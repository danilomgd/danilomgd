import type {
  ApproveProviderInput,
  LocationPing,
  ProviderAvailability,
  ProviderMe,
  ProviderOnboardingInput,
  ProviderPublic,
  SetScheduleInput,
} from '@velio/contracts';
import { rooms } from '@velio/contracts';
import { acceptPing, estimateEtaMinutes, haversineKm, type MatchCandidate } from '@velio/domain';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import {
  providerDocuments,
  providerLocations,
  providerSchedules,
  providerSkills,
  providers,
} from '../../db/schema';
import { errors } from '../../lib/errors';
import { sha256 } from '../../lib/jwt';
import { type Exec, iso } from '../_shared/util';
import type { PlatformService } from '../admin/platform';
import type { CatalogService } from '../catalog/service';
import type { IdentityService } from '../identity/service';
import type { WalletService } from '../wallet/service';

export type ProviderRow = typeof providers.$inferSelect;

export interface ProviderSources {
  /** Ordem ativa do prestador em estado com localização ao vivo (para retransmitir pings). */
  activeLiveOrder(providerId: string): Promise<{ id: string; lat: number | null; lng: number | null } | null>;
  /** Prestadores com reserva sobreposta à janela (conflito de agenda). */
  providersWithBookingConflict(providerIds: string[], startsAt: Date, endsAt: Date): Promise<Set<string>>;
  /** Prestadores que já atenderam o cliente com boa avaliação. */
  providersWhoServedCustomer(providerIds: string[], customerId: string): Promise<Set<string>>;
}

export function maskDocument(doc: string): string {
  return doc.length === 11
    ? `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**`
    : `**.${doc.slice(2, 5)}.${doc.slice(5, 8)}/****-**`;
}

