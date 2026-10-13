import {
  LocationBatchInput,
  OrderListQuery,
  ProviderDocumentInput,
  ProviderOnboardingInput,
  SetAvailabilityInput,
  SetScheduleInput,
} from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireProvider } from '../../lib/auth';
import { errors } from '../../lib/errors';
import { parse } from '../../lib/validate';
import type { ProvidersService } from './service';

/** Dependências de outros módulos usadas apenas pelas rotas do prestador. */
export interface ProviderRouteDeps {
  listOffers(providerId: string): Promise<unknown[]>;
  listOrders(providerId: string, q: { scope: 'active' | 'history' | 'all'; cursor?: string; limit: number }): Promise<unknown>;
  indicators(providerId: string, days: number): Promise<unknown>;
}

export function registerProvidersRoutes(app: FastifyInstance, svc: ProvidersService, deps: ProviderRouteDeps) {
  app.post('/v1/providers/me', async (req, reply) => {
    const a = requireAuth(req);
    const me = await svc.onboard(a.userId, parse(ProviderOnboardingInput, req.body));
    return reply.status(201).send(me);
  });

  app.get('/v1/providers/me', async (req) => {
    const a = requireAuth(req);
    const p = a.providerId ? await svc.getById(a.providerId) : await svc.findByUserId(a.userId);
    if (!p) throw errors.notFound('Cadastro de prestador');
    return svc.toMe(p);
  });

  app.post('/v1/providers/me/documents', async (req, reply) => {
    const a = requireAuth(req);
    const p = a.providerId ? await svc.getById(a.providerId) : await svc.findByUserId(a.userId);
    if (!p) throw errors.notFound('Cadastro de prestador');
    await svc.addDocument(p.id, parse(ProviderDocumentInput, req.body));
    return reply.status(204).send();
  });

  app.patch('/v1/providers/me/availability', async (req) => {
    const a = requireProvider(req);
    return svc.setAvailability(a.providerId, parse(SetAvailabilityInput, req.body));
  });

  app.post('/v1/providers/me/location', async (req) => {
    const a = requireProvider(req);
    const b = parse(LocationBatchInput, req.body);
    return svc.ingestLocation(a.providerId, b.pings);
  });

  app.get('/v1/providers/me/schedule', async (req) => svc.getSchedule(requireProvider(req).providerId));
  app.put('/v1/providers/me/schedule', async (req) => {
    const a = requireProvider(req);
    return svc.setSchedule(a.providerId, parse(SetScheduleInput, req.body));
  });

  app.get('/v1/providers/me/offers', async (req) => deps.listOffers(requireProvider(req).providerId));

  app.get('/v1/providers/me/orders', async (req) => {
    const a = requireProvider(req);
    return deps.listOrders(a.providerId, parse(OrderListQuery, req.query ?? {}));
  });

  app.get('/v1/providers/me/indicators', async (req) => {
    const a = requireProvider(req);
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query ?? {});
    return deps.indicators(a.providerId, q.days);
  });
}
