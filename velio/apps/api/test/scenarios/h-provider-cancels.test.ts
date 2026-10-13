import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, requestAndAccept, type TestApp } from '../harness';

describe('H) prestador cancela após aceitar', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('ordem volta a MATCHING com nova rodada, cancellationRate sobe e cliente é notificado', async () => {
    const customer = await t.asCustomer('+5511999990008');
    const p1 = await t.asProvider('+5511988880051', {
      categorySlugs: ['residencial'],
      lat: -23.561,
      lng: -46.682,
    });
    const p2 = await t.asProvider('+5511988880052', {
      categorySlugs: ['residencial'],
      lat: -23.563,
      lng: -46.684,
    });
    const { orderId } = await requestAndAccept(t, customer, p1, 'marido-de-aluguel');
    expect((await t.read.order(orderId))?.providerId).toBe(p1.providerId);
    expect((await t.read.offers(orderId)).find((o) => o.providerId === p2.providerId)?.response).toBe(
      'WITHDRAWN',
    );
    const before = await t.read.provider(p1.providerId);
    expect(before?.cancellationRate ?? 0).toBe(0);

    const cancelled = await p1.api.post<{ status: string; providerId: string | null }>(
      `/v1/orders/${orderId}/cancel`,
      { reason: 'Imprevisto pessoal' },
    );
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    await t.drain();

    const order = await t.read.order(orderId);
    expect(order?.status).toBe('OFFERED'); // nova rodada já ofertada
    expect(order?.providerId).toBeNull();
    const rounds = await t.read.rounds(orderId);
    expect(rounds).toHaveLength(2);
    const pending = (await t.read.offers(orderId)).filter((o) => o.response === 'PENDING');
    expect(pending.map((o) => o.providerId)).toEqual([p2.providerId]); // quem cancelou não recebe de novo
    expect((await t.read.events(orderId)).map((e) => e.toStatus).filter(Boolean)).toEqual([
      'REQUESTED',
      'MATCHING',
      'OFFERED',
      'ACCEPTED',
      'MATCHING',
      'OFFERED',
    ]);

    const after = await t.read.provider(p1.providerId);
    expect(after?.cancellationRate ?? 0).toBeGreaterThan(0);
    expect(after?.availability).toBe('ONLINE');
    expect((await t.read.notifications(customer.userId)).some((n) => n.kind === 'order_cancelled')).toBe(
      true,
    );

    // p2 aceita a nova oferta; a pré-autorização anterior é reaproveitada (idempotente).
    const acc = await p2.api.post<{ status: string }>(`/v1/offers/${pending[0]?.id}/accept`);
    expect(acc.body.status).toBe('ACCEPTED');
    await t.drain();
    const intents = await t.read.intents(orderId);
    expect(intents.filter((i) => i.status === 'AUTHORIZED')).toHaveLength(1);
  });
});
