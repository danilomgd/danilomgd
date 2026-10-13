import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { PlatformService } from '../admin/platform';
import type { CommunicationService } from '../communication/service';
import { registerQuotesRoutes } from './routes';
import { createQuotesService, type QuotesService } from './service';

export function registerQuotesModule(app: FastifyInstance, ctx: AppContext, deps: { communication: CommunicationService; platform: PlatformService }): QuotesService {
  const svc = createQuotesService(ctx, deps);
  registerQuotesRoutes(app, svc);
  svc.registerRealtime();
  ctx.scheduler.register('quote.expire', async (p) => {
    await svc.expire(String(p.quoteId));
  });
  return svc;
}

export type { QuotesService } from './service';