export function createProvidersService(
  ctx: AppContext,
  deps: {
    identity: IdentityService;
    catalog: CatalogService;
    wallet: WalletService;
    platform: PlatformService;
  },
) {
  const { db, adapters, outbox, log } = ctx;
  let sources: ProviderSources | null = null;

  async function getById(id: string, exec: Exec = db): Promise<ProviderRow> {
    const [p] = await exec.select().from(providers).where(eq(providers.id, id)).limit(1);
    if (!p) throw errors.notFound('Prestador');
    return p;
  }

  async function findByUserId(userId: string, exec: Exec = db): Promise<ProviderRow | null> {
    const [p] = await exec.select().from(providers).where(eq(providers.userId, userId)).limit(1);
    return p ?? null;
  }

  async function skillsOf(providerId: string) {
    return db.select().from(providerSkills).where(eq(providerSkills.providerId, providerId));
  }

  async function toMe(p: ProviderRow): Promise<ProviderMe> {
    const skills = await skillsOf(p.id);
    const docs = await db
      .select()
      .from(providerDocuments)
      .where(eq(providerDocuments.providerId, p.id))
      .orderBy(asc(providerDocuments.createdAt));
    return {
      id: p.id,
      userId: p.userId,
      displayName: p.displayName,
      status: p.status as ProviderMe['status'],
      availability: p.availability as ProviderAvailability,
      serviceRadiusKm: p.serviceRadiusKm,
      categoryIds: skills.map((s) => s.categoryId),
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      completedCount: p.completedCount,
      acceptanceRate: p.acceptanceRate,
      cancellationRate: p.cancellationRate,
      avgResponseSeconds: p.avgResponseSeconds,
      documents: docs.map((d) => ({
        kind: d.kind,
        status: d.status as 'PENDING' | 'VERIFIED' | 'REJECTED',
        rejectedReason: d.rejectedReason,
      })),
      walletBalanceCents: await deps.wallet.balance('PROVIDER', p.id),
    };
  }

  async function toPublic(p: ProviderRow): Promise<ProviderPublic> {
    const skills = await skillsOf(p.id);
    const cats = await deps.catalog.listCategories(db, false);
    const user = await deps.identity.getUserRow(p.userId);
    return {
      id: p.id,
      displayName: p.displayName,
      avatarUrl: user?.avatarUrl ?? null,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      completedCount: p.completedCount,
      verified: p.verifiedAt !== null,
      specialties: skills.map((s) => cats.find((c) => c.id === s.categoryId)?.name ?? '').filter(Boolean),
    };
  }

  async function setAvailabilityInternal(
    providerId: string,
    availability: ProviderAvailability,
    exec: Exec = db,
  ) {
    await exec.update(providers).set({ availability }).where(eq(providers.id, providerId));
  }

  return {
    bindSources(s: ProviderSources) {
      sources = s;
    },
    getById,
    findByUserId,
    toPublic,
    toMe,
    setAvailabilityInternal,

    async providerIdForUser(userId: string): Promise<string | null> {
      return (await findByUserId(userId))?.id ?? null;
    },

    async userIdOf(providerId: string): Promise<string | null> {
      const [p] = await db
        .select({ userId: providers.userId })
        .from(providers)
        .where(eq(providers.id, providerId))
        .limit(1);
      return p?.userId ?? null;
    },

    async onboard(userId: string, input: ProviderOnboardingInput): Promise<ProviderMe> {
      if (await findByUserId(userId)) throw errors.conflict('Cadastro de prestador já existe');
      const documentHash = sha256(input.documentNumber);
      const [dup] = await db
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.documentHash, documentHash))
        .limit(1);
      if (dup) throw errors.conflict('Documento já cadastrado');
      for (const cid of input.categoryIds) await deps.catalog.getCategory(cid);
      const [p] = await db
        .insert(providers)
        .values({
          userId,
          displayName: input.displayName,
          legalName: input.legalName,
          documentHash,
          documentMasked: maskDocument(input.documentNumber),
          bio: input.bio ?? null,
          baseLat: input.baseAddress.lat,
          baseLng: input.baseAddress.lng,
          baseCity: input.baseAddress.city,
          baseState: input.baseAddress.state,
          serviceRadiusKm: input.serviceRadiusKm,
          lastLat: input.baseAddress.lat,
          lastLng: input.baseAddress.lng,
        })
        .returning();
      if (!p) throw new Error('Falha ao criar prestador');
      for (const cid of input.categoryIds) {
        await db
          .insert(providerSkills)
          .values({ providerId: p.id, categoryId: cid, level: 0.5 })
          .onConflictDoNothing();
      }
      await deps.identity.addRole(userId, 'provider');
      log.info({ providerId: p.id }, 'prestador cadastrado (PENDING)');
      return toMe(p);
    },

    async addDocument(providerId: string, input: { kind: string; fileUrl: string }) {
      await getById(providerId);
      await db.insert(providerDocuments).values({ providerId, kind: input.kind, fileUrl: input.fileUrl });
    },

    async setAvailability(
      providerId: string,
      input: { availability: ProviderAvailability; location?: { lat: number; lng: number } },
    ): Promise<ProviderMe> {
      const p = await getById(providerId);
      if (input.availability === 'ONLINE' && p.status !== 'APPROVED') {
        throw errors.forbidden('Somente prestadores aprovados podem ficar online');
      }
      const now = adapters.clock.now();
      const patch: Partial<typeof providers.$inferInsert> = { availability: input.availability };
      if (input.location) {
        patch.lastLat = input.location.lat;
        patch.lastLng = input.location.lng;
        patch.lastLocationAt = now;
      }
      const [updated] = await db.update(providers).set(patch).where(eq(providers.id, providerId)).returning();
      if (!updated) throw errors.notFound('Prestador');
      return toMe(updated);
    },

    /** Marca ocupado ao assumir uma ordem; volta a ONLINE quando liberado (só se estava BUSY). */
    async setBusy(providerId: string) {
      const p = await getById(providerId);
      if (p.availability === 'ONLINE') await setAvailabilityInternal(providerId, 'BUSY');
    },
    async setOnline(providerId: string) {
      const p = await getById(providerId);
      if (p.availability === 'BUSY') await setAvailabilityInternal(providerId, 'ONLINE');
    },

    /**
     * Lote de pings de GPS: aplica a política de aceitação do domínio, grava histórico, atualiza a
     * última posição e retransmite para a sala da ordem ativa com ETA.
     */
    async ingestLocation(
      providerId: string,
      pings: LocationPing[],
    ): Promise<{ accepted: number; rejected: number }> {
      const p = await getById(providerId);
      if (p.availability === 'OFFLINE' || p.availability === 'UNAVAILABLE')
        return { accepted: 0, rejected: pings.length };
      const settings = await deps.platform.getSettings();
      const active = sources ? await sources.activeLiveOrder(providerId) : null;
      let previous =
        p.lastLat !== null && p.lastLng !== null && p.lastLocationAt
          ? { lat: p.lastLat, lng: p.lastLng, recordedAt: p.lastLocationAt }
          : null;
      let accepted = 0;
      const sorted = [...pings].sort(
        (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
      );
      for (const ping of sorted) {
        const current = { lat: ping.lat, lng: ping.lng, recordedAt: new Date(ping.recordedAt) };
        const verdict = acceptPing({
          accuracyM: ping.accuracyM ?? null,
          previous,
          current,
          maxAccuracyM: settings.location.maxAccuracyM,
        });
        if (!verdict.accept) continue;
        await db.insert(providerLocations).values({
          providerId,
          orderId: active?.id ?? null,
          lat: ping.lat,
          lng: ping.lng,
          accuracyM: ping.accuracyM ?? null,
          headingDeg: ping.headingDeg ?? null,
          speedMps: ping.speedMps ?? null,
          recordedAt: current.recordedAt,
        });
        previous = current;
        accepted++;
        if (active) {
          const distanceKm =
            active.lat !== null && active.lng !== null
              ? haversineKm(current, { lat: active.lat, lng: active.lng })
              : null;
          await outbox.publish(db, {
            type: 'provider.location',
            aggregateType: 'order',
            aggregateId: active.id,
            payload: {
              orderId: active.id,
              lat: ping.lat,
              lng: ping.lng,
              headingDeg: ping.headingDeg ?? null,
              etaMinutes: distanceKm === null ? null : estimateEtaMinutes(distanceKm),
              recordedAt: current.recordedAt.toISOString(),
            },
          });
        }
      }
      if (previous && accepted > 0) {
        await db
          .update(providers)
          .set({ lastLat: previous.lat, lastLng: previous.lng, lastLocationAt: previous.recordedAt })
          .where(eq(providers.id, providerId));
      }
      return { accepted, rejected: pings.length - accepted };
    },

    async setSchedule(providerId: string, input: z.infer<typeof SetScheduleInput>) {
      await db.delete(providerSchedules).where(eq(providerSchedules.providerId, providerId));
      for (const w of input.windows) {
        if (w.endMinute <= w.startMinute) throw errors.badRequest('Janela inválida');
        await db.insert(providerSchedules).values({ providerId, ...w });
      }
      return this.getSchedule(providerId);
    },

    async getSchedule(providerId: string) {
      const rows = await db
        .select()
        .from(providerSchedules)
        .where(eq(providerSchedules.providerId, providerId))
        .orderBy(asc(providerSchedules.weekday), asc(providerSchedules.startMinute));
      return {
        windows: rows.map((r) => ({
          weekday: r.weekday,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
        })),
      };
    },

    /**
     * Candidatos ao matching: APROVADOS, com skill na categoria, dentro do bounding box, ONLINE/BUSY.
     * Devolve `MatchCandidate` já com conflito de agenda e histórico com o cliente.
     */
    async findCandidates(input: {
      categoryId: string;
      bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
      customerId: string;
      window: { startsAt: Date; endsAt: Date } | null;
      excludeProviderIds?: string[];
    }): Promise<MatchCandidate[]> {
      const rows = await db
        .select({ p: providers, level: providerSkills.level })
        .from(providers)
        .innerJoin(
          providerSkills,
          and(
            eq(providerSkills.providerId, sql`${providers.id}::text`),
            eq(providerSkills.categoryId, input.categoryId),
          ),
        )
        .where(
          and(
            eq(providers.status, 'APPROVED'),
            inArray(providers.availability, ['ONLINE', 'BUSY']),
            gte(providers.lastLat, input.bbox.minLat),
            lte(providers.lastLat, input.bbox.maxLat),
            gte(providers.lastLng, input.bbox.minLng),
            lte(providers.lastLng, input.bbox.maxLng),
          ),
        );
      const excluded = new Set(input.excludeProviderIds ?? []);
      const filtered = rows.filter(
        (r) => !excluded.has(r.p.id) && r.p.lastLat !== null && r.p.lastLng !== null,
      );
      const ids = filtered.map((r) => r.p.id);
      const conflicts =
        input.window && sources
          ? await sources.providersWithBookingConflict(ids, input.window.startsAt, input.window.endsAt)
          : new Set<string>();
      const served = sources
        ? await sources.providersWhoServedCustomer(ids, input.customerId)
        : new Set<string>();
      const now = adapters.clock.now();
      return filtered.map(({ p, level }) => ({
        providerId: p.id,
        location: { lat: p.lastLat ?? 0, lng: p.lastLng ?? 0 },
        availability: p.availability as MatchCandidate['availability'],
        serviceRadiusKm: p.serviceRadiusKm,
        qualification: level,
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        acceptanceRate: p.acceptanceRate,
        cancellationRate: p.cancellationRate,
        avgResponseSeconds: p.avgResponseSeconds,
        hasScheduleConflict: conflicts.has(p.id),
        servedCustomerBefore: served.has(p.id),
        minutesSinceLastOrder: p.lastOrderCompletedAt
          ? Math.round((now.getTime() - p.lastOrderCompletedAt.getTime()) / 60000)
          : null,
      }));
    },

    async updateStats(
      providerId: string,
      stats: Partial<
        Pick<
          ProviderRow,
          | 'ratingAvg'
          | 'ratingCount'
          | 'completedCount'
          | 'acceptanceRate'
          | 'cancellationRate'
          | 'avgResponseSeconds'
          | 'lastOrderCompletedAt'
        >
      >,
    ) {
      await db.update(providers).set(stats).where(eq(providers.id, providerId));
    },

    async listOnline() {
      return db
        .select()
        .from(providers)
        .where(and(eq(providers.status, 'APPROVED'), inArray(providers.availability, ['ONLINE', 'BUSY'])));
    },

    async listAll(limit = 200) {
      const rows = await db.select().from(providers).orderBy(desc(providers.createdAt)).limit(limit);
      return Promise.all(rows.map(toMe));
    },

    /** Decisão administrativa: aprovar exige ao menos um documento, que passa a VERIFIED. */
    async decide(
      providerId: string,
      input: z.infer<typeof ApproveProviderInput>,
      byUserId: string,
    ): Promise<ProviderMe> {
      const p = await getById(providerId);
      const now = adapters.clock.now();
      const docs = await db
        .select()
        .from(providerDocuments)
        .where(eq(providerDocuments.providerId, providerId));
      let status = p.status;
      let verifiedAt = p.verifiedAt;
      switch (input.decision) {
        case 'APPROVE':
          if (docs.length === 0) throw errors.unprocessable('Aprovação exige ao menos um documento enviado');
          await db
            .update(providerDocuments)
            .set({ status: 'VERIFIED', reviewedByUserId: byUserId, reviewedAt: now })
            .where(
              and(eq(providerDocuments.providerId, providerId), eq(providerDocuments.status, 'PENDING')),
            );
          status = 'APPROVED';
          verifiedAt = now;
          break;
        case 'REJECT':
          await db
            .update(providerDocuments)
            .set({
              status: 'REJECTED',
              rejectedReason: input.reason ?? 'Documentação recusada',
              reviewedByUserId: byUserId,
              reviewedAt: now,
            })
            .where(
              and(eq(providerDocuments.providerId, providerId), eq(providerDocuments.status, 'PENDING')),
            );
          status = 'PENDING';
          break;
        case 'SUSPEND':
          status = 'SUSPENDED';
          break;
        case 'BLOCK':
          status = 'BLOCKED';
          break;
      }
      const availability = status === 'APPROVED' ? p.availability : 'OFFLINE';
      const [updated] = await db
        .update(providers)
        .set({ status, verifiedAt, availability, statusReason: input.reason ?? null })
        .where(eq(providers.id, providerId))
        .returning();
      if (!updated) throw errors.notFound('Prestador');
      return toMe(updated);
    },

    registerRealtime() {
      outbox.on('provider.location', async (ev) => {
        const p = ev.payload as { orderId: string };
        ctx.io?.to(rooms.order(p.orderId)).emit('provider.location', ev.payload);
      });
    },

    lastLocationOf(p: ProviderRow) {
      return p.lastLat !== null && p.lastLng !== null
        ? { lat: p.lastLat, lng: p.lastLng, at: iso(p.lastLocationAt) }
        : null;
    },
  };
}

export type ProvidersService = ReturnType<typeof createProvidersService>;
