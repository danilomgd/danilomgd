import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { type Adapters, buildAdapters } from './adapters';
import { type Config, loadConfig } from './config';
import type { AppContext } from './context';
import { createDb, type DbHandle } from './db/client';
import { AppError } from './lib/errors';
import { verifyJwt } from './lib/jwt';
import { registerModules } from './modules';
import { Outbox } from './platform/outbox';
import { Scheduler } from './platform/scheduler';
import { attachRealtime } from './realtime/io';

export interface BuildOptions {
  config?: Partial<Config> | Config;
  dbHandle?: DbHandle;
  adapters?: Partial<Adapters>;
  /** Desliga loops em background (testes controlam outbox/scheduler manualmente). */
  background?: boolean;
  realtime?: boolean;
}

export interface App {
  fastify: FastifyInstance;
  ctx: AppContext;
  close: () => Promise<void>;
}

export async function buildApp(opts: BuildOptions = {}): Promise<App> {
  const cfg = loadConfig({
    ...process.env,
    ...Object.fromEntries(Object.entries(opts.config ?? {}).map(([k, v]) => [k, String(v)])),
  });
  const fastify = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      redact: ['req.headers.authorization', 'body.password', 'body.code', 'body.pin'],
    },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  const dbHandle =
    opts.dbHandle ??
    (await createDb({ url: cfg.DATABASE_URL, dataDir: cfg.PGLITE_DATA_DIR, nodeEnv: cfg.NODE_ENV }));
  if (!opts.dbHandle) await dbHandle.migrate();

  const adapters = buildAdapters(cfg, fastify.log, opts.adapters);
  const outbox = new Outbox(dbHandle.db, fastify.log);
  const scheduler = new Scheduler(dbHandle.db, fastify.log);

  const ctx: AppContext = {
    cfg,
    db: dbHandle.db,
    dbHandle,
    log: fastify.log,
    adapters,
    outbox,
    scheduler,
    io: null,
  };

  await fastify.register(sensible);
  await fastify.register(cors, {
    origin: cfg.CORS_ORIGINS === '*' ? true : cfg.CORS_ORIGINS.split(','),
    credentials: true,
  });
  await fastify.register(rateLimit, {
    max: cfg.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.auth?.userId ?? req.ip,
  });

  // Autenticação: Bearer JWT → req.auth (nunca lança; rotas decidem com requireAuth).
  fastify.decorateRequest('auth', null);
  fastify.addHook('onRequest', async (req) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return;
    const claims = verifyJwt(h.slice(7), cfg.JWT_SECRET, adapters.clock.now().getTime());
    if (claims) req.auth = { userId: claims.sub, roles: claims.roles, providerId: claims.providerId ?? null };
  });

  // Corpo bruto para webhooks (assinatura).
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as { rawBody?: string }).rawBody = body as string;
    if (!body || (body as string).length === 0) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch (e) {
      done(e as Error, undefined);
    }
  });

  fastify.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.status)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply
        .status(400)
        .send({ error: { code: 'BAD_REQUEST', message: 'Entrada inválida', details: err.issues } });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    return reply.status(status).send({
      error: {
        code: status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'INTERNAL' : 'HTTP_ERROR',
        message: status >= 500 ? 'Erro interno' : err.message,
      },
    });
  });

  fastify.get('/health', async () => ({
    ok: true,
    db: dbHandle.driver,
    payments: adapters.payments.name,
    time: adapters.clock.now().toISOString(),
  }));

  const modules = await registerModules(fastify, ctx);

  if (opts.realtime !== false) {
    ctx.io = attachRealtime(fastify, cfg, {
      canJoinOrder: (user, orderId) =>
        modules.orders.canUserAccessOrder(user.userId, user.roles, user.providerId, orderId),
      onLocation: (user, p) => modules.providers.ingestLocation(user.providerId ?? '', [p as never]),
    });
  }

  const background = opts.background ?? cfg.NODE_ENV !== 'test';
  fastify.addHook('onReady', async () => {
    if (background) {
      outbox.start(cfg.OUTBOX_INTERVAL_MS);
      if (cfg.SCHEDULER_ENABLED) scheduler.start(cfg.SCHEDULER_INTERVAL_MS);
    }
  });
  fastify.addHook('onClose', async () => {
    outbox.stop();
    scheduler.stop();
  });

  return {
    fastify,
    ctx,
    close: async () => {
      await fastify.close();
      if (!opts.dbHandle) await dbHandle.close();
    },
  };
}
