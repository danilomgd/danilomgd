import type { Message, Notification, NotificationKind, SendMessageInput } from '@velio/contracts';
import { rooms } from '@velio/contracts';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { conversationParticipants, conversations, messages, notifications } from '../../db/schema';
import { errors } from '../../lib/errors';
import { type Exec, iso } from '../_shared/util';
import type { IdentityService } from '../identity/service';

/** Textos de notificação em pt-BR. `data` sempre carrega `orderId` quando houver. */
const TEMPLATES: Record<NotificationKind, { title: string; body: string }> = {
  provider_found: { title: 'Profissional confirmado', body: 'Encontramos um profissional para o seu pedido.' },
  provider_en_route: { title: 'A caminho', body: 'Seu profissional está a caminho.' },
  provider_arriving: { title: 'Chegou', body: 'Seu profissional chegou ao local.' },
  service_started: { title: 'Serviço iniciado', body: 'O serviço começou. Acompanhe pelo app.' },
  quote_available: { title: 'Orçamento disponível', body: 'Você tem um orçamento para aprovar.' },
  payment_approved: { title: 'Pagamento aprovado', body: 'Seu pagamento foi autorizado.' },
  payment_failed: { title: 'Pagamento recusado', body: 'Não conseguimos autorizar o pagamento. Troque o método para continuar.' },
  service_completed: { title: 'Serviço concluído', body: 'Seu serviço foi concluído.' },
  review_request: { title: 'Como foi o atendimento?', body: 'Avalie o profissional em poucos toques.' },
  offer_received: { title: 'Nova oferta de serviço', body: 'Você recebeu uma oferta. Responda antes que expire.' },
  offer_expired: { title: 'Oferta expirada', body: 'A oferta expirou.' },
  order_cancelled: { title: 'Pedido cancelado', body: 'Um pedido foi cancelado.' },
  booking_reminder: { title: 'Lembrete de agendamento', body: 'Seu serviço agendado está próximo.' },
  plan_proposed: { title: 'Plano pronto', body: 'Revise e aprove o plano do seu Concierge.' },
  dispute_update: { title: 'Contestação atualizada', body: 'Há uma atualização na sua contestação.' },
  generic: { title: 'VÉLIO', body: '' },
};

export type ConversationRow = typeof conversations.$inferSelect;

export function toMessageDto(m: typeof messages.$inferSelect): Message {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderType: m.senderType as Message['senderType'],
    senderUserId: m.senderUserId,
    body: m.body,
    mediaUrl: m.mediaUrl,
    systemKind: m.systemKind,
    createdAt: m.createdAt.toISOString(),
    readAt: null,
  };
}

export interface CommunicationSources {
  /** Participantes de uma ordem: cliente e usuário do prestador (se houver). */
  orderParticipants(orderId: string): Promise<{ customerUserId: string; providerUserId: string | null } | null>;
  providerUserId(providerId: string): Promise<string | null>;
}

