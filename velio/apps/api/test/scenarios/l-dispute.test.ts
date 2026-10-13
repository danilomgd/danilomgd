import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHOTO, type TestApp, createTestApp, requestAndAccept, transition } from '../harness';

describe('L) disputa após conclusão', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('hold do repasse, resolução SPLIT com reembolso parcial, ledger ajustado, CLOSED', async () => {
    const customer = await t.asCustomer('+5511999990040');
    const provider = await t.asProvider('+5511988880090', { categorySlugs: ['hidraulica'] });
    const { orderId } = await requestAndAccept(t, customer, provider, 'encanador-visita');
    await transition(provider.api, orderId, 'provider.en_route');
    await transition(provider.api, orderId, 'provider.arrive');
    await provider.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'BEFORE', url: PHOTO });
    await provider.api.post(`/v1/orders/${orderId}/start`, { pin: (await t.read.order(orderId))?.startPin });
    await provider.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'AFTER', url: PHOTO });
    expect((await provider.api.post<{ status: string }>(`/v1/orders/${orderId}/complete`, {})).body.status).toBe('COMPLETED');
    await t.drain();
    expect((await t.read.wallet('PROVIDER', provider.providerId))?.balanceCents).toBe(6400);

    // Prestador não pode abrir disputa; cliente abre.
    expect((await provider.api.post(`/v1/orders/${orderId}/disputes`, { reason: 'OTHER', description: 'teste de permissão' })).status).toBe(403);
    const dispute = await customer.api.post<{ id: string; status: string }>(`/v1/orders/${orderId}/disputes`, { reason: 'POOR_QUALITY', description: 'O vazamento voltou no dia seguinte.', evidenceUrls: [PHOTO] });
    expect(dispute.status, JSON.stringify(dispute.body)).toBe(201);
    expect(dispute.body.status).toBe('OPEN');
    await t.drain();
    expect((await t.read.order(orderId))?.status).toBe('DISPUTED');
    let wallet = await t.read.wallet('PROVIDER', provider.providerId);
    expect(wallet?.balanceCents).toBe(0);
    expect(wallet?.heldCents).toBe(6400);
    expect((await t.read.incidents(orderId)).map((i) => i.kind)).toEqual(['DISPUTE']);
    expect((await provider.api.get<{ heldCents: number }>('/v1/providers/me/wallet')).body.heldCents).toBe(6400);
    expect((await t.read.notifications(provider.userId)).some((n) => n.kind === 'dispute_update')).toBe(true);

    // Operador resolve SPLIT com reembolso de R$ 30.
    const admin = await t.asAdmin();
    const list = await admin.api.get<Array<{ id: string }>>('/v1/ops/disputes');
    expect(list.body.map((d) => d.id)).toContain(dispute.body.id);
    const resolved = await admin.api.post<{ status: string; resolution: { refundCents: number; providerPayoutCents: number } }>(`/v1/ops/disputes/${dispute.body.id}/resolve`, { outcome: 'RESOLVED_SPLIT', refundCents: 3000, note: 'Reembolso parcial acordado com as partes' });
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);
    expect(resolved.body.status).toBe('RESOLVED_SPLIT');
    expect(resolved.body.resolution).toEqual({ refundCents: 3000, providerPayoutCents: 3400, note: 'Reembolso parcial acordado com as partes' });
    await t.drain();

    const order = await t.read.order(orderId);
    expect(order?.status).toBe('CLOSED');
    expect(order?.providerPayoutCents).toBe(3400);
    const intent = (await t.read.intents(orderId))[0];
    expect(intent?.status).toBe('PARTIALLY_REFUNDED');
    expect(intent?.refundedCents).toBe(3000);
    expect(t.gateway.authorizations.get(intent?.gatewayRef ?? '')?.refunded).toBe(3000);
    wallet = await t.read.wallet('PROVIDER', provider.providerId);
    expect(wallet?.heldCents).toBe(0);
    expect(wallet?.balanceCents).toBe(3400);
    const ledger = await t.read.ledgerForOrder(orderId);
    expect(ledger.find((l) => l.kind === 'dispute_hold')?.amountCents).toBe(6400);
    expect(ledger.find((l) => l.kind === 'dispute_release')?.amountCents).toBe(3400);
    expect(ledger.find((l) => l.kind === 'dispute_adjustment')?.amountCents).toBe(3000);
    expect((await t.db.select().from(t.schema.refunds))).toHaveLength(1);
    expect((await t.read.notifications(customer.userId)).some((n) => n.kind === 'dispute_update')).toBe(true);
    expect((await t.read.incidents(orderId))[0]?.status).toBe('RESOLVED');
  });
});
