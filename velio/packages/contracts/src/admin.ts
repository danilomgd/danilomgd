import { z } from 'zod';
import { CategoryConfig, ServiceOption } from './catalog';
import { Cents, IsoDateTime, Uuid } from './common';
import { HomeSectionKind, PricingModel, WorkflowKind } from './enums';

export const UpsertCategoryInput = z.object({
  id: Uuid.optional(),
  parentId: Uuid.nullable().optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(60),
  description: z.string().max(300).optional().nullable(),
  icon: z.string().min(1).max(40),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
  config: CategoryConfig.partial().default({}),
});

export const UpsertServiceInput = z.object({
  id: Uuid.optional(),
  categoryId: Uuid,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(80),
  shortDescription: z.string().max(140).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  workflowKind: WorkflowKind,
  pricingModel: PricingModel,
  basePriceCents: Cents.optional().nullable(),
  priceMinCents: Cents.optional().nullable(),
  priceMaxCents: Cents.optional().nullable(),
  hourlyRateCents: Cents.optional().nullable(),
  estimatedDurationMinutes: z.number().int().positive().optional().nullable(),
  allowsImmediate: z.boolean().default(true),
  allowsScheduling: z.boolean().default(true),
  requiresAddress: z.boolean().default(true),
  requiresVehicle: z.boolean().default(false),
  requiresEquipment: z.boolean().default(false),
  options: z.array(ServiceOption).default([]),
  imageUrl: z.string().url().optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const UpsertRegionInput = z.object({
  id: Uuid.optional(),
  name: z.string().min(2),
  city: z.string().min(2),
  state: z.string().length(2),
  /** Bounding box simples no MVP; polígono em V1. */
  bbox: z.object({ minLat: z.number(), minLng: z.number(), maxLat: z.number(), maxLng: z.number() }),
  active: z.boolean().default(true),
  neighborhoods: z.array(z.string()).default([]),
});

export const UpsertPriceRuleInput = z.object({
  id: Uuid.optional(),
  serviceId: Uuid,
  regionId: Uuid.nullable(),
  basePriceCents: Cents.optional().nullable(),
  priceMinCents: Cents.optional().nullable(),
  priceMaxCents: Cents.optional().nullable(),
  hourlyRateCents: Cents.optional().nullable(),
  surgeMultiplierBps: z.number().int().min(10000).max(30000).default(10000),
  active: z.boolean().default(true),
});

export const UpsertCommissionRuleInput = z.object({
  id: Uuid.optional(),
  categoryId: Uuid.nullable(),
  regionId: Uuid.nullable(),
  percentBps: z.number().int().min(0).max(10000),
  fixedCents: Cents.default(0),
  minCents: Cents.default(0),
  maxCents: Cents.nullable().optional(),
  passPaymentFeeToProvider: z.boolean().default(false),
  activeFrom: IsoDateTime.optional(),
});

export const MatchingWeights = z.object({
  proximity: z.number().min(0).max(1),
  qualification: z.number().min(0).max(1),
  reputation: z.number().min(0).max(1),
  availability: z.number().min(0).max(1),
  compatibility: z.number().min(0).max(1),
  acceptanceRate: z.number().min(0).max(1),
  cancellationPenalty: z.number().min(0).max(1),
});
export type MatchingWeights = z.infer<typeof MatchingWeights>;

export const WaveConfig = z.object({
  /** Ondas sucessivas: raio em km, quantos prestadores recebem a oferta, e segundos até expirar. */
  waves: z
    .array(
      z.object({
        radiusKm: z.number().positive(),
        offerCount: z.number().int().min(1).max(20),
        timeoutSeconds: z.number().int().min(15).max(900),
      }),
    )
    .min(1)
    .max(6),
  /** Depois da última onda, cai para a fila de operações. */
  escalateToOps: z.boolean().default(true),
  minScore: z.number().min(0).max(1).default(0.2),
});
export type WaveConfig = z.infer<typeof WaveConfig>;

export const UpsertMatchingConfigInput = z.object({
  id: Uuid.optional(),
  categoryId: Uuid.nullable(),
  weights: MatchingWeights,
  waves: WaveConfig,
  active: z.boolean().default(true),
});

export const UpsertCouponInput = z.object({
  code: z.string().regex(/^[A-Z0-9]{4,20}$/),
  kind: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().positive(),
  minOrderCents: Cents.nullable().optional(),
  maxDiscountCents: Cents.nullable().optional(),
  validFrom: IsoDateTime.nullable().optional(),
  validUntil: IsoDateTime.nullable().optional(),
  usageLimit: z.number().int().nullable().optional(),
  perUserLimit: z.number().int().nullable().optional(),
  categoryId: Uuid.nullable().optional(),
  active: z.boolean().default(true),
});

export const UpsertPlanInput = z.object({
  id: Uuid.optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(2),
  description: z.string().max(500).optional().nullable(),
  serviceId: Uuid,
  intervalMonths: z.number().int().positive(),
  visitsPerCycle: z.number().int().positive(),
  priceCents: Cents,
  benefits: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

export const UpsertHomeSectionInput = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  kind: HomeSectionKind,
  title: z.string().max(60).nullable().optional(),
  subtitle: z.string().max(120).nullable().optional(),
  sortOrder: z.number().int(),
  active: z.boolean().default(true),
  /** Regras de exibição por contexto: horas do dia, só com equipamento cadastrado, etc. */
  rules: z
    .object({
      hoursOfDay: z.array(z.number().int().min(0).max(23)).optional(),
      requiresEquipmentDue: z.boolean().optional(),
      requiresActiveOrder: z.boolean().optional(),
      requiresSubscription: z.boolean().optional(),
    })
    .default({}),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const PlatformSettings = z.object({
  cancellation: z.object({
    freeMinutesAfterAccept: z.number().int().default(10),
    lateFeeCents: Cents.default(1500),
    enRouteFeeBps: z.number().int().default(2000),
    enRouteFeeMinCents: Cents.default(2000),
  }),
  offers: z.object({ defaultTimeoutSeconds: z.number().int().default(90) }),
  quotes: z.object({ additionalQuoteExpiresMinutes: z.number().int().default(60) }),
  payouts: z.object({
    cadence: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('WEEKLY'),
    weekday: z.number().int().min(0).max(6).default(3),
  }),
  concierge: z.object({
    humanReviewAboveCents: Cents.default(50000),
    humanReviewAboveTasks: z.number().int().default(4),
    alwaysHumanForKinds: z.array(z.string()).default(['PURCHASE']),
  }),
  location: z.object({ maxAccuracyM: z.number().default(100), retentionDays: z.number().int().default(30) }),
  reviews: z.object({ windowDays: z.number().int().default(7) }),
});
export type PlatformSettings = z.infer<typeof PlatformSettings>;

export const ApproveProviderInput = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'SUSPEND', 'BLOCK']),
  reason: z.string().max(500).optional(),
});

export const ManualAssignInput = z.object({
  providerId: Uuid,
  note: z.string().max(300).optional(),
});
