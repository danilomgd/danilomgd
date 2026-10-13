import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { AnalyticsService } from '../analytics/service';
import type { AssetsService } from '../assets/service';
import type { GeoService } from '../geo/service';
import type { IdentityService } from '../identity/service';
import type { OrdersService } from '../orders/service';
import type { PaymentsService } from '../payments/service';
import { registerSubscriptionsRoutes } from './routes';
import { createSubscriptionsService, type SubscriptionsService } from './service';

export function registerSubscriptionsModule(
  app: FastifyInstance,
  ctx: AppContext,
  deps: {
    orders: OrdersService;
    payments: PaymentsService;
    assets: AssetsService;
    geo: GeoService;
    identity: IdentityService;
    analytics: AnalyticsService;
  },
): SubscriptionsService {
  const svc = createSubscriptionsService(ctx, deps);
  registerSubscriptionsRoutes(app, svc);
  ctx.scheduler.register('subscription.generate_visit', async (p) => {
    await svc.generateVisit(String(p.subscriptionId), String(p.dueAt));
  });
  ctx.scheduler.register('subscription.charge', async (p) => {
    await svc.charge(String(p.subscriptionId));
  });
  return svc;
}

export type { SubscriptionsService } from './service';
