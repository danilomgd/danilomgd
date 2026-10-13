import { rooms } from '@velio/contracts';
import type { FastifyInstance } from 'fastify';
import { Server as IOServer } from 'socket.io';
import type { Config } from '../config';
import { verifyJwt } from '../lib/jwt';

export interface SocketUser {
  userId: string;
  roles: string[];
  providerId: string | null;
}

/**
 * Socket.IO acoplado ao servidor HTTP do Fastify (ADR-009). Autentica por JWT no handshake,
 * coloca cada socket nas salas do usuário, do prestador e de ops conforme papéis.
 * Eventos de ordem e localização são emitidos pelos módulos via `ctx.io`.
 */
export function attachRealtime(
  app: FastifyInstance,
  cfg: Config,
  hooks: {
    onLocation?: (user: SocketUser, p: Record<string, unknown>) => Promise<void>;
    canJoinOrder?: (user: SocketUser, orderId: string) => Promise<boolean>;
  } = {},
): IOServer {
  const io = new IOServer(app.server, {
    path: '/realtime',
    cors: { origin: cfg.CORS_ORIGINS === '*' ? true : cfg.CORS_ORIGINS.split(','), credentials: true },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth as { token?: string })?.token ??
      (socket.handshake.headers.authorization ?? '').replace(/^Bearer /, '');
    const claims = token ? verifyJwt(token, cfg.JWT_SECRET) : null;
    if (!claims) return next(new Error('unauthorized'));
    socket.data.user = {
      userId: claims.sub,
      roles: claims.roles,
      providerId: claims.providerId ?? null,
    } satisfies SocketUser;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;
    void socket.join(rooms.user(user.userId));
    if (user.providerId) void socket.join(rooms.provider(user.providerId));
    if (user.roles.includes('operator') || user.roles.includes('admin')) void socket.join(rooms.ops());

    socket.on('order.subscribe', async (p: { orderId?: string }) => {
      if (!p?.orderId) return;
      const ok = hooks.canJoinOrder ? await hooks.canJoinOrder(user, p.orderId) : false;
      if (ok) void socket.join(rooms.order(p.orderId));
    });
    socket.on('order.unsubscribe', (p: { orderId?: string }) => {
      if (p?.orderId) void socket.leave(rooms.order(p.orderId));
    });
    socket.on('location.push', async (p: Record<string, unknown>) => {
      if (!user.providerId || !hooks.onLocation) return;
      try {
        await hooks.onLocation(user, p);
      } catch (err) {
        app.log.warn({ err }, 'location.push rejected');
      }
    });
  });

  app.addHook('onClose', async () => {
    await io.close();
  });
  return io;
}
