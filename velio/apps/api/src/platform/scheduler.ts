import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { scheduledJobs } from '../db/schema';

export type JobHandler = (
  payload: Record<string, unknown>,
  job: { id: string; kind: string; attempts: number },
) => Promise<void>;

/**
 * Agendador em tabela Postgres (ADR-012). Lock otimista por `lockedBy`.
 * `runDue(now)` é determinístico para testes avançarem o relógio.
 */
export class Scheduler {
  private handlers = new Map<string, JobHandler>();
  private timer: NodeJS.Timeout | null = null;
  private readonly workerId = `w-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly log: {
      error: (o: unknown, msg?: string) => void;
      debug: (o: unknown, msg?: string) => void;
    },
  ) {}

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async schedule(
    tx: Tx | Db,
    job: {
      kind: string;
      runAt: Date;
      payload?: Record<string, unknown>;
      dedupeKey?: string;
      maxAttempts?: number;
    },
  ): Promise<void> {
    await tx
      .insert(scheduledJobs)
      .values({
        kind: job.kind,
        runAt: job.runAt,
        payload: job.payload ?? {},
        dedupeKey: job.dedupeKey ?? null,
        maxAttempts: job.maxAttempts ?? 5,
      })
      .onConflictDoNothing({ target: scheduledJobs.dedupeKey });
  }

  async cancelByDedupe(tx: Tx | Db, dedupeKey: string): Promise<void> {
    await tx
      .update(scheduledJobs)
      .set({ status: 'CANCELLED' })
      .where(and(eq(scheduledJobs.dedupeKey, dedupeKey), eq(scheduledJobs.status, 'PENDING')));
  }

  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runDue(new Date()), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Executa tudo que venceu até `now`. Retorna quantos jobs rodaram. */
  async runDue(now: Date, limit = 50): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let ran = 0;
    try {
      const due = await this.db
        .select()
        .from(scheduledJobs)
        .where(and(eq(scheduledJobs.status, 'PENDING'), lte(scheduledJobs.runAt, now)))
        .orderBy(asc(scheduledJobs.runAt))
        .limit(limit);
      for (const job of due) {
        const locked = await this.db
          .update(scheduledJobs)
          .set({
            status: 'RUNNING',
            lockedBy: this.workerId,
            lockedAt: now,
            attempts: sql`${scheduledJobs.attempts} + 1`,
          })
          .where(and(eq(scheduledJobs.id, job.id), eq(scheduledJobs.status, 'PENDING')))
          .returning({ id: scheduledJobs.id, attempts: scheduledJobs.attempts });
        if (locked.length === 0) continue;
        const attempts = locked[0]?.attempts ?? job.attempts + 1;
        const handler = this.handlers.get(job.kind);
        try {
          if (!handler) throw new Error(`Sem handler para job ${job.kind}`);
          await handler(job.payload ?? {}, { id: job.id, kind: job.kind, attempts });
          await this.db
            .update(scheduledJobs)
            .set({ status: 'DONE', lockedBy: null })
            .where(eq(scheduledJobs.id, job.id));
          ran++;
        } catch (err) {
          const message = String((err as Error)?.message ?? err);
          this.log.error({ err, jobId: job.id, kind: job.kind }, 'job failed');
          const failed = attempts >= job.maxAttempts;
          await this.db
            .update(scheduledJobs)
            .set({
              status: failed ? 'FAILED' : 'PENDING',
              lockedBy: null,
              lastError: message,
              runAt: failed ? job.runAt : new Date(now.getTime() + Math.min(60_000 * attempts, 600_000)),
            })
            .where(eq(scheduledJobs.id, job.id));
        }
      }
    } finally {
      this.running = false;
    }
    return ran;
  }
}
