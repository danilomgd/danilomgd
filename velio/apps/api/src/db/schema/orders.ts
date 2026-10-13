import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_shared';

export const serviceRequests = pgTable(
  'service_requests',
  {
    id: id(),
    customerId: text('customer_id').notNull(),
    serviceId: text('service_id').notNull(),
    addressId: text('address_id'),
    vehicleId: text('vehicle_id'),
    equipmentId: text('equipment_id'),
    destinationAddressId: text('destination_address_id'),
    scheduleMode: varchar('schedule_mode', { length: 10 }).notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    windowMinutes: integer('window_minutes'),
    options: jsonb('options').$type<Record<string, string | number | boolean>>().notNull().default({}),
    notes: text('notes'),
    mediaUrls: jsonb('media_urls').$type<string[]>().notNull().default([]),
    couponCode: varchar('coupon_code', { length: 20 }),
    paymentMethodId: text('payment_method_id'),
    idempotencyKey: varchar('idempotency_key', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('requests_customer_idx').on(t.customerId),
    uniqueIndex('requests_idempotency_uq').on(t.customerId, t.idempotencyKey),
  ],
);

export const serviceOrders = pgTable(
  'service_orders',
  {
    id: id(),
    requestId: text('request_id').notNull(),
    customerId: text('customer_id').notNull(),
    providerId: text('provider_id'),
    parentOrderId: text('parent_order_id'),
    serviceId: text('service_id').notNull(),
    categoryId: text('category_id').notNull(),
    regionId: text('region_id'),
    workflowKind: varchar('workflow_kind', { length: 20 }).notNull(),
    workflowVersion: integer('workflow_version').notNull().default(1),
    status: varchar('status', { length: 30 }).notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    windowMinutes: integer('window_minutes'),
    etaAt: timestamp('eta_at', { withTimezone: true }),
    addressSummary: text('address_summary'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    addressInstructions: text('address_instructions'),
    destinationSummary: text('destination_summary'),
    destinationLat: doublePrecision('destination_lat'),
    destinationLng: doublePrecision('destination_lng'),
    priceCents: integer('price_cents'),
    additionalApprovedCents: integer('additional_approved_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents'),
    platformFeeCents: integer('platform_fee_cents'),
    providerPayoutCents: integer('provider_payout_cents'),
    startPin: varchar('start_pin', { length: 4 }),
    custodyCode: varchar('custody_code', { length: 24 }),
    notes: text('notes'),
    cancelReason: text('cancel_reason'),
    cancelledBy: varchar('cancelled_by', { length: 20 }),
    cancellationFeeCents: integer('cancellation_fee_cents'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    matchingStartedAt: timestamp('matching_started_at', { withTimezone: true }),
    dispatchWave: integer('dispatch_wave').notNull().default(0),
    /** Flags derivadas da categoria, congeladas no momento da criação. */
    flags: jsonb('flags')
      .$type<{
        requiresStartPin: boolean;
        requiresBeforeAfterPhotos: boolean;
        requiresCustody: boolean;
        requiresVehicleHandover: boolean;
        allowsAdditionalQuote: boolean;
      }>()
      .notNull()
      .default({
        requiresStartPin: false,
        requiresBeforeAfterPhotos: false,
        requiresCustody: false,
        requiresVehicleHandover: false,
        allowsAdditionalQuote: true,
      }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    version: integer('version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('orders_customer_idx').on(t.customerId, t.createdAt),
    index('orders_provider_idx').on(t.providerId, t.status),
    index('orders_status_idx').on(t.status, t.createdAt),
    index('orders_parent_idx').on(t.parentOrderId),
    index('orders_scheduled_idx').on(t.scheduledFor),
  ],
);

export const orderEvents = pgTable(
  'order_events',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    seq: integer('seq').notNull(),
    type: varchar('type', { length: 60 }).notNull(),
    action: varchar('action', { length: 60 }),
    fromStatus: varchar('from_status', { length: 30 }),
    toStatus: varchar('to_status', { length: 30 }),
    actorType: varchar('actor_type', { length: 20 }).notNull(),
    actorId: text('actor_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('order_events_seq_uq').on(t.orderId, t.seq)],
);

export const orderTasks = pgTable(
  'order_tasks',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    seq: integer('seq').notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    kind: varchar('kind', { length: 40 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    childOrderId: text('child_order_id'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    dependsOnSeq: jsonb('depends_on_seq').$type<number[]>().notNull().default([]),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('order_tasks_order_idx').on(t.orderId, t.seq)],
);

export const bookings = pgTable(
  'bookings',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    providerId: text('provider_id'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    reminder24hSentAt: timestamp('reminder_24h_sent_at', { withTimezone: true }),
    reminder1hSentAt: timestamp('reminder_1h_sent_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('bookings_order_uq').on(t.orderId),
    index('bookings_provider_idx').on(t.providerId, t.startsAt),
  ],
);

export const mediaEvidence = pgTable(
  'media_evidence',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    kind: varchar('kind', { length: 20 }).notNull(),
    url: text('url').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('media_evidence_order_idx').on(t.orderId)],
);

export const custodyEvents = pgTable(
  'custody_events',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    itemCode: varchar('item_code', { length: 40 }).notNull(),
    step: varchar('step', { length: 30 }).notNull(),
    fromParty: varchar('from_party', { length: 30 }).notNull(),
    toParty: varchar('to_party', { length: 30 }).notNull(),
    byUserId: text('by_user_id').notNull(),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    photoUrl: text('photo_url'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('custody_order_idx').on(t.orderId, t.createdAt)],
);

export const vehicleHandovers = pgTable(
  'vehicle_handovers',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    step: varchar('step', { length: 20 }).notNull(),
    odometerKm: integer('odometer_km').notNull(),
    fuelLevelPct: integer('fuel_level_pct'),
    checklist: jsonb('checklist').$type<Record<string, boolean>>().notNull().default({}),
    photoUrls: jsonb('photo_urls').$type<string[]>().notNull().default([]),
    customerConfirmed: text('customer_confirmed'),
    byUserId: text('by_user_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('vehicle_handovers_order_idx').on(t.orderId)],
);

export const quotes = pgTable(
  'quotes',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    providerId: text('provider_id').notNull(),
    kind: varchar('kind', { length: 12 }).notNull(),
    status: varchar('status', { length: 12 }).notNull().default('SENT'),
    items: jsonb('items')
      .$type<Array<{ description: string; quantity: number; unitPriceCents: number }>>()
      .notNull()
      .default([]),
    amountCents: integer('amount_cents').notNull(),
    notes: text('notes'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedByUserId: text('decided_by_user_id'),
    createdAt: createdAt(),
  },
  (t) => [index('quotes_order_idx').on(t.orderId, t.status)],
);

export const workflowDefinitions = pgTable(
  'workflow_definitions',
  {
    id: id(),
    kind: varchar('kind', { length: 20 }).notNull(),
    version: integer('version').notNull(),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    active: text('active').notNull().default('true'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('workflow_definitions_uq').on(t.kind, t.version)],
);
