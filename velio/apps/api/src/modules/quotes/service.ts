import type { CreateQuoteInput, Quote, QuoteKind, QuoteStatus } from '@velio/contracts';
import { rooms } from '@velio/contracts';
import { and, asc, eq } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { quotes } from '../../db/schema';
import { errors } from '../../lib/errors';
import { type Exec, iso } from '../_shared/util';
import type { PlatformService } from '../admin/platform';
import type { CommunicationService } from '../communication/service';
import type { OrderActor, OrderRow } from '../orders/types';

export type QuoteRow = typeof quotes.$inferSelect;

export interface QuotesLateDeps {
  orders: {
    getById(id: string): Promise<OrderRow>;
    transition(orderId: string, action: 'provider.submit_quote' | 'customer.approve_quote' | 'customer.reject_quote', actor: OrderActor, payload?: Record<string, unknown>): Promise<OrderRow>;
    addApprovedAdditional(orderId: string, amountCents: number): Promise<void>;
    appendEvent(orderId: string, e: { type: string; actor: OrderActor; payload?: Record<string, unknown> }): Promise<unknown>;
  };
  payments: { authorizeAdditional(order: OrderRow, quote: { id: string; amountCents: number }): Promise<unknown> };
  analytics: { track(name: 'quote_sent' | 'quote_approved' | 'quote_rejected', ref: { userId?: string | null; providerId?: string | null; orderId?: string | null }): Promise<void> };
}

const INITIAL_STATES: Record<string, string[]> = {
  QUOTE: ['UNDER_REVIEW', 'QUOTE_REJECTED'],
  CONCIERGE: ['PLAN_APPROVED'],
};
const ADDITIONAL_STATES = new Set(['IN_PROGRESS', 'AT_DESTINATION', 'THIRD_PARTY_IN_PROGRESS', 'THIRD_PARTY_DONE']);

export function toQuoteDto(q: QuoteRow): Quote {
  return {
    id: q.id,
    orderId: q.orderId,
    providerId: q.providerId,
    kind: q.kind as QuoteKind,
    status: q.status as QuoteStatus,
    items: q.items,
    amountCents: q.amountCents,
    notes: q.notes,
    expiresAt: iso(q.expiresAt),
    decidedAt: iso(q.decidedAt),
    createdAt: q.createdAt.toISOString(),
  };
}

