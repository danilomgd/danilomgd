import { CreateQuoteInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { requireAuth, requireProvider } from '../../lib/auth';
import { parse } from '../../lib/validate';
import type { QuotesService } from './service';

export function registerQuotesRoutes(app: FastifyInstance, svc: QuotesService) {
  app.post<{ Params: { id: string } }>('/v1/orders/:id/quotes', async (req, reply) => {
    const a = requireProvider(req);
    return reply.status(201).send(await svc.create(req.params.id, a, parse(CreateQuoteInput, req.body)));
  });
  app.post<{ Params: { id: string } }>('/v1/quotes/:id/approve', async (req) => svc.approve(req.params.id, requireAuth(req)));
  app.post<{ Params: { id: string } }>('/v1/quotes/:id/reject', async (req) => svc.reject(req.params.id, requireAuth(req)));
}
