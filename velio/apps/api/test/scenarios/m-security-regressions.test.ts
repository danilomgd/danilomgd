import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, requestAndAccept, type TestApp } from '../harness';

/**
 * Regressões de segurança e dinheiro apontadas na revisão cruzada código × documentação
 * (19_GAP_ANALYSIS.md): PIN nunca vai para o prestador; PIX pago antes do matching é
 * devolvido integralmente quando o cliente cancela sem taxa.
 */
describe('M) regressões de segurança e dinheiro', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('PIN de início aparece para o cliente e nunca para o prestador (detalhe e listagens)', async () => {
    const customer = await t.asCustomer('+5511999990090');
    const provider = await t.asProvider('+5511988880090', { categorySlugs: ['hidraulica'] });
    // encanador-visita exige PIN (categoria hidraulica: requiresStartPin).
    const { orderId } = await requestAndAccept(t, customer, provider, 'encanador-visita');

    const asCustomer = await customer.api.get<{ startPin: string | null }>(`/v1/orders/${orderId}`);
    expect(asCustomer.status).toBe(200);
    expect(asCustomer.body.startPin).toMatch(/^\d{4}$/);

    const customerList = await customer.api.get<{ items: Array<{ id: string; startPin: string | null }> }>(
      '/v1/orders',
    );
    expect(customerList.body.items.find((o) => o.id === orderId)?.startPin).toMatch(/^\d{4}$/);

    const asProvider = await provider.api.get<{ startPin: string | null }>(`/v1/orders/${orderId}`);
    expect(asProvider.status).toBe(200);
    expect(asProvider.body.startPin).toBeNull();

    const providerList = await provider.api.get<{ items: Array<{ id: string; startPin: string | null }> }>(
      '/v1/providers/me/orders',
    );
    expect(providerList.body.items.find((o) => o.id === orderId)?.startPin).toBeNull();
  });

  it('PIX pago antes do matching é reembolsado integralmente em cancelamento sem taxa', async () => {
    const customer = await t.asCustomer('+5511999990091', { cardToken: null });
    const pm = await customer.api.post<{ id: string }>('/v1/me/payment-methods', {
      kind: 'PIX',
      setDefault: true,
    });
    await t.asProvider('+5511988880091', { categorySlugs: ['hidraulica'] });
    const service = await t.read.service('encanador-visita');
    const created = await customer.api.post<{ id: string }>('/v1/requests', {
      serviceId: service?.id,
      addressId: customer.addressId,
      schedule: { mode: 'NOW' },
      paymentMethodId: pm.body.id,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const orderId = created.body.id;
    await t.drain();

    const intent = (await t.read.intents(orderId))[0];
    expect(intent?.status).toBe('REQUIRES_ACTION');
    await t.anon.post(
      '/v1/payments/webhooks/sandbox',
      JSON.parse(t.gateway.settlePix(intent?.gatewayRef ?? '')),
    );
    await t.drain();
    expect((await t.read.intents(orderId))[0]?.status).toBe('AUTHORIZED');
    expect((await t.read.order(orderId))?.status).toBe('OFFERED');

    // Cancelamento antes do aceite: sem taxa, logo o valor pago deve voltar por inteiro.
    const res = await customer.api.post<{ status: string }>(`/v1/orders/${orderId}/cancel`, {
      reason: 'Não preciso mais',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe('CANCELLED_BY_CUSTOMER');
    await t.drain();

    const after = (await t.read.intents(orderId)).find((i) => i.kind === 'INITIAL');
    expect(after?.status).toBe('REFUNDED');
    expect(after?.refundedCents).toBe(after?.amountCents);
    expect((await t.read.order(orderId))?.cancellationFeeCents ?? null).toBeNull();
  });
});
