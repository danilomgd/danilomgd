import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import { registerAnalyticsRoutes } from './routes';
import { type AnalyticsService, createAnalyticsService } from './service';

export function registerAnalyticsModule(app: FastifyInstance, ctx: AppContext): AnalyticsService {
  const svc = createAnalyticsService(ctx);
  registerAnalyticsRoutes(app, svc);
  return svc;
}

export type { AnalyticsService } from './service';
