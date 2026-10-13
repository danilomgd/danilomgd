import type { Address, AddressInput, UpsertRegionInput } from '@velio/contracts';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { addresses, regions } from '../../db/schema';
import { errors } from '../../lib/errors';
import type { Exec } from '../_shared/util';

export type RegionRow = typeof regions.$inferSelect;
export type AddressRow = typeof addresses.$inferSelect;

export function toAddressDto(a: AddressRow): Address {
  return {
    id: a.id,
    label: a.label,
    street: a.street,
    number: a.number,
    complement: a.complement,
    neighborhood: a.neighborhood,
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    lat: Number(a.lat),
    lng: Number(a.lng),
    instructions: a.instructions,
    isDefault: a.isDefault,
  };
}

export function toRegionDto(r: RegionRow) {
  return {
    id: r.id,
    name: r.name,
    city: r.city,
    state: r.state,
    bbox: { minLat: r.minLat, minLng: r.minLng, maxLat: r.maxLat, maxLng: r.maxLng },
    active: r.active,
    neighborhoods: r.neighborhoods,
  };
}

export function createGeoService(ctx: AppContext) {
  const { db, adapters } = ctx;

  async function listRegions(exec: Exec = db): Promise<RegionRow[]> {
    return exec.select().from(regions).where(eq(regions.active, true)).orderBy(asc(regions.name));
  }

  return {
    listRegions,

    async getRegion(id: string, exec: Exec = db): Promise<RegionRow | null> {
      const [r] = await exec.select().from(regions).where(eq(regions.id, id)).limit(1);
      return r ?? null;
    },

    /** Região ativa cujo bounding box contém o ponto; null se fora de cobertura. */
    async resolveRegion(lat: number, lng: number, exec: Exec = db): Promise<RegionRow | null> {
      const all = await listRegions(exec);
      return (
        all.find((r) => lat >= r.minLat && lat <= r.maxLat && lng >= r.minLng && lng <= r.maxLng) ?? null
      );
    },

    async listAddresses(userId: string): Promise<Address[]> {
      const rows = await db
        .select()
        .from(addresses)
        .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)))
        .orderBy(asc(addresses.createdAt));
      return rows.map(toAddressDto);
    },

    async getAddress(userId: string, id: string, exec: Exec = db): Promise<AddressRow> {
      const [a] = await exec
        .select()
        .from(addresses)
        .where(and(eq(addresses.id, id), eq(addresses.userId, userId), isNull(addresses.deletedAt)))
        .limit(1);
      if (!a) throw errors.notFound('Endereço');
      return a;
    },

    async createAddress(userId: string, input: AddressInput): Promise<Address> {
      const existing = await db
        .select({ id: addresses.id })
        .from(addresses)
        .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)));
      const isDefault = input.isDefault || existing.length === 0;
      if (isDefault) {
        await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
      }
      const [row] = await db
        .insert(addresses)
        .values({ ...input, userId, lat: String(input.lat), lng: String(input.lng), isDefault })
        .returning();
      if (!row) throw new Error('Falha ao criar endereço');
      return toAddressDto(row);
    },

    async updateAddress(userId: string, id: string, input: Partial<AddressInput>): Promise<Address> {
      await this.getAddress(userId, id);
      if (input.isDefault) {
        await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
      }
      const patch: Partial<typeof addresses.$inferInsert> = { ...input, lat: undefined, lng: undefined };
      if (input.lat !== undefined) patch.lat = String(input.lat);
      if (input.lng !== undefined) patch.lng = String(input.lng);
      const [row] = await db.update(addresses).set(patch).where(eq(addresses.id, id)).returning();
      if (!row) throw errors.notFound('Endereço');
      return toAddressDto(row);
    },

    async deleteAddress(userId: string, id: string): Promise<void> {
      await this.getAddress(userId, id);
      await db
        .update(addresses)
        .set({ deletedAt: adapters.clock.now(), isDefault: false })
        .where(eq(addresses.id, id));
    },

    admin: {
      async list() {
        const rows = await db.select().from(regions).orderBy(asc(regions.name));
        return rows.map(toRegionDto);
      },
      async upsert(input: z.infer<typeof UpsertRegionInput>) {
        const values = {
          name: input.name,
          city: input.city,
          state: input.state,
          minLat: input.bbox.minLat,
          minLng: input.bbox.minLng,
          maxLat: input.bbox.maxLat,
          maxLng: input.bbox.maxLng,
          active: input.active,
          neighborhoods: input.neighborhoods,
        };
        const [row] = input.id
          ? await db.update(regions).set(values).where(eq(regions.id, input.id)).returning()
          : await db.insert(regions).values(values).returning();
        if (!row) throw errors.notFound('Região');
        return toRegionDto(row);
      },
      async remove(id: string) {
        await db.update(regions).set({ active: false }).where(eq(regions.id, id));
      },
    },
  };
}

export type GeoService = ReturnType<typeof createGeoService>;
