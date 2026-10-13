import { PlatformSettings } from '@velio/contracts';
import { desc, eq } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { auditLogs, platformSettings } from '../../db/schema';

/**
 * Configurações da plataforma e trilha de auditoria. Pertence ao módulo admin, mas é construído
 * primeiro porque quase todos os módulos leem settings.
 */
export function createPlatformService(ctx: AppContext) {
  const { db } = ctx;
  let cache: { at: number; value: PlatformSettings } | null = null;

  async function getSettings(): Promise<PlatformSettings> {
    const now = Date.now();
    if (cache && now - cache.at < 2000) return cache.value;
    const rows = await db.select().from(platformSettings);
    const raw: Record<string, unknown> = {};
    for (const r of rows) raw[r.key] = r.value;
    const parsed = PlatformSettings.safeParse({
      cancellation: raw.cancellation ?? {},
      offers: raw.offers ?? {},
      quotes: raw.quotes ?? {},
      payouts: raw.payouts ?? {},
      concierge: raw.concierge ?? {},
      location: raw.location ?? {},
      reviews: raw.reviews ?? {},
    });
    const value = parsed.success
      ? parsed.data
      : PlatformSettings.parse({ cancellation: {}, offers: {}, quotes: {}, payouts: {}, concierge: {}, location: {}, reviews: {} });
    cache = { at: now, value };
    return value;
  }

  return {
    getSettings,

    async updateSettings(input: PlatformSettings, byUserId: string): Promise<PlatformSettings> {
      const now = ctx.adapters.clock.now();
      for (const [key, value] of Object.entries(input)) {
        await db
          .insert(platformSettings)
          .values({ key, value, updatedByUserId: byUserId, updatedAt: now })
          .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedByUserId: byUserId, updatedAt: now } });
      }
      cache = null;
      return getSettings();
    },

    async audit(entry: {
      actorUserId: string | null;
      actorRole: string | null;
      action: string;
      targetType?: string;
      targetId?: string | null;
      before?: unknown;
      after?: unknown;
      ip?: string | null;
    }) {
      await db.insert(auditLogs).values({
        actorUserId: entry.actorUserId,
        actorRole: entry.actorRole,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        ip: entry.ip ?? null,
      });
    },

    async listAudit(limit = 100) {
      return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
    },

    async listAuditFor(targetType: string, targetId: string) {
      return db.select().from(auditLogs).where(eq(auditLogs.targetId, targetId)).orderBy(desc(auditLogs.createdAt));
    },
  };
}

export type PlatformService = ReturnType<typeof createPlatformService>;
