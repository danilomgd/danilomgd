import { describe, expect, it, vi } from 'vitest';
import { AnalyticsQueue, type QueuedEvent } from './analytics-queue';

function makeQueue(overrides: Partial<ConstructorParameters<typeof AnalyticsQueue>[0]> = {}) {
  const sent: QueuedEvent[][] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const q = new AnalyticsQueue({
    send: async (events) => {
      sent.push(events);
    },
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: (h) => {
      const i = (h as number) - 1;
      if (timers[i]) timers[i] = { fn: () => {}, ms: 0 };
    },
    now: () => 1_700_000_000_000,
    ...overrides,
  });
  return { q, sent, timers };
}

describe('AnalyticsQueue', () => {
  it('envia em lote ao atingir 10 eventos', async () => {
    const { q, sent } = makeQueue();
    for (let i = 0; i < 9; i++) q.track('home_view');
    expect(sent).toHaveLength(0);
    q.track('app_open', { role: 'customer' });
    await q.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(10);
    expect(sent[0]?.[9]).toMatchObject({
      name: 'app_open',
      properties: { role: 'customer' },
      occurredAt: '2023-11-14T22:13:20.000Z',
    });
  });

  it('agenda envio em 30 s quando o lote não fecha', async () => {
    const { q, sent, timers } = makeQueue();
    q.track('service_view', { slug: 'x' }, '11111111-1111-7111-8111-111111111111');
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(30_000);
    timers[0]?.fn();
    await q.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[0]?.orderId).toBe('11111111-1111-7111-8111-111111111111');
  });

  it('devolve o lote à fila quando o envio falha e preserva a ordem', async () => {
    let fail = true;
    const sent: QueuedEvent[][] = [];
    const { q } = makeQueue({
      send: async (events) => {
        if (fail) throw new Error('offline');
        sent.push(events);
      },
    });
    q.track('home_view');
    q.track('category_view');
    await q.flush();
    expect(q.size).toBe(2);
    fail = false;
    await q.flush();
    expect(sent[0]?.map((e) => e.name)).toEqual(['home_view', 'category_view']);
    expect(q.size).toBe(0);
  });

  it('limita a fila para não crescer sem fim offline', () => {
    const { q } = makeQueue({ send: vi.fn().mockRejectedValue(new Error('x')), maxQueue: 20 });
    for (let i = 0; i < 50; i++) q.track('home_view');
    expect(q.size).toBeLessThanOrEqual(20);
  });
});
