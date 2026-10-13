import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';
import { NotificationChannel, NotificationKind } from './enums';

export const Message = z.object({
  id: Uuid,
  conversationId: Uuid,
  senderType: z.enum(['customer', 'provider', 'operator', 'system']),
  senderUserId: Uuid.nullable(),
  body: z.string().nullable(),
  mediaUrl: z.string().url().nullable(),
  systemKind: z.string().nullable(),
  createdAt: IsoDateTime,
  readAt: IsoDateTime.nullable(),
});
export type Message = z.infer<typeof Message>;

export const SendMessageInput = z
  .object({
    body: z.string().max(2000).optional(),
    mediaUrl: z.string().url().optional(),
  })
  .refine((m) => Boolean(m.body?.trim()) || Boolean(m.mediaUrl), { message: 'Mensagem vazia' });

export const Notification = z.object({
  id: Uuid,
  kind: NotificationKind,
  channel: NotificationChannel,
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
  createdAt: IsoDateTime,
  readAt: IsoDateTime.nullable(),
});
export type Notification = z.infer<typeof Notification>;

export const SupportTicketInput = z.object({
  orderId: Uuid.optional(),
  subject: z.string().min(3).max(120),
  body: z.string().min(3).max(3000),
  kind: z.enum(['QUESTION', 'COMPLAINT', 'REPORT_USER', 'PAYMENT', 'OTHER']).default('QUESTION'),
});
export const SupportTicket = z.object({
  id: Uuid,
  userId: Uuid,
  orderId: Uuid.nullable(),
  subject: z.string(),
  kind: z.string(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  assigneeUserId: Uuid.nullable(),
  conversationId: Uuid,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type SupportTicket = z.infer<typeof SupportTicket>;
