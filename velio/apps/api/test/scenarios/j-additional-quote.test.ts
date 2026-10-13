import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PHOTO, requestAndAccept, type TestApp, transition } from '../harness';

async function startOrder(t: TestApp, phoneSuffix: string) {
  const customer = await t.asCustomer(`+55119999900${phoneSuffix}`);
  const provider = await t.asProvider(`+55119888800${phoneSuffix}`, { categorySlugs: ['hidraulica'] });
  const { orderId } = await requestAndAccept(t, customer, provider, 'encanador-visita');
  await transition(provider.api, orderId, 'provider.en_route');
  await transition(provider.api, orderId, 'provider.arrive');
  await provider.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'BEFORE', url: PHOTO });
  const pin = (await t.read.order(orderId))?.startPin;
  expect(
    (await provider.api.post<{ status: string }>(`/v1/orders/${orderId}/start`, { pin })).body.status,
  ).toBe('IN_PROGRESS');
  await provider.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'AFTER', url: PHOTO });
  const quote = await provider.api.post<{ id: string; status: string; amountCents: number }>(
    `/v1/orders/${orderId}/quotes`,
    {
      kind: 'ADDITIONAL',
      items: [{ description: 'Troca de registro', quantity: 1, unitPriceCents: 12000 }],
      notes: 'Registro antigo com vazamento',
    },
  );
  expect(quote.status, JSON.stringify(quote.body)).toBe(201);
  expect(quote.body.status).toBe('SENT');
  expect(quote.body.amountCents).toBe(12000);
  return { customer, provider, orderId, quoteId: quote.body.id };
}

describe('J) orçamento adicional de R$ 120 em IN_PROGRESS', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('bloqueia a conclusão com orçamento SENT; recusado → cobra só o original', async () => {
    const { customer, provider, orderId, quoteId } = await startOrder(t, '20');
    expect((await t.read.notifications(customer.userId)).some((n) => n.kind === 'quote_available')).toBe(
      true,
    );
    const blocked = await provider.api.post<{ error: { code: string } }>(
      `/v1/orders/${orderId}/complete`,
      {},
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('INVALID_TRANSITION');
    // Segundo adicional enquanto um está pendente → 409.
    expect(
      (
        await provider.api.post(`/v1/orders/${orderId}/quotes`, {
          kind: 'ADDITIONAL',
          items: [{ description: 'x', quantity: 1, unitPriceCents: 100 }],
        })
      ).status,
    ).toBe(409);
    // Outro usuário não decide o orçamento.
    expect((await provider.api.post(`/v1/quotes/${quoteId}/reject`)).status).toBe(403);

    const rejected = await customer.api.post<{ status: string }>(`/v1/quotes/${quoteId}/reject`);
    expect(rejected.body.status).toBe('REJECTED');
    const done = await provider.api.post<{ status: string; totalCents: number }>(
      `/v1/orders/${orderId}/complete`,
      {},
    );
    expect(done.body.status).toBe('COMPLETED');
    await t.drain();
    const intents = await t.read.intents(orderId);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.capturedCents).toBe(8000);
    expect((await t.read.order(orderId))?.additionalApprovedCents).toBe(0);
  });

  it('aprovado → nova intent ADDITIONAL e captura total = original + 120', async () => {
    const { customer, provider, orderId, quoteId } = await startOrder(t, '21');
    const approved = await customer.api.post<{ status: string }>(`/v1/quotes/${quoteId}/approve`);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
    await t.drain();
    let intents = await t.read.intents(orderId);
    expect(intents.map((i) => [i.kind, i.status, i.amountCents])).toEqual([
      ['INITIAL', 'AUTHORIZED', 8000],
      ['ADDITIONAL', 'AUTHORIZED', 12000],
    ]);
    expect(intents[1]?.quoteId).toBe(quoteId);
    expect(intents[1]?.paymentMethodId).toBe(intents[0]?.paymentMethodId);
    const order = await t.read.order(orderId);
    expect(order?.additionalApprovedCents).toBe(12000);
    expect(order?.totalCents).toBe(20000);

    const done = await provider.api.post<{ status: string }>(`/v1/orders/${orderId}/complete`, {});
    expect(done.body.status).toBe('COMPLETED');
    await t.drain();
    intents = await t.read.intents(orderId);
    expect(intents.every((i) => i.status === 'CAPTURED')).toBe(true);
    expect(intents.reduce((s, i) => s + i.capturedCents, 0)).toBe(20000);
    const final = await t.read.order(orderId);
    expect(final?.platformFeeCents).toBe(4000); // 20% de R$ 200
    expect(final?.providerPayoutCents).toBe(16000);
    expect(
      (await provider.api.get<{ balanceCents: number }>('/v1/providers/me/wallet')).body.balanceCents,
    ).toBe(16000);
  });
});
