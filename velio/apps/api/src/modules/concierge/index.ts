import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { PlatformService } from '../admin/platform';
import type { AssetsService } from '../assets/service';
import type { CatalogService } from '../catalog/service';
import type { CommunicationService } from '../communication/service';
import type { GeoService } from '../geo/service';
import type { IdentityService } from '../identity/service';
import type { OrdersService } from '../orders/service';
import type { QuotesService } from '../quotes/service';
import { registerConciergeRoutes } from './routes';
import { type ConciergeService, createConciergeService } from './service';

export function registerConciergeModule(
  app: FastifyInstance,
  ctx: AppContext,
  deps: { orders: OrdersService; quotes: QuotesService; catalog: CatalogService; identity: IdentityService; geo: GeoService; assets: AssetsService; platform: PlatformService; communication: CommunicationService },
): ConciergeService {
  const svc = createConciergeService(ctx, deps);
  registerConciergeRoutes(app, svc, deps.orders, deps.platform);
  ctx.scheduler.register('concierge.plan', async (p) => {
    const orderId = String(p.orderId);
    const o = await deps.orders.findById(orderId);
    if (!o) return;
    if (o.status === 'SUBMITTED') await deps.orders.tryTransition(orderId, 'system.start_matching', { type: 'system', userId: null }, {});
    else if (o.status === 'INTERPRETING') await svc.runPlanner(o);
  });
  return svc;
}

export type { ConciergeService } from './service';
