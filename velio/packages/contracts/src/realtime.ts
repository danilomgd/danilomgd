import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';
import { OrderStatus } from './enums';

/** Eventos emitidos pelo servidor via Socket.IO. Nome → payload. */
export const RealtimeEvents = {
  'order.updated': z.object({ orderId: Uuid, status: OrderStatus, updatedAt: IsoDateTime }),
  'order.event': z.object({ orderId: Uuid, eventId: Uuid, type: z.string(), seq: z.number().int() }),
  'offer.created': z.object({ offerId: Uuid, orderId: Uuid, expiresAt: IsoDateTime }),
  'offer.expired': z.object({ offerId: Uuid, orderId: Uuid }),
  'provider.location': z.object({
    orderId: Uuid,
    lat: z.number(),
    lng: z.number(),
    headingDeg: z.number().nullable(),
    etaMinutes: z.number().nullable(),
    recordedAt: IsoDateTime,
  }),
  'message.created': z.object({ conversationId: Uuid, messageId: Uuid, orderId: Uuid.nullable() }),
  'quote.created': z.object({ quoteId: Uuid, orderId: Uuid, amountCents: z.number().int() }),
  'quote.decided': z.object({ quoteId: Uuid, orderId: Uuid, status: z.string() }),
  'payment.updated': z.object({ intentId: Uuid, orderId: Uuid.nullable(), status: z.string() }),
  'notification.created': z.object({ notificationId: Uuid, kind: z.string() }),
  'ops.order_needs_attention': z.object({ orderId: Uuid, reason: z.string() }),
} as const;
export type RealtimeEventName = keyof typeof RealtimeEvents;
export type RealtimePayload<K extends RealtimeEventName> = z.infer<(typeof RealtimeEvents)[K]>;

/** Salas. */
export const rooms = {
  user: (userId: string) => `user:${userId}`,
  order: (orderId: string) => `order:${orderId}`,
  provider: (providerId: string) => `provider:${providerId}`,
  ops: () => 'ops',
} as const;

/** Mensagens que o cliente envia ao servidor. */
export const ClientRealtimeEvents = {
  'location.push': z.object({
    lat: z.number(),
    lng: z.number(),
    accuracyM: z.number().optional(),
    headingDeg: z.number().optional(),
    speedMps: z.number().optional(),
    recordedAt: IsoDateTime,
  }),
  'order.subscribe': z.object({ orderId: Uuid }),
  'order.unsubscribe': z.object({ orderId: Uuid }),
} as const;
