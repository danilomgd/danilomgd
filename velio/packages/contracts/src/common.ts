import { z } from 'zod';

export const Uuid = z.string().uuid();
export type Uuid = z.infer<typeof Uuid>;

/** Valores monetários sempre em centavos inteiros (ADR-016). */
export const Cents = z.number().int().min(0);
export type Cents = z.infer<typeof Cents>;

export const Currency = z.literal('BRL');

export const IsoDateTime = z.string().datetime({ offset: true });

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

export const Pagination = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof Pagination>;

export const Page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

/** Telefone brasileiro em E.164 (+55DDDNÚMERO). */
export const PhoneBR = z.string().regex(/^\+55\d{10,11}$/, 'Telefone deve estar no formato +55DDDNÚMERO');

export const PlateBR = z
  .string()
  .transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .pipe(z.string().regex(/^[A-Z]{3}\d[A-Z0-9]\d{2}$/, 'Placa inválida (padrão Mercosul ou antigo)'));

export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const Address = z.object({
  id: Uuid,
  label: z.string().min(1).max(40),
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().max(120).optional().nullable(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  postalCode: z.string().regex(/^\d{5}-?\d{3}$/),
  lat: z.number(),
  lng: z.number(),
  instructions: z.string().max(500).optional().nullable(),
  isDefault: z.boolean().default(false),
});
export type Address = z.infer<typeof Address>;

export const AddressInput = Address.omit({ id: true });
export type AddressInput = z.infer<typeof AddressInput>;
