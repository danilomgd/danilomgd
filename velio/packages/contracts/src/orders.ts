import { z } from 'zod';
import { Cents, IsoDateTime, LatLng, Uuid } from './common';
import {
  ActorType,
  DisputeStatus,
  EvidenceKind,
  OrderStatus,
  QuoteKind,
  QuoteStatus,
  TransitionAction,
  WorkflowKind,
} from './enums';

export const ScheduleWindow = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('NOW') }),
  z.object({
    mode: z.literal('SCHEDULED'),
    startsAt: IsoDateTime,
    /** Janela de chegada em minutos (ex.: 60 = chega entre startsAt e startsAt+60min). */
    windowMinutes: z.number().int().min(30).max(240).default(60),
  }),
]);
export type ScheduleWindow = z.infer<typeof ScheduleWindow>;

export const CreateServiceRequestInput = z.object({
  serviceId: Uuid,
  addressId: Uuid.optional(),
  vehicleId: Uuid.optional(),
  equipmentId: Uuid.optional(),
  schedule: ScheduleWindow,
  options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  notes: z.string().max(1000).optional(),
  mediaUrls: z.array(z.string().url()).max(6).default([]),
  paymentMethodId: Uuid.optional(),
  couponCode: z.string().optional(),
  /** Para LOGISTICS: destino (oficina, lavanderia) quando não é um parceiro da plataforma. */
  destinationAddressId: Uuid.optional(),
  idempotencyKey: z.string().min(8).max(64).optional(),
});
export type CreateServiceRequestInput = z.infer<typeof CreateServiceRequestInput>;

export const OrderEvent = z.object({
  id: Uuid,
  orderId: Uuid,
  seq: z.number().int(),
  type: z.string(),
  action: TransitionAction.nullable(),
  fromStatus: OrderStatus.nullable(),
  toStatus: OrderStatus.nullable(),
  actorType: ActorType,
  actorId: Uuid.nullable(),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: IsoDateTime,
});
export type OrderEvent = z.infer<typeof OrderEvent>;

