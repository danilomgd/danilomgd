import { SendMessageInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../lib/auth';
import { errors } from '../../lib/errors';
import { parse } from '../../lib/validate';
import type { CommunicationService } from './service';

export function registerCommunicationRoutes(
  app: FastifyInstance,
  svc: CommunicationService,
  canAccessOrder: (userId: string, roles: string[], providerId: string | null, orderId: string) => Promise<boolean>,
) {
  app.get('/v1/me/notifications', async (req) => svc.listNotifications(requireAuth(req).userId));

  app.post<{ Params: { id: string } }>('/v1/me/notifications/:id/read', async (req, reply) => {
    await svc.markRead(requireAuth(req).userId, req.params.id);
    return reply.status(204).send();
  });

  app.get<{ Params: { id: string } }>('/v1/orders/:id/messages', async (req) => {
    const a = requireAuth(req);
    if (!(await canAccessOrder(a.userId, a.roles, a.providerId, req.params.id))) throw errors.forbidden();
    return svc.listMessages(req.params.id, a);
  });

  app.post<{ Params: { id: string } }>('/v1/orders/:id/messages', async (req, reply) => {
    const a = requireAuth(req);
    if (!(await canAccessOrder(a.userId, a.roles, a.providerId, req.params.id))) throw errors.forbidden();
    const b = parse(SendMessageInput, req.body);
    return reply.status(201).send(await svc.sendMessage(req.params.id, a, b));
  });

  app.get('/v1/me/notifications/unread-count', async (req) => {
    const list = await svc.listNotifications(requireAuth(req).userId, 100);
    return parse(z.object({ count: z.number() }), { count: list.filter((n) => !n.readAt).length });
  });
}
