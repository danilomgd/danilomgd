import { ConciergePlan, type ConciergeRequest, type ConciergeRequestInput, type Quote } from '@velio/contracts';
import { needsHumanReview } from '@velio/domain';
import { asc, eq } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { conciergeRequests, orderTasks } from '../../db/schema';
import { errors } from '../../lib/errors';
import type { Exec } from '../_shared/util';
import type { PlatformService } from '../admin/platform';
import type { AssetsService } from '../assets/service';
import type { CatalogService } from '../catalog/service';
import type { CommunicationService } from '../communication/service';
import type { GeoService } from '../geo/service';
import type { IdentityService } from '../identity/service';
import type { OrdersService } from '../orders/service';
import type { OrderRow } from '../orders/types';
import type { QuotesService } from '../quotes/service';

export type ConciergeRow = typeof conciergeRequests.$inferSelect;

function toDto(r: ConciergeRow): ConciergeRequest {
  return {
    id: r.id,
    orderId: r.orderId,
    customerId: r.customerId,
    inputType: r.inputType as ConciergeRequest['inputType'],
    rawText: r.rawText,
    transcript: r.transcript,
    plan: r.plan ?? null,
    plannerName: r.plannerName,
    operatorUserId: r.operatorUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function createConciergeService(
  ctx: AppContext,
  deps: { orders: OrdersService; quotes: QuotesService; catalog: CatalogService; identity: IdentityService; geo: GeoService; assets: AssetsService; platform: PlatformService; communication: CommunicationService },
) {
  const { db, adapters, log } = ctx;
  const system = { type: 'system' as const, userId: null };

  async function byIdOrOrder(id: string): Promise<ConciergeRow> {
    const [a] = await db.select().from(conciergeRequests).where(eq(conciergeRequests.id, id)).limit(1);
    if (a) return a;
    const [b] = await db.select().from(conciergeRequests).where(eq(conciergeRequests.orderId, id)).limit(1);
    if (!b) throw errors.notFound('Pedido de concierge');
    return b;
  }

  async function byOrder(orderId: string, exec: Exec = db): Promise<ConciergeRow | null> {
    const [r] = await exec.select().from(conciergeRequests).where(eq(conciergeRequests.orderId, orderId)).limit(1);
    return r ?? null;
  }

  return {
    async create(userId: string, input: ConciergeRequestInput): Promise<ConciergeRequest> {
      const text = input.text?.trim() ?? input.audioUrl ?? input.imageUrls[0] ?? '';
      if (!text) throw errors.badRequest('Descreva o que você precisa');
      const service = await deps.catalog.getServiceBySlug('concierge');
      if (!service) throw errors.unprocessable('Serviço de concierge não configurado');
      const order = await deps.orders.createRequest(
        userId,
        { serviceId: service.id, addressId: input.addressId, vehicleId: input.vehicleId, schedule: { mode: 'NOW' }, options: {}, mediaUrls: input.imageUrls, notes: input.text },
        { relaxRequirements: true, priceOverrideCents: null },
      );
      const [row] = await db
        .insert(conciergeRequests)
        .values({ orderId: order.id, customerId: userId, inputType: input.inputType, rawText: input.text ?? null, audioUrl: input.audioUrl ?? null, imageUrls: input.imageUrls, transcript: input.inputType === 'TEXT' ? (input.text ?? null) : null })
        .returning();
      if (!row) throw new Error('Falha ao criar pedido de concierge');
      return toDto(row);
    },

    async get(id: string, user: { userId: string; roles: string[] }): Promise<ConciergeRequest> {
      const r = await byIdOrOrder(id);
      if (r.customerId !== user.userId && !user.roles.includes('operator') && !user.roles.includes('admin')) throw errors.forbidden();
      return toDto(r);
    },

    async hasPlan(exec: Exec, orderId: string): Promise<boolean> {
      const r = await byOrder(orderId, exec);
      return Boolean(r?.plan);
    },

    /** Efeito concierge.plan: chama o planejador, valida, grava e decide se precisa de humano. */
    async runPlanner(order: OrderRow): Promise<void> {
      const r = await byOrder(order.id);
      if (!r) return;
      const settings = await deps.platform.getSettings();
      const user = await deps.identity.getUserRow(order.customerId);
      const vehicles = await deps.assets.listVehicles(order.customerId);
      const addresses = await deps.geo.listAddresses(order.customerId);
      const text = [r.transcript ?? r.rawText ?? '', ...r.answers.map((a) => `${a.question}: ${a.answer}`)].join('\n');
      let plan: ConciergePlan;
      try {
        const raw = await adapters.planner.plan(text, {
          now: adapters.clock.now(),
          timezone: user?.timezone ?? 'America/Sao_Paulo',
          hasVehicle: vehicles.length > 0,
          hasAddress: addresses.length > 0,
          settings: settings.concierge,
        });
        const parsed = ConciergePlan.safeParse(raw);
        if (!parsed.success) throw new Error(`plano inválido: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
        plan = parsed.data;
      } catch (err) {
        log.error({ err, orderId: order.id }, 'planejador falhou; encaminhando para humano');
        plan = {
          summary: 'Pedido encaminhado para análise da equipe.',
          tasks: [{ seq: 1, title: 'Analisar pedido e montar plano', kind: 'CUSTOM', dependsOnSeq: [], notes: text.slice(0, 500) }],
          estimateMinCents: 0,
          estimateMaxCents: 0,
          confidence: 0,
          clarifications: [],
          requiresHuman: true,
          requiresHumanReasons: ['Falha do planejador automático'],
        };
      }
      await db.update(conciergeRequests).set({ plan, plannerName: adapters.planner.name }).where(eq(conciergeRequests.id, r.id));
      const review = needsHumanReview(plan, settings.concierge);
      if (review.required) {
        await deps.orders.tryTransition(order.id, 'system.plan_needs_human', system, { reasons: review.reasons });
      } else {
        await deps.orders.tryTransition(order.id, 'system.plan_ready', system, { confidence: plan.confidence, tasks: plan.tasks.length });
      }
    },

    async approvePlanByCustomer(id: string, user: { userId: string }) {
      const r = await byIdOrOrder(id);
      if (r.customerId !== user.userId) throw errors.forbidden();
      return deps.orders.transition(r.orderId, 'customer.approve_plan', { type: 'customer', userId: user.userId }, { conciergeRequestId: r.id });
    },

    /** Operador revisa (opcionalmente edita) o plano e libera para o cliente. */
    async operatorApprovePlan(id: string, operator: { userId: string }, plan: ConciergePlan | null) {
      const r = await byIdOrOrder(id);
      const finalPlan = plan ?? r.plan;
      if (!finalPlan) throw errors.unprocessable('Pedido sem plano para aprovar');
      await db.update(conciergeRequests).set({ plan: { ...finalPlan, requiresHuman: false }, operatorUserId: operator.userId }).where(eq(conciergeRequests.id, r.id));
      return deps.orders.transition(r.orderId, 'operator.approve_plan', { type: 'operator', userId: operator.userId }, { conciergeRequestId: r.id, edited: plan !== null });
    },

    async answer(id: string, user: { userId: string }, answers: Array<{ question: string; answer: string }>): Promise<ConciergeRequest> {
      const r = await byIdOrOrder(id);
      if (r.customerId !== user.userId) throw errors.forbidden();
      const [row] = await db.update(conciergeRequests).set({ answers: [...r.answers, ...answers] }).where(eq(conciergeRequests.id, r.id)).returning();
      if (!row) throw errors.notFound('Pedido de concierge');
      return toDto(row);
    },

    /** Efeito concierge.quote: orçamento INITIAL = soma das estimativas (ou estimateMaxCents) e `provider.submit_quote` como sistema. */
    async quoteFromPlan(order: OrderRow): Promise<Quote | null> {
      const r = await byOrder(order.id);
      if (!r?.plan) return null;
      const withEstimate = r.plan.tasks.filter((t) => typeof t.estimateCents === 'number');
      const amount = withEstimate.length > 0 ? withEstimate.reduce((s, t) => s + (t.estimateCents ?? 0), 0) : r.plan.estimateMaxCents;
      const items = withEstimate.map((t) => ({ description: t.title, quantity: 1, unitPriceCents: t.estimateCents ?? 0 }));
      const quote = await deps.quotes.createSystemInitial(order, amount, items, r.plan.summary);
      await deps.orders.transition(order.id, 'provider.submit_quote', system, { quoteId: quote.id, amountCents: amount });
      return quote;
    },

    /** Efeito concierge.spawnChildren: tarefas + ordens filhas para tarefas com serviço da plataforma. */
    async spawnChildren(order: OrderRow): Promise<void> {
      const r = await byOrder(order.id);
      if (!r?.plan) return;
      const existing = await db.select({ id: orderTasks.id }).from(orderTasks).where(eq(orderTasks.orderId, order.id));
      if (existing.length > 0) return;
      const vehicleId = (order.metadata as { vehicleId?: string | null }).vehicleId ?? null;
      const [request] = await db.select().from(conciergeRequests).where(eq(conciergeRequests.orderId, order.id)).limit(1);
      void request;
      const addressId = await deps.geo
        .listAddresses(order.customerId)
        .then((list) => list.find((a) => a.lat === order.lat && a.lng === order.lng)?.id ?? list.find((a) => a.isDefault)?.id ?? list[0]?.id);
      for (const t of r.plan.tasks) {
        let childOrderId: string | null = null;
        const service = t.serviceSlug ? await deps.catalog.getServiceBySlug(t.serviceSlug) : null;
        if (service?.active) {
          try {
            const child = await deps.orders.createRequest(
              order.customerId,
              {
                serviceId: service.id,
                addressId,
                vehicleId: service.requiresVehicle && vehicleId ? vehicleId : undefined,
                schedule: t.startsAt && new Date(t.startsAt).getTime() > adapters.clock.now().getTime() ? { mode: 'SCHEDULED', startsAt: t.startsAt, windowMinutes: 60 } : { mode: 'NOW' },
                options: {},
                mediaUrls: [],
                notes: `[Concierge] ${t.title}`,
              },
              { parentOrderId: order.id, priceOverrideCents: t.estimateCents ?? null, billedViaParent: true, relaxRequirements: true, actor: system },
            );
            childOrderId = child.id;
          } catch (err) {
            log.error({ err, orderId: order.id, task: t.seq }, 'falha ao criar ordem filha');
          }
        }
        await db.insert(orderTasks).values({ orderId: order.id, seq: t.seq, title: t.title, kind: t.kind, status: childOrderId ? 'IN_PROGRESS' : 'PENDING', childOrderId, dueAt: t.startsAt ? new Date(t.startsAt) : null, dependsOnSeq: t.dependsOnSeq, payload: { notes: t.notes ?? null, estimateCents: t.estimateCents ?? null } });
      }
    },

    /** Hook: ordem filha terminou → se todas terminaram, conclui o pai. */
    async onChildTerminal(child: OrderRow): Promise<void> {
      if (!child.parentOrderId) return;
      const parent = await deps.orders.findById(child.parentOrderId);
      if (!parent || parent.status !== 'IN_EXECUTION') return;
      const children = await deps.orders.listChildren(parent.id);
      const done = new Set(['COMPLETED', 'REVIEWED', 'CLOSED']);
      await db.update(orderTasks).set({ status: done.has(child.status) ? 'DONE' : 'SKIPPED' }).where(eq(orderTasks.childOrderId, child.id));
      if (!deps.orders.childrenAllDone(children)) return;
      const tasks = await db.select().from(orderTasks).where(eq(orderTasks.orderId, parent.id)).orderBy(asc(orderTasks.seq));
      for (const t of tasks) if (t.status === 'PENDING' || t.status === 'IN_PROGRESS') await db.update(orderTasks).set({ status: 'DONE' }).where(eq(orderTasks.id, t.id));
      await deps.orders.tryTransition(parent.id, 'system.children_completed', system, { children: children.length });
    },
  };
}

export type ConciergeService = ReturnType<typeof createConciergeService>;
