import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_shared';

export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    reviewerUserId: text('reviewer_user_id').notNull(),
    targetType: varchar('target_type', { length: 10 }).notNull(),
    targetId: text('target_id').notNull(),
    rating: integer('rating').notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    comment: text('comment'),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('reviews_order_target_uq').on(t.orderId, t.targetType), index('reviews_target_idx').on(t.targetType, t.targetId, t.createdAt)],
);

export const customerRiskSignals = pgTable('customer_risk_signals', {
  userId: text('user_id').primaryKey(),
  lateCancellations90d: integer('late_cancellations_90d').notNull().default(0),
  disputesOpened90d: integer('disputes_opened_90d').notNull().default(0),
  disputesRejected90d: integer('disputes_rejected_90d').notNull().default(0),
  chargebacks: integer('chargebacks').notNull().default(0),
  completedOrders: integer('completed_orders').notNull().default(0),
  riskScore: integer('risk_score_bps').notNull().default(0),
  updatedAt: updatedAt(),
});

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: id(),
    userId: text('user_id').notNull(),
    orderId: text('order_id'),
    conversationId: text('conversation_id').notNull(),
    subject: varchar('subject', { length: 120 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('OPEN'),
    priority: varchar('priority', { length: 10 }).notNull().default('NORMAL'),
    assigneeUserId: text('assignee_user_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('tickets_user_idx').on(t.userId), index('tickets_status_idx').on(t.status, t.priority)],
);

export const disputes = pgTable(
  'disputes',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    openedByUserId: text('opened_by_user_id').notNull(),
    reason: varchar('reason', { length: 20 }).notNull(),
    description: text('description').notNull(),
    evidenceUrls: jsonb('evidence_urls').$type<string[]>().notNull().default([]),
    status: varchar('status', { length: 20 }).notNull().default('OPEN'),
    resolution: jsonb('resolution').$type<{ refundCents: number; providerPayoutCents: number; note: string }>(),
    resolvedByUserId: text('resolved_by_user_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('disputes_order_uq').on(t.orderId)],
);

export const incidents = pgTable(
  'incidents',
  {
    id: id(),
    orderId: text('order_id'),
    kind: varchar('kind', { length: 30 }).notNull(),
    severity: varchar('severity', { length: 10 }).notNull().default('MEDIUM'),
    title: varchar('title', { length: 160 }).notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status', { length: 12 }).notNull().default('OPEN'),
    assigneeUserId: text('assignee_user_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('incidents_status_idx').on(t.status, t.createdAt), index('incidents_order_idx').on(t.orderId)],
);
