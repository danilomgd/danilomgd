import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';

/** Catálogo fechado de eventos de produto (ADR-013). Novos eventos entram aqui, nunca como string livre. */
export const AnalyticsEventName = z.enum([
  'app_open',
  'home_view',
  'category_view',
  'service_view',
  'search_performed',
  'service_request_started',
  'service_request_completed',
  'checkout_view',
  'payment_method_added',
  'provider_matched',
  'provider_accepted',
  'provider_en_route',
  'provider_arrived',
  'service_started',
  'quote_sent',
  'quote_approved',
  'quote_rejected',
  'service_completed',
  'payment_completed',
  'payment_failed',
  'order_cancelled',
  'no_provider_found',
  'review_created',
  'dispute_opened',
  'subscription_started',
  'subscription_cancelled',
  'concierge_submitted',
  'concierge_plan_approved',
  'provider_online',
  'provider_offline',
  'offer_received',
  'offer_accepted',
  'offer_rejected',
  'offer_expired',
  'notification_opened',
]);
export type AnalyticsEventName = z.infer<typeof AnalyticsEventName>;

export const AnalyticsEvent = z.object({
  name: AnalyticsEventName,
  occurredAt: IsoDateTime,
  sessionId: z.string().max(64).optional(),
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  orderId: Uuid.optional(),
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEvent>;

export const AnalyticsBatchInput = z.object({
  events: z.array(AnalyticsEvent).min(1).max(100),
  app: z.enum(['customer', 'provider', 'web']),
  appVersion: z.string().max(20).optional(),
});

export const DashboardMetrics = z.object({
  periodStart: IsoDateTime,
  periodEnd: IsoDateTime,
  gmvCents: z.number().int(),
  orders: z.number().int(),
  completedOrders: z.number().int(),
  cancelledOrders: z.number().int(),
  avgTicketCents: z.number().int().nullable(),
  takeRatePct: z.number().nullable(),
  platformRevenueCents: z.number().int(),
  repeatRatePct: z.number().nullable(),
  avgMatchingSeconds: z.number().nullable(),
  avgArrivalSeconds: z.number().nullable(),
  avgRating: z.number().nullable(),
  noProviderRatePct: z.number().nullable(),
  activeProviders: z.number().int(),
  newCustomers: z.number().int(),
});
export type DashboardMetrics = z.infer<typeof DashboardMetrics>;
