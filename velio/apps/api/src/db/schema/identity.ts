import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_shared';

export const users = pgTable(
  'users',
  {
    id: id(),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    passwordHash: text('password_hash'),
    name: varchar('name', { length: 120 }),
    avatarUrl: text('avatar_url'),
    roles: jsonb('roles').$type<string[]>().notNull().default(['customer']),
    locale: varchar('locale', { length: 10 }).notNull().default('pt-BR'),
    timezone: varchar('timezone', { length: 60 }).notNull().default('America/Sao_Paulo'),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    consents: jsonb('consents').$type<Record<string, { granted: boolean; at: string }>>().notNull().default({}),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_phone_uq').on(t.phone), uniqueIndex('users_email_uq').on(t.email)],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: id(),
    phone: varchar('phone', { length: 20 }).notNull(),
    codeHash: text('code_hash').notNull(),
    app: varchar('app', { length: 20 }).notNull().default('customer'),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('otp_phone_idx').on(t.phone, t.createdAt)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    deviceName: varchar('device_name', { length: 80 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedById: text('replaced_by_id'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('refresh_token_hash_uq').on(t.tokenHash), index('refresh_user_idx').on(t.userId)],
);

export const devices = pgTable(
  'devices',
  {
    id: id(),
    userId: text('user_id').notNull(),
    pushToken: text('push_token').notNull(),
    platform: varchar('platform', { length: 10 }).notNull(),
    app: varchar('app', { length: 20 }).notNull().default('customer'),
    active: boolean('active').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('devices_token_uq').on(t.pushToken), index('devices_user_idx').on(t.userId)],
);

export const addresses = pgTable(
  'addresses',
  {
    id: id(),
    userId: text('user_id').notNull(),
    label: varchar('label', { length: 40 }).notNull(),
    street: text('street').notNull(),
    number: varchar('number', { length: 20 }).notNull(),
    complement: text('complement'),
    neighborhood: varchar('neighborhood', { length: 120 }).notNull(),
    city: varchar('city', { length: 120 }).notNull(),
    state: varchar('state', { length: 2 }).notNull(),
    postalCode: varchar('postal_code', { length: 9 }).notNull(),
    lat: text('lat').notNull(),
    lng: text('lng').notNull(),
    instructions: text('instructions'),
    isDefault: boolean('is_default').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('addresses_user_idx').on(t.userId)],
);
