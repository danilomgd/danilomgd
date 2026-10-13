import type { FastifyInstance } from 'fastify';
import { requireAuth, requireProvider } from '../../lib/auth';
import type { WalletService } from './service';

export function registerWalletRoutes(app: FastifyInstance, svc: WalletService) {
  app.get('/v1/me/wallet', async (req) => svc.summary('USER', requireAuth(req).userId));
  app.get('/v1/providers/me/wallet', async (req) => svc.summary('PROVIDER', requireProvider(req).providerId));
  app.get('/v1/providers/me/ledger', async (req) => svc.ledger('PROVIDER', requireProvider(req).providerId));
  app.get('/v1/providers/me/payouts', async (req) => svc.listPayouts(requireProvider(req).providerId));
}