export function createQuotesService(ctx: AppContext, deps: { communication: CommunicationService; platform: PlatformService }) {
  const { db, adapters, outbox, scheduler } = ctx;
  let late: QuotesLateDeps | null = null;
  const L = () => {
    if (!late) throw new Error('Módulo quotes usado antes de bind()');
    return late;
  };

  async function getQuote(id: string): Promise<QuoteRow> {
    const [q] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
    if (!q) throw errors.notFound('Orçamento');
    return q;
  }

  async function insert(order: OrderRow, providerId: string, kind: QuoteKind, items: Quote['items'], notes: string | null, expiresInMinutes: number): Promise<QuoteRow> {
    const now = adapters.clock.now();
    const amountCents = items.reduce((s, i) => s + Math.round(i.quantity * i.unitPriceCents), 0);
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60_000);
    const [row] = await db.insert(quotes).values({ orderId: order.id, providerId, kind, status: 'SENT', items, amountCents, notes, expiresAt }).returning();
    if (!row) throw new Error('Falha ao criar orçamento');
    await scheduler.schedule(db, { kind: 'quote.expire', runAt: expiresAt, payload: { quoteId: row.id }, dedupeKey: `quote.expire:${row.id}` });
    await outbox.publish(db, { type: 'quote.created', aggregateType: 'order', aggregateId: order.id, payload: { quoteId: row.id, orderId: order.id, amountCents, customerId: order.customerId, kind } });
    return row;
  }

  async function decide(q: QuoteRow, status: 'APPROVED' | 'REJECTED' | 'EXPIRED', byUserId: string | null): Promise<QuoteRow> {
    const [row] = await db.update(quotes).set({ status, decidedAt: adapters.clock.now(), decidedByUserId: byUserId }).where(and(eq(quotes.id, q.id), eq(quotes.status, 'SENT'))).returning();
    if (!row) throw errors.conflict('Orçamento já decidido ou expirado', { status: q.status });
    await outbox.publish(db, { type: 'quote.decided', aggregateType: 'order', aggregateId: q.orderId, payload: { quoteId: q.id, orderId: q.orderId, status, providerId: q.providerId } });
    return row;
  }

  return {
    bind(l: QuotesLateDeps) {
      late = l;
    },

    async listForOrder(exec: Exec, orderId: string): Promise<Quote[]> {
      const rows = await exec.select().from(quotes).where(eq(quotes.orderId, orderId)).orderBy(asc(quotes.createdAt));
      return rows.map(toQuoteDto);
    },

    /** Prestador atribuído envia orçamento INITIAL (QUOTE) ou ADDITIONAL (em execução). */
    async create(orderId: string, provider: { userId: string; providerId: string }, input: CreateQuoteInput): Promise<Quote> {
      const l = L();
      const order = await l.orders.getById(orderId);
      if (order.providerId !== provider.providerId) throw errors.forbidden('Somente o prestador atribuído envia orçamentos');
      const existing = await db.select().from(quotes).where(and(eq(quotes.orderId, orderId), eq(quotes.kind, input.kind), eq(quotes.status, 'SENT')));
      if (existing.length > 0) throw errors.conflict('Já existe um orçamento aguardando decisão do cliente');
      if (input.kind === 'INITIAL') {
        const allowed = INITIAL_STATES[order.workflowKind] ?? [];
        if (!allowed.includes(order.status)) throw errors.invalidTransition('Orçamento inicial não cabe nesta etapa', { status: order.status, allowedActions: [] });
      } else {
        if (!ADDITIONAL_STATES.has(order.status)) throw errors.invalidTransition('Orçamento adicional só durante a execução', { status: order.status, allowedActions: [] });
        if (!order.flags.allowsAdditionalQuote) throw errors.unprocessable('Esta categoria não permite orçamento adicional');
      }
      const settings = await deps.platform.getSettings();
      const expires = input.kind === 'ADDITIONAL' ? Math.min(input.expiresInMinutes, settings.quotes.additionalQuoteExpiresMinutes) : input.expiresInMinutes;
      const row = await insert(order, provider.providerId, input.kind, input.items, input.notes ?? null, expires);
      if (input.kind === 'INITIAL') {
        await l.orders.transition(orderId, 'provider.submit_quote', { type: 'provider', userId: provider.userId, providerId: provider.providerId }, { quoteId: row.id, amountCents: row.amountCents });
      } else {
        await deps.communication.notifyUser(order.customerId, 'quote_available', { orderId, quoteId: row.id, amountCents: row.amountCents }, { body: `Orçamento adicional de R$ ${(row.amountCents / 100).toFixed(2).replace('.', ',')} aguardando sua aprovação.` });
        await deps.communication.systemMessage(orderId, 'quote_additional', `Orçamento adicional enviado: R$ ${(row.amountCents / 100).toFixed(2).replace('.', ',')}.`);
        await l.orders.appendEvent(orderId, { type: 'quote.created', actor: { type: 'provider', userId: provider.userId, providerId: provider.providerId }, payload: { quoteId: row.id, kind: 'ADDITIONAL', amountCents: row.amountCents } });
        await l.analytics.track('quote_sent', { providerId: provider.providerId, orderId });
      }
      return toQuoteDto(row);
    },

    /** Concierge: orçamento INITIAL criado pelo sistema a partir do plano aprovado. */
    async createSystemInitial(order: OrderRow, amountCents: number, items: Quote['items'], notes: string | null): Promise<Quote> {
      const row = await insert(order, order.providerId ?? 'platform', 'INITIAL', items.length > 0 ? items : [{ description: 'Concierge', quantity: 1, unitPriceCents: amountCents }], notes, 24 * 60);
      return toQuoteDto(row);
    },

    async approve(quoteId: string, user: { userId: string }): Promise<Quote> {
      const l = L();
      const q = await getQuote(quoteId);
      const order = await l.orders.getById(q.orderId);
      if (order.customerId !== user.userId) throw errors.forbidden('Somente o cliente da ordem decide o orçamento');
      if (q.status !== 'SENT') throw errors.conflict('Orçamento não está aguardando decisão', { status: q.status });
      if (q.expiresAt && q.expiresAt.getTime() < adapters.clock.now().getTime()) {
        await decide(q, 'EXPIRED', null);
        throw errors.conflict('Orçamento expirado');
      }
      const row = await decide(q, 'APPROVED', user.userId);
      await scheduler.cancelByDedupe(db, `quote.expire:${q.id}`);
      if (q.kind === 'INITIAL') {
        await l.orders.transition(q.orderId, 'customer.approve_quote', { type: 'customer', userId: user.userId }, { quoteId: q.id, amountCents: q.amountCents });
      } else {
        await l.orders.addApprovedAdditional(q.orderId, q.amountCents);
        const fresh = await l.orders.getById(q.orderId);
        await l.payments.authorizeAdditional(fresh, { id: q.id, amountCents: q.amountCents });
        await deps.communication.notifyProvider(q.providerId, 'generic', { orderId: q.orderId, quoteId: q.id }, { title: 'Orçamento aprovado', body: 'O cliente aprovou o orçamento adicional.' });
        await l.orders.appendEvent(q.orderId, { type: 'quote.decided', actor: { type: 'customer', userId: user.userId }, payload: { quoteId: q.id, status: 'APPROVED', amountCents: q.amountCents } });
      }
      await l.analytics.track('quote_approved', { userId: user.userId, orderId: q.orderId });
      return toQuoteDto(row);
    },

    async reject(quoteId: string, user: { userId: string }): Promise<Quote> {
      const l = L();
      const q = await getQuote(quoteId);
      const order = await l.orders.getById(q.orderId);
      if (order.customerId !== user.userId) throw errors.forbidden('Somente o cliente da ordem decide o orçamento');
      if (q.status !== 'SENT') throw errors.conflict('Orçamento não está aguardando decisão', { status: q.status });
      const row = await decide(q, 'REJECTED', user.userId);
      await scheduler.cancelByDedupe(db, `quote.expire:${q.id}`);
      if (q.kind === 'INITIAL') {
        await l.orders.transition(q.orderId, 'customer.reject_quote', { type: 'customer', userId: user.userId }, { quoteId: q.id });
      } else {
        await deps.communication.notifyProvider(q.providerId, 'generic', { orderId: q.orderId, quoteId: q.id }, { title: 'Orçamento recusado', body: 'O cliente recusou o adicional. Conclua o escopo original.' });
        await l.orders.appendEvent(q.orderId, { type: 'quote.decided', actor: { type: 'customer', userId: user.userId }, payload: { quoteId: q.id, status: 'REJECTED' } });
      }
      await l.analytics.track('quote_rejected', { userId: user.userId, orderId: q.orderId });
      return toQuoteDto(row);
    },

    /** Job quote.expire. */
    async expire(quoteId: string) {
      const q = await getQuote(quoteId);
      if (q.status !== 'SENT') return;
      await decide(q, 'EXPIRED', null);
    },

    registerRealtime() {
      outbox.on('quote.created', async (ev) => {
        const p = ev.payload as { quoteId: string; orderId: string; amountCents: number; customerId: string };
        const payload = { quoteId: p.quoteId, orderId: p.orderId, amountCents: p.amountCents };
        ctx.io?.to(rooms.order(p.orderId)).emit('quote.created', payload);
        ctx.io?.to(rooms.user(p.customerId)).emit('quote.created', payload);
      });
      outbox.on('quote.decided', async (ev) => {
        const p = ev.payload as { quoteId: string; orderId: string; status: string; providerId: string };
        const payload = { quoteId: p.quoteId, orderId: p.orderId, status: p.status };
        ctx.io?.to(rooms.order(p.orderId)).emit('quote.decided', payload);
        ctx.io?.to(rooms.provider(p.providerId)).emit('quote.decided', payload);
      });
    },
  };
}

export type QuotesService = ReturnType<typeof createQuotesService>;
