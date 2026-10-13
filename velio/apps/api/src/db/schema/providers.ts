import { boolean, doublePrecision, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_shared';

export const providers = pgTable(
  'providers',
  {
    id: id(),
    userId: text('user_id').notNull(),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    legalName: varchar('legal_name', { length: 120 }),
    /** Hash do CPF/CNPJ para unicidade; nunca em claro. */
    documentHash: text('document_hash'),
    documentMasked: varchar('document_masked', { length: 20 }),
    bio: text('bio'),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    availability: varchar('availability', { length: 20 }).notNull().default('OFFLINE'),
    baseLat: doublePrecision('base_lat'),
    baseLng: doublePrecision('base_lng'),
    baseCity: varchar('base_city', { length: 120 }),
    baseState: varchar('base_state', { length: 2 }),
    serviceRadiusKm: real('service_radius_km').notNull().default(15),
    lastLat: doublePrecision('last_lat'),
    lastLng: doublePrecision('last_lng'),
    lastLocationAt: timestamp('last_location_at', { withTimezone: true }),
    ratingAvg: real('rating_avg'),
    ratingCount: integer('rating_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    acceptanceRate: real('acceptance_rate'),
    cancellationRate: real('cancellation_rate'),
    avgResponseSeconds: real('avg_response_seconds'),
    lastOrderCompletedAt: timestamp('last_order_completed_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    statusReason: text('status_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('providers_user_uq').on(t.userId),
    uniqueIndex('providers_document_uq').on(t.documentHash),
    index('providers_availability_idx').on(t.availability, t.status),
    index('providers_location_idx').on(t.lastLat, t.lastLng),
  ],
);

export const providerDocuments = pgTable(
  'provider_documents',
  {
    id: id(),
    providerId: text('provider_id').notNull(),
    kind: varchar('kind', { length: 30 }).notNull(),
    fileUrl: text('file_url').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    rejectedReason: text('rejected_reason'),
    reviewedByUserId: text('reviewed_by_user_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('provider_documents_provider_idx').on(t.providerId)],
);

export const providerSkills = pgTable(
  'provider_skills',
  {
    id: id(),
    providerId: text('provider_id').notNull(),
    categoryId: text('category_id').notNull(),
    /** 0..1 qualificação (declarada 0.5, verificada 0.8, certificada 1.0). */
    level: real('level').notNull().default(0.5),
    verified: boolean('verified').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('provider_skills_uq').on(t.providerId, t.categoryId), index('provider_skills_category_idx').on(t.categoryId)],
);

export const providerServiceAreas = pgTable(
  'provider_service_areas',
  {
    id: id(),
    providerId: text('provider_id').notNull(),
    regionId: text('region_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('provider_areas_uq').on(t.providerId, t.regionId)],
);

export const providerSchedules = pgTable(
  'provider_schedules',
  {
    id: id(),
    providerId: text('provider_id').notNull(),
    weekday: integer('weekday').notNull(),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
  },
  (t) => [index('provider_schedules_provider_idx').on(t.providerId)],
);

export const providerTimeOff = pgTable(
  'provider_time_off',
  {
    id: id(),
    providerId: text('provider_id').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    reason: text('reason'),
  },
  (t) => [index('provider_time_off_idx').on(t.providerId, t.startsAt)],
);

export const providerLocations = pgTable(
  'provider_locations',
  {
    id: id(),
    providerId: text('provider_id').notNull(),
    orderId: text('order_id'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    accuracyM: real('accuracy_m'),
    headingDeg: real('heading_deg'),
    speedMps: real('speed_mps'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('provider_locations_provider_idx').on(t.providerId, t.recordedAt), index('provider_locations_order_idx').on(t.orderId)],
);

export const providerStats = pgTable('provider_stats', {
  providerId: text('provider_id').primaryKey(),
  ratingAvg: real('rating_avg'),
  ratingCount: integer('rating_count').notNull().default(0),
  completedCount: integer('completed_count').notNull().default(0),
  cancelledCount: integer('cancelled_count').notNull().default(0),
  offersReceived: integer('offers_received').notNull().default(0),
  offersAccepted: integer('offers_accepted').notNull().default(0),
  avgResponseSeconds: real('avg_response_seconds'),
  tags: jsonb('tags').$type<Record<string, number>>().notNull().default({}),
  updatedAt: updatedAt(),
});
