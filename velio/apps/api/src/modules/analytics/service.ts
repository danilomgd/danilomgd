import type { AnalyticsBatchInput, AnalyticsEventName, DashboardMetrics } from '@velio/contracts';
import { and, count, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { analyticsEvents, orderEvents, providers, reviews, serviceOrders, users } from '../../db/schema';

/**
 * Métricas de dashboard são lidas por SQL direto sobre tabelas de vários módulos: é leitura
 * analítica agregada (ADR-013), não regra de negócio; nenhuma escrita acontece aqui fora de analytics_events.
 */
export function createAnalyticsService(ctx: AppContext) {
  const { db, adapters } = ctx;

  return {
    async ingest(userId: string, input: z.infer<typeof AnalyticsBatchInput>) {
      for (const e of input.events) {
        await db.insert(analyticsEvents).values({
          name: e.name,
          userId,
          orderId: e.orderId ?? null,
          sessionId: e.sessionId ?? null,
          app: input.app,
          appVersion: input.appVersion ?? null,
          properties: e.properties,
          occurredAt: new Date(e.occurredAt),
        });
      }
      return input.events.length;
    },

    async track(name: AnalyticsEventName, ref: { userId?: string | null; providerId?: string | null; orderId?: string | null; properties?: Record<string, unknown> }) {
      await db.insert(analyticsEvents).values({
        name,
        userId: ref.userId ?? null,
        providerId: ref.providerId ?? null,
        orderId: ref.orderId ?? null,
        app: 'api',
        properties: ref.properties ?? {},
        occurredAt: adapters.clock.now(),
      });
    },

    async dashboard(from: Date, to: Date): Promise<DashboardMetrics> {
      const inPeriod = and(gte(serviceOrders.createdAt, from), lt(serviceOrders.createdAt, to));
      const completedStatuses = ['COMPLETED', 'REVIEWED', 'CLOSED', 'DISPUTED'];
      const cancelledStatuses = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_PROVIDER', 'CANCELLED_BY_PLATFORM'];

      const [orders] = await db.select({ n: count() }).from(serviceOrders).where(inPeriod);
      const [completed] = await db
        .select({
          n: count(),
          gmv: sql<number>`coalesce(sum(${serviceOrders.totalCents}), 0)`,
          fee: sql<number>`coalesce(sum(${serviceOrders.platformFeeCents}), 0)`,
          matching: sql<number | null>`avg(extract(epoch from (${serviceOrders.acceptedAt} - ${serviceOrders.matchingStartedAt})))`,
        })
        .from(serviceOrders)
        .where(and(inPeriod, inArray(serviceOrders.status, completedStatuses)));
      const [cancelled] = await db.select({ n: count() }).from(serviceOrders).where(and(inPeriod, inArray(serviceOrders.status, cancelledStatuses)));
      const [noProvider] = await db.select({ n: count() }).from(serviceOrders).where(and(inPeriod, eq(serviceOrders.status, 'NO_PROVIDER_FOUND')));
      const [arrival] = await db
        .select({ secs: sql<number | null>`avg(extract(epoch from (${orderEvents.createdAt} - ${serviceOrders.acceptedAt})))` })
        .from(orderEvents)
        .innerJoin(serviceOrders, eq(serviceOrders.id, orderEvents.orderId))
        .where(and(eq(orderEvents.toStatus, 'ARRIVED'), sql`${serviceOrders.acceptedAt} is not null`, inPeriod));
      const perCustomer = db
        .select({ customerId: serviceOrders.customerId, n: count().as('n') })
        .from(serviceOrders)
        .where(inArray(serviceOrders.status, ['COMPLETED', 'REVIEWED', 'CLOSED']))
        .groupBy(serviceOrders.customerId)
        .as('c');
      const [repeat] = await db
        .select({ repeaters: sql<number>`count(*) filter (where ${perCustomer.n} >= 2)`, total: count() })
        .from(perCustomer);
      const [rating] = await db.select({ avg: sql<number | null>`avg(${reviews.rating})` }).from(reviews).where(and(eq(reviews.targetType, 'PROVIDER'), gte(reviews.createdAt, from), lt(reviews.createdAt, to)));
      const [active] = await db.select({ n: count() }).from(providers).where(and(eq(providers.status, 'APPROVED'), inArray(providers.availability, ['ONLINE', 'BUSY'])));
      const [newCustomers] = await db.select({ n: count() }).from(users).where(and(gte(users.createdAt, from), lt(users.createdAt, to)));

      const gmv = Number(completed?.gmv ?? 0);
      const fee = Number(completed?.fee ?? 0);
      const completedN = Number(completed?.n ?? 0);
      const ordersN = Number(orders?.n ?? 0);
      const repeaters = Number(repeat?.repeaters ?? 0);
      const total = Number(repeat?.total ?? 0);
      const arrivalSecs = arrival?.secs;
      return {
        periodStart: from.toISOString(),
        periodEnd: to.toISOString(),
        gmvCents: gmv,
        orders: ordersN,
        completedOrders: completedN,
        cancelledOrders: Number(cancelled?.n ?? 0),
        avgTicketCents: completedN > 0 ? Math.round(gmv / completedN) : null,
        takeRatePct: gmv > 0 ? Math.round((fee / gmv) * 10000) / 100 : null,
        platformRevenueCents: fee,
        repeatRatePct: total > 0 ? Math.round((repeaters / total) * 10000) / 100 : null,
        avgMatchingSeconds: completed?.matching === null || completed?.matching === undefined ? null : Math.round(Number(completed.matching)),
        avgArrivalSeconds: arrivalSecs === null || arrivalSecs === undefined ? null : Math.round(Number(arrivalSecs)),
        avgRating: rating?.avg === null || rating?.avg === undefined ? null : Math.round(Number(rating.avg) * 100) / 100,
        noProviderRatePct: ordersN > 0 ? Math.round((Number(noProvider?.n ?? 0) / ordersN) * 10000) / 100 : null,
        activeProviders: Number(active?.n ?? 0),
        newCustomers: Number(newCustomers?.n ?? 0),
      };
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
