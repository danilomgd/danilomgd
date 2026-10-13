import { index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_shared';

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    orderId: text('order_id'),
    kind: varchar('kind', { length: 30 }).notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('conversations_order_kind_uq').on(t.orderId, t.kind)],
);

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: id(),
    conversationId: text('conversation_id').notNull(),
    userId: text('user_id').notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('participants_uq').on(t.conversationId, t.userId),
    index('participants_user_idx').on(t.userId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    conversationId: text('conversation_id').notNull(),
    senderType: varchar('sender_type', { length: 20 }).notNull(),
    senderUserId: text('sender_user_id'),
    body: text('body'),
    mediaUrl: text('media_url'),
    systemKind: varchar('system_kind', { length: 40 }),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: text('user_id').notNull(),
    kind: varchar('kind', { length: 40 }).notNull(),
    channel: varchar('channel', { length: 10 }).notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status', { length: 12 }).notNull().default('PENDING'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);
