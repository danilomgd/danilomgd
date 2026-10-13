import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import { registerAdminRoutes } from './routes';

export { createPlatformService, type PlatformService } from './platform';

export function registerAdminModule(
  app: FastifyInstance,
  ctx: AppContext,
  deps: Parameters<typeof registerAdminRoutes>[1],
) {
  registerAdminRoutes(app, deps, ctx.adapters.clock);
}
