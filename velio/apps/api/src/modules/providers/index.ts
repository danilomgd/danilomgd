import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { PlatformService } from '../admin/platform';
import type { CatalogService } from '../catalog/service';
import type { IdentityService } from '../identity/service';
import type { WalletService } from '../wallet/service';
import { type ProviderRouteDeps, registerProvidersRoutes } from './routes';
import { createProvidersService, type ProvidersService } from './service';

export function createProvidersModule(
  ctx: AppContext,
  deps: { identity: IdentityService; catalog: CatalogService; wallet: WalletService; platform: PlatformService },
): ProvidersService {
  const svc = createProvidersService(ctx, deps);
  svc.registerRealtime();
  deps.identity.setProviderIdResolver((userId) => svc.providerIdForUser(userId));
  return svc;
}

export function mountProvidersRoutes(app: FastifyInstance, svc: ProvidersService, deps: ProviderRouteDeps) {
  registerProvidersRoutes(app, svc, deps);
}

export type { ProvidersService } from './service';
