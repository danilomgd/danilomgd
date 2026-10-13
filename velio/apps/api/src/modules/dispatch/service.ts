import type { DispatchOffer, MatchingWeights, OfferResponse, UpsertMatchingConfigInput, WaveConfig } from '@velio/contracts';
import { rooms } from '@velio/contracts';
import { boundingBox, DEFAULT_WAVES, DEFAULT_WEIGHTS, haversineKm, planWave, rankCandidates, type ScoredCandidate } from '@velio/domain';
import { and, asc, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { dispatchOffers, dispatchRounds, matchingConfigs } from '../../db/schema';
import { AppError, errors } from '../../lib/errors';
import { iso } from '../_shared/util';
import type { CatalogService } from '../catalog/service';
import type { CommunicationService } from '../communication/service';
import type { OrdersService } from '../orders/service';
import { meta } from '../orders/types';
import type { ProvidersService } from '../providers/service';
import type { ReputationService } from '../reputation/service';

export type OfferRow = typeof dispatchOffers.$inferSelect;
export type RoundRow = typeof dispatchRounds.$inferSelect;

const MATCHABLE = new Set(['MATCHING', 'OFFERED']);

export function createDispatchService(
  ctx: AppContext,
  deps: { orders: OrdersService; providers: ProvidersService; catalog: CatalogService; communication: CommunicationService; reputation: ReputationService },
) {
  const { db, adapters, outbox, scheduler, log } = ctx;
  const system = { type: 'system' as const, userId: null };

  async function configFor(categoryId: string): Promise<{ weights: MatchingWeights; waves: WaveConfig }> {
    const rows = await db.select().from(matchingConfigs).where(and(eq(matchingConfigs.active, true)));
    const specific = rows.find((r) => r.categoryId === categoryId);
    const global = rows.find((r) => r.categoryId === null);
    const picked = specific ?? global;
    return { weights: picked?.weights ?? DEFAULT_WEIGHTS, waves: picked?.waves ?? DEFAULT_WAVES };
  }

  async function rankForOrder(orderId: string, radiusKm: number): Promise<{ ranked: ScoredCandidate[]; total: number }> {
    const o = await deps.orders.getById(orderId);
    if (o.lat === null || o.lng === null) return { ranked: [], total: 0 };
    const { weights } = await configFor(o.categoryId);
    const service = await deps.catalog.getServiceRow(o.serviceId);
    const window = o.scheduledFor ? { startsAt: o.scheduledFor, endsAt: new Date(o.scheduledFor.getTime() + (service.estimatedDurationMinutes ?? 60) * 60_000) } : null;
    const cands = await deps.providers.findCandidates({
      categoryId: o.categoryId,
      bbox: boundingBox({ lat: o.lat, lng: o.lng }, radiusKm),
      customerId: o.customerId,
      window,
      excludeProviderIds: meta(o).excludedProviderIds ?? [],
    });
    const ranked = rankCandidates(cands, { location: { lat: o.lat, lng: o.lng }, scheduledFor: o.scheduledFor, now: adapters.clock.now(), radiusKm }, weights);
    return { ranked, total: cands.length };
  }

  async function alreadyOffered(orderId: string): Promise<Set<string>> {
    const rows = await db.select({ providerId: dispatchOffers.providerId }).from(dispatchOffers).where(eq(dispatchOffers.orderId, orderId));
    return new Set(rows.map((r) => r.providerId));
  }

  /**
   * Onda de dispatch: pontua candidatos, oferta aos N melhores com expiração e agenda o timeout.
   * Sem candidatos elegíveis: registra a rodada vazia e segue para a próxima; esgotadas → ops.
   */
  async function start(orderId: string): Promise<void> {
    let o = await deps.orders.getById(orderId);
    if (!MATCHABLE.has(o.status)) {
      log.debug({ orderId, status: o.status }, 'dispatch ignorado: ordem fora de matching');
      return;
    }
    const { waves } = await configFor(o.categoryId);
    const now = adapters.clock.now();
    let waveIndex = o.dispatchWave;
    for (let guard = 0; guard < waves.waves.length + 1; guard++) {
      const wave = waves.waves[waveIndex];
      const radius = wave?.radiusKm ?? waves.waves[waves.waves.length - 1]?.radiusKm ?? 10;
      const { ranked, total } = await rankForOrder(orderId, radius);
      const plan = planWave(waveIndex, ranked, waves, await alreadyOffered(orderId));
      if (plan.kind === 'OFFER') {
        const expiresAt = new Date(now.getTime() + plan.timeoutSeconds * 1000);
        const [round] = await db
          .insert(dispatchRounds)
          .values({ orderId, wave: waveIndex + 1, radiusKm: plan.radiusKm, candidatesCount: total, eligibleCount: ranked.filter((r) => r.eligible).length, offeredCount: plan.providerIds.length, expiresAt, snapshot: { ranked: ranked.slice(0, 20) } })
          .returning();
        if (!round) throw new Error('Falha ao criar rodada');
        for (const pid of plan.providerIds) {
          const sc = ranked.find((r) => r.providerId === pid);
          const [offer] = await db
            .insert(dispatchOffers)
            .values({ roundId: round.id, orderId, providerId: pid, score: sc?.score ?? 0, distanceKm: sc?.distanceKm ?? 0, scoreBreakdown: sc ? { ...sc.breakdown } : {}, expiresAt })
            .returning();
          if (!offer) continue;
          await outbox.publish(db, { type: 'offer.created', aggregateType: 'offer', aggregateId: offer.id, payload: { offerId: offer.id, orderId, providerId: pid, expiresAt: expiresAt.toISOString() } });
          await deps.communication.notifyProvider(pid, 'offer_received', { orderId, offerId: offer.id, expiresAt: expiresAt.toISOString() });
        }
        await deps.reputation.recordOffers(plan.providerIds);
        await deps.orders.setDispatchWave(orderId, waveIndex + 1);
        await scheduler.schedule(db, { kind: 'dispatch.wave_timeout', runAt: expiresAt, payload: { orderId, roundId: round.id }, dedupeKey: `dispatch.wave_timeout:${round.id}` });
        o = await deps.orders.getById(orderId);
        if (o.status === 'MATCHING') await deps.orders.tryTransition(orderId, 'system.offer', system, { roundId: round.id, wave: waveIndex + 1, offered: plan.providerIds.length });
        return;
      }
      if (plan.kind === 'NEXT_WAVE') {
        await db.insert(dispatchRounds).values({ orderId, wave: waveIndex + 1, radiusKm: radius, candidatesCount: total, eligibleCount: ranked.filter((r) => r.eligible).length, offeredCount: 0, outcome: 'EMPTY', endedAt: now });
        waveIndex = plan.waveIndex;
        await deps.orders.setDispatchWave(orderId, waveIndex);
        continue;
      }
      // ESCALATE_TO_OPS ou FAIL
      await deps.orders.setDispatchWave(orderId, waveIndex);
      await deps.orders.tryTransition(orderId, 'system.no_provider', system, { reason: plan.reason, wavesTried: waveIndex });
      return;
    }
  }

  async function expirePending(roundId: string, orderId: string, response: 'EXPIRED' | 'WITHDRAWN') {
    const now = adapters.clock.now();
    const pending = await db.update(dispatchOffers).set({ response, respondedAt: now }).where(and(eq(dispatchOffers.roundId, roundId), eq(dispatchOffers.response, 'PENDING'))).returning();
    for (const offer of pending) {
      await outbox.publish(db, { type: 'offer.expired', aggregateType: 'offer', aggregateId: offer.id, payload: { offerId: offer.id, orderId, providerId: offer.providerId } });
      if (response === 'EXPIRED') await deps.communication.notifyProvider(offer.providerId, 'offer_expired', { orderId, offerId: offer.id });
    }
    return pending.length;
  }

  /** Timeout da onda: expira ofertas pendentes, `system.wave_exhausted` e próxima onda. */
  async function onWaveTimeout(orderId: string, roundId: string): Promise<void> {
    const [round] = await db.select().from(dispatchRounds).where(eq(dispatchRounds.id, roundId)).limit(1);
    if (!round || round.endedAt) return;
    const o = await deps.orders.getById(orderId);
    const now = adapters.clock.now();
    if (o.providerId || !MATCHABLE.has(o.status)) {
      await db.update(dispatchRounds).set({ outcome: o.providerId ? 'ACCEPTED' : 'CLOSED', endedAt: now }).where(eq(dispatchRounds.id, roundId));
      await expirePending(roundId, orderId, 'WITHDRAWN');
      return;
    }
    await expirePending(roundId, orderId, 'EXPIRED');
    await db.update(dispatchRounds).set({ outcome: 'EXPIRED', endedAt: now }).where(eq(dispatchRounds.id, roundId));
    await deps.orders.tryTransition(orderId, 'system.wave_exhausted', system, { roundId, wave: round.wave });
    await start(orderId);
  }

  async function cancelOffers(orderId: string): Promise<void> {
    const rounds = await db.select().from(dispatchRounds).where(and(eq(dispatchRounds.orderId, orderId), isNull(dispatchRounds.endedAt)));
    for (const r of rounds) {
      await expirePending(r.id, orderId, 'WITHDRAWN');
      await db.update(dispatchRounds).set({ outcome: 'CLOSED', endedAt: adapters.clock.now() }).where(eq(dispatchRounds.id, r.id));
      await scheduler.cancelByDedupe(db, `dispatch.wave_timeout:${r.id}`);
    }
  }

  async function offerSummary(offer: OfferRow): Promise<DispatchOffer> {
    const o = await deps.orders.getById(offer.orderId);
    const service = await deps.catalog.getServiceRow(o.serviceId);
    const category = await deps.catalog.getCategory(o.categoryId);
    const m = meta(o);
    return {
      id: offer.id,
      orderId: offer.orderId,
      roundId: offer.roundId,
      providerId: offer.providerId,
      score: offer.score,
      response: offer.response as OfferResponse,
      offeredAt: offer.offeredAt.toISOString(),
      expiresAt: offer.expiresAt.toISOString(),
      summary: {
        serviceName: service.name,
        categorySlug: category.slug,
        distanceKm: offer.distanceKm,
        approxLocation: { neighborhood: m.neighborhood ?? '', city: m.city ?? '', lat: Math.round((o.lat ?? 0) * 1000) / 1000, lng: Math.round((o.lng ?? 0) * 1000) / 1000 },
        priceCents: o.totalCents,
        providerPayoutCents: o.totalCents === null ? null : Math.round(o.totalCents * 0.8),
        estimatedDurationMinutes: service.estimatedDurationMinutes,
        scheduledFor: iso(o.scheduledFor),
        notes: o.notes,
      },
    };
  }

  return {
    start,
    onWaveTimeout,
    cancelOffers,

    /** Prestador cancelou: novas ofertas excluindo quem cancelou (metadata.excludedProviderIds). */
    async restart(orderId: string) {
      await cancelOffers(orderId);
      await deps.orders.setDispatchWave(orderId, 0);
      await start(orderId);
    },

    async listPendingOffers(providerId: string): Promise<DispatchOffer[]> {
      const now = adapters.clock.now();
      const rows = await db.select().from(dispatchOffers).where(and(eq(dispatchOffers.providerId, providerId), eq(dispatchOffers.response, 'PENDING'), gt(dispatchOffers.expiresAt, now))).orderBy(desc(dispatchOffers.offeredAt));
      return Promise.all(rows.map(offerSummary));
    },

    /** Primeiro aceite vence: oferta PENDING, não expirada, ordem ainda sem prestador. */
    async acceptOffer(offerId: string, provider: { userId: string; providerId: string }) {
      const now = adapters.clock.now();
      const offer = await db.transaction(async (tx) => {
        const [of] = await tx.select().from(dispatchOffers).where(eq(dispatchOffers.id, offerId)).limit(1);
        if (!of) throw errors.notFound('Oferta');
        if (of.providerId !== provider.providerId) throw errors.forbidden('Oferta de outro prestador');
        if (of.response !== 'PENDING') throw errors.conflict('Oferta não está mais disponível', { response: of.response });
        if (of.expiresAt.getTime() < now.getTime()) throw errors.conflict('Oferta expirada');
        const o = await deps.orders.getById(of.orderId, tx);
        if (o.providerId || !MATCHABLE.has(o.status)) throw errors.conflict('Pedido já foi aceito por outro prestador', { status: o.status });
        const [accepted] = await tx.update(dispatchOffers).set({ response: 'ACCEPTED', respondedAt: now }).where(and(eq(dispatchOffers.id, offerId), eq(dispatchOffers.response, 'PENDING'))).returning();
        if (!accepted) throw errors.conflict('Oferta não está mais disponível');
        return accepted;
      });
      try {
        await deps.orders.transition(offer.orderId, 'provider.accept', { type: 'provider', userId: provider.userId, providerId: provider.providerId }, { offerId });
      } catch (err) {
        await db.update(dispatchOffers).set({ response: 'WITHDRAWN' }).where(eq(dispatchOffers.id, offerId));
        if (err instanceof AppError && err.code === 'INVALID_TRANSITION') throw errors.conflict('Pedido não pode mais ser aceito', err.details);
        throw err;
      }
      await deps.reputation.recordOfferAccepted(provider.providerId, Math.max(0, Math.round((now.getTime() - offer.offeredAt.getTime()) / 1000)));
      return deps.orders.getById(offer.orderId);
    },

    async rejectOffer(offerId: string, providerId: string) {
      const [of] = await db.select().from(dispatchOffers).where(eq(dispatchOffers.id, offerId)).limit(1);
      if (!of) throw errors.notFound('Oferta');
      if (of.providerId !== providerId) throw errors.forbidden('Oferta de outro prestador');
      if (of.response !== 'PENDING') return;
      await db.update(dispatchOffers).set({ response: 'REJECTED', respondedAt: adapters.clock.now() }).where(eq(dispatchOffers.id, offerId));
      const remaining = await db.select({ id: dispatchOffers.id }).from(dispatchOffers).where(and(eq(dispatchOffers.roundId, of.roundId), eq(dispatchOffers.response, 'PENDING')));
      if (remaining.length === 0) await onWaveTimeout(of.orderId, of.roundId);
    },

    /** Job offer.expire (oferta individual). */
    async expireOffer(offerId: string) {
      const [of] = await db.select().from(dispatchOffers).where(eq(dispatchOffers.id, offerId)).limit(1);
      if (!of || of.response !== 'PENDING') return;
      await db.update(dispatchOffers).set({ response: 'EXPIRED', respondedAt: adapters.clock.now() }).where(eq(dispatchOffers.id, offerId));
      await outbox.publish(db, { type: 'offer.expired', aggregateType: 'offer', aggregateId: of.id, payload: { offerId: of.id, orderId: of.orderId, providerId: of.providerId } });
      const remaining = await db.select({ id: dispatchOffers.id }).from(dispatchOffers).where(and(eq(dispatchOffers.roundId, of.roundId), eq(dispatchOffers.response, 'PENDING')));
      if (remaining.length === 0) await onWaveTimeout(of.orderId, of.roundId);
    },

    /** Ranking completo para atribuição manual no painel (score + breakdown). */
    async candidatesForOps(orderId: string) {
      const o = await deps.orders.getById(orderId);
      const { waves } = await configFor(o.categoryId);
      const radius = waves.waves[waves.waves.length - 1]?.radiusKm ?? 20;
      const { ranked } = await rankForOrder(orderId, radius);
      const offered = await alreadyOffered(orderId);
      const out = [];
      for (const r of ranked) {
        const p = await deps.providers.getById(r.providerId);
        out.push({ ...r, displayName: p.displayName, availability: p.availability, alreadyOffered: offered.has(r.providerId), location: deps.providers.lastLocationOf(p) });
      }
      return out;
    },

    /** Atribuição manual pelo operador. */
    async assign(orderId: string, providerId: string, operator: { userId: string }, note?: string) {
      const p = await deps.providers.getById(providerId);
      if (p.status !== 'APPROVED') throw errors.unprocessable('Prestador não está aprovado');
      await cancelOffers(orderId);
      const o = await deps.orders.transition(orderId, 'operator.assign', { type: 'operator', userId: operator.userId }, { providerId, note: note ?? null });
      await deps.reputation.recordOffers([providerId]);
      await deps.reputation.recordOfferAccepted(providerId, 0);
      return o;
    },

    async roundsForOrder(orderId: string) {
      return db.select().from(dispatchRounds).where(eq(dispatchRounds.orderId, orderId)).orderBy(asc(dispatchRounds.wave));
    },

    distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
      return haversineKm(a, b);
    },

    registerRealtime() {
      outbox.on('offer.created', async (ev) => {
        const p = ev.payload as { offerId: string; orderId: string; providerId: string; expiresAt: string };
        ctx.io?.to(rooms.provider(p.providerId)).emit('offer.created', { offerId: p.offerId, orderId: p.orderId, expiresAt: p.expiresAt });
      });
      outbox.on('offer.expired', async (ev) => {
        const p = ev.payload as { offerId: string; orderId: string; providerId: string };
        ctx.io?.to(rooms.provider(p.providerId)).emit('offer.expired', { offerId: p.offerId, orderId: p.orderId });
      });
    },

    admin: {
      matchingConfigs: {
        list: async () => db.select().from(matchingConfigs).orderBy(asc(matchingConfigs.createdAt)),
        upsert: async (input: z.infer<typeof UpsertMatchingConfigInput>) => {
          const values = { categoryId: input.categoryId, weights: input.weights, waves: input.waves, active: input.active };
          const [row] = input.id
            ? await db.update(matchingConfigs).set(values).where(eq(matchingConfigs.id, input.id)).returning()
            : await db.insert(matchingConfigs).values(values).onConflictDoUpdate({ target: matchingConfigs.categoryId, set: values }).returning();
          if (!row) throw errors.notFound('Configuração de matching');
          return row;
        },
        remove: async (id: string) => {
          await db.update(matchingConfigs).set({ active: false }).where(eq(matchingConfigs.id, id));
        },
      },
    },

    async offersForOrder(orderId: string) {
      return db.select().from(dispatchOffers).where(eq(dispatchOffers.orderId, orderId)).orderBy(asc(dispatchOffers.offeredAt));
    },

    hasPendingFor: async (providerId: string, orderId: string) => {
      const rows = await db.select({ id: dispatchOffers.id }).from(dispatchOffers).where(and(eq(dispatchOffers.providerId, providerId), eq(dispatchOffers.orderId, orderId), inArray(dispatchOffers.response, ['PENDING', 'ACCEPTED'])));
      return rows.length > 0;
    },
  };
}

export type DispatchService = ReturnType<typeof createDispatchService>;
