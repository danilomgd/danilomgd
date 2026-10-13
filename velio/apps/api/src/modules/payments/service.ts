import type {
  AddPaymentMethodInput,
  Coupon,
  CreatePaymentIntentInput,
  PaymentIntent,
  PaymentIntentKind,
  PaymentIntentStatus,
  PaymentMethod,
  PaymentMethodKind,
  UpsertCouponInput,
} from '@velio/contracts';
import { rooms } from '@velio/contracts';
import { type CouponSource, customerCancellation } from '@velio/domain';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import {
  couponRedemptions,
  coupons,
  paymentIntents,
  paymentMethods,
  refunds,
  webhookEvents,
} from '../../db/schema';
import { newId } from '../../db/schema/_shared';
import { errors } from '../../lib/errors';
import { type Exec, iso } from '../_shared/util';
import type { PlatformService } from '../admin/platform';
import type { CommunicationService } from '../communication/service';
import type { IdentityService } from '../identity/service';
import type { EffectContext, OrderRow } from '../orders/types';
import { meta } from '../orders/types';
import type { WalletService } from '../wallet/service';

export type IntentRow = typeof paymentIntents.$inferSelect;
export type MethodRow = typeof paymentMethods.$inferSelect;

export interface PaymentsLateDeps {
  orders: {
    getById(id: string, exec?: Exec): Promise<OrderRow>;
    transition(
      orderId: string,
      action: 'customer.authorize_payment' | 'operator.cancel',
      actor: { type: 'system'; userId: null },
      payload?: Record<string, unknown>,
    ): Promise<OrderRow>;
    releaseForDispatch(orderId: string): Promise<void>;
    setPaymentMethod(orderId: string, method: { id: string; kind: PaymentMethodKind }): Promise<void>;
    setCancellationFee(orderId: string, fee: number): Promise<void>;
  };
  support: {
    createIncident(i: {
      orderId: string | null;
      kind: string;
      title: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      details?: Record<string, unknown>;
    }): Promise<unknown>;
  };
  analytics: {
    track(
      name: 'payment_completed' | 'payment_failed' | 'payment_method_added',
      ref: { userId?: string | null; orderId?: string | null; properties?: Record<string, unknown> },
    ): Promise<void>;
  };
}

