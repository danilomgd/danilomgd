import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../harness';

describe('G) nenhum prestador aceita', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('3 ondas expiram, NO_PROVIDER_FOUND com incidente, operador atribui manualmente', async () => {
    const customer = await t.asCustomer('+5511999990007');
    // Onda 1 (5 km): 3 perto; onda 2 (10 km): 2 a ~8 km; onda 3 (20 km): 1 a ~15 km.
    const near = await Promise.all(
      ['+5511988880041', '+5511988880042', '+5511988880043'].map((p, i) =>
        t.asProvider(p, { categorySlugs: ['eletrica'], lat: -23.561 - i * 0.004, lng: -46.682 }),
      ),
    );
    const mid = await Promise.all(
      ['+5511988880044', '+5511988880045'].map((p, i) =>
        t.asProvider(p, { categorySlugs: ['eletrica'], lat: -23.561 - 0.07 - i * 0.003, lng: -46.682 }),
      ),
    );
    const far = await t.asProvider('+5511988880046', {
      categorySlugs: ['eletrica'],
      lat: -23.561 - 0.13,
      lng: -46.682,
    });
    const service = await t.read.service('eletricista-visita');

    const created = await customer.api.post<{ id: string }>('/v1/requests', {
      serviceId: service?.id,
      addressId: customer.addressId,
      schedule: { mode: 'NOW' },
      paymentMethodId: customer.paymentMethodId,
    });
    const orderId = created.body.id;
    await t.drain();
    expect((await t.read.order(orderId))?.status).toBe('OFFERED');
    let rounds = await t.read.rounds(orderId);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.offeredCount).toBe(3);
    expect(rounds[0]?.radiusKm).toBe(5);

    // Onda 1 expira (90 s) → onda 2 com raio 10 km.
    await t.advance(91_000);
    expect((await t.read.order(orderId))?.status).toBe('OFFERED');
    rounds = await t.read.rounds(orderId);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]?.outcome).toBe('EXPIRED');
    expect(rounds[1]?.radiusKm).toBe(10);
    expect(rounds[1]?.offeredCount).toBe(2);
    const offers = await t.read.offers(orderId);
    expect(offers.filter((o) => o.response === 'EXPIRED')).toHaveLength(3);
    expect(new Set(offers.filter((o) => o.response === 'PENDING').map((o) => o.providerId))).toEqual(
      new Set(mid.map((m) => m.providerId)),
    );

    // Onda 2 expira (120 s) → onda 3 com raio 20 km.
    await t.advance(121_000);
    rounds = await t.read.rounds(orderId);
    expect(rounds).toHaveLength(3);
    expect(rounds[2]?.radiusKm).toBe(20);
    expect(rounds[2]?.offeredCount).toBe(1);
    expect((await t.read.offers(orderId)).find((o) => o.providerId === far.providerId)?.response).toBe(
      'PENDING',
    );

    // Onda 3 expira (180 s) → NO_PROVIDER_FOUND + incidente + evento para ops.
    await t.advance(181_000);
    const order = await t.read.order(orderId);
    expect(order?.status).toBe('NO_PROVIDER_FOUND');
    const incidents = await t.read.incidents(orderId);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.kind).toBe('NO_PROVIDER');
    const evs = await t.read.domainEvents('ops.order_needs_attention');
    expect(evs.some((e) => e.aggregateId === orderId && e.dispatchedAt !== null)).toBe(true);
    const types = (await t.read.events(orderId)).map((e) => e.action).filter(Boolean);
    expect(types.filter((a) => a === 'system.wave_exhausted')).toHaveLength(3);
    expect(types.at(-1)).toBe('system.no_provider');
    // Prestadores que ignoraram as ofertas foram notificados da expiração.
    expect((await t.read.notifications(near[0]?.userId ?? '')).some((n) => n.kind === 'offer_expired')).toBe(
      true,
    );

    // Operador vê a ordem na fila de atenção e atribui manualmente com ranking.
    const admin = await t.asAdmin();
    const queue = await admin.api.get<{ items: Array<{ id: string }> }>('/v1/ops/orders', {
      attention: true,
    });
    expect(queue.body.items.map((o) => o.id)).toContain(orderId);
    const candidates = await admin.api.get<
      Array<{ providerId: string; score: number; breakdown: Record<string, number>; alreadyOffered: boolean }>
    >(`/v1/ops/orders/${orderId}/candidates`);
    expect(candidates.status).toBe(200);
    expect(candidates.body.length).toBe(6);
    expect(candidates.body[0]?.breakdown.proximity).toBeGreaterThan(0);
    expect(candidates.body.every((c) => c.alreadyOffered)).toBe(true);

    const assigned = await admin.api.post<{ status: string; providerId: string }>(
      `/v1/ops/orders/${orderId}/assign`,
      { providerId: near[1]?.providerId, note: 'Ligado por telefone' },
    );
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
    expect(assigned.body.status).toBe('ACCEPTED');
    expect(assigned.body.providerId).toBe(near[1]?.providerId);
    await t.drain();
    expect((await t.read.intents(orderId))[0]?.status).toBe('AUTHORIZED');
    const audit = await t.db.select().from(t.schema.auditLogs);
    expect(audit.some((a) => a.action === 'ops.assign' && a.targetId === orderId)).toBe(true);
    const slas = await admin.api.get<{ byStatus: Record<string, { total: number }> }>('/v1/ops/slas');
    expect(slas.status).toBe(200);
    expect(slas.body.byStatus.ACCEPTED?.total).toBe(1);
  });
});
