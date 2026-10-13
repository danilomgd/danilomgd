import {
  boolean,
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

export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: id(),
    slug: varchar('slug', { length: 60 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description'),
    serviceId: text('service_id').notNull(),
    intervalMonths: integer('interval_months').notNull(),
    visitsPerCycle: integer('visits_per_cycle').notNull(),
    priceCents: integer('price_cents').notNull(),
    benefits: jsonb('benefits').$type<string[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('plans_slug_uq').on(t.slug)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    customerId: text('customer_id').notNull(),
    planId: text('plan_id').notNull(),
    addressId: text('address_id').notNull(),
    paymentMethodId: text('payment_method_id').notNull(),
    equipmentIds: jsonb('equipment_ids').$type<string[]>().notNull().default([]),
    status: varchar('status', { length: 12 }).notNull().default('ACTIVE'),
    preferredWeekday: integer('preferred_weekday'),
    preferredPeriod: varchar('preferred_period', { length: 10 }),
    startedAt: createdAt(),
    nextVisitDueAt: timestamp('next_visit_due_at', { withTimezone: true }),
    nextChargeAt: timestamp('next_charge_at', { withTimezone: true }),
    lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('subscriptions_customer_idx').on(t.customerId, t.status),
    index('subscriptions_due_idx').on(t.nextVisitDueAt),
  ],
);

export const subscriptionVisits = pgTable(
  'subscription_visits',
  {
    id: id(),
    subscriptionId: text('subscription_id').notNull(),
    orderId: text('order_id').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('subscription_visits_sub_idx').on(t.subscriptionId),
    uniqueIndex('subscription_visits_order_uq').on(t.orderId),
  ],
);
