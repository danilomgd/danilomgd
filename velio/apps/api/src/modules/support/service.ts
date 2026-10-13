import type { Dispute, DisputeStatus, OpenDisputeInput, ResolveDisputeInput, SupportTicket, SupportTicketInput } from '@velio/contracts';
import { rooms } from '@velio/contracts';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { disputes, incidents, supportTickets } from '../../db/schema';
import { errors } from '../../lib/errors';
import { iso } from '../_shared/util';
import type { CommunicationService } from '../communication/service';
import type { OrderActor, OrderRow } from '../orders/types';
import type { ReputationService } from '../reputation/service';

export type IncidentRow = typeof incidents.$inferSelect;

export interface SupportLateDeps {
  orders: {
    getById(id: string): Promise<OrderRow>;
    transition(orderId: string, action: 'customer.open_dispute' | 'operator.resolve_dispute', actor: OrderActor, payload?: Record<string, unknown>): Promise<OrderRow>;
  };
}

function toDisputeDto(d: typeof disputes.$inferSelect): Dispute {
  return {
    id: d.id,
    orderId: d.orderId,
    openedByUserId: d.openedByUserId,
    reason: d.reason,
    description: d.description,
    status: d.status as DisputeStatus,
    resolution: d.resolution ?? null,
    createdAt: d.createdAt.toISOString(),
    resolvedAt: iso(d.resolvedAt),
  };
}

