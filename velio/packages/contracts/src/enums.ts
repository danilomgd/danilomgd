import { z } from 'zod';

/** Papéis acumuláveis de um usuário. */
export const UserRole = z.enum(['customer', 'provider', 'operator', 'admin']);
export type UserRole = z.infer<typeof UserRole>;

/** Quem dispara uma ação sobre uma ordem. */
export const ActorType = z.enum(['customer', 'provider', 'operator', 'system']);
export type ActorType = z.infer<typeof ActorType>;

export const ProviderStatus = z.enum(['PENDING', 'APPROVED', 'SUSPENDED', 'BLOCKED']);
export type ProviderStatus = z.infer<typeof ProviderStatus>;

export const ProviderAvailability = z.enum(['OFFLINE', 'ONLINE', 'BUSY', 'UNAVAILABLE']);
export type ProviderAvailability = z.infer<typeof ProviderAvailability>;

export const WorkflowKind = z.enum(['IMMEDIATE', 'SCHEDULED', 'QUOTE', 'LOGISTICS', 'LAUNDRY', 'CONCIERGE']);
export type WorkflowKind = z.infer<typeof WorkflowKind>;

export const PricingModel = z.enum(['FIXED', 'HOURLY', 'QUOTE', 'RANGE']);
export type PricingModel = z.infer<typeof PricingModel>;

/**
 * Estados canônicos de uma ServiceOrder. A união cobre todos os workflows;
 * cada WorkflowDefinition usa um subconjunto.
 */
export const OrderStatus = z.enum([
  // comuns
  'REQUESTED',
  'MATCHING',
  'OFFERED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'REVIEWED',
  'CLOSED',
  // agendado
  'SCHEDULED',
  'REMINDED',
  // orçamento
  'UNDER_REVIEW',
  'QUOTED',
  'QUOTE_APPROVED',
  'QUOTE_REJECTED',
  'AUTHORIZED',
  // logístico / lavanderia
  'DRIVER_ASSIGNED',
  'EN_ROUTE_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_DESTINATION',
  'THIRD_PARTY_IN_PROGRESS',
  'THIRD_PARTY_DONE',
  'RETURN_PICKUP',
  'RETURNING',
  'DELIVERED',
  // concierge
  'SUBMITTED',
  'INTERPRETING',
  'PLAN_PROPOSED',
  'NEEDS_HUMAN',
  'PLAN_APPROVED',
  'IN_EXECUTION',
  // excepcionais
  'NO_PROVIDER_FOUND',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_PROVIDER',
  'CANCELLED_BY_PLATFORM',
  'DISPUTED',
  'REFUNDED',
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'REVIEWED',
  'CLOSED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_PROVIDER',
  'CANCELLED_BY_PLATFORM',
  'REFUNDED',
]);

/** Ações que provocam transições. Prefixo = ator natural. */
export const TransitionAction = z.enum([
  'system.start_matching',
  'system.offer',
  'system.no_provider',
  'system.wave_exhausted',
  'system.remind',
  'system.auto_close',
  'system.plan_ready',
  'system.plan_needs_human',
  'system.children_completed',
  'operator.assign',
  'operator.cancel',
  'operator.resolve_dispute',
  'operator.approve_plan',
  'operator.refund',
  'provider.accept',
  'provider.reject',
  'provider.en_route',
  'provider.arrive',
  'provider.start',
  'provider.complete',
  'provider.cancel',
  'provider.submit_quote',
  'provider.start_review',
  'provider.pickup',
  'provider.depart',
  'provider.arrive_destination',
  'provider.third_party_start',
  'provider.third_party_done',
  'provider.return_pickup',
  'provider.return_depart',
  'provider.deliver',
  'customer.cancel',
  'customer.approve_quote',
  'customer.reject_quote',
  'customer.approve_plan',
  'customer.authorize_payment',
  'customer.review',
  'customer.open_dispute',
]);
export type TransitionAction = z.infer<typeof TransitionAction>;

export const QuoteKind = z.enum(['INITIAL', 'ADDITIONAL']);
export type QuoteKind = z.infer<typeof QuoteKind>;
export const QuoteStatus = z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED']);
export type QuoteStatus = z.infer<typeof QuoteStatus>;

export const PaymentMethodKind = z.enum(['CARD', 'PIX', 'WALLET']);
export type PaymentMethodKind = z.infer<typeof PaymentMethodKind>;
export const PaymentIntentKind = z.enum(['INITIAL', 'ADDITIONAL', 'SUBSCRIPTION', 'CANCELLATION_FEE']);
export type PaymentIntentKind = z.infer<typeof PaymentIntentKind>;
export const PaymentIntentStatus = z.enum([
  'REQUIRES_ACTION',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);
export type PaymentIntentStatus = z.infer<typeof PaymentIntentStatus>;

export const OfferResponse = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN']);
export type OfferResponse = z.infer<typeof OfferResponse>;

export const DisputeStatus = z.enum([
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED_CUSTOMER',
  'RESOLVED_PROVIDER',
  'RESOLVED_SPLIT',
  'REJECTED',
]);
export type DisputeStatus = z.infer<typeof DisputeStatus>;

export const EvidenceKind = z.enum([
  'BEFORE',
  'AFTER',
  'PICKUP',
  'DELIVERY',
  'CHECKLIST',
  'ODOMETER',
  'SIGNATURE',
  'CUSTODY',
  'OTHER',
]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const NotificationKind = z.enum([
  'provider_found',
  'provider_en_route',
  'provider_arriving',
  'service_started',
  'quote_available',
  'payment_approved',
  'payment_failed',
  'service_completed',
  'review_request',
  'offer_received',
  'offer_expired',
  'order_cancelled',
  'booking_reminder',
  'plan_proposed',
  'dispute_update',
  'generic',
]);
export type NotificationKind = z.infer<typeof NotificationKind>;

export const NotificationChannel = z.enum(['PUSH', 'INAPP', 'SMS']);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

export const SubscriptionStatus = z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'PAST_DUE']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const ConciergeInputType = z.enum(['TEXT', 'AUDIO', 'IMAGE']);
export type ConciergeInputType = z.infer<typeof ConciergeInputType>;

export const CouponKind = z.enum(['PERCENT', 'FIXED']);
export type CouponKind = z.infer<typeof CouponKind>;

export const HomeSectionKind = z.enum([
  'hero',
  'search',
  'categories',
  'quick_services',
  'scheduled',
  'subscriptions',
  'concierge',
  'active_orders',
  'recommendations',
  'banner',
]);
export type HomeSectionKind = z.infer<typeof HomeSectionKind>;
