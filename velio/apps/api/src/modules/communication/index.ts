import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { IdentityService } from '../identity/service';
import { registerCommunicationRoutes } from './routes';
import { type CommunicationService, createCommunicationService } from './service';

export function registerCommunicationModule(
  app: FastifyInstance,
  ctx: AppContext,
  deps: {
    identity: IdentityService;
    canAccessOrder: (
      userId: string,
      roles: string[],
      providerId: string | null,
      orderId: string,
    ) => Promise<boolean>;
  },
): CommunicationService {
  const svc = createCommunicationService(ctx, { identity: deps.identity });
  registerCommunicationRoutes(app, svc, deps.canAccessOrder);
  svc.registerRealtime();
  return svc;
}

export type { CommunicationService } from './service';
