import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PHOTO, type TestApp, transition } from '../harness';

describe('A) cliente chama encanador imediato', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('percorre request → OFFERED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED → REVIEWED com pagamento e ledger', async () => {
    const customer = await t.asCustomer('+5511999990001', { pushToken: 'ExponentPushToken[cliente-a]' });
    const p1 = await t.asProvider('+5511988880001', {
      categorySlugs: ['hidraulica'],
      lat: -23.562,
      lng: -46.683,
    });
    const p2 = await t.asProvider('+5511988880002', {
      categorySlugs: ['hidraulica'],
      lat: -23.565,
      lng: -46.69,
    });
    const p3 = await t.asProvider('+5511988880003', {
      categorySlugs: ['hidraulica'],
      lat: -23.57,
      lng: -46.7,
    });
    const p4 = await t.asProvider('+5511988880004', {
      categorySlugs: ['hidraulica'],
      lat: -23.58,
      lng: -46.71,
    });
    const service = await t.read.service('encanador-visita');
    expect(service).toBeDefined();

    const created = await customer.api.post<{
      id: string;
      status: string;
      startPin: string;
      priceCents: number;
      totalCents: number;
    }>('/v1/requests', {
      serviceId: service?.id,
      addressId: customer.addressId,
      schedule: { mode: 'NOW' },
      paymentMethodId: customer.paymentMethodId,
      notes: 'Vazamento na pia',
      idempotencyKey: 'req-a-0001',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.status).toBe('REQUESTED');
    expect(created.body.startPin).toMatch(/^\d{4}$/);
    expect(created.body.priceCents).toBe(8000);
    const orderId = created.body.id;

    // Idempotência: mesma chave devolve a mesma ordem.
    const again = await customer.api.post<{ id: string }>('/v1/requests', {
      serviceId: service?.id,
      addressId: customer.addressId,
      schedule: { mode: 'NOW' },
      idempotencyKey: 'req-a-0001',
    });
    expect(again.body.id).toBe(orderId);

    await t.drain();
    let order = await t.read.order(orderId);
    expect(order?.status).toBe('OFFERED');
    const offers = await t.read.offers(orderId);
    expect(offers).toHaveLength(3); // onda 1 oferta aos 3 melhores
    expect(offers.map((o) => o.providerId).sort()).toEqual(
      [p1.providerId, p2.providerId, p3.providerId].sort(),
    );
    const types = (await t.read.events(orderId)).map((e) => `${e.type}:${e.toStatus}`);
    expect(types).toEqual([
      'order.created:REQUESTED',
      'order.transitioned:MATCHING',
      'order.transitioned:OFFERED',
    ]);

    // Oferta visível para o prestador, com localização aproximada e sem PIN.
    const myOffers =
      await p1.api.get<
        Array<{
          id: string;
          orderId: string;
          summary: { serviceName: string; approxLocation: { neighborhood: string } };
        }>
      >('/v1/providers/me/offers');
    expect(myOffers.body).toHaveLength(1);
    expect(myOffers.body[0]?.summary.serviceName).toBe(service?.name);
    expect(myOffers.body[0]?.summary.approxLocation.neighborhood).toBe('Pinheiros');
    const offerP2 = offers.find((o) => o.providerId === p2.providerId);
    expect(offerP2).toBeDefined();

    // p1 aceita; pré-autorização no cartão.
    const offerP1 = offers.find((o) => o.providerId === p1.providerId);
    const accepted = await p1.api.post<{ status: string; providerId: string; startPin: string | null }>(
      `/v1/offers/${offerP1?.id}/accept`,
    );
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.status).toBe('ACCEPTED');
    expect(accepted.body.providerId).toBe(p1.providerId);
    expect(accepted.body.startPin).toBeNull(); // prestador não vê o PIN
    await t.drain();

    // Outro prestador tentando aceitar recebe 409.
    const late = await p2.api.post<{ error: { code: string } }>(`/v1/offers/${offerP2?.id}/accept`);
    expect(late.status).toBe(409);

    const intents = await t.read.intents(orderId);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.kind).toBe('INITIAL');
    expect(intents[0]?.status).toBe('AUTHORIZED');
    expect(intents[0]?.amountCents).toBe(8000);
    const remainingOffers = await t.read.offers(orderId);
    expect(remainingOffers.filter((o) => o.response === 'WITHDRAWN')).toHaveLength(2);
    expect((await t.read.provider(p1.providerId))?.availability).toBe('BUSY');
    expect(p4.providerId).toBeTruthy();

    // Cliente notificado (in-app + push).
    const notifs = await t.read.notifications(customer.userId);
    expect(notifs.some((n) => n.kind === 'provider_found' && n.channel === 'INAPP')).toBe(true);
    expect(
      t.push.sent.some(
        (p) => p.tokens.includes('ExponentPushToken[cliente-a]') && p.data?.kind === 'provider_found',
      ),
    ).toBe(true);

    // Chat da ordem com mensagem de sistema; telefone nunca exposto.
    const msgs = await customer.api.get<Array<{ senderType: string; body: string }>>(
      `/v1/orders/${orderId}/messages`,
    );
    expect(msgs.status).toBe(200);
    expect(msgs.body.some((m) => m.senderType === 'system')).toBe(true);
    expect(JSON.stringify(msgs.body)).not.toContain('+5511');

    expect((await transition(p1.api, orderId, 'provider.en_route')).body.status).toBe('EN_ROUTE');
    expect((await transition(p1.api, orderId, 'provider.arrive')).body.status).toBe('ARRIVED');

    // Start exige foto "antes" e PIN; PIN errado → 409 INVALID_TRANSITION com allowedActions.
    await p1.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'BEFORE', url: PHOTO });
    const wrongPin = created.body.startPin === '0000' ? '1111' : '0000';
    const bad = await p1.api.post<{
      error: { code: string; details: { status: string; allowedActions: string[] } };
    }>(`/v1/orders/${orderId}/start`, { pin: wrongPin });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('INVALID_TRANSITION');
    expect(bad.body.error.details.status).toBe('ARRIVED');
    expect(bad.body.error.details.allowedActions).toContain('provider.start');

    const started = await p1.api.post<{ status: string }>(`/v1/orders/${orderId}/start`, {
      pin: created.body.startPin,
    });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    expect(started.body.status).toBe('IN_PROGRESS');

    // Conclusão exige foto "depois".
    const noAfter = await p1.api.post<{ error: { code: string } }>(`/v1/orders/${orderId}/complete`, {});
    expect(noAfter.status).toBe(409);
    await p1.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'AFTER', url: PHOTO });
    const completed = await p1.api.post<{
      status: string;
      platformFeeCents: number;
      providerPayoutCents: number;
    }>(`/v1/orders/${orderId}/complete`, { notes: 'Trocado o sifão' });
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect(completed.body.status).toBe('COMPLETED');
    await t.drain();

    order = await t.read.order(orderId);
    expect(order?.platformFeeCents).toBe(1600); // 20% de R$ 80 (≥ mínimo R$ 5)
    expect(order?.providerPayoutCents).toBe(6400);
    const captured = (await t.read.intents(orderId))[0];
    expect(captured?.status).toBe('CAPTURED');
    expect(captured?.capturedCents).toBe(8000);
    expect(t.gateway.authorizations.get(captured?.gatewayRef ?? '')?.captured).toBe(8000);

    const ledger = await t.read.ledgerForOrder(orderId);
    expect(ledger.find((l) => l.kind === 'provider_payout')?.amountCents).toBe(6400);
    expect(ledger.find((l) => l.kind === 'platform_fee')?.amountCents).toBe(1600);
    expect(ledger.find((l) => l.kind === 'order_charge')?.amountCents).toBe(8000);
    const wallet = await p1.api.get<{ balanceCents: number }>('/v1/providers/me/wallet');
    expect(wallet.body.balanceCents).toBe(6400);
    expect((await t.read.provider(p1.providerId))?.availability).toBe('ONLINE');
    expect((await t.read.provider(p1.providerId))?.completedCount).toBe(1);

    // Cliente notificado da conclusão e pedido de avaliação.
    const kinds = (await t.read.notifications(customer.userId)).map((n) => n.kind);
    expect(kinds).toContain('service_completed');
    expect(kinds).toContain('review_request');

    // Avaliação pelo cliente → REVIEWED.
    const review = await customer.api.post<{ rating: number }>(`/v1/orders/${orderId}/review`, {
      rating: 5,
      tags: ['pontual'],
      comment: 'Excelente',
    });
    expect(review.status, JSON.stringify(review.body)).toBe(201);
    await t.drain();
    order = await t.read.order(orderId);
    expect(order?.status).toBe('REVIEWED');
    expect((await t.read.provider(p1.providerId))?.ratingAvg).toBe(5);
    const dup = await customer.api.post(`/v1/orders/${orderId}/review`, { rating: 4 });
    expect(dup.status).toBe(409);

    const detail = await customer.api.get<{
      events: Array<{ toStatus: string | null }>;
      allowedActions: string[];
    }>(`/v1/orders/${orderId}`);
    expect(detail.body.events.map((e) => e.toStatus).filter(Boolean)).toEqual([
      'REQUESTED',
      'MATCHING',
      'OFFERED',
      'ACCEPTED',
      'EN_ROUTE',
      'ARRIVED',
      'IN_PROGRESS',
      'COMPLETED',
      'REVIEWED',
    ]);
    expect(detail.body.allowedActions).toEqual([]);
    expect((await t.read.jobs('order.auto_close')).length).toBe(1);
  });
});