export const OrderTask = z.object({
  id: Uuid,
  orderId: Uuid,
  seq: z.number().int(),
  title: z.string(),
  kind: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED']),
  childOrderId: Uuid.nullable(),
  dueAt: IsoDateTime.nullable(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type OrderTask = z.infer<typeof OrderTask>;

export const QuoteItem = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unitPriceCents: Cents,
});
export const Quote = z.object({
  id: Uuid,
  orderId: Uuid,
  providerId: Uuid,
  kind: QuoteKind,
  status: QuoteStatus,
  items: z.array(QuoteItem),
  amountCents: Cents,
  notes: z.string().nullable(),
  expiresAt: IsoDateTime.nullable(),
  decidedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type Quote = z.infer<typeof Quote>;

export const CreateQuoteInput = z.object({
  kind: QuoteKind,
  items: z.array(QuoteItem).min(1),
  notes: z.string().max(500).optional(),
  expiresInMinutes: z
    .number()
    .int()
    .min(5)
    .max(72 * 60)
    .default(60),
});
export type CreateQuoteInput = z.infer<typeof CreateQuoteInput>;

export const ProviderPublic = z.object({
  id: Uuid,
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  ratingAvg: z.number().nullable(),
  ratingCount: z.number().int(),
  completedCount: z.number().int(),
  verified: z.boolean(),
  specialties: z.array(z.string()),
});
export type ProviderPublic = z.infer<typeof ProviderPublic>;

export const ServiceOrder = z.object({
  id: Uuid,
  requestId: Uuid,
  customerId: Uuid,
  providerId: Uuid.nullable(),
  parentOrderId: Uuid.nullable(),
  serviceId: Uuid,
  serviceName: z.string(),
  categorySlug: z.string(),
  workflowKind: WorkflowKind,
  workflowVersion: z.number().int(),
  status: OrderStatus,
  scheduledFor: IsoDateTime.nullable(),
  windowMinutes: z.number().int().nullable(),
  etaAt: IsoDateTime.nullable(),
  address: z
    .object({ summary: z.string(), lat: z.number(), lng: z.number(), instructions: z.string().nullable() })
    .nullable(),
  destination: z.object({ summary: z.string(), lat: z.number(), lng: z.number() }).nullable(),
  priceCents: Cents.nullable(),
  additionalApprovedCents: Cents,
  discountCents: Cents,
  totalCents: Cents.nullable(),
  platformFeeCents: Cents.nullable(),
  providerPayoutCents: Cents.nullable(),
  startPin: z.string().nullable(),
  custodyCode: z.string().nullable(),
  notes: z.string().nullable(),
  provider: ProviderPublic.nullable(),
  cancelReason: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  startedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
});
export type ServiceOrder = z.infer<typeof ServiceOrder>;

export const ServiceOrderDetail = ServiceOrder.extend({
  events: z.array(OrderEvent),
  quotes: z.array(Quote),
  tasks: z.array(OrderTask),
  /** Transições que o ator atual pode disparar agora. */
  allowedActions: z.array(TransitionAction),
});
export type ServiceOrderDetail = z.infer<typeof ServiceOrderDetail>;

export const TransitionInput = z.object({
  action: TransitionAction,
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type TransitionInput = z.infer<typeof TransitionInput>;

export const CancelInput = z.object({
  reason: z.string().min(3).max(300),
});

export const StartInput = z.object({
  pin: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  location: LatLng.optional(),
});

export const CompleteInput = z.object({
  notes: z.string().max(1000).optional(),
  evidenceIds: z.array(Uuid).default([]),
});

export const EvidenceInput = z.object({
  kind: EvidenceKind,
  url: z.string().url(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export const MediaEvidence = EvidenceInput.extend({
  id: Uuid,
  orderId: Uuid,
  createdByUserId: Uuid,
  createdAt: IsoDateTime,
});
export type MediaEvidence = z.infer<typeof MediaEvidence>;

export const CustodyScanInput = z.object({
  itemCode: z.string().min(4),
  location: LatLng.optional(),
  photoUrl: z.string().url().optional(),
  note: z.string().max(300).optional(),
});

export const VehicleHandoverInput = z.object({
  odometerKm: z.number().int().min(0),
  fuelLevelPct: z.number().int().min(0).max(100).optional(),
  checklist: z.record(z.string(), z.boolean()),
  photoUrls: z.array(z.string().url()).min(1),
  customerConfirmationPin: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

export const ReviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(30)).max(5).default([]),
  comment: z.string().max(600).optional(),
});
export const Review = ReviewInput.extend({
  id: Uuid,
  orderId: Uuid,
  reviewerUserId: Uuid,
  targetType: z.enum(['PROVIDER', 'CUSTOMER']),
  createdAt: IsoDateTime,
});
export type Review = z.infer<typeof Review>;
export type ReviewInput = z.infer<typeof ReviewInput>;

export const OpenDisputeInput = z.object({
  reason: z.enum(['NOT_DONE', 'POOR_QUALITY', 'DAMAGE', 'OVERCHARGE', 'OTHER']),
  description: z.string().min(10).max(2000),
  evidenceUrls: z.array(z.string().url()).max(10).default([]),
});
export const Dispute = z.object({
  id: Uuid,
  orderId: Uuid,
  openedByUserId: Uuid,
  reason: z.string(),
  description: z.string(),
  status: DisputeStatus,
  resolution: z.object({ refundCents: Cents, providerPayoutCents: Cents, note: z.string() }).nullable(),
  createdAt: IsoDateTime,
  resolvedAt: IsoDateTime.nullable(),
});
export type Dispute = z.infer<typeof Dispute>;

export const ResolveDisputeInput = z.object({
  outcome: z.enum(['RESOLVED_CUSTOMER', 'RESOLVED_PROVIDER', 'RESOLVED_SPLIT', 'REJECTED']),
  refundCents: Cents.default(0),
  note: z.string().min(3).max(1000),
});

export const OrderListQuery = z.object({
  scope: z.enum(['active', 'history', 'all']).default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
