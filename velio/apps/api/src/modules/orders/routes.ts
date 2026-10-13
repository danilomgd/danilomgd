import {
  CancelInput,
  CompleteInput,
  CreateServiceRequestInput,
  CustodyScanInput,
  EvidenceInput,
  OrderListQuery,
  StartInput,
  TransitionInput,
  VehicleHandoverInput,
} from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type AuthContext, actorFrom, requireAuth, requireProvider } from '../../lib/auth';
import { errors } from '../../lib/errors';
import { parse } from '../../lib/validate';
import type { OrdersService } from './service';
import type { OrderActor } from './types';

/** Ator conforme o prefixo da ação: provider.* exige papel provider; operator./system.* exigem operação. */
function actorForAction(auth: AuthContext, action: string): OrderActor {
  const isOps = auth.roles.includes('operator') || auth.roles.includes('admin');
  if (action.startsWith('provider.')) {
    if (isOps) return actorFrom(auth);
    if (!auth.roles.includes('provider') || !auth.providerId) throw errors.forbidden('Ação exclusiva do prestador');
    return actorFrom(auth, 'provider');
  }
  if (action.startsWith('operator.') || action.startsWith('system.')) {
    if (!isOps) throw errors.forbidden('Ação exclusiva da operação');
    return actorFrom(auth);
  }
  return isOps ? actorFrom(auth) : actorFrom(auth, 'customer');
}

export function registerOrdersRoutes(app: FastifyInstance, svc: OrdersService) {
  app.post('/v1/requests', async (req, reply) => {
    const a = requireAuth(req);
    const b = parse(CreateServiceRequestInput, req.body);
    const order = await svc.createRequest(a.userId, b);
    return reply.status(201).send(await svc.toDetail(order, actorFrom(a, 'customer')));
  });

  app.get('/v1/orders', async (req) => {
    const a = requireAuth(req);
    return svc.listForCustomer(a.userId, parse(OrderListQuery, req.query ?? {}));
  });

  app.get<{ Params: { id: string } }>('/v1/orders/:id', async (req) => {
    const a = requireAuth(req);
    const o = await svc.requireOrderFor(req.params.id, a);
    const actor = o.providerId && o.providerId === a.providerId ? actorFrom(a, 'provider') : o.customerId === a.userId ? actorFrom(a, 'customer') : actorFrom(a);
    return svc.toDetail(o, actor);
  });

  app.post<{ Params: { id: string } }>('/v1/orders/:id/transition', async (req) => {
    const a = requireAuth(req);
    await svc.requireOrderFor(req.params.id, a);
    const b = parse(TransitionInput, req.body);
    const actor = actorForAction(a, b.action);
    const o = await svc.transition(req.params.id, b.action, actor, b.payload);
    return svc.toDetail(o, actor);
  });

  app.post<{ Params: { id: string } }>('/v1/orders/:id/cancel', async (req) => {
    const a = requireAuth(req);
    const current = await svc.requireOrderFor(req.params.id, a);
    const b = parse(CancelInput, req.body);
    const isProvider = current.providerId !== null && current.providerId === a.providerId && current.customerId !== a.userId;
    const action = isProvider ? 'provider.cancel' : 'customer.cancel';
    const actor = actorForAction(a, action);
    const o = await svc.transition(req.params.id, action, actor, { reason: b.reason });
    return svc.toDetail(o, actor);
  });

  app.post<{ Params: { id: string } }>('/v1/orders/:id/start', async (req) => {
    const a = requireProvider(req);
    const b = parse(StartInput, req.body ?? {});
    const actor = actorFrom(a, 'provider');
    const o = await svc.transition(req.params.id, 'provider.start', actor, { ...(b.pin ? { pin: b.pin } : {}), ...(b.location ? { location: b.location } : {}) });
    return svc.toDetail(o, actor);
  });

  app.post<{ Params: { id: string } }>('/v1/orders/:id/complete', async (req) => {
    const a = requireProvider(req);
    const b = parse(CompleteInput, req.body ?? {});
    const actor = actorFrom(a, 'provider');
    const o = await svc.transition(req.params.id, 'provider.complete', actor, { notes: b.notes ?? null, evidenceIds: b.evidenceIds });
    return svc.toDetail(o, actor);
  });

  app.post<{ Params: { id: string } }>('/v1/orders/:id/evidence', async (req, reply) => {
    const a = requireAuth(req);
    const o = await svc.requireOrderFor(req.params.id, a);
    if (o.providerId !== a.providerId && !a.roles.includes('operator') && !a.roles.includes('admin')) throw errors.forbidden('Somente o prestador atribuído envia evidências');
    const b = parse(EvidenceInput, req.body);
    return reply.status(201).send(await svc.addEvidence(req.params.id, a.userId, b));
  });

  app.post<{ Params: { id: string } }>('/v1/orders/:id/custody/scan', async (req) => {
    const a = requireProvider(req);
    const b = parse(CustodyScanInput, req.body);
    await svc.custodyScan(req.params.id, a, b);
    return svc.toDetail(await svc.getById(req.params.id), actorFrom(a, 'provider'));
  });

  app.post<{ Params: { id: string; step: string } }>('/v1/orders/:id/vehicle-handover/:step', async (req) => {
    const a = requireProvider(req);
    const step = parse(z.enum(['PICKUP', 'DELIVERY']), req.params.step.toUpperCase());
    const b = parse(VehicleHandoverInput, req.body);
    await svc.vehicleHandover(req.params.id, a, step, b);
    return svc.toDetail(await svc.getById(req.params.id), actorFrom(a, 'provider'));
  });
}
