import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { CatalogService } from '../catalog/service';
import type { CommunicationService } from '../communication/service';
import type { OrdersService } from '../orders/service';
import type { ProvidersService } from '../providers/service';
import type { ReputationService } from '../reputation/service';
import { registerDispatchRoutes } from './routes';
import { createDispatchService, type DispatchService } from './service';

export function registerDispatchModule(
  app: FastifyInstance,
  ctx: AppContext,
  deps: {
    orders: OrdersService;
    providers: ProvidersService;
    catalog: CatalogService;
    communication: CommunicationService;
    reputation: ReputationService;
  },
): DispatchService {
  const svc = createDispatchService(ctx, deps);
  registerDispatchRoutes(app, svc, deps.orders);
  svc.registerRealtime();
  ctx.scheduler.register('dispatch.start', async (p) => {
    const orderId = String(p.orderId);
    const o = await deps.orders.findById(orderId);
    if (!o) return;
    if (o.status === 'REQUESTED' || o.status === 'SCHEDULED') {
      await deps.orders.tryTransition(orderId, 'system.start_matching', { type: 'system', userId: null }, {});
    } else if (o.status === 'MATCHING') {
      await svc.start(orderId);
    }
  });
  ctx.scheduler.register('dispatch.wave_timeout', async (p) => {
    await svc.onWaveTimeout(String(p.orderId), String(p.roundId));
  });
  ctx.scheduler.register('offer.expire', async (p) => {
    await svc.expireOffer(String(p.offerId));
  });
  return svc;
}

export type { DispatchService } from './service';
