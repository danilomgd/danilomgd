import { ConciergeAnswerInput, ConciergePlan, ConciergeRequestInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actorFrom, requireAuth, requireRole } from '../../lib/auth';
import { parse } from '../../lib/validate';
import type { PlatformService } from '../admin/platform';
import type { OrdersService } from '../orders/service';
import type { ConciergeService } from './service';

export function registerConciergeRoutes(app: FastifyInstance, svc: ConciergeService, orders: OrdersService, platform: PlatformService) {
  app.post('/v1/concierge/requests', async (req, reply) => {
    const a = requireAuth(req);
    return reply.status(201).send(await svc.create(a.userId, parse(ConciergeRequestInput, req.body)));
  });

  app.get<{ Params: { id: string } }>('/v1/concierge/requests/:id', async (req) => svc.get(req.params.id, requireAuth(req)));

  app.post<{ Params: { id: string } }>('/v1/concierge/requests/:id/approve-plan', async (req) => {
    const a = requireAuth(req);
    const o = await svc.approvePlanByCustomer(req.params.id, a);
    return orders.toDetail(o, actorFrom(a, 'customer'));
  });

  app.post<{ Params: { id: string } }>('/v1/concierge/requests/:id/answers', async (req) => {
    const a = requireAuth(req);
    return svc.answer(req.params.id, a, parse(ConciergeAnswerInput, req.body).answers);
  });

  app.post<{ Params: { id: string } }>('/v1/ops/concierge/:id/approve-plan', async (req) => {
    const a = requireRole(req, 'operator', 'admin');
    const b = parse(z.object({ plan: ConciergePlan.optional() }), req.body ?? {});
    const o = await svc.operatorApprovePlan(req.params.id, a, b.plan ?? null);
    await platform.audit({ actorUserId: a.userId, actorRole: 'operator', action: 'concierge.approve_plan', targetType: 'order', targetId: o.id, after: { edited: Boolean(b.plan) }, ip: req.ip });
    return orders.toDetail(o, actorFrom(a));
  });
}
