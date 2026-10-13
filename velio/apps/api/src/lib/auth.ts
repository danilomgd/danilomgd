import type { ActorType, UserRole } from '@velio/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { errors } from './errors';

export interface AuthContext {
  userId: string;
  roles: UserRole[];
  providerId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw errors.unauthorized();
  return req.auth;
}

export function requireRole(req: FastifyRequest, ...roles: UserRole[]): AuthContext {
  const a = requireAuth(req);
  if (!roles.some((r) => a.roles.includes(r))) throw errors.forbidden();
  return a;
}

export function requireProvider(req: FastifyRequest): AuthContext & { providerId: string } {
  const a = requireRole(req, 'provider');
  if (!a.providerId) throw errors.forbidden('Complete o cadastro de prestador');
  return { ...a, providerId: a.providerId };
}

/** Traduz o contexto autenticado no ator do domínio. Operador/admin viram 'operator'. */
export function actorFrom(
  a: AuthContext,
  preferred?: ActorType,
): { type: ActorType; userId: string; providerId: string | null } {
  if (preferred === 'provider' && a.roles.includes('provider'))
    return { type: 'provider', userId: a.userId, providerId: a.providerId };
  if (preferred === 'customer') return { type: 'customer', userId: a.userId, providerId: null };
  if (a.roles.includes('admin') || a.roles.includes('operator'))
    return { type: 'operator', userId: a.userId, providerId: null };
  if (a.roles.includes('provider') && a.providerId)
    return { type: 'provider', userId: a.userId, providerId: a.providerId };
  return { type: 'customer', userId: a.userId, providerId: null };
}

export const preHandlers = {
  auth: async (req: FastifyRequest, _reply: FastifyReply) => {
    requireAuth(req);
  },
  ops: async (req: FastifyRequest) => {
    requireRole(req, 'operator', 'admin');
  },
  admin: async (req: FastifyRequest) => {
    requireRole(req, 'admin');
  },
  provider: async (req: FastifyRequest) => {
    requireProvider(req);
  },
};