export function createSupportService(ctx: AppContext, deps: { communication: CommunicationService; reputation: ReputationService }) {
  const { db, adapters, outbox } = ctx;
  let late: SupportLateDeps | null = null;
  const L = () => {
    if (!late) throw new Error('Módulo support usado antes de bind()');
    return late;
  };

  return {
    bind(l: SupportLateDeps) {
      late = l;
    },

    /** Incidente para a fila de operações + evento realtime `ops.order_needs_attention`. */
    async createIncident(i: { orderId: string | null; kind: string; title: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; details?: Record<string, unknown> }): Promise<IncidentRow> {
      const [row] = await db.insert(incidents).values({ orderId: i.orderId, kind: i.kind, title: i.title, severity: i.severity, details: i.details ?? {} }).returning();
      if (!row) throw new Error('Falha ao criar incidente');
      if (i.orderId) {
        await outbox.publish(db, { type: 'ops.order_needs_attention', aggregateType: 'order', aggregateId: i.orderId, payload: { orderId: i.orderId, reason: i.kind, incidentId: row.id } });
      }
      return row;
    },

    async listIncidents(status: string | null = 'OPEN') {
      return db.select().from(incidents).where(status ? eq(incidents.status, status) : undefined).orderBy(desc(incidents.createdAt)).limit(200);
    },

    async resolveIncident(id: string, userId: string) {
      const [row] = await db.update(incidents).set({ status: 'RESOLVED', assigneeUserId: userId, resolvedAt: adapters.clock.now() }).where(eq(incidents.id, id)).returning();
      if (!row) throw errors.notFound('Incidente');
      return row;
    },

    async openDispute(orderId: string, user: { userId: string }, input: z.infer<typeof OpenDisputeInput>): Promise<Dispute> {
      const l = L();
      const order = await l.orders.getById(orderId);
      if (order.customerId !== user.userId) throw errors.forbidden('Somente o cliente da ordem contesta');
      const [existing] = await db.select().from(disputes).where(eq(disputes.orderId, orderId)).limit(1);
      if (existing) throw errors.conflict('Já existe contestação para esta ordem');
      // A transição valida o estado (COMPLETED/REVIEWED) antes de a disputa existir.
      await l.orders.transition(orderId, 'customer.open_dispute', { type: 'customer', userId: user.userId }, { reason: input.reason });
      const [row] = await db.insert(disputes).values({ orderId, openedByUserId: user.userId, reason: input.reason, description: input.description, evidenceUrls: input.evidenceUrls }).returning();
      if (!row) throw new Error('Falha ao abrir contestação');
      await deps.reputation.recordDisputeOpened(user.userId);
      if (order.providerId) await deps.communication.notifyProvider(order.providerId, 'dispute_update', { orderId, disputeId: row.id }, { body: 'O cliente abriu uma contestação. Nossa equipe vai analisar.' });
      return toDisputeDto(row);
    },

    async listDisputes(status?: string): Promise<Dispute[]> {
      const rows = await db.select().from(disputes).where(status ? eq(disputes.status, status) : undefined).orderBy(desc(disputes.createdAt)).limit(200);
      return rows.map(toDisputeDto);
    },

    async getDispute(id: string): Promise<Dispute> {
      const [d] = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
      if (!d) throw errors.notFound('Contestação');
      return toDisputeDto(d);
    },

    /**
     * Resolução pelo operador: reembolso (parcial/total) via payments e ajuste do repasse retido via wallet,
     * ambos executados como efeitos da transição `operator.resolve_dispute`.
     */
    async resolveDispute(id: string, operator: { userId: string }, input: z.infer<typeof ResolveDisputeInput>): Promise<Dispute> {
      const l = L();
      const [d] = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
      if (!d) throw errors.notFound('Contestação');
      if (!['OPEN', 'UNDER_REVIEW'].includes(d.status)) throw errors.conflict('Contestação já resolvida', { status: d.status });
      const order = await l.orders.getById(d.orderId);
      const charged = Math.max(0, (order.priceCents ?? 0) + order.additionalApprovedCents - order.discountCents);
      const originalPayout = order.providerPayoutCents ?? 0;
      let refundCents = 0;
      switch (input.outcome) {
        case 'RESOLVED_CUSTOMER':
          refundCents = input.refundCents > 0 ? Math.min(input.refundCents, charged) : charged;
          break;
        case 'RESOLVED_SPLIT':
          refundCents = Math.min(input.refundCents, charged);
          break;
        default:
          refundCents = 0;
      }
      const providerPayoutCents = Math.max(0, originalPayout - refundCents);
      const resolution = { refundCents, providerPayoutCents, note: input.note };
      const now = adapters.clock.now();
      await db.update(disputes).set({ status: input.outcome, resolution, resolvedByUserId: operator.userId, resolvedAt: now }).where(eq(disputes.id, id));
      await l.orders.transition(d.orderId, 'operator.resolve_dispute', { type: 'operator', userId: operator.userId }, { disputeId: id, outcome: input.outcome, refundCents, providerPayoutCents, note: input.note });
      if (input.outcome === 'REJECTED') await deps.reputation.recordDisputeRejected(d.openedByUserId);
      await deps.communication.notifyUser(d.openedByUserId, 'dispute_update', { orderId: d.orderId, disputeId: id, outcome: input.outcome, refundCents });
      if (order.providerId) await deps.communication.notifyProvider(order.providerId, 'dispute_update', { orderId: d.orderId, disputeId: id, outcome: input.outcome });
      await db.update(incidents).set({ status: 'RESOLVED', resolvedAt: now, assigneeUserId: operator.userId }).where(and(eq(incidents.orderId, d.orderId), eq(incidents.kind, 'DISPUTE'), inArray(incidents.status, ['OPEN'])));
      return this.getDispute(id);
    },

    async createTicket(user: { userId: string }, input: z.infer<typeof SupportTicketInput>): Promise<SupportTicket> {
      const conversationId = await deps.communication.createSupportConversation(user.userId, input.orderId ?? null);
      const [row] = await db.insert(supportTickets).values({ userId: user.userId, orderId: input.orderId ?? null, conversationId, subject: input.subject, kind: input.kind, priority: input.kind === 'PAYMENT' || input.kind === 'COMPLAINT' ? 'HIGH' : 'NORMAL' }).returning();
      if (!row) throw new Error('Falha ao criar ticket');
      return this.toTicket(row);
    },

    toTicket(t: typeof supportTickets.$inferSelect): SupportTicket {
      return {
        id: t.id,
        userId: t.userId,
        orderId: t.orderId,
        subject: t.subject,
        kind: t.kind,
        status: t.status as SupportTicket['status'],
        priority: t.priority as SupportTicket['priority'],
        assigneeUserId: t.assigneeUserId,
        conversationId: t.conversationId,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    },

    async listTickets(userId: string | null): Promise<SupportTicket[]> {
      const rows = await db.select().from(supportTickets).where(userId ? eq(supportTickets.userId, userId) : undefined).orderBy(desc(supportTickets.createdAt)).limit(100);
      return rows.map((t) => this.toTicket(t));
    },

    registerRealtime() {
      outbox.on('ops.order_needs_attention', async (ev) => {
        const p = ev.payload as { orderId: string; reason: string };
        ctx.io?.to(rooms.ops()).emit('ops.order_needs_attention', { orderId: p.orderId, reason: p.reason });
      });
    },
  };
}

export type SupportService = ReturnType<typeof createSupportService>;
