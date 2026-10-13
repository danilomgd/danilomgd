import { randomBytes } from 'node:crypto';
import {
  type CreateServiceRequestInput,
  type CustodyScanInput,
  type EvidenceInput,
  type MediaEvidence,
  ORDER_STATUS_LABELS,
  type OrderEvent,
  type OrderListQuery,
  type OrderStatus,
  type OrderTask,
  type Quote,
  rooms,
  type ServiceOrder,
  type ServiceOrderDetail,
  TERMINAL_ORDER_STATUSES,
  type TransitionAction,
  type VehicleHandoverInput,
  type WorkflowKind,
} from '@velio/contracts';
import {
  allowedActions,
  applyTransition,
  type CouponSource,
  estimatePrice,
  getWorkflow,
  type OrderSnapshot,
  pinFromBytes,
  reminderTimes,
  scheduledMatchingStart,
  stateMeta,
} from '@velio/domain';
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, max, ne, notInArray, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import {
  bookings,
  custodyEvents,
  mediaEvidence,
  orderEvents,
  orderTasks,
  serviceOrders,
  serviceRequests,
  vehicleHandovers,
} from '../../db/schema';
import { AppError, errors } from '../../lib/errors';
import { type Exec, iso, page, shortCode } from '../_shared/util';
import type { PlatformService } from '../admin/platform';
import type { AssetsService } from '../assets/service';
import { type CatalogService, categoryConfig } from '../catalog/service';
import type { GeoService } from '../geo/service';
import type { IdentityService } from '../identity/service';
import type { ProvidersService } from '../providers/service';
import {
  type EffectContext,
  type EffectExecutor,
  meta,
  type OrderActor,
  type OrderEventRow,
  type OrderRow,
} from './types';

const LIVE_LOCATION_STATES = new Set<OrderStatus>([
  'EN_ROUTE',
  'ARRIVED',
  'EN_ROUTE_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'RETURN_PICKUP',
  'RETURNING',
]);
const PRE_EXECUTION_STATES = new Set<OrderStatus>([
  'SCHEDULED',
  'MATCHING',
  'OFFERED',
  'ACCEPTED',
  'REMINDED',
  'NO_PROVIDER_FOUND',
]);
const DONE_FOR_PARENT = new Set<OrderStatus>([
  'COMPLETED',
  'REVIEWED',
  'CLOSED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_PLATFORM',
]);

/** Serviços de outros módulos ligados após a construção (evita dependência circular). */
export interface OrdersLateDeps {
  quotes: { listForOrder(exec: Exec, orderId: string): Promise<Quote[]> };
  payments: {
    hasAuthorizedInitial(exec: Exec, orderId: string): Promise<boolean>;
    getMethod(userId: string, id: string): Promise<{ id: string; kind: 'CARD' | 'PIX' | 'WALLET' }>;
    getDefaultMethod(userId: string): Promise<{ id: string; kind: 'CARD' | 'PIX' | 'WALLET' } | null>;
    validateCoupon(
      code: string,
      userId: string | null,
      categoryId: string,
      now: Date,
    ): Promise<CouponSource | null>;
    redeemCoupon(
      exec: Exec,
      code: string,
      userId: string,
      orderId: string,
      discountCents: number,
    ): Promise<void>;
    createInitialPixIntent(exec: Exec, order: OrderRow, methodId: string): Promise<{ id: string }>;
  };
  concierge: { hasPlan(exec: Exec, orderId: string): Promise<boolean> };
  effects: EffectExecutor;
  hooks: { afterTransition(c: EffectContext): Promise<void> };
}

export interface CreateInternalOptions {
  parentOrderId?: string;
  priceOverrideCents?: number | null;
  billedViaParent?: boolean;
  relaxRequirements?: boolean;
  metadata?: Record<string, unknown>;
  actor?: OrderActor;
}

