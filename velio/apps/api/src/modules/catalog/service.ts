import {
  CategoryConfig,
  type HomeResponse,
  type HomeSection,
  type PriceEstimate,
  type PriceEstimateInput,
  type Service,
  type ServiceCategory,
  type ServiceSummary,
  type UpsertCategoryInput,
  type UpsertHomeSectionInput,
  type UpsertPriceRuleInput,
  type UpsertServiceInput,
} from '@velio/contracts';
import { type CouponSource, estimatePrice, type PriceSource } from '@velio/domain';
import { and, asc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { banners, homeSections, serviceCategories, servicePriceRules, services } from '../../db/schema';
import { errors } from '../../lib/errors';
import { type Exec, hourInTimezone } from '../_shared/util';
import type { AssetsService } from '../assets/service';
import type { IdentityService } from '../identity/service';

export type CategoryRow = typeof serviceCategories.$inferSelect;
export type ServiceRow = typeof services.$inferSelect;

export function categoryConfig(c: CategoryRow): CategoryConfig {
  return CategoryConfig.parse(c.config ?? {});
}

export function toCategoryDto(c: CategoryRow): ServiceCategory {
  return {
    id: c.id,
    parentId: c.parentId,
    slug: c.slug,
    name: c.name,
    description: c.description,
    icon: c.icon,
    sortOrder: c.sortOrder,
    active: c.active,
    config: categoryConfig(c),
  };
}

export function toServiceDto(s: ServiceRow): Service {
  return {
    id: s.id,
    categoryId: s.categoryId,
    slug: s.slug,
    name: s.name,
    shortDescription: s.shortDescription,
    description: s.description,
    workflowKind: s.workflowKind as Service['workflowKind'],
    pricingModel: s.pricingModel as Service['pricingModel'],
    basePriceCents: s.basePriceCents,
    priceMinCents: s.priceMinCents,
    priceMaxCents: s.priceMaxCents,
    hourlyRateCents: s.hourlyRateCents,
    estimatedDurationMinutes: s.estimatedDurationMinutes,
    allowsImmediate: s.allowsImmediate,
    allowsScheduling: s.allowsScheduling,
    requiresAddress: s.requiresAddress,
    requiresVehicle: s.requiresVehicle,
    requiresEquipment: s.requiresEquipment,
    options: s.options,
    imageUrl: s.imageUrl,
    active: s.active,
    sortOrder: s.sortOrder,
  };
}

export function toServiceSummary(s: ServiceRow): ServiceSummary {
  const d = toServiceDto(s);
  return {
    id: d.id,
    categoryId: d.categoryId,
    slug: d.slug,
    name: d.name,
    shortDescription: d.shortDescription,
    workflowKind: d.workflowKind,
    pricingModel: d.pricingModel,
    basePriceCents: d.basePriceCents,
    priceMinCents: d.priceMinCents,
    priceMaxCents: d.priceMaxCents,
    estimatedDurationMinutes: d.estimatedDurationMinutes,
    allowsImmediate: d.allowsImmediate,
    allowsScheduling: d.allowsScheduling,
    imageUrl: d.imageUrl,
  };
}

/** Fontes de contexto da home resolvidas por outros módulos (ligadas após a construção). */
export interface HomeContextSources {
  activeOrders(userId: string): Promise<Array<{ id: string; status: string; serviceName: string }>>;
  upcomingBooking(
    userId: string,
    now: Date,
  ): Promise<{ orderId: string; scheduledFor: Date; serviceName: string } | null>;
  hasActiveSubscription(userId: string): Promise<boolean>;
  listPlans(): Promise<unknown[]>;
  validateCoupon(
    code: string,
    userId: string | null,
    categoryId: string,
    now: Date,
  ): Promise<CouponSource | null>;
  resolveRegion(lat: number, lng: number): Promise<{ id: string } | null>;
}

export function createCatalogService(
  ctx: AppContext,
  deps: { identity: IdentityService; assets: AssetsService },
) {
  const { db, adapters } = ctx;
  let sources: HomeContextSources | null = null;

  async function listCategories(exec: Exec = db, onlyActive = true): Promise<CategoryRow[]> {
    return exec
      .select()
      .from(serviceCategories)
      .where(onlyActive ? eq(serviceCategories.active, true) : undefined)
      .orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name));
  }

  async function getCategory(id: string, exec: Exec = db): Promise<CategoryRow> {
    const [c] = await exec.select().from(serviceCategories).where(eq(serviceCategories.id, id)).limit(1);
    if (!c) throw errors.notFound('Categoria');
    return c;
  }

  async function getServiceRow(id: string, exec: Exec = db): Promise<ServiceRow> {
    const [s] = await exec.select().from(services).where(eq(services.id, id)).limit(1);
    if (!s) throw errors.notFound('Serviço');
    return s;
  }

  async function getServiceBySlug(slug: string, exec: Exec = db): Promise<ServiceRow | null> {
    const [s] = await exec.select().from(services).where(eq(services.slug, slug)).limit(1);
    return s ?? null;
  }

  async function servicesBySlugs(slugs: string[]): Promise<ServiceRow[]> {
    if (slugs.length === 0) return [];
    const rows = await db
      .select()
      .from(services)
      .where(and(inArray(services.slug, slugs), eq(services.active, true)));
    return slugs.map((s) => rows.find((r) => r.slug === s)).filter((r): r is ServiceRow => Boolean(r));
  }

  /** Preço efetivo: regra da região > regra global do serviço > serviço. */
  async function getPriceSource(
    serviceId: string,
    regionId: string | null,
    exec: Exec = db,
  ): Promise<PriceSource> {
    const s = await getServiceRow(serviceId, exec);
    const rules = await exec
      .select()
      .from(servicePriceRules)
      .where(
        and(
          eq(servicePriceRules.serviceId, serviceId),
          eq(servicePriceRules.active, true),
          regionId
            ? or(eq(servicePriceRules.regionId, regionId), isNull(servicePriceRules.regionId))
            : isNull(servicePriceRules.regionId),
        ),
      );
    const rule = rules.find((r) => r.regionId === regionId) ?? rules.find((r) => r.regionId === null) ?? null;
    return {
      pricingModel: s.pricingModel as PriceSource['pricingModel'],
      basePriceCents: rule?.basePriceCents ?? s.basePriceCents,
      priceMinCents: rule?.priceMinCents ?? s.priceMinCents,
      priceMaxCents: rule?.priceMaxCents ?? s.priceMaxCents,
      hourlyRateCents: rule?.hourlyRateCents ?? s.hourlyRateCents,
      estimatedDurationMinutes: s.estimatedDurationMinutes,
      options: s.options,
      surgeMultiplierBps: rule?.surgeMultiplierBps ?? 10000,
    };
  }

  async function estimate(
    input: z.infer<typeof PriceEstimateInput>,
    userId: string | null,
  ): Promise<PriceEstimate & { couponCode: string | null }> {
    const s = await getServiceRow(input.serviceId);
    const src = await getPriceSource(s.id, input.regionId ?? null);
    let coupon: CouponSource | null = null;
    if (input.couponCode && sources) {
      coupon = await sources.validateCoupon(
        input.couponCode.toUpperCase(),
        userId,
        s.categoryId,
        adapters.clock.now(),
      );
    }
    return { ...estimatePrice(src, input.options, coupon), couponCode: coupon?.code ?? null };
  }

  function greetingFor(hour: number, name: string | null): string {
    const base = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return name ? `${base}, ${name.split(' ')[0]}!` : `${base}!`;
  }

  async function home(userId: string | null, _loc: { lat?: number; lng?: number }): Promise<HomeResponse> {
    const now = adapters.clock.now();
    const user = userId ? await deps.identity.getUserRow(userId) : null;
    const tz = user?.timezone ?? 'America/Sao_Paulo';
    const hour = hourInTimezone(now, tz);
    const sectionsRows = await db
      .select()
      .from(homeSections)
      .where(eq(homeSections.active, true))
      .orderBy(asc(homeSections.sortOrder), asc(homeSections.id));

    const dueEquipments = userId ? await deps.assets.dueEquipments(userId, now) : [];
    const active = userId && sources ? await sources.activeOrders(userId) : [];
    const upcoming = userId && sources ? await sources.upcomingBooking(userId, now) : null;
    const hasSub = userId && sources ? await sources.hasActiveSubscription(userId) : false;
    const cats = await listCategories();

    const sections: HomeSection[] = [];
    for (const h of sectionsRows) {
      const rules = (h.rules ?? {}) as z.infer<typeof UpsertHomeSectionInput>['rules'];
      if (rules.hoursOfDay && !rules.hoursOfDay.includes(hour)) continue;
      if (rules.requiresEquipmentDue && dueEquipments.length === 0) continue;
      if (rules.requiresActiveOrder && active.length === 0) continue;
      if (rules.requiresSubscription && !hasSub) continue;
      const config = (h.config ?? {}) as { serviceSlugs?: string[] };
      let items: unknown[] = [];
      switch (h.kind) {
        case 'categories':
          items = cats.filter((c) => c.slug !== 'concierge').map(toCategoryDto);
          break;
        case 'quick_services': {
          const rows = await db
            .select()
            .from(services)
            .where(and(eq(services.active, true), eq(services.workflowKind, 'IMMEDIATE')))
            .orderBy(asc(services.sortOrder))
            .limit(8);
          items = rows.map(toServiceSummary);
          break;
        }
        case 'recommendations':
        case 'scheduled':
          items = (await servicesBySlugs(config.serviceSlugs ?? [])).map(toServiceSummary);
          break;
        case 'active_orders':
          items = active;
          break;
        case 'subscriptions':
          items = sources ? await sources.listPlans() : [];
          break;
        case 'banner': {
          const rows = await db
            .select()
            .from(banners)
            .where(eq(banners.active, true))
            .orderBy(asc(banners.sortOrder));
          items = rows.map((b) => ({
            id: b.id,
            title: b.title,
            subtitle: b.subtitle,
            imageUrl: b.imageUrl,
            deepLink: b.deepLink,
          }));
          break;
        }
        default:
          items = [];
      }
      sections.push({
        id: h.id,
        kind: h.kind as HomeSection['kind'],
        title: h.title,
        subtitle: h.subtitle,
        items,
        meta: {},
      });
    }

    // Dica contextual: só com fonte real, em ordem de relevância.
    let contextHint: HomeResponse['contextHint'] = null;
    const firstActive = active[0];
    const firstDue = dueEquipments[0];
    if (firstActive) {
      contextHint = {
        text: `Você tem um pedido em andamento: ${firstActive.serviceName}.`,
        source: 'active_order',
      };
    } else if (upcoming) {
      const when = upcoming.scheduledFor.toLocaleString('pt-BR', {
        timeZone: tz,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      contextHint = { text: `${upcoming.serviceName} agendado para ${when}.`, source: 'upcoming_booking' };
    } else if (firstDue) {
      const months = Math.max(
        1,
        Math.round(firstDue.due.overdueDays / 30) + firstDue.row.maintenanceIntervalMonths,
      );
      contextHint = {
        text: `Seu ar-condicionado (${firstDue.row.room}) está há ${months} meses sem manutenção.`,
        source: 'equipment_due',
      };
    } else {
      contextHint = {
        text:
          hour < 12
            ? 'Que tal resolver algo cedo hoje?'
            : hour < 18
              ? 'Precisa de alguém ainda hoje?'
              : 'Deixe agendado para amanhã cedo.',
        source: 'time_of_day',
      };
    }

    return { greeting: greetingFor(hour, user?.name ?? null), contextHint, sections };
  }

  async function upsertCategory(input: z.infer<typeof UpsertCategoryInput>) {
    const values = {
      parentId: input.parentId ?? null,
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon,
      sortOrder: input.sortOrder,
      active: input.active,
      config: input.config,
    };
    const [row] = input.id
      ? await db.update(serviceCategories).set(values).where(eq(serviceCategories.id, input.id)).returning()
      : await db
          .insert(serviceCategories)
          .values(values)
          .onConflictDoUpdate({ target: serviceCategories.slug, set: values })
          .returning();
    if (!row) throw errors.notFound('Categoria');
    return toCategoryDto(row);
  }

  async function upsertService(input: z.infer<typeof UpsertServiceInput>) {
    const cat = await getCategory(input.categoryId);
    const values = {
      categoryId: input.categoryId,
      slug: input.slug,
      name: input.name,
      shortDescription: input.shortDescription ?? null,
      description: input.description ?? null,
      workflowKind: input.workflowKind,
      pricingModel: input.pricingModel,
      basePriceCents: input.basePriceCents ?? null,
      priceMinCents: input.priceMinCents ?? null,
      priceMaxCents: input.priceMaxCents ?? null,
      hourlyRateCents: input.hourlyRateCents ?? null,
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
      allowsImmediate: input.allowsImmediate,
      allowsScheduling: input.allowsScheduling,
      requiresAddress: input.requiresAddress,
      requiresVehicle: input.requiresVehicle,
      requiresEquipment: input.requiresEquipment,
      options: input.options,
      imageUrl: input.imageUrl ?? null,
      active: input.active,
      sortOrder: input.sortOrder,
      searchText: `${input.name} ${input.shortDescription ?? ''} ${cat.name}`.toLowerCase(),
    };
    const [row] = input.id
      ? await db.update(services).set(values).where(eq(services.id, input.id)).returning()
      : await db
          .insert(services)
          .values(values)
          .onConflictDoUpdate({ target: services.slug, set: values })
          .returning();
    if (!row) throw errors.notFound('Serviço');
    return toServiceDto(row);
  }

  return {
    bindSources(s: HomeContextSources) {
      sources = s;
    },
    listCategories,
    getCategory,
    async getCategoryBySlug(slug: string): Promise<CategoryRow | null> {
      const [c] = await db.select().from(serviceCategories).where(eq(serviceCategories.slug, slug)).limit(1);
      return c ?? null;
    },
    getServiceRow,
    getServiceBySlug,
    getPriceSource,
    estimate,
    home,
    async listServices(filter: { category?: string } = {}): Promise<ServiceRow[]> {
      let categoryId: string | null = null;
      if (filter.category) {
        const [c] = await db
          .select({ id: serviceCategories.id })
          .from(serviceCategories)
          .where(eq(serviceCategories.slug, filter.category))
          .limit(1);
        if (!c) return [];
        categoryId = c.id;
      }
      return db
        .select()
        .from(services)
        .where(and(eq(services.active, true), categoryId ? eq(services.categoryId, categoryId) : undefined))
        .orderBy(asc(services.sortOrder), asc(services.name));
    },
    async search(q: string): Promise<ServiceRow[]> {
      const term = `%${q.toLowerCase().trim()}%`;
      return db
        .select()
        .from(services)
        .where(
          and(eq(services.active, true), or(ilike(services.searchText, term), ilike(services.name, term))),
        )
        .orderBy(asc(services.sortOrder))
        .limit(20);
    },
    admin: {
      categories: {
        list: async () => (await listCategories(db, false)).map(toCategoryDto),
        upsert: upsertCategory,
        remove: async (id: string) => {
          await db.update(serviceCategories).set({ active: false }).where(eq(serviceCategories.id, id));
        },
      },
      services: {
        list: async () =>
          (await db.select().from(services).orderBy(asc(services.sortOrder))).map(toServiceDto),
        upsert: upsertService,
        remove: async (id: string) => {
          await db.update(services).set({ active: false }).where(eq(services.id, id));
        },
      },
      priceRules: {
        list: async () => db.select().from(servicePriceRules).orderBy(asc(servicePriceRules.createdAt)),
        upsert: async (input: z.infer<typeof UpsertPriceRuleInput>) => {
          await getServiceRow(input.serviceId);
          const values = {
            serviceId: input.serviceId,
            regionId: input.regionId,
            basePriceCents: input.basePriceCents ?? null,
            priceMinCents: input.priceMinCents ?? null,
            priceMaxCents: input.priceMaxCents ?? null,
            hourlyRateCents: input.hourlyRateCents ?? null,
            surgeMultiplierBps: input.surgeMultiplierBps,
            active: input.active,
          };
          const [row] = input.id
            ? await db
                .update(servicePriceRules)
                .set(values)
                .where(eq(servicePriceRules.id, input.id))
                .returning()
            : await db.insert(servicePriceRules).values(values).returning();
          if (!row) throw errors.notFound('Regra de preço');
          return row;
        },
        remove: async (id: string) => {
          await db.delete(servicePriceRules).where(eq(servicePriceRules.id, id));
        },
      },
      homeSections: {
        list: async () => db.select().from(homeSections).orderBy(asc(homeSections.sortOrder)),
        upsert: async (input: z.infer<typeof UpsertHomeSectionInput>) => {
          const values = {
            id: input.id,
            kind: input.kind,
            title: input.title ?? null,
            subtitle: input.subtitle ?? null,
            sortOrder: input.sortOrder,
            active: input.active,
            rules: input.rules,
            config: input.config,
          };
          const [row] = await db
            .insert(homeSections)
            .values(values)
            .onConflictDoUpdate({ target: homeSections.id, set: values })
            .returning();
          return row;
        },
        remove: async (id: string) => {
          await db.delete(homeSections).where(eq(homeSections.id, id));
        },
      },
      banners: {
        list: async () => db.select().from(banners).orderBy(asc(banners.sortOrder)),
        upsert: async (input: {
          id?: string;
          title: string;
          subtitle?: string | null;
          imageUrl?: string | null;
          deepLink?: string | null;
          sortOrder?: number;
          active?: boolean;
        }) => {
          const values = {
            title: input.title,
            subtitle: input.subtitle ?? null,
            imageUrl: input.imageUrl ?? null,
            deepLink: input.deepLink ?? null,
            sortOrder: input.sortOrder ?? 0,
            active: input.active ?? true,
          };
          const [row] = input.id
            ? await db.update(banners).set(values).where(eq(banners.id, input.id)).returning()
            : await db.insert(banners).values(values).returning();
          if (!row) throw errors.notFound('Banner');
          return row;
        },
        remove: async (id: string) => {
          await db.delete(banners).where(eq(banners.id, id));
        },
      },
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
