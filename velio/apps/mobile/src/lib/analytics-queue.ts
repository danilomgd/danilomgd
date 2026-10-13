import type { AnalyticsEventName } from '@velio/contracts';

export interface QueuedEvent {
  name: AnalyticsEventName;
  occurredAt: string;
  properties?: Record<string, string | number | boolean | null>;
  orderId?: string;
}

export interface AnalyticsQueueOptions {
  /** Envia o lote. Deve rejeitar em falha para o lote voltar à fila. */
  send: (events: QueuedEvent[]) => Promise<void>;
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueue?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

/**
 * Fila de eventos de produto enviada em lote: a cada `batchSize` eventos (10) ou `flushIntervalMs` (30 s).
 * Pura: sem React Native, testável com temporizadores injetados.
 */
export class AnalyticsQueue {
  private queue: QueuedEvent[] = [];
  private timer: unknown = null;
  private flushing: Promise<void> | null = null;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueue: number;

  constructor(private readonly o: AnalyticsQueueOptions) {
    this.batchSize = o.batchSize ?? 10;
    this.flushIntervalMs = o.flushIntervalMs ?? 30_000;
    this.maxQueue = o.maxQueue ?? 500;
  }

  get size() {
    return this.queue.length;
  }

  track(name: AnalyticsEventName, properties?: QueuedEvent['properties'], orderId?: string): void {
    const occurredAt = new Date((this.o.now ?? Date.now)()).toISOString();
    const event: QueuedEvent = { name, occurredAt };
    if (properties && Object.keys(properties).length) event.properties = properties;
    if (orderId) event.orderId = orderId;
    this.queue.push(event);
    if (this.queue.length > this.maxQueue) this.queue.splice(0, this.queue.length - this.maxQueue);
    if (this.queue.length >= this.batchSize) {
      void this.flush();
    } else {
      this.schedule();
    }
  }

  private schedule() {
    if (this.timer !== null) return;
    const set = this.o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.timer = set(() => {
      this.timer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  /** Envia tudo que está na fila (em lotes de até 100, limite do contrato). */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.timer !== null) {
      (this.o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) return Promise.resolve();
    const batch = this.queue.splice(0, 100);
    this.flushing = this.o
      .send(batch)
      .catch(() => {
        // devolve ao início da fila preservando ordem; tenta de novo no próximo ciclo
        this.queue.unshift(...batch);
        if (this.queue.length > this.maxQueue) this.queue.length = this.maxQueue;
        this.schedule();
      })
      .finally(() => {
        this.flushing = null;
        if (this.queue.length >= this.batchSize) void this.flush();
      });
    return this.flushing;
  }
}
