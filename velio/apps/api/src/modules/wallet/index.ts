import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import { registerWalletRoutes } from './routes';
import { createWalletService, type WalletService } from './service';

export function registerWalletModule(app: FastifyInstance, ctx: AppContext): WalletService {
  const svc = createWalletService(ctx);
  registerWalletRoutes(app, svc);
  ctx.scheduler.register('payout.batch', async (payload) => {
    const now = ctx.adapters.clock.now();
    await svc.runPayoutBatch(now);
    // Reagenda o próximo lote semanal (dedupe por semana evita duplicidade).
    const next = new Date(now.getTime() + 7 * 86_400_000);
    await ctx.scheduler.schedule(ctx.db, {
      kind: 'payout.batch',
      runAt: next,
      payload: { cadence: payload.cadence ?? 'WEEKLY' },
      dedupeKey: `payout.batch:${next.toISOString().slice(0, 10)}`,
    });
  });
  return svc;
}

export type { WalletService } from './service';
