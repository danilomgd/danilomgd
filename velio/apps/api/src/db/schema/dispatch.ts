import type { MatchingWeights, WaveConfig } from '@velio/contracts';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_shared';

export const matchingConfigs = pgTable(
  'matching_configs',
  {
    id: id(),
    categoryId: text('category_id'),
    weights: jsonb('weights').$type<MatchingWeights>().notNull(),
    waves: jsonb('waves').$type<WaveConfig>().notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('matching_configs_category_uq').on(t.categoryId)],
);

export const dispatchRounds = pgTable(
  'dispatch_rounds',
  {
    id: id(),
    orderId: text('order_id').notNull(),
    wave: integer('wave').notNull(),
    radiusKm: real('radius_km').notNull(),
    candidatesCount: integer('candidates_count').notNull().default(0),
    eligibleCount: integer('eligible_count').notNull().default(0),
    offeredCount: integer('offered_count').notNull().default(0),
    outcome: varchar('outcome', { length: 20 }),
    startedAt: createdAt(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('dispatch_rounds_order_idx').on(t.orderId, t.wave)],
);

export const dispatchOffers = pgTable(
  'dispatch_offers',
  {
    id: id(),
    roundId: text('round_id').notNull(),
    orderId: text('order_id').notNull(),
    providerId: text('provider_id').notNull(),
    score: real('score').notNull(),
    distanceKm: real('distance_km').notNull(),
    scoreBreakdown: jsonb('score_breakdown').$type<Record<string, number>>().notNull().default({}),
    response: varchar('response', { length: 12 }).notNull().default('PENDING'),
    offeredAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    index('dispatch_offers_order_idx').on(t.orderId, t.response),
    index('dispatch_offers_provider_idx').on(t.providerId, t.response),
    uniqueIndex('dispatch_offers_uq').on(t.orderId, t.providerId, t.roundId),
  ],
);
