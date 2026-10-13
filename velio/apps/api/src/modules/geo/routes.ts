import { AddressInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../lib/auth';
import { parse } from '../../lib/validate';
import type { GeoService } from './service';

export function registerGeoRoutes(app: FastifyInstance, svc: GeoService) {
  app.get('/v1/geo/regions', async () => (await svc.listRegions()).map((r) => ({ id: r.id, name: r.name, city: r.city, state: r.state })));

  app.get('/v1/me/addresses', async (req) => svc.listAddresses(requireAuth(req).userId));

  app.post('/v1/me/addresses', async (req, reply) => {
    const a = requireAuth(req);
    const created = await svc.createAddress(a.userId, parse(AddressInput, req.body));
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string } }>('/v1/me/addresses/:id', async (req) => {
    const a = requireAuth(req);
    return svc.updateAddress(a.userId, req.params.id, parse(AddressInput.partial(), req.body));
  });

  app.delete<{ Params: { id: string } }>('/v1/me/addresses/:id', async (req, reply) => {
    const a = requireAuth(req);
    await svc.deleteAddress(a.userId, req.params.id);
    return reply.status(204).send();
  });
}
