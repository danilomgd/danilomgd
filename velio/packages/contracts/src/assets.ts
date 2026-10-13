import { z } from 'zod';
import { IsoDateTime, PlateBR, Uuid } from './common';

export const VehicleInput = z.object({
  brand: z.string().min(1).max(40),
  model: z.string().min(1).max(60),
  plate: PlateBR,
  year: z.number().int().min(1950).max(2100),
  color: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
});
export const Vehicle = VehicleInput.extend({ id: Uuid, userId: Uuid, createdAt: IsoDateTime });
export type Vehicle = z.infer<typeof Vehicle>;

export const EquipmentInput = z.object({
  kind: z.enum(['AIR_CONDITIONER', 'WATER_HEATER', 'OTHER']).default('AIR_CONDITIONER'),
  brand: z.string().min(1).max(40),
  model: z.string().max(60).optional(),
  btus: z.number().int().positive().optional(),
  room: z.string().min(1).max(40),
  addressId: Uuid.optional(),
  lastMaintenanceAt: IsoDateTime.optional().nullable(),
  /** Intervalo recomendado; usado pela home contextual e pelas assinaturas. */
  maintenanceIntervalMonths: z.number().int().min(1).max(24).default(6),
});
export const Equipment = EquipmentInput.extend({
  id: Uuid,
  userId: Uuid,
  nextMaintenanceDueAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type Equipment = z.infer<typeof Equipment>;
