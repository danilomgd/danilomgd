import {
  OtpRequestInput,
  OtpVerifyInput,
  PasswordLoginInput,
  RefreshInput,
  RegisterDeviceInput,
  UpdateProfileInput,
} from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../lib/auth';
import { parse } from '../../lib/validate';
import type { IdentityService } from './service';

/** 5 pedidos de código por minuto por IP+telefone. */
const otpRequestRateLimit = {
  rateLimit: {
    max: 5,
    timeWindow: '1 minute',
    keyGenerator: (req: { ip: string; body: unknown }) => `${req.ip}:${(req.body as { phone?: string } | null)?.phone ?? ''}`,
  },
};
/** Verificação por IP+desafio; a regra de negócio (5 tentativas) é aplicada antes deste teto. */
const otpVerifyRateLimit = {
  rateLimit: {
    max: 10,
    timeWindow: '1 minute',
    keyGenerator: (req: { ip: string; body: unknown }) => `${req.ip}:${(req.body as { challengeId?: string } | null)?.challengeId ?? ''}`,
  },
};

export function registerIdentityRoutes(app: FastifyInstance, svc: IdentityService) {
  app.post('/v1/auth/otp/request', { config: otpRequestRateLimit }, async (req) => {
    const b = parse(OtpRequestInput, req.body);
    return svc.requestOtp(b.phone, b.app);
  });

  app.post('/v1/auth/otp/verify', { config: otpVerifyRateLimit }, async (req) => {
    const b = parse(OtpVerifyInput, req.body);
    return svc.verifyOtp(b.challengeId, b.code, b.deviceName);
  });

  app.post('/v1/auth/password/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(PasswordLoginInput, req.body);
    return svc.passwordLogin(b.email, b.password);
  });

  app.post('/v1/auth/refresh', async (req) => {
    const b = parse(RefreshInput, req.body);
    return svc.refresh(b.refreshToken);
  });

  app.post('/v1/auth/logout', async (req, reply) => {
    const a = requireAuth(req);
    const b = parse(z.object({ refreshToken: z.string().optional() }), req.body ?? {});
    await svc.logout(a.userId, b.refreshToken);
    return reply.status(204).send();
  });

  app.get('/v1/me', async (req) => svc.getUser(requireAuth(req).userId));

  app.patch('/v1/me', async (req) => {
    const a = requireAuth(req);
    return svc.updateProfile(a.userId, parse(UpdateProfileInput, req.body));
  });

  app.post('/v1/me/devices', async (req, reply) => {
    const a = requireAuth(req);
    const b = parse(RegisterDeviceInput, req.body);
    const appName = String(req.headers['x-velio-app'] ?? 'customer');
    await svc.registerDevice(a.userId, b, appName);
    return reply.status(204).send();
  });
}
