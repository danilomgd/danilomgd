import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { domainEvents } from '../db/schema';

export interface DomainEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export type DomainEventHandler = (event: DomainEvent & { id: string; createdAt: Date }) => Promise<void> | void;

/**
 * Outbox transacional (ADR-009): eventos são gravados na mesma transação da mudança de estado
 * e despachados por um loop em processo. Handlers: Socket.IO, notificações, analytics, jobs.
 */
export class Outbox {
  private handlers = new Map<string, DomainEventHandler[]>();
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    private readonly db: Db,
    private readonly log: { error: (o: unknown, msg?: string) => void; debug: (o: unknown, msg?: string) => void },
  ) {}

  /** Grava dentro da transação corrente. */
  async publish(tx: Tx | Db, event: DomainEvent): Promise<void> {
    await tx.insert(domainEvents).values({
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
    });
  }

  on(type: string | '*', handler: DomainEventHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.drain(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Processa tudo que está pendente. Usado pelos testes para sincronizar. */
  async drain(): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    let processed = 0;
    try {
      // Em loop até esvaziar, porque handlers podem publicar novos eventos.
      for (let round = 0; round < 20; round++) {
        const pending = await this.db
          .select()
          .from(domainEvents)
          .where(and(isNull(domainEvents.dispatchedAt), or(lt(domainEvents.attempts, 5), isNull(domainEvents.lastError))))
          .orderBy(asc(domainEvents.createdAt))
          .limit(100);
        if (pending.length === 0) break;
        for (const ev of pending) {
          const hs = [...(this.handlers.get(ev.type) ?? []), ...(this.handlers.get('*') ?? [])];
          try {
            for (const h of hs) await h({ ...ev, payload: ev.payload ?? {} });
            await this.db.update(domainEvents).set({ dispatchedAt: new Date() }).where(eq(domainEvents.id, ev.id));
            processed++;
          } catch (err) {
            this.log.error({ err, eventId: ev.id, type: ev.type }, 'outbox handler failed');
            await this.db
              .update(domainEvents)
              .set({ attempts: sql`${domainEvents.attempts} + 1`, lastError: String((err as Error)?.message ?? err) })
              .where(eq(domainEvents.id, ev.id));
          }
        }
      }
    } finally {
      this.draining = false;
    }
    return processed;
  }
}
