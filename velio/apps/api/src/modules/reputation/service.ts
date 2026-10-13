import type { Review, ReviewInput } from '@velio/contracts';
import type { z } from 'zod';
import { customerRiskScore, rate, recencyWeightedRating } from '@velio/domain';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { customerRiskSignals, providerStats, reviews } from '../../db/schema';
import { errors } from '../../lib/errors';
import type { ProvidersService } from '../providers/service';

export interface ReputationSources {
  /** Ordem com cliente/prestador/status para validar a avaliação. */
  orderForReview(orderId: string): Promise<{ id: string; customerId: string; providerId: string | null; providerUserId: string | null; status: string } | null>;
  onCustomerReviewed(orderId: string, userId: string, review: Review): Promise<void>;
}

const REVIEWABLE = new Set(['COMPLETED', 'REVIEWED', 'CLOSED']);

export function createReputationService(ctx: AppContext, deps: { providers: ProvidersService }) {
  const { db, adapters } = ctx;
  let sources: ReputationSources | null = null;

  async function stats(providerId: string) {
    const [row] = await db.select().from(providerStats).where(eq(providerStats.providerId, providerId)).limit(1);
    if (row) return row;
    const [created] = await db.insert(providerStats).values({ providerId }).onConflictDoNothing().returning();
    if (created) return created;
    const [again] = await db.select().from(providerStats).where(eq(providerStats.providerId, providerId)).limit(1);
    if (!again) throw new Error('Falha ao criar estatísticas');
    return again;
  }

  async function risk(userId: string) {
    const [row] = await db.select().from(customerRiskSignals).where(eq(customerRiskSignals.userId, userId)).limit(1);
    if (row) return row;
    const [created] = await db.insert(customerRiskSignals).values({ userId }).onConflictDoNothing().returning();
    if (created) return created;
    const [again] = await db.select().from(customerRiskSignals).where(eq(customerRiskSignals.userId, userId)).limit(1);
    if (!again) throw new Error('Falha ao criar sinais de risco');
    return again;
  }

  async function bumpRisk(userId: string, patch: Partial<Record<'lateCancellations90d' | 'disputesOpened90d' | 'disputesRejected90d' | 'chargebacks' | 'completedOrders', number>>) {
    const r = await risk(userId);
    const next = {
      lateCancellations90d: r.lateCancellations90d + (patch.lateCancellations90d ?? 0),
      disputesOpened90d: r.disputesOpened90d + (patch.disputesOpened90d ?? 0),
      disputesRejected90d: r.disputesRejected90d + (patch.disputesRejected90d ?? 0),
      chargebacks: r.chargebacks + (patch.chargebacks ?? 0),
      completedOrders: r.completedOrders + (patch.completedOrders ?? 0),
    };
    await db
      .update(customerRiskSignals)
      .set({ ...next, riskScore: Math.round(customerRiskScore(next) * 10000) })
      .where(eq(customerRiskSignals.userId, userId));
  }

  /** Recalcula os agregados exibidos do prestador a partir de reviews + provider_stats. */
  async function recompute(providerId: string) {
    const s = await stats(providerId);
    const rows = await db
      .select({ rating: reviews.rating, createdAt: reviews.createdAt })
      .from(reviews)
      .where(and(eq(reviews.targetType, 'PROVIDER'), eq(reviews.targetId, providerId)));
    const ratingAvg = recencyWeightedRating(rows);
    const accepted = s.offersAccepted;
    await db.update(providerStats).set({ ratingAvg, ratingCount: rows.length }).where(eq(providerStats.providerId, providerId));
    await deps.providers.updateStats(providerId, {
      ratingAvg,
      ratingCount: rows.length,
      completedCount: s.completedCount,
      acceptanceRate: rate(s.offersAccepted, s.offersReceived),
      cancellationRate: rate(s.cancelledCount, Math.max(accepted, s.completedCount + s.cancelledCount)),
      avgResponseSeconds: s.avgResponseSeconds,
    });
  }

  return {
    bindSources(s: ReputationSources) {
      sources = s;
    },
    recompute,
    stats,
    risk,

    async createReview(orderId: string, user: { userId: string; providerId: string | null }, input: z.infer<typeof ReviewInput>): Promise<Review> {
      const order = sources ? await sources.orderForReview(orderId) : null;
      if (!order) throw errors.notFound('Ordem');
      if (!REVIEWABLE.has(order.status)) throw errors.invalidTransition('Avaliação só é possível após a conclusão', { status: order.status });
      const isCustomer = order.customerId === user.userId;
      const isProvider = order.providerId !== null && order.providerId === user.providerId;
      if (!isCustomer && !isProvider) throw errors.forbidden('Somente participantes da ordem avaliam');
      const targetType = isCustomer ? 'PROVIDER' : 'CUSTOMER';
      const targetId = isCustomer ? order.providerId : order.customerId;
      if (!targetId) throw errors.unprocessable('Ordem sem prestador para avaliar');
      const [existing] = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.orderId, orderId), eq(reviews.targetType, targetType))).limit(1);
      if (existing) throw errors.conflict('Avaliação já registrada para esta ordem');
      const [row] = await db
        .insert(reviews)
        .values({ orderId, reviewerUserId: user.userId, targetType, targetId, rating: input.rating, tags: input.tags, comment: input.comment ?? null })
        .returning();
      if (!row) throw new Error('Falha ao gravar avaliação');
      const review: Review = {
        id: row.id,
        orderId,
        reviewerUserId: user.userId,
        targetType,
        rating: row.rating,
        tags: row.tags,
        comment: row.comment ?? undefined,
        createdAt: row.createdAt.toISOString(),
      };
      if (isCustomer) {
        if (order.providerId) {
          const s = await stats(order.providerId);
          const tags = { ...s.tags };
          for (const t of input.tags) tags[t] = (tags[t] ?? 0) + 1;
          await db.update(providerStats).set({ tags }).where(eq(providerStats.providerId, order.providerId));
          await recompute(order.providerId);
        }
        if (sources) await sources.onCustomerReviewed(orderId, user.userId, review);
      }
      return review;
    },

    async listForOrder(orderId: string): Promise<Review[]> {
      const rows = await db.select().from(reviews).where(eq(reviews.orderId, orderId)).orderBy(desc(reviews.createdAt));
      return rows.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        reviewerUserId: r.reviewerUserId,
        targetType: r.targetType as 'PROVIDER' | 'CUSTOMER',
        rating: r.rating,
        tags: r.tags,
        comment: r.comment ?? undefined,
        createdAt: r.createdAt.toISOString(),
      }));
    },

    async recordOffers(providerIds: string[]) {
      for (const id of providerIds) {
        await stats(id);
        await db.update(providerStats).set({ offersReceived: sql`${providerStats.offersReceived} + 1` }).where(eq(providerStats.providerId, id));
      }
    },

    async recordOfferAccepted(providerId: string, responseSeconds: number) {
      const s = await stats(providerId);
      const n = s.offersAccepted;
      const avg = s.avgResponseSeconds === null ? responseSeconds : (s.avgResponseSeconds * n + responseSeconds) / (n + 1);
      await db
        .update(providerStats)
        .set({ offersAccepted: n + 1, avgResponseSeconds: Math.round(avg) })
        .where(eq(providerStats.providerId, providerId));
      await recompute(providerId);
    },

    async recordCompletion(providerId: string, customerId: string) {
      const s = await stats(providerId);
      await db.update(providerStats).set({ completedCount: s.completedCount + 1 }).where(eq(providerStats.providerId, providerId));
      await deps.providers.updateStats(providerId, { lastOrderCompletedAt: adapters.clock.now() });
      await recompute(providerId);
      await bumpRisk(customerId, { completedOrders: 1 });
    },

    /** Penalidade reputacional por cancelamento do prestador após aceite. */
    async penalizeProviderCancel(providerId: string) {
      const s = await stats(providerId);
      await db.update(providerStats).set({ cancelledCount: s.cancelledCount + 1 }).where(eq(providerStats.providerId, providerId));
      await recompute(providerId);
    },

    recordLateCancellation: (userId: string) => bumpRisk(userId, { lateCancellations90d: 1 }),
    recordDisputeOpened: (userId: string) => bumpRisk(userId, { disputesOpened90d: 1 }),
    recordDisputeRejected: (userId: string) => bumpRisk(userId, { disputesRejected90d: 1 }),
  };
}

export type ReputationService = ReturnType<typeof createReputationService>;
