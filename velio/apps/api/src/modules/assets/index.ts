import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import { registerAssetsRoutes } from './routes';
import { type AssetsService, createAssetsService } from './service';

export function registerAssetsModule(app: FastifyInstance, ctx: AppContext): AssetsService {
  const svc = createAssetsService(ctx);
  registerAssetsRoutes(app, svc);
  return svc;
}

export type { AssetsService } from './service';
