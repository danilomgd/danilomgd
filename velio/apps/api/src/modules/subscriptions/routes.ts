import { SubscribeInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../lib/auth';
import { parse } from '../../lib/validate';
import type { SubscriptionsService } from './service';

export function registerSubscriptionsRoutes(app: FastifyInstance, svc: SubscriptionsService) {
  app.get('/v1/catalog/plans', async () => svc.listPlans());
  app.get('/v1/me/subscriptions', async (req) => svc.listMine(requireAuth(req).userId));
  app.post('/v1/me/subscriptions', async (req, reply) => {
    const a = requireAuth(req);
    return reply.status(201).send(await svc.subscribe(a.userId, parse(SubscribeInput, req.body)));
  });
  app.post<{ Params: { id: string } }>('/v1/me/subscriptions/:id/cancel', async (req) => {
    const a = requireAuth(req);
    const b = parse(z.object({ reason: z.string().min(2).max(300).default('Cancelado pelo cliente') }), req.body ?? {});
    return svc.cancel(a.userId, req.params.id, b.reason);
  });
}
