import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, MINUTE, PHOTO, requestAndAccept, type TestApp, transition } from '../harness';

describe('K) falhas e caminhos alternativos de pagamento', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('cartão recusado → FAILED + notificação; troca para PIX → webhook paga; duplicado ignorado; captura falha vira incidente', async () => {
    const customer = await t.asCustomer('+5511999990030', { cardToken: 'tok_sandbox_0002' });
    const provider = await t.asProvider('+5511988880080', { categorySlugs: ['hidraulica'] });
    const { orderId } = await requestAndAccept(t, customer, provider, 'encanador-visita');
    let order = await t.read.order(orderId);
    expect(order?.status).toBe('ACCEPTED'); // ordem continua
    let intents = await t.read.intents(orderId);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.status).toBe('FAILED');
    expect(intents[0]?.failureCode).toBe('card_declined');
    expect((await t.read.notifications(customer.userId)).some((n) => n.kind === 'payment_failed')).toBe(true);

    // Cliente troca para PIX.
    await customer.api.post('/v1/me/payment-methods', { kind: 'PIX' });
    const pix = await customer.api.post<{
      id: string;
      status: string;
      pix: { qrCode: string; copyPaste: string };
      gatewayRef: string;
    }>(`/v1/orders/${orderId}/payments`, { methodKind: 'PIX' });
    expect(pix.status, JSON.stringify(pix.body)).toBe(201);
    expect(pix.body.status).toBe('REQUIRES_ACTION');
    expect(pix.body.pix.qrCode).toContain('sandbox');

    // Webhook PAID → AUTHORIZED; webhook duplicado é ignorado (webhook_events).
    const body = t.gateway.settlePix(pix.body.gatewayRef);
    const wh = await t.anon.post<{ ok: boolean; duplicate?: boolean }>(
      '/v1/payments/webhooks/sandbox',
      JSON.parse(body),
    );
    expect(wh.status).toBe(200);
    expect(wh.body.duplicate).toBeUndefined();
    const dup = await t.anon.post<{ ok: boolean; duplicate?: boolean }>(
      '/v1/payments/webhooks/sandbox',
      JSON.parse(body),
    );
    expect(dup.body.duplicate).toBe(true);
    expect(await t.db.select().from(t.schema.webhookEvents)).toHaveLength(1);
    intents = await t.read.intents(orderId);
    expect(intents.find((i) => i.id === pix.body.id)?.status).toBe('AUTHORIZED');
    expect(
      (await customer.api.get<Array<{ status: string }>>(`/v1/orders/${orderId}/payments`)).body.map(
        (i) => i.status,
      ),
    ).toEqual(['FAILED', 'AUTHORIZED']);

    // Conclui: captura PIX ok.
    await transition(provider.api, orderId, 'provider.en_route');
    await transition(provider.api, orderId, 'provider.arrive');
    await provider.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'BEFORE', url: PHOTO });
    await provider.api.post(`/v1/orders/${orderId}/start`, { pin: (await t.read.order(orderId))?.startPin });
    await provider.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'AFTER', url: PHOTO });
    expect(
      (await provider.api.post<{ status: string }>(`/v1/orders/${orderId}/complete`, {})).body.status,
    ).toBe('COMPLETED');
    await t.drain();
    expect((await t.read.intents(orderId)).find((i) => i.id === pix.body.id)?.status).toBe('CAPTURED');
    order = await t.read.order(orderId);
    expect(order?.providerPayoutCents).toBe(6400);
  });

  it('captura falha (token 0004): ordem COMPLETED, intent FAILED, incidente de pagamento', async () => {
    const customer = await t.asCustomer('+5511999990031', { cardToken: 'tok_sandbox_0004' });
    const provider = await t.asProvider('+5511988880081', { categorySlugs: ['residencial'] });
    const { orderId } = await requestAndAccept(t, customer, provider, 'marido-de-aluguel');
    expect((await t.read.intents(orderId))[0]?.status).toBe('AUTHORIZED');
    await transition(provider.api, orderId, 'provider.en_route');
    await transition(provider.api, orderId, 'provider.arrive');
    await provider.api.post(`/v1/orders/${orderId}/start`, { pin: (await t.read.order(orderId))?.startPin });
    expect(
      (await provider.api.post<{ status: string }>(`/v1/orders/${orderId}/complete`, {})).body.status,
    ).toBe('COMPLETED');
    await t.drain();
    const intent = (await t.read.intents(orderId))[0];
    expect(intent?.status).toBe('FAILED');
    expect(intent?.failureCode).toBe('capture_failed');
    const incidents = await t.read.incidents(orderId);
    expect(incidents.map((i) => i.kind)).toEqual(['PAYMENT']);
    expect((await t.read.order(orderId))?.status).toBe('COMPLETED');
    expect(
      (await t.read.notifications(customer.userId)).filter((n) => n.kind === 'payment_failed').length,
    ).toBeGreaterThan(0);
  });

  it('PIX escolhido na criação: cobrança antecipada, matching só após webhook PAID', async () => {
    const customer = await t.asCustomer('+5511999990032', { cardToken: null });
    const pm = await customer.api.post<{ id: string }>('/v1/me/payment-methods', {
      kind: 'PIX',
      setDefault: true,
    });
    const provider = await t.asProvider('+5511988880082', { categorySlugs: ['hidraulica'] });
    const service = await t.read.service('encanador-visita');
    const created = await customer.api.post<{ id: string; status: string }>('/v1/requests', {
      serviceId: service?.id,
      addressId: customer.addressId,
      schedule: { mode: 'NOW' },
      paymentMethodId: pm.body.id,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const orderId = created.body.id;
    await t.drain();
    expect((await t.read.order(orderId))?.status).toBe('REQUESTED'); // aguarda PIX
    const intent = (await t.read.intents(orderId))[0];
    expect(intent?.kind).toBe('INITIAL');
    expect(intent?.status).toBe('REQUIRES_ACTION');
    expect(intent?.pixQrCode).toBeTruthy();
    expect(await t.read.jobs('payment.pix_timeout')).toHaveLength(1);
    expect((await provider.api.get<unknown[]>('/v1/providers/me/offers')).body).toHaveLength(0);

    await t.anon.post(
      '/v1/payments/webhooks/sandbox',
      JSON.parse(t.gateway.settlePix(intent?.gatewayRef ?? '')),
    );
    await t.drain();
    expect((await t.read.order(orderId))?.status).toBe('OFFERED');
    expect((await t.read.intents(orderId))[0]?.status).toBe('AUTHORIZED');
    expect((await provider.api.get<unknown[]>('/v1/providers/me/offers')).body).toHaveLength(1);
  });

  it('PIX não pago em 15 min: intent cancelada e ordem cancelada pela plataforma', async () => {
    const customer = await t.asCustomer('+5511999990033', { cardToken: null });
    const pm = await customer.api.post<{ id: string }>('/v1/me/payment-methods', {
      kind: 'PIX',
      setDefault: true,
    });
    const service = await t.read.service('encanador-visita');
    const created = await customer.api.post<{ id: string }>('/v1/requests', {
      serviceId: service?.id,
      addressId: customer.addressId,
      schedule: { mode: 'NOW' },
      paymentMethodId: pm.body.id,
    });
    const orderId = created.body.id;
    await t.advance(16 * MINUTE);
    const order = await t.read.order(orderId);
    expect(order?.status).toBe('CANCELLED_BY_PLATFORM');
    expect(order?.cancelReason).toBe('PIX não pago');
    expect((await t.read.intents(orderId))[0]?.status).toBe('CANCELLED');
    expect((await t.read.notifications(customer.userId)).some((n) => n.kind === 'order_cancelled')).toBe(
      true,
    );
  });
});
