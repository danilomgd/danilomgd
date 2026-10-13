import { randomInt } from 'node:crypto';
import type { AuthTokens, UpdateProfileInput, UserPublic, UserRole } from '@velio/contracts';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { devices, otpChallenges, refreshTokens, users } from '../../db/schema';
import { errors } from '../../lib/errors';
import { randomToken, sha256, signJwt } from '../../lib/jwt';
import { verifyPassword } from '../../lib/password';
import { type Exec, iso, maskPhone } from '../_shared/util';

export type UserRow = typeof users.$inferSelect;

const MAX_OTP_ATTEMPTS = 5;

export function toUserPublic(u: UserRow): UserPublic {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    roles: u.roles as UserRole[],
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt.toISOString(),
  };
}

export function createIdentityService(ctx: AppContext) {
  const { db, cfg, adapters, log } = ctx;
  /** Resolvido pelo módulo providers depois da construção (ordem de registro). */
  let providerIdResolver: (userId: string) => Promise<string | null> = async () => null;

  async function getUserRow(id: string, exec: Exec = db): Promise<UserRow | null> {
    const [u] = await exec.select().from(users).where(eq(users.id, id)).limit(1);
    return u ?? null;
  }

  function needsOnboarding(u: UserRow): boolean {
    return !u.name || !u.consents.terms?.granted || !u.consents.privacy?.granted;
  }

  async function issueTokens(u: UserRow, deviceName?: string): Promise<AuthTokens> {
    const now = adapters.clock.now();
    const providerId = u.roles.includes('provider') ? await providerIdResolver(u.id) : null;
    const claims: Record<string, unknown> = { sub: u.id, roles: u.roles };
    if (providerId) claims.providerId = providerId;
    const accessToken = signJwt(claims, cfg.JWT_SECRET, cfg.JWT_ACCESS_TTL_SECONDS, now.getTime());
    const refreshToken = randomToken();
    await db.insert(refreshTokens).values({
      userId: u.id,
      tokenHash: sha256(refreshToken),
      deviceName: deviceName ?? null,
      expiresAt: new Date(now.getTime() + cfg.JWT_REFRESH_TTL_SECONDS * 1000),
    });
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, u.id));
    return {
      accessToken,
      refreshToken,
      expiresInSeconds: cfg.JWT_ACCESS_TTL_SECONDS,
      user: toUserPublic(u),
      needsOnboarding: needsOnboarding(u),
    };
  }

  return {
    setProviderIdResolver(fn: (userId: string) => Promise<string | null>) {
      providerIdResolver = fn;
    },

    async requestOtp(phone: string, app: 'customer' | 'provider') {
      const now = adapters.clock.now();
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const [ch] = await db
        .insert(otpChallenges)
        .values({
          phone,
          app,
          codeHash: sha256(code),
          expiresAt: new Date(now.getTime() + cfg.OTP_TTL_SECONDS * 1000),
        })
        .returning({ id: otpChallenges.id });
      if (!ch) throw new Error('Falha ao criar desafio OTP');
      await adapters.sms.send(
        phone,
        `Seu código VÉLIO é ${code}. Válido por ${Math.round(cfg.OTP_TTL_SECONDS / 60)} min.`,
      );
      log.info({ phone: maskPhone(phone), app }, 'otp solicitado');
      return {
        challengeId: ch.id,
        expiresInSeconds: cfg.OTP_TTL_SECONDS,
        ...(cfg.NODE_ENV === 'test' ? { devCode: code } : {}),
      };
    },

    async verifyOtp(challengeId: string, code: string, deviceName?: string): Promise<AuthTokens> {
      const now = adapters.clock.now();
      const [ch] = await db.select().from(otpChallenges).where(eq(otpChallenges.id, challengeId)).limit(1);
      if (!ch) throw errors.notFound('Desafio');
      if (ch.consumedAt) throw errors.badRequest('Código já utilizado');
      if (ch.expiresAt.getTime() <= now.getTime()) throw errors.badRequest('Código expirado');
      if (ch.attempts >= MAX_OTP_ATTEMPTS) throw errors.tooMany('Número máximo de tentativas excedido');
      if (ch.codeHash !== sha256(code)) {
        await db
          .update(otpChallenges)
          .set({ attempts: sql`${otpChallenges.attempts} + 1` })
          .where(eq(otpChallenges.id, ch.id));
        throw errors.badRequest('Código inválido', { attemptsLeft: MAX_OTP_ATTEMPTS - ch.attempts - 1 });
      }
      await db.update(otpChallenges).set({ consumedAt: now }).where(eq(otpChallenges.id, ch.id));
      let [u] = await db.select().from(users).where(eq(users.phone, ch.phone)).limit(1);
      if (!u) {
        const role: UserRole = ch.app === 'provider' ? 'provider' : 'customer';
        [u] = await db
          .insert(users)
          .values({ phone: ch.phone, roles: role === 'provider' ? ['customer', 'provider'] : ['customer'] })
          .returning();
      }
      if (!u) throw new Error('Falha ao criar usuário');
      if (u.status !== 'ACTIVE') throw errors.forbidden('Conta desativada');
      return issueTokens(u, deviceName);
    },

    async passwordLogin(email: string, password: string): Promise<AuthTokens> {
      const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
      if (!u?.passwordHash || !(await verifyPassword(password, u.passwordHash))) {
        throw errors.unauthorized('Credenciais inválidas');
      }
      if (!u.roles.includes('operator') && !u.roles.includes('admin')) {
        throw errors.forbidden('Login com senha disponível apenas para operação');
      }
      return issueTokens(u, 'web');
    },

    /** Refresh rotativo: o token antigo é revogado e aponta para o novo. */
    async refresh(refreshToken: string): Promise<AuthTokens> {
      const now = adapters.clock.now();
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, sha256(refreshToken)))
        .limit(1);
      if (!row || row.revokedAt || row.expiresAt.getTime() <= now.getTime()) {
        throw errors.unauthorized('Sessão expirada');
      }
      const u = await getUserRow(row.userId);
      if (u?.status !== 'ACTIVE') throw errors.unauthorized('Sessão inválida');
      const tokens = await issueTokens(u, row.deviceName ?? undefined);
      const [fresh] = await db
        .select({ id: refreshTokens.id })
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, sha256(tokens.refreshToken)))
        .limit(1);
      await db
        .update(refreshTokens)
        .set({ revokedAt: now, replacedById: fresh?.id ?? null })
        .where(eq(refreshTokens.id, row.id));
      return tokens;
    },

    async logout(userId: string, refreshToken?: string): Promise<void> {
      const now = adapters.clock.now();
      const where = refreshToken
        ? and(eq(refreshTokens.userId, userId), eq(refreshTokens.tokenHash, sha256(refreshToken)))
        : and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt));
      await db.update(refreshTokens).set({ revokedAt: now }).where(where);
    },

    async getUser(id: string): Promise<UserPublic> {
      const u = await getUserRow(id);
      if (!u) throw errors.notFound('Usuário');
      return toUserPublic(u);
    },

    getUserRow,

    async getUsersByIds(ids: string[], exec: Exec = db): Promise<UserRow[]> {
      if (ids.length === 0) return [];
      return exec.select().from(users).where(inArray(users.id, ids));
    },

    async updateProfile(id: string, input: UpdateProfileInput): Promise<UserPublic> {
      const u = await getUserRow(id);
      if (!u) throw errors.notFound('Usuário');
      const now = adapters.clock.now().toISOString();
      const consents = { ...u.consents };
      if (input.consents) {
        for (const [k, granted] of Object.entries(input.consents)) {
          if (typeof granted === 'boolean') consents[k] = { granted, at: now };
        }
      }
      if (input.email) {
        const [dup] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email.toLowerCase()))
          .limit(1);
        if (dup && dup.id !== id) throw errors.conflict('E-mail já utilizado');
      }
      const [updated] = await db
        .update(users)
        .set({
          name: input.name ?? u.name,
          email: input.email ? input.email.toLowerCase() : u.email,
          timezone: input.timezone ?? u.timezone,
          consents,
        })
        .where(eq(users.id, id))
        .returning();
      if (!updated) throw errors.notFound('Usuário');
      return toUserPublic(updated);
    },

    async registerDevice(userId: string, input: { pushToken: string; platform: string }, app = 'customer') {
      const now = adapters.clock.now();
      await db
        .insert(devices)
        .values({ userId, pushToken: input.pushToken, platform: input.platform, app, lastSeenAt: now })
        .onConflictDoUpdate({
          target: devices.pushToken,
          set: { userId, platform: input.platform, app, active: true, lastSeenAt: now },
        });
    },

    async listPushTokens(userId: string): Promise<string[]> {
      const rows = await db
        .select({ token: devices.pushToken })
        .from(devices)
        .where(and(eq(devices.userId, userId), eq(devices.active, true)));
      return rows.map((r) => r.token);
    },

    async addRole(userId: string, role: UserRole, exec: Exec = db): Promise<void> {
      const u = await getUserRow(userId, exec);
      if (!u) throw errors.notFound('Usuário');
      if (u.roles.includes(role)) return;
      await exec
        .update(users)
        .set({ roles: [...u.roles, role] })
        .where(eq(users.id, userId));
    },

    async setRoles(userId: string, roles: UserRole[]): Promise<UserPublic> {
      const [u] = await db.update(users).set({ roles }).where(eq(users.id, userId)).returning();
      if (!u) throw errors.notFound('Usuário');
      return toUserPublic(u);
    },

    async listUsers(limit = 100) {
      const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(limit);
      return rows.map((u) => ({
        ...toUserPublic(u),
        status: u.status,
        timezone: u.timezone,
        lastSeenAt: iso(u.lastSeenAt),
      }));
    },
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
