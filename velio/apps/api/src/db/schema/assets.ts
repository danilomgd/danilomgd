import { index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_shared';

export const vehicles = pgTable(
  'vehicles',
  {
    id: id(),
    userId: text('user_id').notNull(),
    brand: varchar('brand', { length: 40 }).notNull(),
    model: varchar('model', { length: 60 }).notNull(),
    plate: varchar('plate', { length: 8 }).notNull(),
    year: integer('year').notNull(),
    color: varchar('color', { length: 30 }),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('vehicles_user_idx').on(t.userId)],
);

export const equipments = pgTable(
  'equipments',
  {
    id: id(),
    userId: text('user_id').notNull(),
    kind: varchar('kind', { length: 30 }).notNull().default('AIR_CONDITIONER'),
    brand: varchar('brand', { length: 40 }).notNull(),
    model: varchar('model', { length: 60 }),
    btus: integer('btus'),
    room: varchar('room', { length: 40 }).notNull(),
    addressId: text('address_id'),
    lastMaintenanceAt: timestamp('last_maintenance_at', { withTimezone: true }),
    maintenanceIntervalMonths: integer('maintenance_interval_months').notNull().default(6),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('equipments_user_idx').on(t.userId)],
);