export function createOrdersService(
  ctx: AppContext,
  deps: {
    catalog: CatalogService;
    geo: GeoService;
    assets: AssetsService;
    identity: IdentityService;
    providers: ProvidersService;
    platform: PlatformService;
  },
) {
  const { db, adapters, outbox, scheduler, log, dbHandle } = ctx;
  let late: OrdersLateDeps | null = null;
  const L = (): OrdersLateDeps => {
    if (!late) throw new Error('Módulo orders usado antes de bind()');
    return late;
  };

  async function findById(id: string, exec: Exec = db): Promise<OrderRow | null> {
    const [o] = await exec.select().from(serviceOrders).where(eq(serviceOrders.id, id)).limit(1);
    return o ?? null;
  }
  async function getById(id: string, exec: Exec = db): Promise<OrderRow> {
    const o = await findById(id, exec);
    if (!o) throw errors.notFound('Ordem');
    return o;
  }

  async function nextSeq(exec: Exec, orderId: string): Promise<number> {
    const [r] = await exec
      .select({ m: max(orderEvents.seq) })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId));
    return Number(r?.m ?? 0) + 1;
  }

  async function appendEvent(
    exec: Exec,
    orderId: string,
    e: {
      type: string;
      action?: TransitionAction | null;
      from?: OrderStatus | null;
      to?: OrderStatus | null;
      actor: OrderActor;
      payload?: Record<string, unknown>;
    },
  ): Promise<OrderEventRow> {
    const seq = await nextSeq(exec, orderId);
    const [row] = await exec
      .insert(orderEvents)
      .values({
        orderId,
        seq,
        type: e.type,
        action: e.action ?? null,
        fromStatus: e.from ?? null,
        toStatus: e.to ?? null,
        actorType: e.actor.type,
        actorId: e.actor.type === 'provider' ? (e.actor.providerId ?? e.actor.userId) : e.actor.userId,
        payload: e.payload ?? {},
      })
      .returning();
    if (!row) throw new Error('Falha ao gravar evento da ordem');
    return row;
  }

  // ---------------------------------------------------------------------------------------------
  // Snapshot para o engine de workflow
  // ---------------------------------------------------------------------------------------------
  async function buildSnapshot(exec: Exec, o: OrderRow): Promise<OrderSnapshot> {
    const l = L();
    const evidence = await exec
      .select({ kind: mediaEvidence.kind })
      .from(mediaEvidence)
      .where(eq(mediaEvidence.orderId, o.id));
    const quotes = await l.quotes.listForOrder(exec, o.id);
    const children = await exec
      .select({ status: serviceOrders.status })
      .from(serviceOrders)
      .where(eq(serviceOrders.parentOrderId, o.id));
    const [scan] = await exec
      .select({ id: custodyEvents.id })
      .from(custodyEvents)
      .where(and(eq(custodyEvents.orderId, o.id), eq(custodyEvents.step, o.status)))
      .limit(1);
    const handoverStep = o.status === 'RETURNING' || o.status === 'RETURN_PICKUP' ? 'DELIVERY' : 'PICKUP';
    const [handover] = await exec
      .select({ id: vehicleHandovers.id })
      .from(vehicleHandovers)
      .where(and(eq(vehicleHandovers.orderId, o.id), eq(vehicleHandovers.step, handoverStep)))
      .limit(1);
    const m = meta(o);
    const noChargeNeeded = (o.totalCents ?? 0) <= 0 || m.billedViaParent === true || m.coveredByPlan === true;
    return {
      id: o.id,
      customerId: o.customerId,
      providerId: o.providerId,
      status: o.status as OrderStatus,
      workflowKind: o.workflowKind as WorkflowKind,
      priceCents: o.priceCents,
      acceptedAt: o.acceptedAt,
      scheduledFor: o.scheduledFor,
      startPin: o.startPin,
      requiresStartPin: o.flags.requiresStartPin,
      requiresBeforeAfterPhotos: o.flags.requiresBeforeAfterPhotos,
      requiresCustody: o.flags.requiresCustody,
      requiresVehicleHandover: o.flags.requiresVehicleHandover,
      evidenceKinds: [...new Set(evidence.map((e) => e.kind))],
      quotes: quotes.map((q) => ({ kind: q.kind, status: q.status })),
      paymentAuthorized: noChargeNeeded || (await l.payments.hasAuthorizedInitial(exec, o.id)),
      childOrders: children.map((c) => ({ status: c.status as OrderStatus })),
      hasPlan: o.workflowKind === 'CONCIERGE' ? await l.concierge.hasPlan(exec, o.id) : false,
      custodyScannedForCurrentStep: Boolean(scan),
      vehicleHandoverRecorded: Boolean(handover),
    };
  }

  function workflowOf(o: OrderRow) {
    return getWorkflow(o.workflowKind as WorkflowKind, o.workflowVersion);
  }

  // ---------------------------------------------------------------------------------------------
  // Transição genérica
  // ---------------------------------------------------------------------------------------------
  function columnPatch(
    action: TransitionAction,
    _to: OrderStatus,
    o: OrderRow,
    actor: OrderActor,
    payload: Record<string, unknown>,
    now: Date,
  ): Partial<typeof serviceOrders.$inferInsert> {
    const patch: Partial<typeof serviceOrders.$inferInsert> = {};
    const m = meta(o);
    switch (action) {
      case 'system.start_matching':
        patch.matchingStartedAt = now;
        patch.dispatchWave = 0;
        break;
      case 'provider.accept':
      case 'operator.assign': {
        const providerId =
          action === 'provider.accept' ? actor.providerId : (payload.providerId as string | undefined);
        if (!providerId) throw errors.badRequest('providerId obrigatório para atribuição');
        patch.providerId = providerId;
        patch.acceptedAt = now;
        break;
      }
      case 'provider.cancel':
        patch.providerId = null;
        patch.acceptedAt = null;
        patch.matchingStartedAt = now; // novo ciclo de matching
        patch.dispatchWave = 0;
        patch.metadata = {
          ...m,
          excludedProviderIds: [...(m.excludedProviderIds ?? []), ...(o.providerId ? [o.providerId] : [])],
        };
        break;
      case 'provider.start':
        patch.startedAt = now;
        break;
      case 'provider.complete':
      case 'system.children_completed':
        patch.completedAt = now;
        break;
      case 'customer.cancel':
      case 'operator.cancel':
        patch.cancelReason = typeof payload.reason === 'string' ? payload.reason : null;
        patch.cancelledBy = actor.type;
        patch.cancelledAt = now;
        break;
      case 'customer.approve_quote': {
        const amount = typeof payload.amountCents === 'number' ? payload.amountCents : o.priceCents;
        if (amount !== null) {
          patch.priceCents = amount;
          patch.totalCents = Math.max(0, amount + o.additionalApprovedCents - o.discountCents);
        }
        break;
      }
      default:
        break;
    }
    return patch;
  }

  interface TransitionOutcome {
    order: OrderRow;
    previous: OrderRow;
    event: OrderEventRow;
    effects: EffectContext & { names: string[] };
  }

  async function transitionTx(
    orderId: string,
    action: TransitionAction,
    actor: OrderActor,
    payload: Record<string, unknown>,
  ): Promise<TransitionOutcome> {
    const now = adapters.clock.now();
    return db.transaction(async (tx) => {
      const base = tx.select().from(serviceOrders).where(eq(serviceOrders.id, orderId)).limit(1);
      const [o] = dbHandle.driver === 'postgres' ? await base.for('update') : await base;
      if (!o) throw errors.notFound('Ordem');
      const def = workflowOf(o);
      const snapshot = await buildSnapshot(tx, o);
      const tctx = { now, payload };
      const r = applyTransition(def, snapshot, action, actor, tctx);
      if (!r.ok) {
        throw errors.invalidTransition(r.reason, {
          status: o.status,
          allowedActions: allowedActions(def, snapshot, actor, tctx),
          code: r.code,
          guard: r.guard ?? null,
        });
      }
      const patch = columnPatch(action, r.to, o, actor, payload, now);
      const [updated] = await tx
        .update(serviceOrders)
        .set({ ...patch, status: r.to, version: o.version + 1, updatedAt: now })
        .where(and(eq(serviceOrders.id, o.id), eq(serviceOrders.version, o.version)))
        .returning();
      if (!updated) throw errors.conflict('Ordem alterada simultaneamente; tente novamente');
      const safePayload = Object.fromEntries(
        Object.entries(payload).filter(([k]) => k !== 'pin' && k !== 'customerConfirmationPin'),
      );
      const event = await appendEvent(tx, o.id, {
        type: 'order.transitioned',
        action,
        from: o.status as OrderStatus,
        to: r.to,
        actor,
        payload: safePayload,
      });
      await outbox.publish(tx, {
        type: 'order.transitioned',
        aggregateType: 'order',
        aggregateId: o.id,
        payload: {
          orderId: o.id,
          from: o.status,
          to: r.to,
          action,
          eventId: event.id,
          seq: event.seq,
          customerId: o.customerId,
          providerId: updated.providerId ?? o.providerId,
          updatedAt: now.toISOString(),
        },
      });
      return {
        order: updated,
        previous: o,
        event,
        effects: {
          order: updated,
          previous: o,
          action,
          actor,
          payload,
          now,
          eventId: event.id,
          names: r.effects,
        },
      };
    });
  }

  async function runEffects(out: TransitionOutcome) {
    const l = L();
    const { names, ...c } = out.effects;
    for (const name of names) {
      const fn = l.effects[name as keyof EffectExecutor];
      if (!fn) {
        log.warn({ effect: name, orderId: c.order.id }, 'efeito sem executor');
        continue;
      }
      try {
        await fn(c);
      } catch (err) {
        // Efeitos são pós-commit: falha não desfaz a transição; fica registrado para operação.
        log.error({ err, effect: name, orderId: c.order.id, action: c.action }, 'efeito falhou');
        await appendEvent(db, c.order.id, {
          type: 'effect.failed',
          actor: { type: 'system', userId: null },
          payload: { effect: name, action: c.action, error: String((err as Error).message) },
        }).catch(() => undefined);
      }
    }
    try {
      await l.hooks.afterTransition(c);
    } catch (err) {
      log.error({ err, orderId: c.order.id }, 'hook pós-transição falhou');
    }
  }

  async function transition(
    orderId: string,
    action: TransitionAction,
    actor: OrderActor,
    payload: Record<string, unknown> = {},
  ): Promise<OrderRow> {
    const out = await transitionTx(orderId, action, actor, payload);
    await runEffects(out);
    return (await findById(orderId)) ?? out.order;
  }

  /** Variante para jobs: ignora transição inválida (ordem já mudou de estado). */
  async function tryTransition(
    orderId: string,
    action: TransitionAction,
    actor: OrderActor,
    payload: Record<string, unknown> = {},
  ): Promise<OrderRow | null> {
    try {
      return await transition(orderId, action, actor, payload);
    } catch (err) {
      if (err instanceof AppError && (err.code === 'INVALID_TRANSITION' || err.code === 'NOT_FOUND')) {
        log.debug({ orderId, action, reason: err.message }, 'transição ignorada');
        return null;
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Criação de pedidos
  // ---------------------------------------------------------------------------------------------
  async function scheduleDispatch(exec: Exec, o: OrderRow, now: Date) {
    const runAt = o.scheduledFor ? scheduledMatchingStart(o.scheduledFor, now) : now;
    await scheduler.schedule(exec, {
      kind: 'dispatch.start',
      runAt,
      payload: { orderId: o.id },
      dedupeKey: `dispatch.start:${o.id}`,
    });
  }

  async function ensureBookingAndReminders(exec: Exec, o: OrderRow, now: Date, durationMin: number | null) {
    if (!o.scheduledFor) return;
    const endsAt = new Date(o.scheduledFor.getTime() + (durationMin ?? 60) * 60_000);
    await exec
      .insert(bookings)
      .values({ orderId: o.id, providerId: o.providerId, startsAt: o.scheduledFor, endsAt })
      .onConflictDoUpdate({
        target: bookings.orderId,
        set: { providerId: o.providerId, startsAt: o.scheduledFor, endsAt, releasedAt: null },
      });
    for (const t of reminderTimes(o.scheduledFor, now)) {
      const hours = Math.round((o.scheduledFor.getTime() - t.getTime()) / 3_600_000);
      await scheduler.schedule(exec, {
        kind: 'booking.remind',
        runAt: t,
        payload: { orderId: o.id, hours },
        dedupeKey: `booking.remind:${o.id}:${hours}h`,
      });
    }
  }

  async function createRequest(
    customerId: string,
    input: CreateServiceRequestInput,
    internal: CreateInternalOptions = {},
  ): Promise<OrderRow> {
    const l = L();
    const now = adapters.clock.now();
    const actor: OrderActor = internal.actor ?? { type: 'customer', userId: customerId };

    if (input.idempotencyKey) {
      const [existing] = await db
        .select({ id: serviceRequests.id })
        .from(serviceRequests)
        .where(
          and(
            eq(serviceRequests.customerId, customerId),
            eq(serviceRequests.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        const [o] = await db
          .select()
          .from(serviceOrders)
          .where(eq(serviceOrders.requestId, existing.id))
          .limit(1);
        if (o) return o;
      }
    }

    const service = await deps.catalog.getServiceRow(input.serviceId);
    if (!service.active) throw errors.unprocessable('Serviço indisponível');
    const category = await deps.catalog.getCategory(service.categoryId);
    const cfg = categoryConfig(category);
    const kind = service.workflowKind as WorkflowKind;
    const def = getWorkflow(kind);
    const relax = internal.relaxRequirements === true;

    let scheduledFor: Date | null = null;
    let windowMinutes: number | null = null;
    if (input.schedule.mode === 'SCHEDULED') {
      if (!service.allowsScheduling) throw errors.unprocessable('Este serviço não aceita agendamento');
      scheduledFor = new Date(input.schedule.startsAt);
      if (scheduledFor.getTime() <= now.getTime())
        throw errors.unprocessable('Horário agendado deve estar no futuro');
      windowMinutes = input.schedule.windowMinutes;
    } else if (!service.allowsImmediate && !relax) {
      throw errors.unprocessable('Este serviço precisa ser agendado');
    }

    const address = input.addressId ? await deps.geo.getAddress(customerId, input.addressId) : null;
    if (service.requiresAddress && !address && !relax)
      throw errors.unprocessable('Endereço obrigatório para este serviço');
    const vehicle = input.vehicleId ? await deps.assets.getVehicle(customerId, input.vehicleId) : null;
    if ((service.requiresVehicle || cfg.requiresVehicle) && !vehicle && !relax)
      throw errors.unprocessable('Veículo obrigatório para este serviço');
    const equipment = input.equipmentId
      ? await deps.assets.getEquipment(customerId, input.equipmentId)
      : null;
    if ((service.requiresEquipment || cfg.requiresEquipment) && !equipment && !relax)
      throw errors.unprocessable('Equipamento obrigatório para este serviço');
    const destination = input.destinationAddressId
      ? await deps.geo.getAddress(customerId, input.destinationAddressId)
      : null;

    const lat = address ? Number(address.lat) : null;
    const lng = address ? Number(address.lng) : null;
    const region = lat !== null && lng !== null ? await deps.geo.resolveRegion(lat, lng) : null;

    // Preço: regra por região + opções + cupom (validado pelo módulo payments).
    const src = await deps.catalog.getPriceSource(service.id, region?.id ?? null);
    const coupon = input.couponCode
      ? await l.payments.validateCoupon(input.couponCode.toUpperCase(), customerId, category.id, now)
      : null;
    if (input.couponCode && !coupon) throw errors.unprocessable('Cupom inválido ou expirado');
    const estimate = estimatePrice(src, input.options, coupon);
    let priceCents =
      internal.priceOverrideCents !== undefined
        ? internal.priceOverrideCents
        : (estimate.totalCents ?? estimate.minCents ?? null);
    const discountCents = internal.priceOverrideCents !== undefined ? 0 : estimate.discountCents;
    if (internal.priceOverrideCents === undefined && estimate.pricingModel === 'RANGE')
      priceCents = estimate.minCents;
    const totalCents = priceCents === null ? null : Math.max(0, priceCents - discountCents);

    // Método de pagamento: informado ou padrão; PIX gera cobrança antecipada (doc 11 §7).
    const chargeNeeded = (totalCents ?? 0) > 0 && !internal.billedViaParent;
    let method: { id: string; kind: 'CARD' | 'PIX' | 'WALLET' } | null = null;
    if (chargeNeeded) {
      method = input.paymentMethodId
        ? await l.payments.getMethod(customerId, input.paymentMethodId)
        : await l.payments.getDefaultMethod(customerId);
    }

    const requiresCustody =
      cfg.requiresCustody || kind === 'LAUNDRY' || (kind === 'LOGISTICS' && vehicle !== null);
    const flags = {
      requiresStartPin: cfg.requiresStartPin,
      requiresBeforeAfterPhotos: cfg.requiresBeforeAfterPhotos,
      requiresCustody,
      requiresVehicleHandover: kind === 'LOGISTICS' && vehicle !== null,
      allowsAdditionalQuote: cfg.allowsAdditionalQuote,
    };

    const metadata: Record<string, unknown> = {
      ...(internal.metadata ?? {}),
      paymentMethodId: method?.id ?? null,
      paymentMethodKind: method?.kind ?? null,
      billedViaParent: internal.billedViaParent === true,
      vehicleId: vehicle?.id ?? null,
      vehiclePlate: vehicle?.plate ?? null,
      equipmentIds: equipment
        ? [equipment.id]
        : ((internal.metadata?.equipmentIds as string[] | undefined) ?? []),
      neighborhood: address?.neighborhood ?? null,
      city: address?.city ?? null,
      awaitingPixPayment: chargeNeeded && method?.kind === 'PIX',
      estimate: { min: estimate.minCents, max: estimate.maxCents, model: estimate.pricingModel },
    };

    const created = await db.transaction(async (tx) => {
      const [request] = await tx
        .insert(serviceRequests)
        .values({
          customerId,
          serviceId: service.id,
          addressId: address?.id ?? null,
          vehicleId: vehicle?.id ?? null,
          equipmentId: equipment?.id ?? null,
          destinationAddressId: destination?.id ?? null,
          scheduleMode: input.schedule.mode,
          scheduledFor,
          windowMinutes,
          options: input.options,
          notes: input.notes ?? null,
          mediaUrls: input.mediaUrls,
          couponCode: coupon?.code ?? null,
          paymentMethodId: method?.id ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();
      if (!request) throw new Error('Falha ao criar solicitação');
      const [order] = await tx
        .insert(serviceOrders)
        .values({
          requestId: request.id,
          customerId,
          parentOrderId: internal.parentOrderId ?? null,
          serviceId: service.id,
          categoryId: category.id,
          regionId: region?.id ?? null,
          workflowKind: kind,
          workflowVersion: def.version,
          status: def.initial,
          scheduledFor,
          windowMinutes,
          addressSummary: address
            ? `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ''} — ${address.neighborhood}, ${address.city}`
            : null,
          lat,
          lng,
          addressInstructions: address?.instructions ?? null,
          destinationSummary: destination
            ? `${destination.street}, ${destination.number} — ${destination.neighborhood}, ${destination.city}`
            : null,
          destinationLat: destination ? Number(destination.lat) : null,
          destinationLng: destination ? Number(destination.lng) : null,
          priceCents,
          discountCents,
          totalCents,
          startPin: flags.requiresStartPin ? pinFromBytes(randomBytes(4)) : null,
          custodyCode: requiresCustody ? shortCode(6, 'VL-') : null,
          notes: input.notes ?? null,
          flags,
          metadata,
        })
        .returning();
      if (!order) throw new Error('Falha ao criar ordem');

      await appendEvent(tx, order.id, {
        type: 'order.created',
        to: def.initial,
        actor,
        payload: { serviceId: service.id, kind, scheduledFor: iso(scheduledFor), priceCents, discountCents },
      });
      if (coupon && discountCents > 0)
        await l.payments.redeemCoupon(tx, coupon.code, customerId, order.id, discountCents);
      await outbox.publish(tx, {
        type: 'order.created',
        aggregateType: 'order',
        aggregateId: order.id,
        payload: { orderId: order.id, customerId, status: order.status, kind },
      });

      if (chargeNeeded && method?.kind === 'PIX') {
        // PIX: cobrança nasce agora; o matching só começa após o webhook PAID (payment.pix_timeout cancela em 15 min).
        const intent = await l.payments.createInitialPixIntent(tx, order, method.id);
        await scheduler.schedule(tx, {
          kind: 'payment.pix_timeout',
          runAt: new Date(now.getTime() + 15 * 60_000),
          payload: { orderId: order.id, intentId: intent.id },
          dedupeKey: `payment.pix_timeout:${order.id}`,
        });
      } else if (kind === 'CONCIERGE') {
        await scheduler.schedule(tx, {
          kind: 'concierge.plan',
          runAt: now,
          payload: { orderId: order.id },
          dedupeKey: `concierge.plan:${order.id}`,
        });
      } else {
        await scheduleDispatch(tx, order, now);
      }
      if (scheduledFor) await ensureBookingAndReminders(tx, order, now, service.estimatedDurationMinutes);
      return order;
    });
    log.info({ orderId: created.id, kind, status: created.status }, 'ordem criada');
    return created;
  }

  // ---------------------------------------------------------------------------------------------
  // DTOs
  // ---------------------------------------------------------------------------------------------
  function toEventDto(e: OrderEventRow): OrderEvent {
    return {
      id: e.id,
      orderId: e.orderId,
      seq: e.seq,
      type: e.type,
      action: (e.action as TransitionAction | null) ?? null,
      fromStatus: (e.fromStatus as OrderStatus | null) ?? null,
      toStatus: (e.toStatus as OrderStatus | null) ?? null,
      actorType: e.actorType as OrderEvent['actorType'],
      actorId: e.actorId,
      payload: e.payload,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async function toDto(o: OrderRow, viewer: OrderActor | null = null): Promise<ServiceOrder> {
    const service = await deps.catalog.getServiceRow(o.serviceId);
    const category = await deps.catalog.getCategory(o.categoryId);
    const provider = o.providerId
      ? await deps.providers.toPublic(await deps.providers.getById(o.providerId))
      : null;
    // O PIN é segredo do cliente: o prestador nunca o recebe pela API.
    const showPin = viewer === null || viewer.type === 'customer' || viewer.type === 'operator';
    return {
      id: o.id,
      requestId: o.requestId,
      customerId: o.customerId,
      providerId: o.providerId,
      parentOrderId: o.parentOrderId,
      serviceId: o.serviceId,
      serviceName: service.name,
      categorySlug: category.slug,
      workflowKind: o.workflowKind as WorkflowKind,
      workflowVersion: o.workflowVersion,
      status: o.status as OrderStatus,
      scheduledFor: iso(o.scheduledFor),
      windowMinutes: o.windowMinutes,
      etaAt: iso(o.etaAt),
      address:
        o.lat !== null && o.lng !== null
          ? { summary: o.addressSummary ?? '', lat: o.lat, lng: o.lng, instructions: o.addressInstructions }
          : null,
      destination:
        o.destinationLat !== null && o.destinationLng !== null
          ? { summary: o.destinationSummary ?? '', lat: o.destinationLat, lng: o.destinationLng }
          : null,
      priceCents: o.priceCents,
      additionalApprovedCents: o.additionalApprovedCents,
      discountCents: o.discountCents,
      totalCents: o.totalCents,
      platformFeeCents: o.platformFeeCents,
      providerPayoutCents: o.providerPayoutCents,
      startPin: showPin ? o.startPin : null,
      custodyCode: o.custodyCode,
      notes: o.notes,
      provider,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      startedAt: iso(o.startedAt),
      completedAt: iso(o.completedAt),
    };
  }

  async function toDetail(o: OrderRow, actor: OrderActor): Promise<ServiceOrderDetail> {
    const base = await toDto(o, actor);
    const events = await db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, o.id))
      .orderBy(asc(orderEvents.seq));
    const quotes = await L().quotes.listForOrder(db, o.id);
    const tasks = await db
      .select()
      .from(orderTasks)
      .where(eq(orderTasks.orderId, o.id))
      .orderBy(asc(orderTasks.seq));
    const snapshot = await buildSnapshot(db, o);
    return {
      ...base,
      events: events.map(toEventDto),
      quotes,
      tasks: tasks.map(
        (t): OrderTask => ({
          id: t.id,
          orderId: t.orderId,
          seq: t.seq,
          title: t.title,
          kind: t.kind,
          status: t.status as OrderTask['status'],
          childOrderId: t.childOrderId,
          dueAt: iso(t.dueAt),
          payload: t.payload,
        }),
      ),
      allowedActions: allowedActions(workflowOf(o), snapshot, actor, {
        now: adapters.clock.now(),
        payload: {},
      }),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------------------------
  const terminal = [...TERMINAL_ORDER_STATUSES];

  async function list(where: ReturnType<typeof and>, q: z.infer<typeof OrderListQuery>) {
    const scope =
      q.scope === 'active'
        ? notInArray(serviceOrders.status, terminal)
        : q.scope === 'history'
          ? inArray(serviceOrders.status, terminal)
          : undefined;
    const cursor = q.cursor ? lt(serviceOrders.id, q.cursor) : undefined;
    const rows = await db
      .select()
      .from(serviceOrders)
      .where(and(where, scope, cursor))
      .orderBy(desc(serviceOrders.id))
      .limit(q.limit + 1);
    const p = page(rows, q.limit);
    return { items: await Promise.all(p.items.map((o) => toDto(o))), nextCursor: p.nextCursor };
  }

  async function canUserAccessOrder(
    userId: string,
    roles: string[],
    providerId: string | null,
    orderId: string,
  ): Promise<boolean> {
    if (roles.includes('operator') || roles.includes('admin')) return true;
    const o = await findById(orderId);
    if (!o) return false;
    if (o.customerId === userId) return true;
    return providerId !== null && o.providerId === providerId;
  }

  async function requireOrderFor(
    orderId: string,
    auth: { userId: string; roles: string[]; providerId: string | null },
  ): Promise<OrderRow> {
    const o = await getById(orderId);
    if (!(await canUserAccessOrder(auth.userId, auth.roles, auth.providerId, orderId)))
      throw errors.forbidden('Sem acesso a esta ordem');
    return o;
  }

  // ---------------------------------------------------------------------------------------------
  // Evidências, custódia e handover
  // ---------------------------------------------------------------------------------------------
  async function addEvidence(
    orderId: string,
    userId: string,
    input: z.infer<typeof EvidenceInput>,
  ): Promise<MediaEvidence> {
    const [row] = await db
      .insert(mediaEvidence)
      .values({
        orderId,
        kind: input.kind,
        url: input.url,
        metadata: input.metadata,
        createdByUserId: userId,
      })
      .returning();
    if (!row) throw new Error('Falha ao gravar evidência');
    await appendEvent(db, orderId, {
      type: 'evidence.added',
      actor: { type: 'provider', userId },
      payload: { kind: input.kind, evidenceId: row.id },
    });
    return {
      id: row.id,
      orderId,
      kind: input.kind,
      url: row.url,
      metadata: row.metadata,
      createdByUserId: userId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  const CUSTODY_PARTIES: Partial<Record<OrderStatus, { from: string; to: string }>> = {
    EN_ROUTE_PICKUP: { from: 'CUSTOMER', to: 'PROVIDER' },
    DRIVER_ASSIGNED: { from: 'CUSTOMER', to: 'PROVIDER' },
    IN_TRANSIT: { from: 'PROVIDER', to: 'THIRD_PARTY' },
    THIRD_PARTY_DONE: { from: 'THIRD_PARTY', to: 'PROVIDER' },
    RETURNING: { from: 'PROVIDER', to: 'CUSTOMER' },
  };

  /** Leitura do QR/placa: valida o código e registra a custódia para a etapa atual. */
  async function custodyScan(
    orderId: string,
    user: { userId: string; providerId: string | null },
    input: z.infer<typeof CustodyScanInput>,
  ): Promise<void> {
    const o = await getById(orderId);
    if (!o.providerId || o.providerId !== user.providerId)
      throw errors.forbidden('Somente o prestador atribuído registra custódia');
    const code = input.itemCode.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const plate = (meta(o).vehiclePlate ?? '').toUpperCase();
    const custody = (o.custodyCode ?? '').toUpperCase();
    const matchesCustody = Boolean(custody) && (code === custody || code === custody.replace('-', ''));
    const matchesPlate = Boolean(plate) && code.replace('-', '') === plate;
    if (!matchesCustody && !matchesPlate)
      throw errors.unprocessable('Código não corresponde ao item desta ordem');
    // Item canônico: a placa identifica veículos; o código de custódia identifica os demais itens.
    const itemCode = matchesPlate ? plate : custody;
    const [dup] = await db
      .select({ id: custodyEvents.id })
      .from(custodyEvents)
      .where(and(eq(custodyEvents.orderId, orderId), eq(custodyEvents.step, o.status)))
      .limit(1);
    if (dup) return;
    const parties = CUSTODY_PARTIES[o.status as OrderStatus] ?? { from: 'PROVIDER', to: 'PROVIDER' };
    await db.insert(custodyEvents).values({
      orderId,
      itemCode,
      step: o.status,
      fromParty: parties.from,
      toParty: parties.to,
      byUserId: user.userId,
      lat: input.location?.lat ?? null,
      lng: input.location?.lng ?? null,
      photoUrl: input.photoUrl ?? null,
      note: input.note ?? null,
    });
    await appendEvent(db, orderId, {
      type: 'custody.scanned',
      actor: { type: 'provider', userId: user.userId, providerId: user.providerId },
      payload: { step: o.status },
    });
  }

  /** Efeito `custody.record`: garante um CustodyEvent para a etapa que acabou de ser concluída. */
  async function recordCustodyForTransition(c: EffectContext): Promise<void> {
    const step = c.previous.status as OrderStatus;
    const [existing] = await db
      .select({ id: custodyEvents.id })
      .from(custodyEvents)
      .where(and(eq(custodyEvents.orderId, c.order.id), eq(custodyEvents.step, step)))
      .limit(1);
    if (existing) return;
    const parties = CUSTODY_PARTIES[step] ?? { from: 'PROVIDER', to: 'PROVIDER' };
    await db.insert(custodyEvents).values({
      orderId: c.order.id,
      itemCode: meta(c.order).vehiclePlate ?? c.order.custodyCode ?? 'N/A',
      step,
      fromParty: parties.from,
      toParty: parties.to,
      byUserId: c.actor.userId ?? 'system',
      lat: c.order.destinationLat,
      lng: c.order.destinationLng,
      note: `Registrado na transição ${c.action}`,
    });
  }

  async function vehicleHandover(
    orderId: string,
    user: { userId: string; providerId: string | null },
    step: 'PICKUP' | 'DELIVERY',
    input: z.infer<typeof VehicleHandoverInput>,
  ): Promise<void> {
    const o = await getById(orderId);
    if (!o.providerId || o.providerId !== user.providerId)
      throw errors.forbidden('Somente o prestador atribuído registra a entrega do veículo');
    if (!o.flags.requiresVehicleHandover) throw errors.unprocessable('Esta ordem não envolve veículo');
    let customerConfirmed: string | null = null;
    if (input.customerConfirmationPin) {
      if (!o.startPin || input.customerConfirmationPin !== o.startPin)
        throw errors.unprocessable('PIN de confirmação do cliente inválido');
      customerConfirmed = adapters.clock.now().toISOString();
    }
    await db.insert(vehicleHandovers).values({
      orderId,
      step,
      odometerKm: input.odometerKm,
      fuelLevelPct: input.fuelLevelPct ?? null,
      checklist: input.checklist,
      photoUrls: input.photoUrls,
      customerConfirmed,
      byUserId: user.userId,
    });
    // As fotos do handover são a evidência da etapa (PICKUP/DELIVERY).
    for (const url of input.photoUrls) {
      await db.insert(mediaEvidence).values({
        orderId,
        kind: step,
        url,
        metadata: { odometerKm: input.odometerKm },
        createdByUserId: user.userId,
      });
    }
    await appendEvent(db, orderId, {
      type: 'vehicle.handover',
      actor: { type: 'provider', userId: user.userId, providerId: user.providerId },
      payload: { step, odometerKm: input.odometerKm },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Mutadores usados por efeitos de outros módulos
  // ---------------------------------------------------------------------------------------------
  async function patchMetadata(orderId: string, patch: Record<string, unknown>) {
    const o = await getById(orderId);
    await db
      .update(serviceOrders)
      .set({ metadata: { ...meta(o), ...patch } })
      .where(eq(serviceOrders.id, orderId));
  }

  return {
    bind(l: OrdersLateDeps) {
      late = l;
    },
    findById,
    getById,
    createRequest,
    transition,
    tryTransition,
    toDto,
    toDetail,
    toEventDto,
    buildSnapshot,
    canUserAccessOrder,
    requireOrderFor,
    addEvidence,
    custodyScan,
    recordCustodyForTransition,
    vehicleHandover,
    patchMetadata,
    appendEvent: (orderId: string, e: Parameters<typeof appendEvent>[2]) => appendEvent(db, orderId, e),

    listForCustomer: (userId: string, q: z.infer<typeof OrderListQuery>) =>
      list(eq(serviceOrders.customerId, userId), q),
    listForProvider: (providerId: string, q: z.infer<typeof OrderListQuery>) =>
      list(eq(serviceOrders.providerId, providerId), q),

    async setPaymentMethod(orderId: string, method: { id: string; kind: 'CARD' | 'PIX' | 'WALLET' }) {
      await patchMetadata(orderId, { paymentMethodId: method.id, paymentMethodKind: method.kind });
    },

    async addApprovedAdditional(orderId: string, amountCents: number) {
      const o = await getById(orderId);
      const additional = o.additionalApprovedCents + amountCents;
      await db
        .update(serviceOrders)
        .set({
          additionalApprovedCents: additional,
          totalCents: Math.max(0, (o.priceCents ?? 0) + additional - o.discountCents),
        })
        .where(eq(serviceOrders.id, orderId));
    },

    async setFinancials(orderId: string, f: { platformFeeCents: number; providerPayoutCents: number }) {
      await db
        .update(serviceOrders)
        .set({ platformFeeCents: f.platformFeeCents, providerPayoutCents: f.providerPayoutCents })
        .where(eq(serviceOrders.id, orderId));
    },

    async setCancellationFee(orderId: string, fee: number) {
      await db.update(serviceOrders).set({ cancellationFeeCents: fee }).where(eq(serviceOrders.id, orderId));
    },

    async setDispatchWave(orderId: string, wave: number) {
      await db.update(serviceOrders).set({ dispatchWave: wave }).where(eq(serviceOrders.id, orderId));
    },

    /** PIX confirmado: libera o matching (ou o início agendado). */
    async releaseForDispatch(orderId: string) {
      const o = await getById(orderId);
      if (!meta(o).awaitingPixPayment) return;
      await patchMetadata(orderId, { awaitingPixPayment: false });
      await scheduler.cancelByDedupe(db, `payment.pix_timeout:${orderId}`);
      if (o.workflowKind === 'CONCIERGE') {
        await scheduler.schedule(db, {
          kind: 'concierge.plan',
          runAt: adapters.clock.now(),
          payload: { orderId },
          dedupeKey: `concierge.plan:${orderId}`,
        });
      } else {
        await scheduleDispatch(db, o, adapters.clock.now());
      }
    },

    /** Efeito booking.scheduleReminders: reserva a agenda do prestador e agenda lembretes. */
    async scheduleReminders(o: OrderRow) {
      const service = await deps.catalog.getServiceRow(o.serviceId);
      await ensureBookingAndReminders(db, o, adapters.clock.now(), service.estimatedDurationMinutes);
    },

    async releaseBooking(o: OrderRow) {
      await db.update(bookings).set({ releasedAt: adapters.clock.now() }).where(eq(bookings.orderId, o.id));
      for (const h of [24, 1]) await scheduler.cancelByDedupe(db, `booking.remind:${o.id}:${h}h`);
    },

    /** Job booking.remind: idempotente; transiciona para REMINDED só quando a ordem está ACCEPTED. */
    async remind(orderId: string, hours: number, notify: (o: OrderRow) => Promise<void>) {
      const o = await getById(orderId);
      if (TERMINAL_ORDER_STATUSES.has(o.status as OrderStatus) || !o.scheduledFor) return;
      const col = hours >= 24 ? bookings.reminder24hSentAt : bookings.reminder1hSentAt;
      const [b] = await db.select().from(bookings).where(eq(bookings.orderId, orderId)).limit(1);
      if (b && (hours >= 24 ? b.reminder24hSentAt : b.reminder1hSentAt)) return;
      await db
        .update(bookings)
        .set(
          hours >= 24
            ? { reminder24hSentAt: adapters.clock.now() }
            : { reminder1hSentAt: adapters.clock.now() },
        )
        .where(and(eq(bookings.orderId, orderId), isNull(col)));
      if (o.status === 'ACCEPTED') {
        const moved = await tryTransition(
          orderId,
          'system.remind',
          { type: 'system', userId: null },
          { hours },
        );
        if (moved) return;
      }
      await notify(o);
    },

    async activeLiveOrderForProvider(providerId: string) {
      const [o] = await db
        .select({
          id: serviceOrders.id,
          lat: serviceOrders.lat,
          lng: serviceOrders.lng,
          status: serviceOrders.status,
        })
        .from(serviceOrders)
        .where(
          and(
            eq(serviceOrders.providerId, providerId),
            inArray(serviceOrders.status, [...LIVE_LOCATION_STATES]),
          ),
        )
        .orderBy(desc(serviceOrders.updatedAt))
        .limit(1);
      if (!o) return null;
      const def = getWorkflow('IMMEDIATE');
      void stateMeta(def, o.status as OrderStatus);
      return { id: o.id, lat: o.lat, lng: o.lng };
    },

    async providersWithBookingConflict(
      providerIds: string[],
      startsAt: Date,
      endsAt: Date,
    ): Promise<Set<string>> {
      if (providerIds.length === 0) return new Set();
      const rows = await db
        .select({ providerId: bookings.providerId })
        .from(bookings)
        .where(
          and(
            inArray(bookings.providerId, providerIds),
            isNull(bookings.releasedAt),
            lt(bookings.startsAt, endsAt),
            gt(bookings.endsAt, startsAt),
          ),
        );
      return new Set(rows.map((r) => r.providerId).filter((x): x is string => Boolean(x)));
    },

    async providersWhoServedCustomer(providerIds: string[], customerId: string): Promise<Set<string>> {
      if (providerIds.length === 0) return new Set();
      const rows = await db
        .select({ providerId: serviceOrders.providerId })
        .from(serviceOrders)
        .where(
          and(
            inArray(serviceOrders.providerId, providerIds),
            eq(serviceOrders.customerId, customerId),
            inArray(serviceOrders.status, ['COMPLETED', 'REVIEWED', 'CLOSED']),
          ),
        );
      return new Set(rows.map((r) => r.providerId).filter((x): x is string => Boolean(x)));
    },

    async activeOrdersForCustomer(userId: string) {
      const rows = await db
        .select()
        .from(serviceOrders)
        .where(
          and(
            eq(serviceOrders.customerId, userId),
            notInArray(serviceOrders.status, [...terminal, 'COMPLETED']),
            isNull(serviceOrders.parentOrderId),
          ),
        )
        .orderBy(desc(serviceOrders.createdAt))
        .limit(5);
      const now = adapters.clock.now();
      const out: Array<{ id: string; status: string; serviceName: string }> = [];
      for (const o of rows) {
        // Agendamentos futuros ainda não em execução são "próximos", não "em andamento".
        if (
          o.scheduledFor &&
          o.scheduledFor.getTime() > now.getTime() &&
          PRE_EXECUTION_STATES.has(o.status as OrderStatus)
        )
          continue;
        const s = await deps.catalog.getServiceRow(o.serviceId);
        out.push({ id: o.id, status: o.status, serviceName: s.name });
      }
      return out;
    },

    async upcomingBooking(userId: string, now: Date) {
      const [o] = await db
        .select()
        .from(serviceOrders)
        .where(
          and(
            eq(serviceOrders.customerId, userId),
            gt(serviceOrders.scheduledFor, now),
            lte(serviceOrders.scheduledFor, new Date(now.getTime() + 48 * 3_600_000)),
            inArray(serviceOrders.status, [...PRE_EXECUTION_STATES]),
          ),
        )
        .orderBy(asc(serviceOrders.scheduledFor))
        .limit(1);
      if (!o?.scheduledFor) return null;
      const s = await deps.catalog.getServiceRow(o.serviceId);
      return { orderId: o.id, scheduledFor: o.scheduledFor, serviceName: s.name };
    },

    async listChildren(parentOrderId: string): Promise<OrderRow[]> {
      return db
        .select()
        .from(serviceOrders)
        .where(eq(serviceOrders.parentOrderId, parentOrderId))
        .orderBy(asc(serviceOrders.createdAt));
    },

    childrenAllDone(children: OrderRow[]): boolean {
      return children.length > 0 && children.every((c) => DONE_FOR_PARENT.has(c.status as OrderStatus));
    },

    async orderParticipants(orderId: string) {
      const o = await findById(orderId);
      if (!o) return null;
      return {
        customerUserId: o.customerId,
        providerUserId: o.providerId ? await deps.providers.userIdOf(o.providerId) : null,
      };
    },

    async listActiveWithCoords(): Promise<OrderRow[]> {
      return db
        .select()
        .from(serviceOrders)
        .where(
          and(
            notInArray(serviceOrders.status, terminal),
            ne(serviceOrders.status, 'COMPLETED'),
            sql`${serviceOrders.lat} is not null`,
          ),
        )
        .orderBy(desc(serviceOrders.createdAt))
        .limit(500);
    },

    async listForOps(q: { status?: string; attention?: boolean; cursor?: string; limit: number }, now: Date) {
      const attention = q.attention
        ? or(
            inArray(serviceOrders.status, ['NO_PROVIDER_FOUND', 'NEEDS_HUMAN', 'DISPUTED']),
            and(
              lt(serviceOrders.scheduledFor, now),
              inArray(serviceOrders.status, [...PRE_EXECUTION_STATES]),
            ),
          )
        : undefined;
      const rows = await db
        .select()
        .from(serviceOrders)
        .where(
          and(
            q.status ? eq(serviceOrders.status, q.status) : undefined,
            attention,
            q.cursor ? lt(serviceOrders.id, q.cursor) : undefined,
          ),
        )
        .orderBy(desc(serviceOrders.id))
        .limit(q.limit + 1);
      const p = page(rows, q.limit);
      return { items: await Promise.all(p.items.map((o) => toDto(o))), nextCursor: p.nextCursor };
    },

    /** Ordens cujo estado atual excedeu `slaSeconds` da definição. */
    async slaBreaches(now: Date) {
      const rows = await db
        .select()
        .from(serviceOrders)
        .where(notInArray(serviceOrders.status, terminal))
        .limit(2000);
      const byStatus: Record<
        string,
        { breached: number; total: number; slaSeconds: number | null; orderIds: string[] }
      > = {};
      for (const o of rows) {
        const sla = stateMeta(workflowOf(o), o.status as OrderStatus).slaSeconds ?? null;
        let entry = byStatus[o.status];
        if (!entry) {
          entry = { breached: 0, total: 0, slaSeconds: sla, orderIds: [] };
          byStatus[o.status] = entry;
        }
        entry.total++;
        if (sla !== null && now.getTime() - o.updatedAt.getTime() > sla * 1000) {
          entry.breached++;
          entry.orderIds.push(o.id);
        }
      }
      return byStatus;
    },

    registerRealtime() {
      outbox.on('order.transitioned', async (ev) => {
        const p = ev.payload as {
          orderId: string;
          to: OrderStatus;
          eventId: string;
          seq: number;
          action: string;
          customerId: string;
          providerId: string | null;
          updatedAt: string;
        };
        const io = ctx.io;
        if (!io) return;
        const updated = { orderId: p.orderId, status: p.to, updatedAt: p.updatedAt };
        const event = { orderId: p.orderId, eventId: p.eventId, type: p.action, seq: p.seq };
        io.to(rooms.order(p.orderId)).emit('order.updated', updated);
        io.to(rooms.order(p.orderId)).emit('order.event', event);
        io.to(rooms.user(p.customerId)).emit('order.updated', updated);
        if (p.providerId) io.to(rooms.provider(p.providerId)).emit('order.updated', updated);
        io.to(rooms.ops()).emit('order.updated', updated);
      });
      outbox.on('order.created', async (ev) => {
        const p = ev.payload as { orderId: string; customerId: string; status: OrderStatus };
        ctx.io?.to(rooms.user(p.customerId)).emit('order.updated', {
          orderId: p.orderId,
          status: p.status,
          updatedAt: ev.createdAt.toISOString(),
        });
      });
    },

    statusLabel(status: OrderStatus) {
      return ORDER_STATUS_LABELS[status];
    },
  };
}

export type OrdersService = ReturnType<typeof createOrdersService>;
