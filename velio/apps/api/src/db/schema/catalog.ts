import type { CategoryConfig, ServiceOption } from '@velio/contracts';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_shared';

export const regions = pgTable('regions', {
  id: id(),
  name: varchar('name', { length: 120 }).notNull(),
  city: varchar('city', { length: 120 }).notNull(),
  state: varchar('state', { length: 2 }).notNull(),
  minLat: doublePrecision('min_lat').notNull(),
  minLng: doublePrecision('min_lng').notNull(),
  maxLat: doublePrecision('max_lat').notNull(),
  maxLng: doublePrecision('max_lng').notNull(),
  neighborhoods: jsonb('neighborhoods').$type<string[]>().notNull().default([]),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const serviceCategories = pgTable(
  'service_categories',
  {
    id: id(),
    parentId: text('parent_id'),
    slug: varchar('slug', { length: 80 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description'),
    icon: varchar('icon', { length: 40 }).notNull().default('wrench'),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    config: jsonb('config').$type<Partial<CategoryConfig>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('categories_slug_uq').on(t.slug), index('categories_parent_idx').on(t.parentId)],
);

export const services = pgTable(
  'services',
  {
    id: id(),
    categoryId: text('category_id').notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    shortDescription: varchar('short_description', { length: 160 }),
    description: text('description'),
    workflowKind: varchar('workflow_kind', { length: 20 }).notNull(),
    pricingModel: varchar('pricing_model', { length: 10 }).notNull(),
    basePriceCents: integer('base_price_cents'),
    priceMinCents: integer('price_min_cents'),
    priceMaxCents: integer('price_max_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    estimatedDurationMinutes: integer('estimated_duration_minutes'),
    allowsImmediate: boolean('allows_immediate').notNull().default(true),
    allowsScheduling: boolean('allows_scheduling').notNull().default(true),
    requiresAddress: boolean('requires_address').notNull().default(true),
    requiresVehicle: boolean('requires_vehicle').notNull().default(false),
    requiresEquipment: boolean('requires_equipment').notNull().default(false),
    options: jsonb('options').$type<ServiceOption[]>().notNull().default([]),
    imageUrl: text('image_url'),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    searchText: text('search_text'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('services_slug_uq').on(t.slug), index('services_category_idx').on(t.categoryId)],
);

export const servicePriceRules = pgTable(
  'service_price_rules',
  {
    id: id(),
    serviceId: text('service_id').notNull(),
    regionId: text('region_id'),
    basePriceCents: integer('base_price_cents'),
    priceMinCents: integer('price_min_cents'),
    priceMaxCents: integer('price_max_cents'),
    hourlyRateCents: integer('hourly_rate_cents'),
    surgeMultiplierBps: integer('surge_multiplier_bps').notNull().default(10000),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('price_rules_service_idx').on(t.serviceId, t.regionId)],
);

export const homeSections = pgTable('home_sections', {
  id: varchar('id', { length: 60 }).primaryKey(),
  kind: varchar('kind', { length: 30 }).notNull(),
  title: varchar('title', { length: 60 }),
  subtitle: varchar('subtitle', { length: 120 }),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  rules: jsonb('rules').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
});

export const banners = pgTable('banners', {
  id: id(),
  title: varchar('title', { length: 80 }).notNull(),
  subtitle: varchar('subtitle', { length: 160 }),
  imageUrl: text('image_url'),
  deepLink: text('deep_link'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
