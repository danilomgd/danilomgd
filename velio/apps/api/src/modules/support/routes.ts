import { OpenDisputeInput, SupportTicketInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../lib/auth';
import { parse } from '../../lib/validate';
import type { SupportService } from './service';

export function registerSupportRoutes(app: FastifyInstance, svc: SupportService) {
  app.post<{ Params: { id: string } }>('/v1/orders/:id/disputes', async (req, reply) => {
    const a = requireAuth(req);
    return reply.status(201).send(await svc.openDispute(req.params.id, a, parse(OpenDisputeInput, req.body)));
  });
  app.post('/v1/support/tickets', async (req, reply) => {
    const a = requireAuth(req);
    return reply.status(201).send(await svc.createTicket(a, parse(SupportTicketInput, req.body)));
  });
  app.get('/v1/support/tickets', async (req) => svc.listTickets(requireAuth(req).userId));
}
