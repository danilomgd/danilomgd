import { ReviewInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../lib/auth';
import { parse } from '../../lib/validate';
import type { ReputationService } from './service';

export function registerReputationRoutes(app: FastifyInstance, svc: ReputationService) {
  app.post<{ Params: { id: string } }>('/v1/orders/:id/review', async (req, reply) => {
    const a = requireAuth(req);
    return reply.status(201).send(await svc.createReview(req.params.id, a, parse(ReviewInput, req.body)));
  });
  app.get<{ Params: { id: string } }>('/v1/orders/:id/reviews', async (req) => {
    requireAuth(req);
    return svc.listForOrder(req.params.id);
  });
}
