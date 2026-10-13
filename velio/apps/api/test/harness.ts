import type { AuthTokens } from '@velio/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import { FakeClock, MemoryPushSender, SandboxGateway } from '../src/adapters/sandbox';
import { type App, buildApp } from '../src/app';
import { createDb } from '../src/db/client';
import * as schema from '../src/db/schema';
import { seed } from '../src/db/seed';

export const ADMIN_EMAIL = 'admin@velio.test';
export const ADMIN_PASSWORD = 'admin-senha-12345';
/** Terça-feira, 09:00 em São Paulo (12:00 UTC). */
export const DEFAULT_NOW = new Date('2026-10-13T12:00:00.000Z');
/** Pinheiros, São Paulo. */
export const SP = { lat: -23.5614, lng: -46.6823 };

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

export interface Api {
  get<T = unknown>(url: string, query?: Record<string, string | number | boolean | undefined>): Promise<ApiResponse<T>>;
  post<T = unknown>(url: string, body?: unknown): Promise<ApiResponse<T>>;
  put<T = unknown>(url: string, body?: unknown): Promise<ApiResponse<T>>;
  patch<T = unknown>(url: string, body?: unknown): Promise<ApiResponse<T>>;
  delete<T = unknown>(url: string): Promise<ApiResponse<T>>;
}

export interface Customer {
  token: string;
  refreshToken: string;
  userId: string;
  phone: string;
  addressId: string;
  paymentMethodId: string;
  api: Api;
}

export interface Provider extends Customer {
  providerId: string;
}

function makeApi(fastify: FastifyInstance, token: string | null): Api {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const call = async <T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>): Promise<ApiResponse<T>> => {
    const q = query ? Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])) : undefined;
    const res = await fastify.inject({ method, url, headers, payload: body === undefined ? undefined : (body as Record<string, unknown>), query: q });
    let parsed: unknown = null;
    if (res.body) {
      try {
        parsed = JSON.parse(res.body);
      } catch {
        parsed = res.body;
      }
    }
    return { status: res.statusCode, body: parsed as T };
  };
  return {
    get: (url, query) => call('GET', url, undefined, query),
    post: (url, body) => call('POST', url, body ?? {}),
    put: (url, body) => call('PUT', url, body ?? {}),
    patch: (url, body) => call('PATCH', url, body ?? {}),
    delete: (url) => call('DELETE', url),
  };
}

