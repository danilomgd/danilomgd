import { CancelInput, ManualAssignInput, ResolveDisputeInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actorFrom, requireRole } from '../../lib/auth';
import { parse } from '../../lib/validate';
import type { PlatformService } from '../admin/platform';
import type { DispatchService } from '../dispatch/service';
import type { OrdersService } from '../orders/service';
import type { ProvidersService } from '../providers/service';
import type { SupportService } from '../support/service';

export function registerOpsRoutes(
  app: FastifyInstance,
  deps: { orders: OrdersService; dispatch: DispatchService; providers: ProvidersService; support: SupportService; platform: PlatformService },
  clock: { now(): Date },
) {
  const ops = async (req: Parameters<typeof requireRole>[0]) => requireRole(req, 'operator', 'admin');

  app.get('/v1/ops/map', async (req) => {
    await ops(req);
    const orders = await Promise.all((await deps.orders.listActiveWithCoords()).map((o) => deps.orders.toDto(o)));
    const providers = (await deps.providers.listOnline())
      .filter((p) => p.lastLat !== null && p.lastLng !== null)
      .map((p) => ({ id: p.id, displayName: p.displayName, availability: p.availability, lat: p.lastLat ?? 0, lng: p.lastLng ?? 0, lastLocationAt: p.lastLocationAt?.toISOString() ?? null }));
    return { orders, providers };
  });

  app.get('/v1/ops/orders', async (req) => {
    await ops(req);
    const q = parse(z.object({ status: z.string().optional(), attention: z.coerce.boolean().optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), req.query ?? {});
    return deps.orders.listForOps(q, clock.now());
  });

  app.get<{ Params: { id: string } }>('/v1/ops/orders/:id', async (req) => {
    const a = await ops(req);
    const o = await deps.orders.getById(req.params.id);
    const detail = await deps.orders.toDetail(o, actorFrom(a));
    const offers = await deps.dispatch.offersForOrder(o.id);
    const rounds = await deps.dispatch.roundsForOrder(o.id);
    return { ...detail, dispatch: { rounds, offers } };
  });

  app.get<{ Params: { id: string } }>('/v1/ops/orders/:id/candidates', async (req) => {
    await ops(req);
    return deps.dispatch.candidatesForOps(req.params.id);
  });

  app.post<{ Params: { id: string } }>('/v1/ops/orders/:id/assign', async (req) => {
    const a = await ops(req);
    const b = parse(ManualAssignInput, req.body);
    const o = await deps.dispatch.assign(req.params.id, b.providerId, a, b.note);
    await deps.platform.audit({ actorUserId: a.userId, actorRole: 'operator', action: 'ops.assign', targetType: 'order', targetId: o.id, after: { providerId: b.providerId, note: b.note ?? null }, ip: req.ip });
    return deps.orders.toDetail(o, actorFrom(a));
  });

  app.post<{ Params: { id: string } }>('/v1/ops/orders/:id/cancel', async (req) => {
    const a = await ops(req);
    const b = parse(CancelInput, req.body);
    const before = await deps.orders.getById(req.params.id);
    const o = await deps.orders.transition(req.params.id, 'operator.cancel', actorFrom(a), { reason: b.reason });
    await deps.platform.audit({ actorUserId: a.userId, actorRole: 'operator', action: 'ops.cancel', targetType: 'order', targetId: o.id, before: { status: before.status }, after: { status: o.status, reason: b.reason }, ip: req.ip });
    return deps.orders.toDetail(o, actorFrom(a));
  });

  app.get('/v1/ops/incidents', async (req) => {
    await ops(req);
    const q = parse(z.object({ status: z.string().optional() }), req.query ?? {});
    return deps.support.listIncidents(q.status ?? 'OPEN');
  });

  app.post<{ Params: { id: string } }>('/v1/ops/incidents/:id/resolve', async (req) => {
    const a = await ops(req);
    const r = await deps.support.resolveIncident(req.params.id, a.userId);
    await deps.platform.audit({ actorUserId: a.userId, actorRole: 'operator', action: 'ops.incident.resolve', targetType: 'incident', targetId: r.id, ip: req.ip });
    return r;
  });

  app.get('/v1/ops/disputes', async (req) => {
    await ops(req);
    const q = parse(z.object({ status: z.string().optional() }), req.query ?? {});
    return deps.support.listDisputes(q.status);
  });

  app.post<{ Params: { id: string } }>('/v1/ops/disputes/:id/resolve', async (req) => {
    const a = await ops(req);
    const b = parse(ResolveDisputeInput, req.body);
    const d = await deps.support.resolveDispute(req.params.id, a, b);
    await deps.platform.audit({ actorUserId: a.userId, actorRole: 'operator', action: 'ops.dispute.resolve', targetType: 'dispute', targetId: d.id, after: { outcome: b.outcome, refundCents: b.refundCents }, ip: req.ip });
    return d;
  });

  app.get('/v1/ops/slas', async (req) => {
    await ops(req);
    const byStatus = await deps.orders.slaBreaches(clock.now());
    const breached = Object.values(byStatus).reduce((s, v) => s + v.breached, 0);
    return { generatedAt: clock.now().toISOString(), breached, byStatus };
  });
}
