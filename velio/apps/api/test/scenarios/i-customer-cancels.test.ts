import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, MINUTE, requestAndAccept, type TestApp, transition } from '../harness';

describe('I) cliente cancela em cada fase', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('antes do aceite: sem taxa', async () => {
    const customer = await t.asCustomer('+5511999990010');
    const service = await t.read.service('chaveiro');
    const created = await customer.api.post<{ id: string }>('/v1/requests', {
      serviceId: service?.id,
      addressId: customer.addressId,
      schedule: { mode: 'NOW' },
      paymentMethodId: customer.paymentMethodId,
    });
    await t.drain();
    const res = await customer.api.post<{ status: string }>(`/v1/orders/${created.body.id}/cancel`, {
      reason: 'Resolvi sozinho',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED_BY_CUSTOMER');
    await t.drain();
    expect(await t.read.intents(created.body.id)).toHaveLength(0);
    expect((await t.read.order(created.body.id))?.cancellationFeeCents).toBeNull();
  });

  it('30 min após o aceite: taxa fixa R$ 15 capturada e creditada ao prestador', async () => {
    const customer = await t.asCustomer('+5511999990011');
    const provider = await t.asProvider('+5511988880061', { categorySlugs: ['hidraulica'] });
    const { orderId } = await requestAndAccept(t, customer, provider, 'encanador-visita');
    await t.advance(30 * MINUTE);
    const res = await customer.api.post<{ status: string }>(`/v1/orders/${orderId}/cancel`, {
      reason: 'Mudança de planos',
    });
    expect(res.body.status).toBe('CANCELLED_BY_CUSTOMER');
    await t.drain();
    const intents = await t.read.intents(orderId);
    const fee = intents.find((i) => i.kind === 'CANCELLATION_FEE');
    expect(fee?.status).toBe('CAPTURED');
    expect(fee?.amountCents).toBe(1500);
    expect(intents.find((i) => i.kind === 'INITIAL')?.status).toBe('CANCELLED');
    expect((await t.read.order(orderId))?.cancellationFeeCents).toBe(1500);
    expect((await t.read.wallet('PROVIDER', provider.providerId))?.balanceCents).toBe(1500);
    expect((await t.read.provider(provider.providerId))?.availability).toBe('ONLINE');
    expect((await t.read.notifications(provider.userId)).some((n) => n.kind === 'order_cancelled')).toBe(
      true,
    );
    const risk = await t.db.select().from(t.schema.customerRiskSignals);
    expect(risk.find((r) => r.userId === customer.userId)?.lateCancellations90d).toBe(1);
  });

  it('dentro de 10 min do aceite: sem taxa', async () => {
    const customer = await t.asCustomer('+5511999990012');
    const provider = await t.asProvider('+5511988880062', { categorySlugs: ['hidraulica'] });
    const { orderId } = await requestAndAccept(t, customer, provider, 'encanador-visita');
    await t.advance(5 * MINUTE);
    const res = await customer.api.post<{ status: string }>(`/v1/orders/${orderId}/cancel`, {
      reason: 'Engano',
    });
    expect(res.body.status).toBe('CANCELLED_BY_CUSTOMER');
    await t.drain();
    expect((await t.read.intents(orderId)).some((i) => i.kind === 'CANCELLATION_FEE')).toBe(false);
  });

  it('EN_ROUTE: 20% com mínimo R$ 20', async () => {
    const customer = await t.asCustomer('+5511999990013');
    const provider = await t.asProvider('+5511988880063', { categorySlugs: ['hidraulica'] });
    const { orderId } = await requestAndAccept(t, customer, provider, 'encanador-visita');
    expect((await transition(provider.api, orderId, 'provider.en_route')).body.status).toBe('EN_ROUTE');
    const res = await customer.api.post<{ status: string }>(`/v1/orders/${orderId}/cancel`, {
      reason: 'Não posso mais receber',
    });
    expect(res.body.status).toBe('CANCELLED_BY_CUSTOMER');
    await t.drain();
    const fee = (await t.read.intents(orderId)).find((i) => i.kind === 'CANCELLATION_FEE');
    expect(fee?.amountCents).toBe(2000); // 20% de R$ 80 = R$ 16 → mínimo R$ 20
    expect(fee?.status).toBe('CAPTURED');
    expect((await t.read.wallet('PROVIDER', provider.providerId))?.balanceCents).toBe(2000);
  });

  it('IN_PROGRESS: recusado com 409', async () => {
    const customer = await t.asCustomer('+5511999990014');
    const provider = await t.asProvider('+5511988880064', { categorySlugs: ['residencial'] });
    const { orderId } = await requestAndAccept(t, customer, provider, 'marido-de-aluguel');
    await transition(provider.api, orderId, 'provider.en_route');
    await transition(provider.api, orderId, 'provider.arrive');
    const pin = (await t.read.order(orderId))?.startPin;
    const started = await provider.api.post<{ status: string }>(`/v1/orders/${orderId}/start`, { pin });
    expect(started.body.status).toBe('IN_PROGRESS');
    const res = await customer.api.post<{ error: { code: string; details: { status: string } } }>(
      `/v1/orders/${orderId}/cancel`,
      { reason: 'Quero cancelar' },
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.details.status).toBe('IN_PROGRESS');
  });
});
