import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { PlatformService } from '../admin/platform';
import type { DispatchService } from '../dispatch/service';
import type { OrdersService } from '../orders/service';
import type { ProvidersService } from '../providers/service';
import type { SupportService } from '../support/service';
import { registerOpsRoutes } from './routes';

export function registerOpsModule(
  app: FastifyInstance,
  ctx: AppContext,
  deps: { orders: OrdersService; dispatch: DispatchService; providers: ProvidersService; support: SupportService; platform: PlatformService },
) {
  registerOpsRoutes(app, deps, ctx.adapters.clock);
}
