import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { ProvidersService } from '../providers/service';
import { registerReputationRoutes } from './routes';
import { createReputationService, type ReputationService } from './service';

export function registerReputationModule(app: FastifyInstance, ctx: AppContext, deps: { providers: ProvidersService }): ReputationService {
  const svc = createReputationService(ctx, deps);
  registerReputationRoutes(app, svc);
  return svc;
}

export type { ReputationService } from './service';
