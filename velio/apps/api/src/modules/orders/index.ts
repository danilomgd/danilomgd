import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { PlatformService } from '../admin/platform';
import type { AssetsService } from '../assets/service';
import type { CatalogService } from '../catalog/service';
import type { GeoService } from '../geo/service';
import type { IdentityService } from '../identity/service';
import type { ProvidersService } from '../providers/service';
import { registerOrdersRoutes } from './routes';
import { createOrdersService, type OrdersService } from './service';

export function registerOrdersModule(
  app: FastifyInstance,
  ctx: AppContext,
  deps: {
    catalog: CatalogService;
    geo: GeoService;
    assets: AssetsService;
    identity: IdentityService;
    providers: ProvidersService;
    platform: PlatformService;
  },
): OrdersService {
  const svc = createOrdersService(ctx, deps);
  registerOrdersRoutes(app, svc);
  svc.registerRealtime();
  return svc;
}

export type { OrdersService } from './service';
export type { EffectContext, EffectExecutor, OrderActor, OrderRow } from './types';
