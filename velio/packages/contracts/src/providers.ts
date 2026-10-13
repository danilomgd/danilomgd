import { z } from 'zod';
import { Cents, IsoDateTime, LatLng, Uuid } from './common';
import { OfferResponse, ProviderAvailability, ProviderStatus } from './enums';

export const ProviderOnboardingInput = z.object({
  displayName: z.string().min(2).max(80),
  legalName: z.string().min(2).max(120),
  /** CPF ou CNPJ apenas dígitos. Guardado com hash + máscara; nunca em claro em logs. */
  documentNumber: z.string().regex(/^\d{11}$|^\d{14}$/),
  bio: z.string().max(500).optional(),
  categoryIds: z.array(Uuid).min(1),
  baseAddress: z.object({ lat: z.number(), lng: z.number(), city: z.string(), state: z.string().length(2) }),
  serviceRadiusKm: z.number().min(1).max(100).default(15),
});
export type ProviderOnboardingInput = z.infer<typeof ProviderOnboardingInput>;

export const ProviderDocumentInput = z.object({
  kind: z.enum([
    'ID_FRONT',
    'ID_BACK',
    'SELFIE',
    'PROOF_OF_ADDRESS',
    'CERTIFICATE',
    'CNPJ_CARD',
    'DRIVER_LICENSE',
  ]),
  fileUrl: z.string().url(),
});

export const ProviderMe = z.object({
  id: Uuid,
  userId: Uuid,
  displayName: z.string(),
  status: ProviderStatus,
  availability: ProviderAvailability,
  serviceRadiusKm: z.number(),
  categoryIds: z.array(Uuid),
  ratingAvg: z.number().nullable(),
  ratingCount: z.number().int(),
  completedCount: z.number().int(),
  acceptanceRate: z.number().nullable(),
  cancellationRate: z.number().nullable(),
  avgResponseSeconds: z.number().nullable(),
  documents: z.array(
    z.object({
      kind: z.string(),
      status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
      rejectedReason: z.string().nullable(),
    }),
  ),
  walletBalanceCents: Cents,
});
export type ProviderMe = z.infer<typeof ProviderMe>;

export const SetAvailabilityInput = z.object({
  availability: ProviderAvailability,
  location: LatLng.optional(),
});

export const LocationPing = LatLng.extend({
  accuracyM: z.number().min(0).optional(),
  headingDeg: z.number().min(0).max(360).optional(),
  speedMps: z.number().min(0).optional(),
  recordedAt: IsoDateTime,
});
export const LocationBatchInput = z.object({
  pings: z.array(LocationPing).min(1).max(60),
});
export type LocationPing = z.infer<typeof LocationPing>;

export const WeeklyWindow = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});
export const SetScheduleInput = z.object({ windows: z.array(WeeklyWindow).max(42) });

export const DispatchOffer = z.object({
  id: Uuid,
  orderId: Uuid,
  roundId: Uuid,
  providerId: Uuid,
  score: z.number(),
  response: OfferResponse,
  offeredAt: IsoDateTime,
  expiresAt: IsoDateTime,
  /** Resumo para a tela de oferta: o prestador vê localização aproximada, não o endereço exato. */
  summary: z.object({
    serviceName: z.string(),
    categorySlug: z.string(),
    distanceKm: z.number(),
    approxLocation: z.object({
      neighborhood: z.string(),
      city: z.string(),
      lat: z.number(),
      lng: z.number(),
    }),
    priceCents: Cents.nullable(),
    providerPayoutCents: Cents.nullable(),
    estimatedDurationMinutes: z.number().int().nullable(),
    scheduledFor: IsoDateTime.nullable(),
    notes: z.string().nullable(),
  }),
});
export type DispatchOffer = z.infer<typeof DispatchOffer>;

export const ProviderIndicators = z.object({
  periodDays: z.number().int(),
  completed: z.number().int(),
  cancelled: z.number().int(),
  offersReceived: z.number().int(),
  offersAccepted: z.number().int(),
  acceptanceRate: z.number().nullable(),
  earningsCents: Cents,
  ratingAvg: z.number().nullable(),
  avgResponseSeconds: z.number().nullable(),
});

export const WalletSummary = z.object({
  balanceCents: Cents,
  pendingCents: Cents,
  heldCents: Cents,
  nextPayoutAt: IsoDateTime.nullable(),
});
export const LedgerEntryPublic = z.object({
  id: Uuid,
  kind: z.string(),
  direction: z.enum(['CREDIT', 'DEBIT']),
  amountCents: Cents,
  orderId: Uuid.nullable(),
  description: z.string(),
  createdAt: IsoDateTime,
});
export const Payout = z.object({
  id: Uuid,
  amountCents: Cents,
  status: z.enum(['SCHEDULED', 'PROCESSING', 'PAID', 'FAILED']),
  periodStart: IsoDateTime,
  periodEnd: IsoDateTime,
  paidAt: IsoDateTime.nullable(),
});
