import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { ConciergePlan } from '@velio/contracts';
import { createdAt, id, updatedAt } from './_shared';

export const conciergeRequests = pgTable(
  'concierge_requests',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    customerId: text('customer_id').notNull(),
    inputType: varchar('input_type', { length: 10 }).notNull(),
    rawText: text('raw_text'),
    audioUrl: text('audio_url'),
    imageUrls: jsonb('image_urls').$type<string[]>().notNull().default([]),
    transcript: text('transcript'),
    plan: jsonb('plan').$type<ConciergePlan>(),
    plannerName: varchar('planner_name', { length: 40 }),
    answers: jsonb('answers').$type<Array<{ question: string; answer: string }>>().notNull().default([]),
    operatorUserId: text('operator_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('concierge_order_uq').on(t.orderId)],
);

export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 60 }).primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedByUserId: text('updated_by_user_id'),
  updatedAt: updatedAt(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorUserId: text('actor_user_id'),
    actorRole: varchar('actor_role', { length: 20 }),
    action: varchar('action', { length: 80 }).notNull(),
    targetType: varchar('target_type', { length: 40 }),
    targetId: text('target_id'),
    before: jsonb('before').$type<unknown>(),
    after: jsonb('after').$type<unknown>(),
    ip: varchar('ip', { length: 45 }),
    createdAt: createdAt(),
  },
  (t) => [index('audit_target_idx').on(t.targetType, t.targetId), index('audit_actor_idx').on(t.actorUserId, t.createdAt)],
);

/** Outbox: eventos de domínio persistidos na mesma transação e despachados depois (ADR-009). */
export const domainEvents = pgTable(
  'domain_events',
  {
    id: id(),
    type: varchar('type', { length: 60 }).notNull(),
    aggregateType: varchar('aggregate_type', { length: 40 }).notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [index('domain_events_pending_idx').on(t.dispatchedAt, t.createdAt), index('domain_events_aggregate_idx').on(t.aggregateType, t.aggregateId)],
);

export const scheduledJobs = pgTable(
  'scheduled_jobs',
  {
    id: id(),
    kind: varchar('kind', { length: 60 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    runAt: timestamp('run_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 12 }).notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lockedBy: text('locked_by'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lastError: text('last_error'),
    dedupeKey: varchar('dedupe_key', { length: 120 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('scheduled_jobs_due_idx').on(t.status, t.runAt), uniqueIndex('scheduled_jobs_dedupe_uq').on(t.dedupeKey)],
);

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: id(),
    name: varchar('name', { length: 60 }).notNull(),
    userId: text('user_id'),
    providerId: text('provider_id'),
    orderId: text('order_id'),
    sessionId: varchar('session_id', { length: 64 }),
    app: varchar('app', { length: 10 }).notNull().default('api'),
    appVersion: varchar('app_version', { length: 20 }),
    properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('analytics_name_idx').on(t.name, t.occurredAt), index('analytics_user_idx').on(t.userId, t.occurredAt)],
);
