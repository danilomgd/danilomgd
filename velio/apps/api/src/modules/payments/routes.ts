import { AddPaymentMethodInput, CreatePaymentIntentInput } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../lib/auth';
import { errors } from '../../lib/errors';
import { parse } from '../../lib/validate';
import type { PaymentsService } from './service';

export function registerPaymentsRoutes(
  app: FastifyInstance,
  svc: PaymentsService,
  canAccessOrder: (
    userId: string,
    roles: string[],
    providerId: string | null,
    orderId: string,
  ) => Promise<boolean>,
) {
  app.get('/v1/me/payment-methods', async (req) => svc.listMethods(requireAuth(req).userId));
  app.post('/v1/me/payment-methods', async (req, reply) => {
    const a = requireAuth(req);
    return reply.status(201).send(await svc.addMethod(a.userId, parse(AddPaymentMethodInput, req.body)));
  });
  app.delete<{ Params: { id: string } }>('/v1/me/payment-methods/:id', async (req, reply) => {
    await svc.removeMethod(requireAuth(req).userId, req.params.id);
    return reply.status(204).send();
  });

  app.get<{ Params: { id: string } }>('/v1/orders/:id/payments', async (req) => {
    const a = requireAuth(req);
    if (!(await canAccessOrder(a.userId, a.roles, a.providerId, req.params.id))) throw errors.forbidden();
    return svc.listForOrder(req.params.id);
  });

  app.post<{ Params: { id: string } }>('/v1/orders/:id/payments', async (req, reply) => {
    const a = requireAuth(req);
    const b = parse(CreatePaymentIntentInput, req.body);
    return reply.status(201).send(await svc.createIntentForOrder(req.params.id, a.userId, b));
  });

  app.post<{ Params: { gateway: string } }>(
    '/v1/payments/webhooks/:gateway',
    { config: { rateLimit: false } },
    async (req) => {
      const raw = (req as { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
      return svc.handleWebhook(
        req.params.gateway,
        raw,
        req.headers as Record<string, string | string[] | undefined>,
      );
    },
  );
}