export function toIntentDto(i: IntentRow): PaymentIntent {
  return {
    id: i.id,
    orderId: i.orderId,
    quoteId: i.quoteId,
    subscriptionId: i.subscriptionId,
    kind: i.kind as PaymentIntentKind,
    methodKind: i.methodKind as PaymentMethodKind,
    amountCents: i.amountCents,
    capturedCents: i.capturedCents,
    refundedCents: i.refundedCents,
    status: i.status as PaymentIntentStatus,
    gateway: i.gateway,
    gatewayRef: i.gatewayRef,
    pix:
      i.pixQrCode && i.pixCopyPaste && i.pixExpiresAt
        ? { qrCode: i.pixQrCode, copyPaste: i.pixCopyPaste, expiresAt: i.pixExpiresAt.toISOString() }
        : null,
    failureCode: i.failureCode,
    failureMessage: i.failureMessage,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

export function toMethodDto(m: MethodRow): PaymentMethod {
  return {
    id: m.id,
    kind: m.kind as PaymentMethodKind,
    brand: m.brand,
    last4: m.last4,
    expMonth: m.expMonth,
    expYear: m.expYear,
    isDefault: m.isDefault,
  };
}

function toCouponDto(c: typeof coupons.$inferSelect): Coupon {
  return {
    code: c.code,
    kind: c.kind as 'PERCENT' | 'FIXED',
    value: c.value,
    minOrderCents: c.minOrderCents,
    maxDiscountCents: c.maxDiscountCents,
    validFrom: iso(c.validFrom),
    validUntil: iso(c.validUntil),
    usageLimit: c.usageLimit,
    perUserLimit: c.perUserLimit,
    categoryId: c.categoryId,
    active: c.active,
  };
}

export function createPaymentsService(
  ctx: AppContext,
  deps: {
    identity: IdentityService;
    wallet: WalletService;
    communication: CommunicationService;
    platform: PlatformService;
  },
) {
  const { db, adapters, outbox, log } = ctx;
  const gateway = adapters.payments;
  let late: PaymentsLateDeps | null = null;
  const L = () => {
    if (!late) throw new Error('Módulo payments usado antes de bind()');
    return late;
  };

  async function publishUpdate(exec: Exec, i: IntentRow) {
    await outbox.publish(exec, {
      type: 'payment.updated',
      aggregateType: 'payment_intent',
      aggregateId: i.id,
      payload: { intentId: i.id, orderId: i.orderId, status: i.status, userId: i.userId },
    });
  }

  async function updateIntent(
    exec: Exec,
    id: string,
    patch: Partial<typeof paymentIntents.$inferInsert>,
  ): Promise<IntentRow> {
    const [row] = await exec
      .update(paymentIntents)
      .set({ ...patch, updatedAt: adapters.clock.now() })
      .where(eq(paymentIntents.id, id))
      .returning();
    if (!row) throw errors.notFound('Intenção de pagamento');
    await publishUpdate(exec, row);
    return row;
  }

  async function getMethodRow(userId: string, id: string, exec: Exec = db): Promise<MethodRow> {
    const [m] = await exec
      .select()
      .from(paymentMethods)
      .where(
        and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId), isNull(paymentMethods.deletedAt)),
      )
      .limit(1);
    if (!m) throw errors.notFound('Método de pagamento');
    return m;
  }

  async function getDefaultMethodRow(userId: string): Promise<MethodRow | null> {
    const rows = await db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.userId, userId), isNull(paymentMethods.deletedAt)))
      .orderBy(desc(paymentMethods.isDefault), asc(paymentMethods.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async function intentsForOrder(exec: Exec, orderId: string): Promise<IntentRow[]> {
    return exec
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.orderId, orderId))
      .orderBy(asc(paymentIntents.createdAt));
  }

  /** Recebe o executor para nunca consultar o cliente principal dentro de uma transação (PGlite serializa). */
  async function customerOf(userId: string, exec: Exec = db) {
    const u = await deps.identity.getUserRow(userId, exec);
    return { userId, name: u?.name ?? null };
  }

  /** Cria e tenta autorizar uma intenção para o método informado. Nunca lança por recusa do gateway. */
  async function createAndAuthorize(
    exec: Exec,
    input: {
      order: OrderRow;
      method: MethodRow;
      kind: PaymentIntentKind;
      amountCents: number;
      quoteId?: string | null;
      idempotencyKey: string;
    },
  ): Promise<IntentRow> {
    const { order, method } = input;
    const now = adapters.clock.now();
    const base = {
      userId: order.customerId,
      orderId: order.id,
      quoteId: input.quoteId ?? null,
      kind: input.kind,
      methodKind: method.kind,
      paymentMethodId: method.id,
      amountCents: input.amountCents,
      gateway: gateway.name,
      idempotencyKey: input.idempotencyKey,
    };
    if (method.kind === 'PIX') {
      const pix = await gateway.createPixCharge({
        amountCents: input.amountCents,
        referenceId: `${order.id}:${input.kind}`,
        expiresInSeconds: 30 * 60,
        customer: await customerOf(order.customerId, exec),
      });
      const [row] = await exec
        .insert(paymentIntents)
        .values({
          ...base,
          status: 'REQUIRES_ACTION',
          gatewayRef: pix.gatewayRef,
          pixQrCode: pix.qrCode,
          pixCopyPaste: pix.copyPaste,
          pixExpiresAt: pix.expiresAt,
        })
        .returning();
      if (!row) throw new Error('Falha ao criar intenção PIX');
      await publishUpdate(exec, row);
      return row;
    }
    if (method.kind === 'WALLET') {
      const balance = await deps.wallet.balance('USER', order.customerId);
      if (balance < input.amountCents) {
        const [row] = await exec
          .insert(paymentIntents)
          .values({
            ...base,
            status: 'FAILED',
            gateway: 'wallet',
            failureCode: 'insufficient_wallet',
            failureMessage: 'Saldo da carteira insuficiente',
          })
          .returning();
        if (!row) throw new Error('Falha ao criar intenção');
        await publishUpdate(exec, row);
        return row;
      }
      const [row] = await exec
        .insert(paymentIntents)
        .values({
          ...base,
          status: 'AUTHORIZED',
          gateway: 'wallet',
          gatewayRef: `wallet_${order.id}_${input.kind}_${now.getTime()}`,
          walletAppliedCents: input.amountCents,
        })
        .returning();
      if (!row) throw new Error('Falha ao criar intenção');
      await publishUpdate(exec, row);
      return row;
    }
    if (!method.gatewayToken) throw errors.unprocessable('Cartão sem token do gateway');
    const r = await gateway.authorizeCard({
      amountCents: input.amountCents,
      referenceId: `${order.id}:${input.kind}`,
      cardToken: method.gatewayToken,
      customer: await customerOf(order.customerId, exec),
    });
    const [row] = await exec
      .insert(paymentIntents)
      .values(
        r.ok
          ? { ...base, status: 'AUTHORIZED', gatewayRef: r.gatewayRef }
          : { ...base, status: 'FAILED', failureCode: r.code, failureMessage: r.message },
      )
      .returning();
    if (!row) throw new Error('Falha ao criar intenção');
    await publishUpdate(exec, row);
    return row;
  }

  async function onAuthorized(order: OrderRow) {
    const l = L();
    const fresh = await l.orders.getById(order.id);
    if (fresh.status === 'QUOTE_APPROVED') {
      await l.orders.transition(
        order.id,
        'customer.authorize_payment',
        { type: 'system', userId: null },
        { source: 'payments' },
      );
    }
    if (meta(fresh).awaitingPixPayment) await l.orders.releaseForDispatch(order.id);
  }

  async function notifyFailure(order: OrderRow, intent: IntentRow) {
    await deps.communication.notifyUser(order.customerId, 'payment_failed', {
      orderId: order.id,
      intentId: intent.id,
      failureCode: intent.failureCode,
    });
    await L().analytics.track('payment_failed', {
      userId: order.customerId,
      orderId: order.id,
      properties: { code: intent.failureCode ?? 'unknown' },
    });
  }

  function chargeNeeded(order: OrderRow): boolean {
    const m = meta(order);
    return (order.totalCents ?? 0) > 0 && m.billedViaParent !== true && m.coveredByPlan !== true;
  }

  return {
    bind(l: PaymentsLateDeps) {
      late = l;
    },

    async listMethods(userId: string): Promise<PaymentMethod[]> {
      const rows = await db
        .select()
        .from(paymentMethods)
        .where(and(eq(paymentMethods.userId, userId), isNull(paymentMethods.deletedAt)))
        .orderBy(desc(paymentMethods.isDefault), asc(paymentMethods.createdAt));
      return rows.map(toMethodDto);
    },

    async addMethod(userId: string, input: AddPaymentMethodInput): Promise<PaymentMethod> {
      if (input.setDefault)
        await db.update(paymentMethods).set({ isDefault: false }).where(eq(paymentMethods.userId, userId));
      const existing = await db
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(and(eq(paymentMethods.userId, userId), isNull(paymentMethods.deletedAt)));
      const values: typeof paymentMethods.$inferInsert = {
        userId,
        kind: input.kind,
        gateway: gateway.name,
        isDefault: input.setDefault || existing.length === 0,
      };
      if (input.kind === 'CARD') {
        values.gatewayToken = input.gatewayToken;
        values.holderName = input.holderName;
        values.last4 = input.gatewayToken.slice(-4).replace(/\D/g, '').padStart(4, '0');
        values.brand = 'card';
      }
      const [row] = await db.insert(paymentMethods).values(values).returning();
      if (!row) throw new Error('Falha ao salvar método');
      await L().analytics.track('payment_method_added', { userId, properties: { kind: input.kind } });
      return toMethodDto(row);
    },

    async removeMethod(userId: string, id: string) {
      await getMethodRow(userId, id);
      await db
        .update(paymentMethods)
        .set({ deletedAt: adapters.clock.now(), isDefault: false })
        .where(eq(paymentMethods.id, id));
    },

    async getMethod(userId: string, id: string) {
      const m = await getMethodRow(userId, id);
      return { id: m.id, kind: m.kind as PaymentMethodKind };
    },
    async getDefaultMethod(userId: string) {
      const m = await getDefaultMethodRow(userId);
      return m ? { id: m.id, kind: m.kind as PaymentMethodKind } : null;
    },

    async hasAuthorizedInitial(exec: Exec, orderId: string): Promise<boolean> {
      const rows = await intentsForOrder(exec, orderId);
      return rows.some((i) => i.kind === 'INITIAL' && (i.status === 'AUTHORIZED' || i.status === 'CAPTURED'));
    },

    async listForOrder(orderId: string): Promise<PaymentIntent[]> {
      return (await intentsForOrder(db, orderId)).map(toIntentDto);
    },

    /** PIX antecipado na criação do pedido (doc 11 §7). */
    async createInitialPixIntent(exec: Exec, order: OrderRow, methodId: string) {
      const method = await getMethodRow(order.customerId, methodId, exec);
      const intent = await createAndAuthorize(exec, {
        order,
        method,
        kind: 'INITIAL',
        amountCents: order.totalCents ?? 0,
        idempotencyKey: `INITIAL:${newId()}`,
      });
      return { id: intent.id };
    },

    /** Efeito payments.authorize: pré-autoriza o valor da ordem no método escolhido. Idempotente. */
    async authorizeForOrder(order: OrderRow): Promise<IntentRow | null> {
      if (!chargeNeeded(order)) return null;
      const existing = await intentsForOrder(db, order.id);
      const live = existing.find(
        (i) => i.kind === 'INITIAL' && ['AUTHORIZED', 'CAPTURED', 'REQUIRES_ACTION'].includes(i.status),
      );
      if (live) {
        if (live.status === 'AUTHORIZED') await onAuthorized(order);
        return live;
      }
      const m = meta(order);
      const method = m.paymentMethodId
        ? await getMethodRow(order.customerId, m.paymentMethodId).catch(() => null)
        : await getDefaultMethodRow(order.customerId);
      if (!method) {
        const [row] = await db
          .insert(paymentIntents)
          .values({
            userId: order.customerId,
            orderId: order.id,
            kind: 'INITIAL',
            methodKind: 'CARD',
            amountCents: order.totalCents ?? 0,
            status: 'FAILED',
            gateway: gateway.name,
            failureCode: 'no_payment_method',
            failureMessage: 'Nenhum método de pagamento cadastrado',
          })
          .returning();
        if (row) await notifyFailure(order, row);
        return row ?? null;
      }
      const intent = await createAndAuthorize(db, {
        order,
        method,
        kind: 'INITIAL',
        amountCents: order.totalCents ?? 0,
        idempotencyKey: `INITIAL:${newId()}`,
      });
      if (intent.status === 'FAILED') await notifyFailure(order, intent);
      else if (intent.status === 'AUTHORIZED') await onAuthorized(order);
      return intent;
    },

    /** Cliente escolhe/troca o método (ex.: cartão recusado → PIX). */
    async createIntentForOrder(
      orderId: string,
      userId: string,
      input: z.infer<typeof CreatePaymentIntentInput>,
    ): Promise<PaymentIntent> {
      const l = L();
      const order = await l.orders.getById(orderId);
      if (order.customerId !== userId) throw errors.forbidden();
      if (!chargeNeeded(order)) throw errors.unprocessable('Esta ordem não exige pagamento');
      const method = input.paymentMethodId
        ? await getMethodRow(userId, input.paymentMethodId)
        : (
            await db
              .select()
              .from(paymentMethods)
              .where(
                and(
                  eq(paymentMethods.userId, userId),
                  eq(paymentMethods.kind, input.methodKind),
                  isNull(paymentMethods.deletedAt),
                ),
              )
              .limit(1)
          )[0];
      if (!method) throw errors.notFound('Método de pagamento');
      if (method.kind !== input.methodKind)
        throw errors.badRequest('Método não corresponde ao tipo informado');
      const existing = await intentsForOrder(db, orderId);
      for (const i of existing) {
        if (i.kind !== 'INITIAL') continue;
        if (i.status === 'CAPTURED') throw errors.conflict('Pagamento já capturado');
        if (i.status === 'AUTHORIZED' && i.gatewayRef && i.methodKind === 'CARD')
          await gateway.cancelAuthorization({ gatewayRef: i.gatewayRef });
        if (i.status === 'AUTHORIZED' || i.status === 'REQUIRES_ACTION')
          await updateIntent(db, i.id, { status: 'CANCELLED' });
      }
      await l.orders.setPaymentMethod(orderId, { id: method.id, kind: method.kind as PaymentMethodKind });
      const fresh = await l.orders.getById(orderId);
      const intent = await createAndAuthorize(db, {
        order: fresh,
        method,
        kind: 'INITIAL',
        amountCents: fresh.totalCents ?? 0,
        idempotencyKey: `INITIAL:${newId()}`,
      });
      if (intent.status === 'FAILED') await notifyFailure(fresh, intent);
      else if (intent.status === 'AUTHORIZED') await onAuthorized(fresh);
      return toIntentDto(intent);
    },

    /** Orçamento adicional aprovado → nova intenção ADDITIONAL no mesmo método. */
    async authorizeAdditional(
      order: OrderRow,
      quote: { id: string; amountCents: number },
    ): Promise<IntentRow | null> {
      if (!chargeNeeded(order)) return null;
      const m = meta(order);
      const method = m.paymentMethodId
        ? await getMethodRow(order.customerId, m.paymentMethodId).catch(() => null)
        : await getDefaultMethodRow(order.customerId);
      if (!method) throw errors.unprocessable('Nenhum método de pagamento para o adicional');
      const intent = await createAndAuthorize(db, {
        order,
        method,
        kind: 'ADDITIONAL',
        amountCents: quote.amountCents,
        quoteId: quote.id,
        idempotencyKey: `ADDITIONAL:${quote.id}`,
      });
      if (intent.status === 'FAILED') await notifyFailure(order, intent);
      return intent;
    },

    /** Efeito payments.capture: captura INITIAL + ADDITIONAL autorizadas. Falha vira incidente para ops. */
    async capture(order: OrderRow): Promise<void> {
      const l = L();
      if (!chargeNeeded(order)) return;
      const intents = (await intentsForOrder(db, order.id)).filter(
        (i) => (i.kind === 'INITIAL' || i.kind === 'ADDITIONAL') && i.status === 'AUTHORIZED',
      );
      const expected = Math.max(
        0,
        (order.priceCents ?? 0) + order.additionalApprovedCents - order.discountCents,
      );
      if (intents.length === 0) {
        await l.support.createIncident({
          orderId: order.id,
          kind: 'PAYMENT',
          severity: 'HIGH',
          title: 'Ordem concluída sem pagamento autorizado',
          details: { expectedCents: expected },
        });
        return;
      }
      let captured = 0;
      for (const i of intents) {
        let ok: { ok: true } | { ok: false; code: string; message: string } = { ok: true };
        if (i.methodKind === 'CARD' && i.gatewayRef)
          ok = await gateway.capture({ gatewayRef: i.gatewayRef, amountCents: i.amountCents });
        else if (i.methodKind === 'WALLET') {
          try {
            await deps.wallet.debitCustomer(order.customerId, i.amountCents, order.id, i.id);
          } catch (err) {
            ok = { ok: false, code: 'wallet_debit_failed', message: String((err as Error).message) };
          }
        }
        if (ok.ok) {
          await updateIntent(db, i.id, { status: 'CAPTURED', capturedCents: i.amountCents });
          captured += i.amountCents;
        } else {
          await updateIntent(db, i.id, {
            status: 'FAILED',
            failureCode: ok.code,
            failureMessage: ok.message,
          });
          await l.support.createIncident({
            orderId: order.id,
            kind: 'PAYMENT',
            severity: 'HIGH',
            title: 'Falha na captura do pagamento',
            details: { intentId: i.id, code: ok.code, message: ok.message },
          });
          await deps.communication.notifyUser(order.customerId, 'payment_failed', {
            orderId: order.id,
            intentId: i.id,
          });
        }
      }
      if (captured > 0) {
        await deps.communication.notifyUser(
          order.customerId,
          'payment_approved',
          { orderId: order.id, amountCents: captured },
          { body: `Pagamento de R$ ${(captured / 100).toFixed(2).replace('.', ',')} confirmado.` },
        );
        await l.analytics.track('payment_completed', {
          userId: order.customerId,
          orderId: order.id,
          properties: { amountCents: captured },
        });
      }
      if (captured !== expected && captured > 0)
        log.warn({ orderId: order.id, captured, expected }, 'captura divergente do esperado');
    },

    /** Efeito payments.cancelAuthorization: libera pré-autorizações e cobranças pendentes. */
    async cancelAuthorization(order: OrderRow): Promise<void> {
      const intents = await intentsForOrder(db, order.id);
      for (const i of intents) {
        if (i.status === 'AUTHORIZED' && i.methodKind === 'CARD' && i.gatewayRef)
          await gateway.cancelAuthorization({ gatewayRef: i.gatewayRef });
        if (i.status === 'AUTHORIZED' || i.status === 'REQUIRES_ACTION')
          await updateIntent(db, i.id, { status: 'CANCELLED' });
      }
    },

    /** Efeito payments.refund: reembolsa (parcial ou total) o que foi capturado. */
    async refund(
      order: OrderRow,
      amountCents: number | null,
      reason: string,
      byUserId: string | null,
    ): Promise<number> {
      const intents = (await intentsForOrder(db, order.id)).filter(
        (i) =>
          (i.status === 'CAPTURED' || i.status === 'PARTIALLY_REFUNDED') && i.kind !== 'CANCELLATION_FEE',
      );
      let remaining = amountCents ?? intents.reduce((s, i) => s + i.capturedCents - i.refundedCents, 0);
      let refunded = 0;
      for (const i of intents) {
        if (remaining <= 0) break;
        const available = i.capturedCents - i.refundedCents;
        const amt = Math.min(available, remaining);
        if (amt <= 0) continue;
        let ref: string | null = null;
        if (i.methodKind === 'WALLET') {
          await deps.wallet.creditCustomer(order.customerId, amt, order.id, 'Reembolso para a carteira');
          ref = 'wallet';
        } else if (i.gatewayRef) {
          const r = await gateway.refund({ gatewayRef: i.gatewayRef, amountCents: amt });
          if (!r.ok) {
            await db.insert(refunds).values({
              intentId: i.id,
              amountCents: amt,
              reason,
              status: 'FAILED',
              requestedByUserId: byUserId,
            });
            await L().support.createIncident({
              orderId: order.id,
              kind: 'PAYMENT',
              severity: 'HIGH',
              title: 'Falha no reembolso',
              details: { intentId: i.id, code: r.code },
            });
            continue;
          }
          ref = r.refundRef;
        }
        await db.insert(refunds).values({
          intentId: i.id,
          amountCents: amt,
          reason,
          status: 'DONE',
          gatewayRef: ref,
          requestedByUserId: byUserId,
        });
        const total = i.refundedCents + amt;
        await updateIntent(db, i.id, {
          refundedCents: total,
          status: total >= i.capturedCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        });
        remaining -= amt;
        refunded += amt;
      }
      return refunded;
    },

    /** Efeito payments.chargeCancellationFee: taxa conforme política; vai ao prestador quando ele já estava confirmado. */
    async chargeCancellationFee(c: EffectContext): Promise<void> {
      const l = L();
      const settings = await deps.platform.getSettings();
      const outcome = customerCancellation(
        c.previous.status as never,
        c.previous.acceptedAt,
        c.now,
        c.previous.priceCents,
        settings.cancellation,
      );
      const providerId = c.previous.providerId;
      if (!outcome.allowed || outcome.feeCents <= 0 || !providerId) return;
      const order = c.order;
      const fee = outcome.feeCents;
      const m = meta(order);
      const method = m.paymentMethodId
        ? await getMethodRow(order.customerId, m.paymentMethodId).catch(() => null)
        : await getDefaultMethodRow(order.customerId);
      const intents = await intentsForOrder(db, order.id);
      const paidPix = intents.find(
        (i) => i.kind === 'INITIAL' && i.methodKind === 'PIX' && i.status === 'AUTHORIZED',
      );
      let feeIntent: IntentRow | null = null;
      if (paidPix?.gatewayRef) {
        // PIX já pago: retém a taxa e devolve o restante.
        const rest = paidPix.amountCents - fee;
        if (rest > 0) await gateway.refund({ gatewayRef: paidPix.gatewayRef, amountCents: rest });
        await updateIntent(db, paidPix.id, {
          status: 'PARTIALLY_REFUNDED',
          capturedCents: fee,
          refundedCents: rest,
        });
        const [row] = await db
          .insert(paymentIntents)
          .values({
            userId: order.customerId,
            orderId: order.id,
            kind: 'CANCELLATION_FEE',
            methodKind: 'PIX',
            amountCents: fee,
            capturedCents: fee,
            status: 'CAPTURED',
            gateway: gateway.name,
            gatewayRef: `${paidPix.gatewayRef}:fee`,
          })
          .returning();
        feeIntent = row ?? null;
      } else if (method) {
        const intent = await createAndAuthorize(db, {
          order,
          method,
          kind: 'CANCELLATION_FEE',
          amountCents: fee,
          idempotencyKey: `FEE:${newId()}`,
        });
        if (intent.status === 'AUTHORIZED') {
          let ok = true;
          if (intent.methodKind === 'CARD' && intent.gatewayRef)
            ok = (await gateway.capture({ gatewayRef: intent.gatewayRef, amountCents: fee })).ok;
          else if (intent.methodKind === 'WALLET')
            await deps.wallet.debitCustomer(order.customerId, fee, order.id, intent.id);
          feeIntent = await updateIntent(
            db,
            intent.id,
            ok
              ? { status: 'CAPTURED', capturedCents: fee }
              : { status: 'FAILED', failureCode: 'capture_failed' },
          );
        } else {
          feeIntent = intent;
        }
      }
      if (feeIntent?.status === 'CAPTURED') {
        await deps.wallet.creditProviderFee(providerId, fee, order.id, feeIntent.id);
        await l.orders.setCancellationFee(order.id, fee);
      } else {
        await l.support.createIncident({
          orderId: order.id,
          kind: 'PAYMENT',
          severity: 'MEDIUM',
          title: 'Taxa de cancelamento não cobrada',
          details: { feeCents: fee, reason: outcome.reason },
        });
      }
    },

    /** Webhook do gateway: idempotente por (gateway, externalId). */
    async handleWebhook(
      gatewayName: string,
      rawBody: string,
      headers: Record<string, string | string[] | undefined>,
    ): Promise<{ ok: boolean; duplicate?: boolean; ignored?: boolean }> {
      if (gatewayName !== gateway.name) throw errors.notFound('Gateway');
      const parsed = await gateway.parseWebhook(rawBody, headers);
      if (!parsed) throw errors.badRequest('Webhook inválido');
      const [inserted] = await db
        .insert(webhookEvents)
        .values({
          gateway: gatewayName,
          externalId: parsed.externalId,
          eventType: parsed.eventType,
          payload: JSON.parse(rawBody) as unknown,
        })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });
      if (!inserted) return { ok: true, duplicate: true };
      const [intent] = await db
        .select()
        .from(paymentIntents)
        .where(and(eq(paymentIntents.gateway, gatewayName), eq(paymentIntents.gatewayRef, parsed.gatewayRef)))
        .limit(1);
      if (!intent) {
        await db
          .update(webhookEvents)
          .set({ processedAt: adapters.clock.now(), error: 'intent não encontrada' })
          .where(eq(webhookEvents.id, inserted.id));
        return { ok: true, ignored: true };
      }
      try {
        if (parsed.status === 'PAID' && intent.status === 'REQUIRES_ACTION') {
          await updateIntent(db, intent.id, { status: 'AUTHORIZED' });
          if (intent.orderId) {
            const order = await L().orders.getById(intent.orderId);
            await deps.communication.notifyUser(order.customerId, 'payment_approved', {
              orderId: order.id,
              intentId: intent.id,
            });
            await onAuthorized(order);
          }
        } else if (
          (parsed.status === 'FAILED' || parsed.status === 'EXPIRED') &&
          intent.status === 'REQUIRES_ACTION'
        ) {
          await updateIntent(db, intent.id, { status: 'FAILED', failureCode: parsed.status.toLowerCase() });
          if (intent.orderId) await notifyFailure(await L().orders.getById(intent.orderId), intent);
        } else if (parsed.status === 'REFUNDED' && intent.status === 'CAPTURED') {
          await updateIntent(db, intent.id, { status: 'REFUNDED', refundedCents: intent.capturedCents });
        }
        await db
          .update(webhookEvents)
          .set({ processedAt: adapters.clock.now() })
          .where(eq(webhookEvents.id, inserted.id));
      } catch (err) {
        await db
          .update(webhookEvents)
          .set({ error: String((err as Error).message) })
          .where(eq(webhookEvents.id, inserted.id));
        throw err;
      }
      return { ok: true };
    },

    /** Job payment.pix_timeout: PIX antecipado não pago em 15 min → cancela e encerra a ordem. */
    async pixTimeout(orderId: string, intentId: string) {
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1);
      if (intent?.status !== 'REQUIRES_ACTION') return;
      await updateIntent(db, intent.id, {
        status: 'CANCELLED',
        failureCode: 'pix_timeout',
        failureMessage: 'PIX não pago no prazo',
      });
      await L().orders.transition(
        orderId,
        'operator.cancel',
        { type: 'system', userId: null },
        { reason: 'PIX não pago' },
      );
    },

    /** Cobrança de assinatura: autoriza e captura imediatamente. */
    async chargeSubscription(
      userId: string,
      methodId: string,
      amountCents: number,
      subscriptionId: string | null,
    ): Promise<IntentRow> {
      const method = await getMethodRow(userId, methodId);
      if (method.kind !== 'CARD' || !method.gatewayToken)
        throw errors.unprocessable('Assinaturas exigem cartão de crédito');
      const r = await gateway.authorizeCard({
        amountCents,
        referenceId: `sub:${subscriptionId ?? 'new'}:${adapters.clock.now().getTime()}`,
        cardToken: method.gatewayToken,
        customer: await customerOf(userId),
      });
      if (!r.ok) throw errors.paymentRequired(r.message, { code: r.code });
      const cap = await gateway.capture({ gatewayRef: r.gatewayRef, amountCents });
      if (!cap.ok) throw errors.paymentRequired(cap.message, { code: cap.code });
      const [row] = await db
        .insert(paymentIntents)
        .values({
          userId,
          subscriptionId,
          kind: 'SUBSCRIPTION',
          methodKind: 'CARD',
          paymentMethodId: method.id,
          amountCents,
          capturedCents: amountCents,
          status: 'CAPTURED',
          gateway: gateway.name,
          gatewayRef: r.gatewayRef,
        })
        .returning();
      if (!row) throw new Error('Falha ao registrar cobrança');
      await publishUpdate(db, row);
      return row;
    },

    async attachSubscription(intentId: string, subscriptionId: string) {
      await db.update(paymentIntents).set({ subscriptionId }).where(eq(paymentIntents.id, intentId));
    },

    // ---- Cupons ------------------------------------------------------------------------------
    async validateCoupon(
      code: string,
      userId: string | null,
      categoryId: string,
      now: Date,
    ): Promise<CouponSource | null> {
      const [c] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
      if (!c?.active) return null;
      if (c.validFrom && c.validFrom.getTime() > now.getTime()) return null;
      if (c.validUntil && c.validUntil.getTime() < now.getTime()) return null;
      if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return null;
      if (c.categoryId && c.categoryId !== categoryId) return null;
      if (userId && c.perUserLimit !== null) {
        const [used] = await db
          .select({ n: sql<number>`count(*)` })
          .from(couponRedemptions)
          .where(and(eq(couponRedemptions.code, code), eq(couponRedemptions.userId, userId)));
        if (Number(used?.n ?? 0) >= c.perUserLimit) return null;
      }
      return {
        code: c.code,
        kind: c.kind as 'PERCENT' | 'FIXED',
        value: c.value,
        minOrderCents: c.minOrderCents,
        maxDiscountCents: c.maxDiscountCents,
      };
    },

    async redeemCoupon(exec: Exec, code: string, userId: string, orderId: string, discountCents: number) {
      await exec
        .insert(couponRedemptions)
        .values({ code, userId, orderId, discountCents })
        .onConflictDoNothing();
      await exec
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(eq(coupons.code, code));
    },

    registerRealtime() {
      outbox.on('payment.updated', async (ev) => {
        const p = ev.payload as { intentId: string; orderId: string | null; status: string; userId: string };
        const payload = { intentId: p.intentId, orderId: p.orderId, status: p.status };
        ctx.io?.to(rooms.user(p.userId)).emit('payment.updated', payload);
        if (p.orderId) ctx.io?.to(rooms.order(p.orderId)).emit('payment.updated', payload);
      });
    },

    admin: {
      coupons: {
        list: async () => (await db.select().from(coupons).orderBy(asc(coupons.code))).map(toCouponDto),
        upsert: async (input: z.infer<typeof UpsertCouponInput>) => {
          const values = {
            code: input.code,
            kind: input.kind,
            value: input.value,
            minOrderCents: input.minOrderCents ?? null,
            maxDiscountCents: input.maxDiscountCents ?? null,
            validFrom: input.validFrom ? new Date(input.validFrom) : null,
            validUntil: input.validUntil ? new Date(input.validUntil) : null,
            usageLimit: input.usageLimit ?? null,
            perUserLimit: input.perUserLimit ?? null,
            categoryId: input.categoryId ?? null,
            active: input.active,
          };
          const [row] = await db
            .insert(coupons)
            .values(values)
            .onConflictDoUpdate({ target: coupons.code, set: values })
            .returning();
          if (!row) throw new Error('Falha ao salvar cupom');
          return toCouponDto(row);
        },
        remove: async (code: string) => {
          await db.update(coupons).set({ active: false }).where(eq(coupons.code, code));
        },
      },
    },

    /** Para o scheduler: intents REQUIRES_ACTION de PIX expiradas. */
    async expireStalePix(now: Date) {
      const rows = await db
        .select()
        .from(paymentIntents)
        .where(
          and(eq(paymentIntents.status, 'REQUIRES_ACTION'), inArray(paymentIntents.methodKind, ['PIX'])),
        );
      for (const i of rows)
        if (i.pixExpiresAt && i.pixExpiresAt.getTime() < now.getTime())
          await updateIntent(db, i.id, { status: 'FAILED', failureCode: 'expired' });
    },
  };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
