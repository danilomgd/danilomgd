import { z } from 'zod';
import { Cents, Uuid } from './common';
import { HomeSectionKind, PricingModel, WorkflowKind } from './enums';

/** Configuração por categoria que altera guards e exigências do workflow. */
export const CategoryConfig = z.object({
  requiresStartPin: z.boolean().default(false),
  requiresBeforeAfterPhotos: z.boolean().default(false),
  requiresVehicle: z.boolean().default(false),
  requiresEquipment: z.boolean().default(false),
  requiresCustody: z.boolean().default(false),
  allowsAdditionalQuote: z.boolean().default(true),
  defaultServiceRadiusKm: z.number().positive().default(15),
});
export type CategoryConfig = z.infer<typeof CategoryConfig>;

export const ServiceCategory = z.object({
  id: Uuid,
  parentId: Uuid.nullable(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  icon: z.string().min(1),
  sortOrder: z.number().int(),
  active: z.boolean(),
  config: CategoryConfig,
});
export type ServiceCategory = z.infer<typeof ServiceCategory>;

export const ServiceOption = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['select', 'number', 'boolean', 'text']),
  required: z.boolean().default(false),
  choices: z
    .array(z.object({ value: z.string(), label: z.string(), priceDeltaCents: Cents.default(0) }))
    .optional(),
  unitPriceCents: Cents.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type ServiceOption = z.infer<typeof ServiceOption>;

export const Service = z.object({
  id: Uuid,
  categoryId: Uuid,
  slug: z.string(),
  name: z.string(),
  shortDescription: z.string().nullable(),
  description: z.string().nullable(),
  workflowKind: WorkflowKind,
  pricingModel: PricingModel,
  basePriceCents: Cents.nullable(),
  priceMinCents: Cents.nullable(),
  priceMaxCents: Cents.nullable(),
  hourlyRateCents: Cents.nullable(),
  estimatedDurationMinutes: z.number().int().positive().nullable(),
  allowsImmediate: z.boolean(),
  allowsScheduling: z.boolean(),
  requiresAddress: z.boolean(),
  requiresVehicle: z.boolean(),
  requiresEquipment: z.boolean(),
  options: z.array(ServiceOption),
  imageUrl: z.string().url().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type Service = z.infer<typeof Service>;

export const ServiceSummary = Service.pick({
  id: true,
  categoryId: true,
  slug: true,
  name: true,
  shortDescription: true,
  workflowKind: true,
  pricingModel: true,
  basePriceCents: true,
  priceMinCents: true,
  priceMaxCents: true,
  estimatedDurationMinutes: true,
  allowsImmediate: true,
  allowsScheduling: true,
  imageUrl: true,
});
export type ServiceSummary = z.infer<typeof ServiceSummary>;

export const HomeSection = z.object({
  id: z.string(),
  kind: HomeSectionKind,
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  /** Itens já resolvidos pelo servidor para a seção. */
  items: z.array(z.unknown()),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type HomeSection = z.infer<typeof HomeSection>;

export const HomeResponse = z.object({
  greeting: z.string(),
  /** Mensagem contextual com fonte explícita (hora, equipamento, agenda). Nunca inventada. */
  contextHint: z
    .object({
      text: z.string(),
      source: z.enum(['time_of_day', 'equipment_due', 'upcoming_booking', 'active_order']),
    })
    .nullable(),
  sections: z.array(HomeSection),
});
export type HomeResponse = z.infer<typeof HomeResponse>;

export const SearchQuery = z.object({
  q: z.string().min(1).max(120),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

export const PriceEstimateInput = z.object({
  serviceId: Uuid,
  options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  regionId: Uuid.optional(),
  couponCode: z.string().optional(),
});
export const PriceEstimate = z.object({
  pricingModel: PricingModel,
  subtotalCents: Cents.nullable(),
  minCents: Cents.nullable(),
  maxCents: Cents.nullable(),
  discountCents: Cents,
  totalCents: Cents.nullable(),
  requiresQuote: z.boolean(),
  breakdown: z.array(z.object({ label: z.string(), amountCents: z.number().int() })),
});
export type PriceEstimate = z.infer<typeof PriceEstimate>;
