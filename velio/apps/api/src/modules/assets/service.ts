import type { Equipment, EquipmentInput, Vehicle, VehicleInput } from '@velio/contracts';
import type { z } from 'zod';
import { maintenanceDue } from '@velio/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { equipments, vehicles } from '../../db/schema';
import { errors } from '../../lib/errors';
import { type Exec, iso } from '../_shared/util';

export type VehicleRow = typeof vehicles.$inferSelect;
export type EquipmentRow = typeof equipments.$inferSelect;

export function toVehicleDto(v: VehicleRow): Vehicle {
  return {
    id: v.id,
    userId: v.userId,
    brand: v.brand,
    model: v.model,
    plate: v.plate,
    year: v.year,
    color: v.color ?? undefined,
    notes: v.notes ?? undefined,
    createdAt: v.createdAt.toISOString(),
  };
}

export function toEquipmentDto(e: EquipmentRow): Equipment {
  const due = maintenanceDue(e.lastMaintenanceAt, e.maintenanceIntervalMonths, new Date());
  return {
    id: e.id,
    userId: e.userId,
    kind: e.kind as Equipment['kind'],
    brand: e.brand,
    model: e.model ?? undefined,
    btus: e.btus ?? undefined,
    room: e.room,
    addressId: e.addressId ?? undefined,
    lastMaintenanceAt: iso(e.lastMaintenanceAt),
    maintenanceIntervalMonths: e.maintenanceIntervalMonths,
    nextMaintenanceDueAt: iso(due.dueAt),
    createdAt: e.createdAt.toISOString(),
  };
}

export function createAssetsService(ctx: AppContext) {
  const { db, adapters } = ctx;

  return {
    async listVehicles(userId: string): Promise<Vehicle[]> {
      const rows = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.userId, userId), isNull(vehicles.deletedAt)))
        .orderBy(asc(vehicles.createdAt));
      return rows.map(toVehicleDto);
    },

    async getVehicle(userId: string, id: string, exec: Exec = db): Promise<VehicleRow> {
      const [v] = await exec
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, id), eq(vehicles.userId, userId), isNull(vehicles.deletedAt)))
        .limit(1);
      if (!v) throw errors.notFound('Veículo');
      return v;
    },

    async createVehicle(userId: string, input: z.infer<typeof VehicleInput>): Promise<Vehicle> {
      const [row] = await db
        .insert(vehicles)
        .values({ ...input, userId })
        .returning();
      if (!row) throw new Error('Falha ao criar veículo');
      return toVehicleDto(row);
    },

    async deleteVehicle(userId: string, id: string): Promise<void> {
      await this.getVehicle(userId, id);
      await db.update(vehicles).set({ deletedAt: adapters.clock.now() }).where(eq(vehicles.id, id));
    },

    async listEquipments(userId: string, exec: Exec = db): Promise<EquipmentRow[]> {
      return exec
        .select()
        .from(equipments)
        .where(and(eq(equipments.userId, userId), isNull(equipments.deletedAt)))
        .orderBy(asc(equipments.createdAt));
    },

    async getEquipment(userId: string, id: string, exec: Exec = db): Promise<EquipmentRow> {
      const [e] = await exec
        .select()
        .from(equipments)
        .where(and(eq(equipments.id, id), eq(equipments.userId, userId), isNull(equipments.deletedAt)))
        .limit(1);
      if (!e) throw errors.notFound('Equipamento');
      return e;
    },

    async createEquipment(userId: string, input: z.infer<typeof EquipmentInput>): Promise<Equipment> {
      const [row] = await db
        .insert(equipments)
        .values({
          userId,
          kind: input.kind,
          brand: input.brand,
          model: input.model ?? null,
          btus: input.btus ?? null,
          room: input.room,
          addressId: input.addressId ?? null,
          lastMaintenanceAt: input.lastMaintenanceAt ? new Date(input.lastMaintenanceAt) : null,
          maintenanceIntervalMonths: input.maintenanceIntervalMonths,
        })
        .returning();
      if (!row) throw new Error('Falha ao criar equipamento');
      return toEquipmentDto(row);
    },

    async markMaintained(ids: string[], at: Date): Promise<void> {
      for (const id of ids) {
        await db.update(equipments).set({ lastMaintenanceAt: at }).where(eq(equipments.id, id));
      }
    },

    async deleteEquipment(userId: string, id: string): Promise<void> {
      await this.getEquipment(userId, id);
      await db.update(equipments).set({ deletedAt: adapters.clock.now() }).where(eq(equipments.id, id));
    },

    /** Equipamentos com manutenção vencida (fonte real para a home contextual). */
    async dueEquipments(userId: string, now: Date) {
      const rows = await this.listEquipments(userId);
      return rows
        .map((e) => ({ row: e, due: maintenanceDue(e.lastMaintenanceAt, e.maintenanceIntervalMonths, now) }))
        .filter((x) => x.due.due && x.row.lastMaintenanceAt !== null);
    },
  };
}

export type AssetsService = ReturnType<typeof createAssetsService>;
