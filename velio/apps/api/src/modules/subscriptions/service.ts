import type { SubscribeInput, Subscription, SubscriptionPlan, UpsertPlanInput } from '@velio/contracts';
import { nextVisitDue } from '@velio/domain';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { subscriptionPlans, subscriptions, subscriptionVisits } from '../../db/schema';
import { errors } from '../../lib/errors';
import { addMonths, atLocalTime, iso } from '../_shared/util';
import type { AnalyticsService } from '../analytics/service';
import type { AssetsService } from '../assets/service';
import type { GeoService } from '../geo/service';
import type { IdentityService } from '../identity/service';
import type { OrdersService } from '../orders/service';
import type { PaymentsService } from '../payments/service';

export type PlanRow = typeof subscriptionPlans.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;

/** A visita é gerada com esta antecedência para o matching e os lembretes correrem normalmente. */
const VISIT_LEAD_DAYS = 7;

export function toPlanDto(p: PlanRow): SubscriptionPlan {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    serviceId: p.serviceId,
    intervalMonths: p.intervalMonths,
    visitsPerCycle: p.visitsPerCycle,
    priceCents: p.priceCents,
    benefits: p.benefits,
    active: p.active,
  };
}

export function createSubscriptionsService(
  ctx: AppContext,
  deps: {
    orders: OrdersService;
    payments: PaymentsService;
    assets: AssetsService;
    geo: GeoService;
    identity: IdentityService;
    analytics: AnalyticsService;
  },
) {
  const { db, adapters, scheduler, log } = ctx;

  async function getPlan(id: string): Promise<PlanRow> {
    const [p] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
    if (!p) throw errors.notFound('Plano');
    return p;
  }

  async function getSub(id: string): Promise<SubscriptionRow> {
    const [s] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!s) throw errors.notFound('Assinatura');
    return s;
  }

  async function toDto(s: SubscriptionRow): Promise<Subscription> {
    const plan = await getPlan(s.planId);
    return {
      id: s.id,
      planId: s.planId,
      planName: plan.name,
      status: s.status as Subscription['status'],
      equipmentIds: s.equipmentIds,
      startedAt: s.startedAt.toISOString(),
      nextVisitDueAt: iso(s.nextVisitDueAt),
      nextChargeAt: iso(s.nextChargeAt),
      cancelledAt: iso(s.cancelledAt),
    };
  }

  async function scheduleVisitJob(s: SubscriptionRow, dueAt: Date, now: Date) {
    const runAt = new Date(Math.max(now.getTime(), dueAt.getTime() - VISIT_LEAD_DAYS * 86_400_000));
    await scheduler.schedule(db, {
      kind: 'subscription.generate_visit',
      runAt,
      payload: { subscriptionId: s.id, dueAt: dueAt.toISOString() },
      dedupeKey: `subscription.generate_visit:${s.id}:${dueAt.toISOString()}`,
    });
  }

  return {
    async listPlans(): Promise<SubscriptionPlan[]> {
      const rows = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.active, true))
        .orderBy(asc(subscriptionPlans.sortOrder));
      return rows.map(toPlanDto);
    },

    async listMine(userId: string): Promise<Subscription[]> {
      const rows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.customerId, userId))
        .orderBy(desc(subscriptions.startedAt));
      return Promise.all(rows.map(toDto));
    },

    async hasActive(userId: string): Promise<boolean> {
      const rows = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.customerId, userId), eq(subscriptions.status, 'ACTIVE')))
        .limit(1);
      return rows.length > 0;
    },

    /** Assina: cobra o ciclo no cartão (capturado), ativa e agenda a primeira visita. */
    async subscribe(userId: string, input: z.infer<typeof SubscribeInput>): Promise<Subscription> {
      const plan = await getPlan(input.planId);
      if (!plan.active) throw errors.unprocessable('Plano indisponível');
      for (const eid of input.equipmentIds) await deps.assets.getEquipment(userId, eid);
      await deps.geo.getAddress(userId, input.addressId);
      const now = adapters.clock.now();
      const intent = await deps.payments.chargeSubscription(
        userId,
        input.paymentMethodId,
        plan.priceCents,
        null,
      );
      const due = nextVisitDue(null, now, plan.intervalMonths, plan.visitsPerCycle);
      const [s] = await db
        .insert(subscriptions)
        .values({
          customerId: userId,
          planId: plan.id,
          addressId: input.addressId,
          paymentMethodId: input.paymentMethodId,
          equipmentIds: input.equipmentIds,
          status: 'ACTIVE',
          preferredWeekday: input.preferredWeekday ?? null,
          preferredPeriod: input.preferredPeriod ?? null,
          startedAt: now,
          nextVisitDueAt: due,
          nextChargeAt: addMonths(now, plan.intervalMonths),
        })
        .returning();
      if (!s) throw new Error('Falha ao criar assinatura');
      await deps.payments.attachSubscription(intent.id, s.id);
      await scheduleVisitJob(s, due, now);
      await scheduler.schedule(db, {
        kind: 'subscription.charge',
        runAt: addMonths(now, plan.intervalMonths),
        payload: { subscriptionId: s.id },
        dedupeKey: `subscription.charge:${s.id}:${addMonths(now, plan.intervalMonths).toISOString()}`,
      });
      await deps.analytics.track('subscription_started', { userId, properties: { planSlug: plan.slug } });
      return toDto(s);
    },

    async cancel(userId: string, id: string, reason: string): Promise<Subscription> {
      const s = await getSub(id);
      if (s.customerId !== userId) throw errors.forbidden();
      if (s.status === 'CANCELLED') return toDto(s);
      const [row] = await db
        .update(subscriptions)
        .set({
          status: 'CANCELLED',
          cancelledAt: adapters.clock.now(),
          cancelReason: reason,
          nextVisitDueAt: null,
          nextChargeAt: null,
        })
        .where(eq(subscriptions.id, id))
        .returning();
      if (!row) throw errors.notFound('Assinatura');
      if (s.nextVisitDueAt)
        await scheduler.cancelByDedupe(
          db,
          `subscription.generate_visit:${s.id}:${s.nextVisitDueAt.toISOString()}`,
        );
      if (s.nextChargeAt)
        await scheduler.cancelByDedupe(db, `subscription.charge:${s.id}:${s.nextChargeAt.toISOString()}`);
      await deps.analytics.track('subscription_cancelled', { userId });
      return toDto(row);
    },

    /** Job subscription.generate_visit: cria a ordem SCHEDULED coberta pelo plano (preço 0) e registra a visita. */
    async generateVisit(subscriptionId: string, dueAtIso: string) {
      const s = await getSub(subscriptionId);
      if (s.status !== 'ACTIVE') return null;
      const dueAt = new Date(dueAtIso);
      const plan = await getPlan(s.planId);
      const user = await deps.identity.getUserRow(s.customerId);
      const tz = user?.timezone ?? 'America/Sao_Paulo';
      const hour = s.preferredPeriod === 'AFTERNOON' ? 14 : 9;
      let startsAt = atLocalTime(dueAt, hour, 0, tz);
      const now = adapters.clock.now();
      if (startsAt.getTime() <= now.getTime()) startsAt = new Date(now.getTime() + 24 * 3_600_000);
      const order = await deps.orders.createRequest(
        s.customerId,
        {
          serviceId: plan.serviceId,
          addressId: s.addressId,
          equipmentId: s.equipmentIds[0],
          schedule: { mode: 'SCHEDULED', startsAt: startsAt.toISOString(), windowMinutes: 120 },
          options: {},
          mediaUrls: [],
          paymentMethodId: s.paymentMethodId,
          notes: `Visita do ${plan.name}`,
        },
        {
          priceOverrideCents: 0,
          metadata: { subscriptionId: s.id, coveredByPlan: true, equipmentIds: s.equipmentIds },
          actor: { type: 'system', userId: null },
        },
      );
      await db.insert(subscriptionVisits).values({ subscriptionId: s.id, orderId: order.id, dueAt });
      const nextDue = nextVisitDue(dueAt, s.startedAt, plan.intervalMonths, plan.visitsPerCycle);
      const [updated] = await db
        .update(subscriptions)
        .set({ lastVisitAt: dueAt, nextVisitDueAt: nextDue })
        .where(eq(subscriptions.id, s.id))
        .returning();
      if (updated) await scheduleVisitJob(updated, nextDue, now);
      log.info({ subscriptionId: s.id, orderId: order.id }, 'visita de assinatura gerada');
      return order;
    },

    /** Job subscription.charge: renova o ciclo; falha deixa PAST_DUE. */
    async charge(subscriptionId: string) {
      const s = await getSub(subscriptionId);
      if (s.status !== 'ACTIVE' && s.status !== 'PAST_DUE') return;
      const plan = await getPlan(s.planId);
      const now = adapters.clock.now();
      try {
        await deps.payments.chargeSubscription(s.customerId, s.paymentMethodId, plan.priceCents, s.id);
        const next = addMonths(now, plan.intervalMonths);
        await db
          .update(subscriptions)
          .set({ status: 'ACTIVE', nextChargeAt: next })
          .where(eq(subscriptions.id, s.id));
        await scheduler.schedule(db, {
          kind: 'subscription.charge',
          runAt: next,
          payload: { subscriptionId: s.id },
          dedupeKey: `subscription.charge:${s.id}:${next.toISOString()}`,
        });
      } catch (err) {
        log.warn({ err, subscriptionId: s.id }, 'cobrança de assinatura falhou');
        await db.update(subscriptions).set({ status: 'PAST_DUE' }).where(eq(subscriptions.id, s.id));
      }
    },

    admin: {
      plans: {
        list: async () =>
          (await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder))).map(
            toPlanDto,
          ),
        upsert: async (input: z.infer<typeof UpsertPlanInput>) => {
          const values = {
            slug: input.slug,
            name: input.name,
            description: input.description ?? null,
            serviceId: input.serviceId,
            intervalMonths: input.intervalMonths,
            visitsPerCycle: input.visitsPerCycle,
            priceCents: input.priceCents,
            benefits: input.benefits,
            active: input.active,
          };
          const [row] = input.id
            ? await db
                .update(subscriptionPlans)
                .set(values)
                .where(eq(subscriptionPlans.id, input.id))
                .returning()
            : await db
                .insert(subscriptionPlans)
                .values(values)
                .onConflictDoUpdate({ target: subscriptionPlans.slug, set: values })
                .returning();
          if (!row) throw errors.notFound('Plano');
          return toPlanDto(row);
        },
        remove: async (id: string) => {
          await db.update(subscriptionPlans).set({ active: false }).where(eq(subscriptionPlans.id, id));
        },
      },
    },
  };
}

export type SubscriptionsService = ReturnType<typeof createSubscriptionsService>;
