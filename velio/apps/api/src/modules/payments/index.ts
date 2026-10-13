import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context';
import type { PlatformService } from '../admin/platform';
import type { CommunicationService } from '../communication/service';
import type { IdentityService } from '../identity/service';
import type { WalletService } from '../wallet/service';
import { registerPaymentsRoutes } from './routes';
import { createPaymentsService, type PaymentsService } from './service';

export function registerPaymentsModule(
  app: FastifyInstance,
  ctx: AppContext,
  deps: {
    identity: IdentityService;
    wallet: WalletService;
    communication: CommunicationService;
    platform: PlatformService;
    canAccessOrder: (
      userId: string,
      roles: string[],
      providerId: string | null,
      orderId: string,
    ) => Promise<boolean>;
  },
): PaymentsService {
  const svc = createPaymentsService(ctx, deps);
  registerPaymentsRoutes(app, svc, deps.canAccessOrder);
  svc.registerRealtime();
  ctx.scheduler.register('payment.pix_timeout', async (p) => {
    await svc.pixTimeout(String(p.orderId), String(p.intentId));
  });
  return svc;
}

export type { PaymentsService } from './service';
