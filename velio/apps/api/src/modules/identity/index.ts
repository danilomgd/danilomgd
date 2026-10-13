import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import { registerIdentityRoutes } from './routes';
import { createIdentityService, type IdentityService } from './service';

export function registerIdentityModule(app: FastifyInstance, ctx: AppContext): IdentityService {
  const svc = createIdentityService(ctx);
  registerIdentityRoutes(app, svc);
  return svc;
}

export type { IdentityService } from './service';
