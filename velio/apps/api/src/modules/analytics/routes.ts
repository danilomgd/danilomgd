import { AnalyticsBatchInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../lib/auth';
import { parse } from '../../lib/validate';
import type { AnalyticsService } from './service';

export function registerAnalyticsRoutes(app: FastifyInstance, svc: AnalyticsService) {
  app.post('/v1/analytics/events', async (req, reply) => {
    const a = requireAuth(req);
    const b = parse(AnalyticsBatchInput, req.body);
    await svc.ingest(a.userId, b);
    return reply.status(204).send();
  });
}
