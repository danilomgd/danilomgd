import type { FastifyInstance } from 'fastify';
import { actorFrom, requireProvider } from '../../lib/auth';
import type { OrdersService } from '../orders/service';
import type { DispatchService } from './service';

export function registerDispatchRoutes(app: FastifyInstance, svc: DispatchService, orders: OrdersService) {
  app.post<{ Params: { id: string } }>('/v1/offers/:id/accept', async (req) => {
    const a = requireProvider(req);
    const o = await svc.acceptOffer(req.params.id, a);
    return orders.toDetail(o, actorFrom(a, 'provider'));
  });
  app.post<{ Params: { id: string } }>('/v1/offers/:id/reject', async (req, reply) => {
    const a = requireProvider(req);
    await svc.rejectOffer(req.params.id, a.providerId);
    return reply.status(204).send();
  });
}
