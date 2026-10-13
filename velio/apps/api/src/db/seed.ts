import { eq } from 'drizzle-orm';
import { hashPassword } from '../lib/password';
import { createDb, type Db } from './client';
import * as s from './schema';
import {
  seedCategories,
  seedCoupons,
  seedHomeSections,
  seedMatchingWeights,
  seedPlans,
  seedRegions,
  seedSettings,
  seedWaves,
} from './seed-data';

/** Idempotente: usa slugs/chaves como identidade. Pode rodar em todo deploy. */
export async function seed(
  db: Db,
  opts: { adminEmail?: string; adminPassword?: string } = {},
): Promise<{ categories: number; services: number; plans: number }> {
  let categories = 0;
  let services = 0;
  const serviceIdBySlug = new Map<string, string>();

  for (const r of seedRegions) {
    const existing = await db
      .select({ id: s.regions.id })
      .from(s.regions)
      .where(eq(s.regions.name, r.name))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(s.regions).values({
        name: r.name,
        city: r.city,
        state: r.state,
        minLat: r.bbox.minLat,
        minLng: r.bbox.minLng,
        maxLat: r.bbox.maxLat,
        maxLng: r.bbox.maxLng,
        neighborhoods: r.neighborhoods,
      });
    }
  }

  for (const c of seedCategories) {
    const [cat] = await db
      .insert(s.serviceCategories)
      .values({
        slug: c.slug,
        name: c.name,
        icon: c.icon,
        description: c.description,
        sortOrder: c.sortOrder,
        config: c.config ?? {},
      })
      .onConflictDoUpdate({
        target: s.serviceCategories.slug,
        set: {
          name: c.name,
          icon: c.icon,
          description: c.description,
          sortOrder: c.sortOrder,
          config: c.config ?? {},
        },
      })
      .returning({ id: s.serviceCategories.id });
    if (!cat) continue;
    categories++;
    for (const [i, sv] of c.services.entries()) {
      const values = {
        categoryId: cat.id,
        slug: sv.slug,
        name: sv.name,
        shortDescription: sv.short,
        workflowKind: sv.workflowKind,
        pricingModel: sv.pricingModel,
        basePriceCents: sv.basePriceCents ?? null,
        priceMinCents: sv.priceMinCents ?? null,
        priceMaxCents: sv.priceMaxCents ?? null,
        hourlyRateCents: sv.hourlyRateCents ?? null,
        estimatedDurationMinutes: sv.durationMin ?? null,
        allowsImmediate: sv.allowsImmediate ?? sv.workflowKind !== 'SCHEDULED',
        allowsScheduling: sv.allowsScheduling ?? true,
        requiresVehicle: sv.requiresVehicle ?? false,
        requiresEquipment: sv.requiresEquipment ?? false,
        options: (sv.options ?? []) as never,
        sortOrder: i,
        searchText: `${sv.name} ${sv.short} ${c.name}`.toLowerCase(),
      };
      const [row] = await db
        .insert(s.services)
        .values(values)
        .onConflictDoUpdate({ target: s.services.slug, set: values })
        .returning({ id: s.services.id });
      if (row) {
        services++;
        serviceIdBySlug.set(sv.slug, row.id);
      }
    }
  }

  let plans = 0;
  for (const [i, p] of seedPlans.entries()) {
    const serviceId = serviceIdBySlug.get(p.serviceSlug);
    if (!serviceId) continue;
    const values = {
      slug: p.slug,
      name: p.name,
      description: p.description,
      serviceId,
      intervalMonths: p.intervalMonths,
      visitsPerCycle: p.visitsPerCycle,
      priceCents: p.priceCents,
      benefits: p.benefits,
      sortOrder: i,
    };
    await db
      .insert(s.subscriptionPlans)
      .values(values)
      .onConflictDoUpdate({ target: s.subscriptionPlans.slug, set: values });
    plans++;
  }

  const existingGlobal = await db.select({ id: s.matchingConfigs.id }).from(s.matchingConfigs).limit(1);
  if (existingGlobal.length === 0) {
    await db
      .insert(s.matchingConfigs)
      .values({ categoryId: null, weights: seedMatchingWeights, waves: seedWaves });
  }
  const existingCommission = await db.select({ id: s.commissionRules.id }).from(s.commissionRules).limit(1);
  if (existingCommission.length === 0) {
    await db
      .insert(s.commissionRules)
      .values({ categoryId: null, regionId: null, percentBps: 2000, fixedCents: 0, minCents: 500 });
  }

  for (const h of seedHomeSections) {
    const values = {
      id: h.id,
      kind: h.kind,
      title: h.title ?? null,
      subtitle: (h as { subtitle?: string }).subtitle ?? null,
      sortOrder: h.sortOrder,
      rules: (h as { rules?: Record<string, unknown> }).rules ?? {},
      config: (h as { config?: Record<string, unknown> }).config ?? {},
    };
    await db
      .insert(s.homeSections)
      .values(values)
      .onConflictDoUpdate({ target: s.homeSections.id, set: values });
  }

  for (const [key, value] of Object.entries(seedSettings)) {
    await db.insert(s.platformSettings).values({ key, value }).onConflictDoNothing();
  }

  for (const c of seedCoupons) {
    await db
      .insert(s.coupons)
      .values({
        code: c.code,
        kind: c.kind,
        value: c.value,
        maxDiscountCents: c.maxDiscountCents ?? null,
        perUserLimit: c.perUserLimit ?? null,
      })
      .onConflictDoNothing();
  }

  if (opts.adminEmail && opts.adminPassword) {
    const existing = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(eq(s.users.email, opts.adminEmail))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(s.users).values({
        email: opts.adminEmail,
        passwordHash: await hashPassword(opts.adminPassword),
        name: 'Administrador',
        roles: ['admin', 'operator'],
      });
    }
  }

  return { categories, services, plans };
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const handle = await createDb();
  await handle.migrate();
  const r = await seed(handle.db, {
    adminEmail: process.env.SEED_ADMIN_EMAIL,
    adminPassword: process.env.SEED_ADMIN_PASSWORD,
  });
  console.log(`seed ok (${handle.driver}):`, r);
  await handle.close();
}
