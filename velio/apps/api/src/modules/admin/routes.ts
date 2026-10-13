import {
  ApproveProviderInput,
  PlatformSettings,
  UpsertCategoryInput,
  UpsertCommissionRuleInput,
  UpsertCouponInput,
  UpsertHomeSectionInput,
  UpsertMatchingConfigInput,
  UpsertPlanInput,
  UpsertPriceRuleInput,
  UpsertRegionInput,
  UpsertServiceInput,
  UserRole,
} from '@velio/contracts';
import { describeWorkflow, listWorkflows } from '@velio/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../../lib/auth';
import { errors } from '../../lib/errors';
import { parse } from '../../lib/validate';
import type { AnalyticsService } from '../analytics/service';
import type { CatalogService } from '../catalog/service';
import type { DispatchService } from '../dispatch/service';
import type { GeoService } from '../geo/service';
import type { IdentityService } from '../identity/service';
import type { PaymentsService } from '../payments/service';
import type { ProvidersService } from '../providers/service';
import type { SubscriptionsService } from '../subscriptions/service';
import type { WalletService } from '../wallet/service';
import type { PlatformService } from './platform';

interface Resource {
  schema: z.ZodTypeAny;
  list: () => Promise<unknown[]>;
  upsert: (input: never) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
}

const UpsertBannerInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2).max(80),
  subtitle: z.string().max(160).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  deepLink: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

const UpdateUserRolesInput = z.object({ id: z.string().uuid(), roles: z.array(UserRole).min(1) });

export function registerAdminRoutes(
  app: FastifyInstance,
  deps: {
    platform: PlatformService;
    catalog: CatalogService;
    geo: GeoService;
    wallet: WalletService;
    dispatch: DispatchService;
    payments: PaymentsService;
    subscriptions: SubscriptionsService;
    identity: IdentityService;
    providers: ProvidersService;
    analytics: AnalyticsService;
  },
  clock: { now(): Date },
) {
  const resources: Record<string, Resource> = {
    categories: { schema: UpsertCategoryInput, ...deps.catalog.admin.categories } as Resource,
    services: { schema: UpsertServiceInput, ...deps.catalog.admin.services } as Resource,
    'price-rules': { schema: UpsertPriceRuleInput, ...deps.catalog.admin.priceRules } as Resource,
    'home-sections': { schema: UpsertHomeSectionInput, ...deps.catalog.admin.homeSections } as Resource,
    banners: { schema: UpsertBannerInput, ...deps.catalog.admin.banners } as Resource,
    regions: { schema: UpsertRegionInput, ...deps.geo.admin } as Resource,
    'commission-rules': { schema: UpsertCommissionRuleInput, ...deps.wallet.admin.commissionRules } as Resource,
    'matching-configs': { schema: UpsertMatchingConfigInput, ...deps.dispatch.admin.matchingConfigs } as Resource,
    coupons: { schema: UpsertCouponInput, ...deps.payments.admin.coupons } as Resource,
    plans: { schema: UpsertPlanInput, ...deps.subscriptions.admin.plans } as Resource,
    users: {
      schema: UpdateUserRolesInput,
      list: () => deps.identity.listUsers(),
      upsert: ((input: z.infer<typeof UpdateUserRolesInput>) => deps.identity.setRoles(input.id, input.roles)) as Resource['upsert'],
      remove: async () => {
        throw errors.unprocessable('Usuários não são removidos; altere os papéis ou o status');
      },
    },
    providers: {
      schema: z.object({}),
      list: () => deps.providers.listAll(),
      upsert: (async () => {
        throw errors.unprocessable('Use POST /v1/admin/providers/:id/decision');
      }) as Resource['upsert'],
      remove: async () => {
        throw errors.unprocessable('Prestadores não são removidos; use a decisão BLOCK');
      },
    },
  };

  const admin = (req: Parameters<typeof requireRole>[0]) => requireRole(req, 'admin');

  app.get<{ Params: { resource: string } }>('/v1/admin/:resource', async (req) => {
    admin(req);
    const r = resources[req.params.resource];
    if (!r) throw errors.notFound('Recurso');
    return r.list();
  });

  app.put<{ Params: { resource: string } }>('/v1/admin/:resource', async (req) => {
    const a = admin(req);
    const r = resources[req.params.resource];
    if (!r) throw errors.notFound('Recurso');
    const input = parse(r.schema, req.body);
    const result = await r.upsert(input as never);
    await deps.platform.audit({ actorUserId: a.userId, actorRole: 'admin', action: `admin.${req.params.resource}.upsert`, targetType: req.params.resource, targetId: (result as { id?: string; code?: string })?.id ?? (result as { code?: string })?.code ?? null, after: result, ip: req.ip });
    return result;
  });

  app.delete<{ Params: { resource: string; id: string } }>('/v1/admin/:resource/:id', async (req, reply) => {
    const a = admin(req);
    const r = resources[req.params.resource];
    if (!r) throw errors.notFound('Recurso');
    await r.remove(req.params.id);
    await deps.platform.audit({ actorUserId: a.userId, actorRole: 'admin', action: `admin.${req.params.resource}.delete`, targetType: req.params.resource, targetId: req.params.id, ip: req.ip });
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/v1/admin/providers/:id/decision', async (req) => {
    const a = admin(req);
    const b = parse(ApproveProviderInput, req.body);
    const before = await deps.providers.getById(req.params.id);
    const me = await deps.providers.decide(req.params.id, b, a.userId);
    await deps.platform.audit({ actorUserId: a.userId, actorRole: 'admin', action: `admin.providers.${b.decision.toLowerCase()}`, targetType: 'provider', targetId: me.id, before: { status: before.status }, after: { status: me.status, reason: b.reason ?? null }, ip: req.ip });
    return me;
  });

  app.get('/v1/admin/settings', async (req) => {
    admin(req);
    return deps.platform.getSettings();
  });

  app.put('/v1/admin/settings', async (req) => {
    const a = admin(req);
    const before = await deps.platform.getSettings();
    const input = parse(PlatformSettings, req.body);
    const after = await deps.platform.updateSettings(input, a.userId);
    await deps.platform.audit({ actorUserId: a.userId, actorRole: 'admin', action: 'admin.settings.update', targetType: 'settings', before, after, ip: req.ip });
    return after;
  });

  app.get('/v1/admin/workflows', async (req) => {
    admin(req);
    return listWorkflows().map(describeWorkflow);
  });

  app.get('/v1/admin/audit-logs', async (req) => {
    admin(req);
    return deps.platform.listAudit();
  });

  app.get('/v1/admin/analytics/dashboard', async (req) => {
    requireRole(req, 'admin', 'operator');
    const q = parse(z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }), req.query ?? {});
    const to = q.to ? new Date(q.to) : clock.now();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86_400_000);
    return deps.analytics.dashboard(from, to);
  });
}
