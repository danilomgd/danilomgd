import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import { registerGeoRoutes } from './routes';
import { createGeoService, type GeoService } from './service';

export function registerGeoModule(app: FastifyInstance, ctx: AppContext): GeoService {
  const svc = createGeoService(ctx);
  registerGeoRoutes(app, svc);
  return svc;
}

export type { GeoService } from './service';
