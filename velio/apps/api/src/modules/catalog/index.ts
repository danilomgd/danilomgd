import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { AssetsService } from '../assets/service';
import type { IdentityService } from '../identity/service';
import { registerCatalogRoutes } from './routes';
import { type CatalogService, createCatalogService } from './service';

export function registerCatalogModule(
  app: FastifyInstance,
  ctx: AppContext,
  deps: { identity: IdentityService; assets: AssetsService },
): CatalogService {
  const svc = createCatalogService(ctx, deps);
  registerCatalogRoutes(app, svc);
  return svc;
}

export type { CatalogService } from './service';
