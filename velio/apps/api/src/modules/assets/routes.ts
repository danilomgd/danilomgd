import { EquipmentInput, VehicleInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../lib/auth';
import { parse } from '../../lib/validate';
import { type AssetsService, toEquipmentDto } from './service';

export function registerAssetsRoutes(app: FastifyInstance, svc: AssetsService) {
  app.get('/v1/me/vehicles', async (req) => svc.listVehicles(requireAuth(req).userId));
  app.post('/v1/me/vehicles', async (req, reply) => {
    const a = requireAuth(req);
    return reply.status(201).send(await svc.createVehicle(a.userId, parse(VehicleInput, req.body)));
  });
  app.delete<{ Params: { id: string } }>('/v1/me/vehicles/:id', async (req, reply) => {
    await svc.deleteVehicle(requireAuth(req).userId, req.params.id);
    return reply.status(204).send();
  });

  app.get('/v1/me/equipments', async (req) =>
    (await svc.listEquipments(requireAuth(req).userId)).map(toEquipmentDto),
  );
  app.post('/v1/me/equipments', async (req, reply) => {
    const a = requireAuth(req);
    return reply.status(201).send(await svc.createEquipment(a.userId, parse(EquipmentInput, req.body)));
  });
  app.delete<{ Params: { id: string } }>('/v1/me/equipments/:id', async (req, reply) => {
    await svc.deleteEquipment(requireAuth(req).userId, req.params.id);
    return reply.status(204).send();
  });
}