export async function createTestApp(opts: { now?: Date } = {}) {
  const clock = new FakeClock(opts.now ?? DEFAULT_NOW);
  const dbHandle = await createDb({ url: null, nodeEnv: 'test' });
  await dbHandle.migrate();
  await seed(dbHandle.db, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD });
  const app: App = await buildApp({
    dbHandle,
    background: false,
    realtime: false,
    adapters: { clock },
    config: { JWT_ACCESS_TTL_SECONDS: 3650 * 86_400, LOG_LEVEL: 'silent', RATE_LIMIT_MAX: 100_000 },
  });
  await app.fastify.ready();
  const { fastify, ctx } = app;
  const db = ctx.db;
  const gateway = ctx.adapters.payments as SandboxGateway;
  const push = ctx.adapters.push as MemoryPushSender;
  const anon = makeApi(fastify, null);

  const api = (token: string) => makeApi(fastify, token);

  /** Esvazia outbox e scheduler até estabilizar (handlers podem enfileirar novos jobs/eventos). */
  async function drain(maxRounds = 25) {
    for (let i = 0; i < maxRounds; i++) {
      const events = await ctx.outbox.drain();
      const jobs = await ctx.scheduler.runDue(clock.now());
      if (events === 0 && jobs === 0) return;
    }
  }

  async function advance(ms: number) {
    clock.advance(ms);
    await drain();
  }

  /** Avança em passos para que jobs intermediários rodem na ordem (lembretes, timeouts). */
  async function advanceTo(target: Date, stepMs = 60 * 60_000) {
    while (clock.now().getTime() < target.getTime()) {
      const next = Math.min(target.getTime(), clock.now().getTime() + stepMs);
      clock.set(new Date(next));
      await drain();
    }
  }

  async function otpLogin(phone: string, app: 'customer' | 'provider'): Promise<AuthTokens> {
    const req = await anon.post<{ challengeId: string; devCode?: string }>('/v1/auth/otp/request', { phone, app });
    expect(req.status, JSON.stringify(req.body)).toBe(200);
    const ver = await anon.post<AuthTokens>('/v1/auth/otp/verify', { challengeId: req.body.challengeId, code: req.body.devCode, deviceName: 'teste' });
    expect(ver.status, JSON.stringify(ver.body)).toBe(200);
    return ver.body;
  }

  async function asCustomer(phone: string, opts: { name?: string; cardToken?: string | null; lat?: number; lng?: number; pushToken?: string } = {}): Promise<Customer> {
    const tokens = await otpLogin(phone, 'customer');
    const a = api(tokens.accessToken);
    const prof = await a.patch('/v1/me', { name: opts.name ?? 'Cliente Teste', consents: { terms: true, privacy: true } });
    expect(prof.status).toBe(200);
    if (opts.pushToken !== undefined) await a.post('/v1/me/devices', { pushToken: opts.pushToken, platform: 'android' });
    const addr = await a.post<{ id: string }>('/v1/me/addresses', {
      label: 'Casa',
      street: 'Rua dos Pinheiros',
      number: '100',
      neighborhood: 'Pinheiros',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '05422-001',
      lat: opts.lat ?? SP.lat,
      lng: opts.lng ?? SP.lng,
      isDefault: true,
    });
    expect(addr.status, JSON.stringify(addr.body)).toBe(201);
    let paymentMethodId = '';
    if (opts.cardToken !== null) {
      const pm = await a.post<{ id: string }>('/v1/me/payment-methods', { kind: 'CARD', gatewayToken: opts.cardToken ?? 'tok_sandbox_4242', holderName: 'CLIENTE TESTE', setDefault: true });
      expect(pm.status, JSON.stringify(pm.body)).toBe(201);
      paymentMethodId = pm.body.id;
    }
    return { token: tokens.accessToken, refreshToken: tokens.refreshToken, userId: tokens.user.id, phone, addressId: addr.body.id, paymentMethodId, api: a };
  }

  async function asAdmin() {
    const res = await anon.post<AuthTokens>('/v1/auth/password/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return { token: res.body.accessToken, userId: res.body.user.id, api: api(res.body.accessToken) };
  }

  async function asProvider(phone: string, opts: { categorySlugs: string[]; lat?: number; lng?: number; approve?: boolean; online?: boolean; name?: string; pushToken?: string }): Promise<Provider> {
    const tokens = await otpLogin(phone, 'provider');
    let a = api(tokens.accessToken);
    await a.patch('/v1/me', { name: opts.name ?? `Prestador ${phone.slice(-4)}`, consents: { terms: true, privacy: true } });
    if (opts.pushToken) await a.post('/v1/me/devices', { pushToken: opts.pushToken, platform: 'android' });
    const cats = await anon.get<Array<{ id: string; slug: string }>>('/v1/catalog/categories');
    const categoryIds = opts.categorySlugs.map((slug) => {
      const c = cats.body.find((x) => x.slug === slug);
      if (!c) throw new Error(`categoria ${slug} não existe no seed`);
      return c.id;
    });
    const lat = opts.lat ?? SP.lat;
    const lng = opts.lng ?? SP.lng;
    const onboard = await a.post<{ id: string }>('/v1/providers/me', {
      displayName: opts.name ?? `Prestador ${phone.slice(-4)}`,
      legalName: 'Prestador Teste LTDA',
      documentNumber: phone.replace(/\D/g, '').padStart(11, '0').slice(-11),
      categoryIds,
      baseAddress: { lat, lng, city: 'São Paulo', state: 'SP' },
      serviceRadiusKm: 25,
    });
    expect(onboard.status, JSON.stringify(onboard.body)).toBe(201);
    await a.post('/v1/providers/me/documents', { kind: 'ID_FRONT', fileUrl: 'https://files.velio.test/doc.jpg' });
    // Novo token passa a carregar providerId.
    const refreshed = await anon.post<AuthTokens>('/v1/auth/refresh', { refreshToken: tokens.refreshToken });
    expect(refreshed.status).toBe(200);
    a = api(refreshed.body.accessToken);
    if (opts.approve !== false) {
      const admin = await asAdmin();
      const dec = await admin.api.post(`/v1/admin/providers/${onboard.body.id}/decision`, { decision: 'APPROVE' });
      expect(dec.status, JSON.stringify(dec.body)).toBe(200);
      if (opts.online !== false) {
        const av = await a.patch('/v1/providers/me/availability', { availability: 'ONLINE', location: { lat, lng } });
        expect(av.status, JSON.stringify(av.body)).toBe(200);
      }
    }
    return { token: refreshed.body.accessToken, refreshToken: refreshed.body.refreshToken, userId: tokens.user.id, phone, addressId: '', paymentMethodId: '', providerId: onboard.body.id, api: a };
  }

  // ---- Atalhos de leitura no banco para asserções --------------------------------------------
  const read = {
    order: async (id: string) => (await db.select().from(schema.serviceOrders).where(eq(schema.serviceOrders.id, id)))[0],
    events: (orderId: string) => db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, orderId)).orderBy(schema.orderEvents.seq),
    intents: (orderId: string) => db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.orderId, orderId)).orderBy(schema.paymentIntents.createdAt),
    notifications: (userId: string) => db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(schema.notifications.createdAt),
    ledgerForOrder: (orderId: string) => db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.orderId, orderId)),
    wallet: async (ownerType: 'USER' | 'PROVIDER' | 'PLATFORM', ownerId: string) => (await db.select().from(schema.walletAccounts).where(eq(schema.walletAccounts.ownerId, ownerId))).find((w) => w.ownerType === ownerType),
    offers: (orderId: string) => db.select().from(schema.dispatchOffers).where(eq(schema.dispatchOffers.orderId, orderId)),
    rounds: (orderId: string) => db.select().from(schema.dispatchRounds).where(eq(schema.dispatchRounds.orderId, orderId)).orderBy(schema.dispatchRounds.wave),
    incidents: (orderId: string) => db.select().from(schema.incidents).where(eq(schema.incidents.orderId, orderId)),
    custody: (orderId: string) => db.select().from(schema.custodyEvents).where(eq(schema.custodyEvents.orderId, orderId)).orderBy(schema.custodyEvents.createdAt),
    domainEvents: (type: string) => db.select().from(schema.domainEvents).where(eq(schema.domainEvents.type, type)),
    provider: async (id: string) => (await db.select().from(schema.providers).where(eq(schema.providers.id, id)))[0],
    jobs: (kind: string) => db.select().from(schema.scheduledJobs).where(eq(schema.scheduledJobs.kind, kind)),
    service: async (slug: string) => (await db.select().from(schema.services).where(eq(schema.services.slug, slug)))[0],
    children: (parentId: string) => db.select().from(schema.serviceOrders).where(eq(schema.serviceOrders.parentOrderId, parentId)),
  };

  return {
    app,
    fastify,
    ctx,
    db,
    schema,
    clock,
    gateway,
    push,
    anon,
    api,
    drain,
    advance,
    advanceTo,
    asCustomer,
    asProvider,
    asAdmin,
    read,
    close: () => app.close(),
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const MINUTE = 60_000;

/** Fluxo de pedido imediato até ACCEPTED com um prestador; devolve ids úteis. */
export async function requestAndAccept(t: TestApp, customer: Customer, provider: Provider, serviceSlug: string, extra: Record<string, unknown> = {}) {
  const service = await t.read.service(serviceSlug);
  if (!service) throw new Error(`serviço ${serviceSlug} ausente`);
  const created = await customer.api.post<{ id: string; status: string }>('/v1/requests', {
    serviceId: service.id,
    addressId: customer.addressId,
    schedule: { mode: 'NOW' },
    paymentMethodId: customer.paymentMethodId || undefined,
    ...extra,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  await t.drain();
  const offers = await provider.api.get<Array<{ id: string; orderId: string }>>('/v1/providers/me/offers');
  const offer = offers.body.find((o) => o.orderId === created.body.id);
  if (!offer) throw new Error(`prestador não recebeu oferta (status=${(await t.read.order(created.body.id))?.status})`);
  const accepted = await provider.api.post<{ status: string }>(`/v1/offers/${offer.id}/accept`);
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  await t.drain();
  return { orderId: created.body.id, offerId: offer.id, serviceId: service.id };
}

export async function transition(api: Api, orderId: string, action: string, payload: Record<string, unknown> = {}) {
  return api.post<{ status: string; allowedActions: string[]; error?: { code: string; details?: unknown } }>(`/v1/orders/${orderId}/transition`, { action, payload });
}

export const PHOTO = 'https://files.velio.test/foto.jpg';
