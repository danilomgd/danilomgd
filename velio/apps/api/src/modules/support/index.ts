import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { CommunicationService } from '../communication/service';
import type { ReputationService } from '../reputation/service';
import { registerSupportRoutes } from './routes';
import { createSupportService, type SupportService } from './service';

export function registerSupportModule(
  app: FastifyInstance,
  ctx: AppContext,
  deps: { communication: CommunicationService; reputation: ReputationService },
): SupportService {
  const svc = createSupportService(ctx, deps);
  registerSupportRoutes(app, svc);
  svc.registerRealtime();
  return svc;
}

export type { SupportService } from './service';