export function createCommunicationService(ctx: AppContext, deps: { identity: IdentityService }) {
  const { db, adapters, outbox, log } = ctx;
  let sources: CommunicationSources | null = null;

  async function getConversation(orderId: string, kind: string, exec: Exec = db): Promise<ConversationRow | null> {
    const [c] = await exec
      .select()
      .from(conversations)
      .where(and(eq(conversations.orderId, orderId), eq(conversations.kind, kind)))
      .limit(1);
    return c ?? null;
  }

  async function addParticipant(conversationId: string, userId: string, role: string) {
    await db
      .insert(conversationParticipants)
      .values({ conversationId, userId, role })
      .onConflictDoNothing();
  }

  /** Conversa cliente ↔ prestador da ordem (criada sob demanda; participantes sincronizados). */
  async function ensureOrderConversation(orderId: string): Promise<ConversationRow> {
    let c = await getConversation(orderId, 'CUSTOMER_PROVIDER');
    if (!c) {
      const [created] = await db
        .insert(conversations)
        .values({ orderId, kind: 'CUSTOMER_PROVIDER' })
        .onConflictDoNothing()
        .returning();
      c = created ?? (await getConversation(orderId, 'CUSTOMER_PROVIDER'));
    }
    if (!c) throw new Error('Falha ao criar conversa');
    const parts = sources ? await sources.orderParticipants(orderId) : null;
    if (parts) {
      await addParticipant(c.id, parts.customerUserId, 'customer');
      if (parts.providerUserId) await addParticipant(c.id, parts.providerUserId, 'provider');
    }
    return c;
  }

  async function insertMessage(
    conversation: ConversationRow,
    values: { senderType: string; senderUserId: string | null; body: string | null; mediaUrl: string | null; systemKind: string | null },
  ): Promise<Message> {
    const now = adapters.clock.now();
    const [m] = await db.insert(messages).values({ conversationId: conversation.id, ...values }).returning();
    if (!m) throw new Error('Falha ao gravar mensagem');
    await db.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversation.id));
    await outbox.publish(db, {
      type: 'message.created',
      aggregateType: 'conversation',
      aggregateId: conversation.id,
      payload: { conversationId: conversation.id, messageId: m.id, orderId: conversation.orderId },
    });
    return toMessageDto(m);
  }

  async function notifyUser(userId: string, kind: NotificationKind, data: Record<string, unknown> = {}, override: { title?: string; body?: string } = {}): Promise<Notification> {
    const now = adapters.clock.now();
    const tpl = TEMPLATES[kind];
    const title = override.title ?? tpl.title;
    const body = override.body ?? tpl.body;
    const [inapp] = await db
      .insert(notifications)
      .values({ userId, kind, channel: 'INAPP', title, body, data, status: 'SENT', sentAt: now })
      .returning();
    if (!inapp) throw new Error('Falha ao criar notificação');
    const tokens = await deps.identity.listPushTokens(userId);
    if (tokens.length > 0) {
      try {
        const r = await adapters.push.send(tokens, { title, body, data: { ...data, kind } });
        await db.insert(notifications).values({ userId, kind, channel: 'PUSH', title, body, data, status: r.sent > 0 ? 'SENT' : 'FAILED', sentAt: now });
      } catch (err) {
        log.warn({ err, userId }, 'falha ao enviar push');
        await db.insert(notifications).values({ userId, kind, channel: 'PUSH', title, body, data, status: 'FAILED', error: String((err as Error).message) });
      }
    }
    await outbox.publish(db, {
      type: 'notification.created',
      aggregateType: 'user',
      aggregateId: userId,
      payload: { userId, notificationId: inapp.id, kind },
    });
    return {
      id: inapp.id,
      kind,
      channel: 'INAPP',
      title,
      body,
      data,
      createdAt: inapp.createdAt.toISOString(),
      readAt: null,
    };
  }

  return {
    bindSources(s: CommunicationSources) {
      sources = s;
    },
    ensureOrderConversation,
    notifyUser,

    async notifyProvider(providerId: string, kind: NotificationKind, data: Record<string, unknown> = {}, override: { title?: string; body?: string } = {}) {
      const userId = sources ? await sources.providerUserId(providerId) : null;
      if (!userId) return null;
      return notifyUser(userId, kind, data, override);
    },

    /** Mensagem automática na conversa da ordem (ex.: mudança de status). */
    async systemMessage(orderId: string, systemKind: string, body: string): Promise<Message> {
      const c = await ensureOrderConversation(orderId);
      return insertMessage(c, { senderType: 'system', senderUserId: null, body, mediaUrl: null, systemKind });
    },

    async sendMessage(orderId: string, user: { userId: string; roles: string[] }, input: z.infer<typeof SendMessageInput>): Promise<Message> {
      const c = await ensureOrderConversation(orderId);
      const isOps = user.roles.includes('operator') || user.roles.includes('admin');
      const [part] = await db
        .select()
        .from(conversationParticipants)
        .where(and(eq(conversationParticipants.conversationId, c.id), eq(conversationParticipants.userId, user.userId)))
        .limit(1);
      if (!part && !isOps) throw errors.forbidden('Você não participa desta conversa');
      if (c.closedAt) throw errors.conflict('Conversa encerrada');
      return insertMessage(c, {
        senderType: part?.role ?? 'operator',
        senderUserId: user.userId,
        body: input.body?.trim() || null,
        mediaUrl: input.mediaUrl ?? null,
        systemKind: null,
      });
    },

    async listMessages(orderId: string, user: { userId: string; roles: string[] }): Promise<Message[]> {
      const c = await ensureOrderConversation(orderId);
      const isOps = user.roles.includes('operator') || user.roles.includes('admin');
      const [part] = await db
        .select()
        .from(conversationParticipants)
        .where(and(eq(conversationParticipants.conversationId, c.id), eq(conversationParticipants.userId, user.userId)))
        .limit(1);
      if (!part && !isOps) throw errors.forbidden('Você não participa desta conversa');
      const rows = await db.select().from(messages).where(eq(messages.conversationId, c.id)).orderBy(asc(messages.createdAt)).limit(200);
      return rows.map(toMessageDto);
    },

    async createSupportConversation(userId: string, orderId: string | null): Promise<string> {
      const [c] = await db.insert(conversations).values({ orderId: null, kind: 'CUSTOMER_SUPPORT' }).returning();
      if (!c) throw new Error('Falha ao criar conversa de suporte');
      await addParticipant(c.id, userId, 'customer');
      if (orderId) await insertMessage(c, { senderType: 'system', senderUserId: null, body: `Ticket vinculado à ordem ${orderId}`, mediaUrl: null, systemKind: 'ticket_order_link' });
      return c.id;
    },

    async listNotifications(userId: string, limit = 50): Promise<Notification[]> {
      const rows = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.channel, 'INAPP')))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
      return rows.map((n) => ({
        id: n.id,
        kind: n.kind as NotificationKind,
        channel: 'INAPP' as const,
        title: n.title,
        body: n.body,
        data: n.data,
        createdAt: n.createdAt.toISOString(),
        readAt: iso(n.readAt),
      }));
    },

    async markRead(userId: string, id: string) {
      await db.update(notifications).set({ readAt: adapters.clock.now() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    },

    registerRealtime() {
      outbox.on('message.created', async (ev) => {
        const p = ev.payload as { conversationId: string; messageId: string; orderId: string | null };
        if (p.orderId) ctx.io?.to(rooms.order(p.orderId)).emit('message.created', p);
      });
      outbox.on('notification.created', async (ev) => {
        const p = ev.payload as { userId: string; notificationId: string; kind: string };
        ctx.io?.to(rooms.user(p.userId)).emit('notification.created', { notificationId: p.notificationId, kind: p.kind });
      });
    },
  };
}

export type CommunicationService = ReturnType<typeof createCommunicationService>;
