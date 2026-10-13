import { z } from 'zod';
import { Cents, IsoDateTime, Uuid } from './common';
import { PaymentIntentKind, PaymentIntentStatus, PaymentMethodKind } from './enums';

/**
 * O app tokeniza o cartão no SDK do provedor e envia só o token.
 * O servidor nunca recebe número, CVV ou validade completa (ADR-007).
 */
export const AddPaymentMethodInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('CARD'),
    gatewayToken: z.string().min(10),
    holderName: z.string().min(2).max(80),
    setDefault: z.boolean().default(true),
  }),
  z.object({ kind: z.literal('PIX'), setDefault: z.boolean().default(false) }),
  z.object({ kind: z.literal('WALLET'), setDefault: z.boolean().default(false) }),
]);
export type AddPaymentMethodInput = z.infer<typeof AddPaymentMethodInput>;

export const PaymentMethod = z.object({
  id: Uuid,
  kind: PaymentMethodKind,
  brand: z.string().nullable(),
  last4: z.string().length(4).nullable(),
  expMonth: z.number().int().nullable(),
  expYear: z.number().int().nullable(),
  isDefault: z.boolean(),
});
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const PaymentIntent = z.object({
  id: Uuid,
  orderId: Uuid.nullable(),
  quoteId: Uuid.nullable(),
  subscriptionId: Uuid.nullable(),
  kind: PaymentIntentKind,
  methodKind: PaymentMethodKind,
  amountCents: Cents,
  capturedCents: Cents,
  refundedCents: Cents,
  status: PaymentIntentStatus,
  gateway: z.string(),
  gatewayRef: z.string().nullable(),
  pix: z.object({ qrCode: z.string(), copyPaste: z.string(), expiresAt: IsoDateTime }).nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type PaymentIntent = z.infer<typeof PaymentIntent>;

export const CreatePaymentIntentInput = z.object({
  paymentMethodId: Uuid.optional(),
  methodKind: PaymentMethodKind,
  useWalletCredit: z.boolean().default(false),
});

export const WebhookEnvelope = z.object({
  gateway: z.string(),
  eventType: z.string(),
  gatewayRef: z.string(),
  status: z.string(),
  amountCents: Cents.optional(),
  raw: z.unknown(),
});

export const Coupon = z.object({
  code: z.string(),
  kind: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int(),
  minOrderCents: Cents.nullable(),
  maxDiscountCents: Cents.nullable(),
  validFrom: IsoDateTime.nullable(),
  validUntil: IsoDateTime.nullable(),
  usageLimit: z.number().int().nullable(),
  perUserLimit: z.number().int().nullable(),
  categoryId: Uuid.nullable(),
  active: z.boolean(),
});
export type Coupon = z.infer<typeof Coupon>;

export const SubscriptionPlan = z.object({
  id: Uuid,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  serviceId: Uuid,
  intervalMonths: z.number().int().positive(),
  visitsPerCycle: z.number().int().positive(),
  priceCents: Cents,
  benefits: z.array(z.string()),
  active: z.boolean(),
});
export type SubscriptionPlan = z.infer<typeof SubscriptionPlan>;

export const SubscribeInput = z.object({
  planId: Uuid,
  equipmentIds: z.array(Uuid).min(1),
  addressId: Uuid,
  paymentMethodId: Uuid,
  preferredWeekday: z.number().int().min(0).max(6).optional(),
  preferredPeriod: z.enum(['MORNING', 'AFTERNOON']).optional(),
});

export const Subscription = z.object({
  id: Uuid,
  planId: Uuid,
  planName: z.string(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'PAST_DUE']),
  equipmentIds: z.array(Uuid),
  startedAt: IsoDateTime,
  nextVisitDueAt: IsoDateTime.nullable(),
  nextChargeAt: IsoDateTime.nullable(),
  cancelledAt: IsoDateTime.nullable(),
});
export type Subscription = z.infer<typeof Subscription>;
