import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_shared';

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: id(),
    userId: text('user_id').notNull(),
    kind: varchar('kind', { length: 10 }).notNull(),
    gateway: varchar('gateway', { length: 20 }).notNull(),
    /** Token do gateway. Nunca PAN/CVV. */
    gatewayToken: text('gateway_token'),
    brand: varchar('brand', { length: 20 }),
    last4: varchar('last4', { length: 4 }),
    expMonth: integer('exp_month'),
    expYear: integer('exp_year'),
    holderName: varchar('holder_name', { length: 80 }),
    isDefault: boolean('is_default').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('payment_methods_user_idx').on(t.userId)],
);

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: id(),
    userId: text('user_id').notNull(),
    orderId: text('order_id'),
    quoteId: text('quote_id'),
    subscriptionId: text('subscription_id'),
    kind: varchar('kind', { length: 20 }).notNull(),
    methodKind: varchar('method_kind', { length: 10 }).notNull(),
    paymentMethodId: text('payment_method_id'),
    amountCents: integer('amount_cents').notNull(),
    capturedCents: integer('captured_cents').notNull().default(0),
    refundedCents: integer('refunded_cents').notNull().default(0),
    walletAppliedCents: integer('wallet_applied_cents').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull(),
    gateway: varchar('gateway', { length: 20 }).notNull(),
    gatewayRef: text('gateway_ref'),
    pixQrCode: text('pix_qr_code'),
    pixCopyPaste: text('pix_copy_paste'),
    pixExpiresAt: timestamp('pix_expires_at', { withTimezone: true }),
    failureCode: varchar('failure_code', { length: 40 }),
    failureMessage: text('failure_message'),
    idempotencyKey: varchar('idempotency_key', { length: 80 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payment_intents_order_idx').on(t.orderId),
    index('payment_intents_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('payment_intents_gateway_ref_uq').on(t.gateway, t.gatewayRef),
    uniqueIndex('payment_intents_idem_uq').on(t.idempotencyKey),
  ],
);

export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    intentId: text('intent_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    reason: text('reason'),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    gatewayRef: text('gateway_ref'),
    requestedByUserId: text('requested_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('refunds_intent_idx').on(t.intentId)],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    gateway: varchar('gateway', { length: 20 }).notNull(),
    externalId: text('external_id').notNull(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('webhook_events_uq').on(t.gateway, t.externalId)],
);

export const walletAccounts = pgTable(
  'wallet_accounts',
  {
    id: id(),
    ownerType: varchar('owner_type', { length: 10 }).notNull(),
    ownerId: text('owner_id').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('BRL'),
    balanceCents: integer('balance_cents').notNull().default(0),
    heldCents: integer('held_cents').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('wallet_accounts_owner_uq').on(t.ownerType, t.ownerId)],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    accountId: text('account_id').notNull(),
    /** Agrupa os lançamentos de uma mesma operação (dupla entrada). */
    journalId: text('journal_id').notNull(),
    direction: varchar('direction', { length: 6 }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    kind: varchar('kind', { length: 30 }).notNull(),
    orderId: text('order_id'),
    intentId: text('intent_id'),
    payoutId: text('payout_id'),
    description: text('description').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('ledger_account_idx').on(t.accountId, t.createdAt), index('ledger_order_idx').on(t.orderId), index('ledger_journal_idx').on(t.journalId)],
);

export const payouts = pgTable(
  'payouts',
  {
    id: id(),
    providerId: text('provider_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('SCHEDULED'),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    gatewayRef: text('gateway_ref'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    failureMessage: text('failure_message'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('payouts_provider_idx').on(t.providerId, t.status)],
);

export const commissionRules = pgTable(
  'commission_rules',
  {
    id: id(),
    categoryId: text('category_id'),
    regionId: text('region_id'),
    percentBps: integer('percent_bps').notNull(),
    fixedCents: integer('fixed_cents').notNull().default(0),
    minCents: integer('min_cents').notNull().default(0),
    maxCents: integer('max_cents'),
    passPaymentFeeToProvider: boolean('pass_payment_fee_to_provider').notNull().default(false),
    activeFrom: timestamp('active_from', { withTimezone: true }).notNull().defaultNow(),
    activeUntil: timestamp('active_until', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('commission_rules_scope_idx').on(t.categoryId, t.regionId)],
);

export const coupons = pgTable(
  'coupons',
  {
    code: varchar('code', { length: 20 }).primaryKey(),
    kind: varchar('kind', { length: 10 }).notNull(),
    value: integer('value').notNull(),
    minOrderCents: integer('min_order_cents'),
    maxDiscountCents: integer('max_discount_cents'),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    usageLimit: integer('usage_limit'),
    perUserLimit: integer('per_user_limit'),
    usedCount: integer('used_count').notNull().default(0),
    categoryId: text('category_id'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: id(),
    code: varchar('code', { length: 20 }).notNull(),
    userId: text('user_id').notNull(),
    orderId: text('order_id').notNull(),
    discountCents: integer('discount_cents').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('coupon_redemptions_order_uq').on(t.orderId), index('coupon_redemptions_user_idx').on(t.code, t.userId)],
);

export const promotions = pgTable('promotions', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull(),
  kind: varchar('kind', { length: 20 }).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
