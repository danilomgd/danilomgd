import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY, DEFAULT_NOW, HOUR, PHOTO, type TestApp, createTestApp, transition } from '../harness';

describe('B) agendar limpeza de ar-condicionado para daqui a 2 dias', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('matching começa 6h antes, lembretes 24h e 1h, execução no dia', async () => {
    const customer = await t.asCustomer('+5511999990002');
    const provider = await t.asProvider('+5511988880010', { categorySlugs: ['ar-condicionado'] });
    const eq = await customer.api.post<{ id: string }>('/v1/me/equipments', { kind: 'AIR_CONDITIONER', brand: 'LG', room: 'Quarto', btus: 12000, lastMaintenanceAt: new Date(DEFAULT_NOW.getTime() - 200 * DAY).toISOString() });
    expect(eq.status).toBe(201);
    const service = await t.read.service('ac-limpeza');
    const startsAt = new Date(DEFAULT_NOW.getTime() + 2 * DAY);

    const created = await customer.api.post<{ id: string; status: string; startPin: string; scheduledFor: string }>('/v1/requests', {
      serviceId: service?.id,
      addressId: customer.addressId,
      equipmentId: eq.body.id,
      schedule: { mode: 'SCHEDULED', startsAt: startsAt.toISOString(), windowMinutes: 60 },
      options: { btus: 'ate18' },
      paymentMethodId: customer.paymentMethodId,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.status).toBe('SCHEDULED');
    const orderId = created.body.id;
    await t.drain();
    expect((await t.read.order(orderId))?.status).toBe('SCHEDULED'); // nada acontece agora

    const dispatchJob = (await t.read.jobs('dispatch.start'))[0];
    expect(dispatchJob?.runAt.toISOString()).toBe(new Date(startsAt.getTime() - 6 * HOUR).toISOString());
    expect(await t.read.jobs('booking.remind')).toHaveLength(2);

    // 24h antes: lembrete ao cliente (ainda sem prestador), ordem continua SCHEDULED.
    await t.advanceTo(new Date(startsAt.getTime() - 24 * HOUR));
    let notifs = await t.read.notifications(customer.userId);
    expect(notifs.filter((n) => n.kind === 'booking_reminder')).toHaveLength(1);
    expect((await t.read.order(orderId))?.status).toBe('SCHEDULED');

    // Home mostra agendamento próximo como dica contextual.
    const home = await customer.api.get<{ contextHint: { source: string } }>('/v1/catalog/home');
    expect(home.body.contextHint.source).toBe('upcoming_booking');

    // 6h antes: matching → ofertas → aceite.
    await t.advanceTo(new Date(startsAt.getTime() - 6 * HOUR));
    expect((await t.read.order(orderId))?.status).toBe('OFFERED');
    const offers = await provider.api.get<Array<{ id: string; summary: { scheduledFor: string } }>>('/v1/providers/me/offers');
    expect(offers.body).toHaveLength(1);
    expect(offers.body[0]?.summary.scheduledFor).toBe(startsAt.toISOString());
    const accepted = await provider.api.post<{ status: string }>(`/v1/offers/${offers.body[0]?.id}/accept`);
    expect(accepted.body.status).toBe('ACCEPTED');
    await t.drain();
    expect((await t.read.intents(orderId))[0]?.status).toBe('AUTHORIZED');

    // 1h antes: lembrete para cliente e prestador; ordem vai a REMINDED.
    await t.advanceTo(new Date(startsAt.getTime() - 1 * HOUR));
    expect((await t.read.order(orderId))?.status).toBe('REMINDED');
    notifs = await t.read.notifications(customer.userId);
    expect(notifs.filter((n) => n.kind === 'booking_reminder')).toHaveLength(2);
    expect((await t.read.notifications(provider.userId)).some((n) => n.kind === 'booking_reminder')).toBe(true);

    // Execução no dia.
    await t.advanceTo(startsAt);
    expect((await transition(provider.api, orderId, 'provider.en_route')).body.status).toBe('EN_ROUTE');
    expect((await transition(provider.api, orderId, 'provider.arrive')).body.status).toBe('ARRIVED');
    await provider.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'BEFORE', url: PHOTO });
    const started = await provider.api.post<{ status: string }>(`/v1/orders/${orderId}/start`, { pin: created.body.startPin });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    await provider.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'AFTER', url: PHOTO });
    const done = await provider.api.post<{ status: string }>(`/v1/orders/${orderId}/complete`, {});
    expect(done.body.status).toBe('COMPLETED');
    await t.drain();
    expect((await t.read.intents(orderId))[0]?.status).toBe('CAPTURED');
    expect((await t.read.intents(orderId))[0]?.capturedCents).toBe(18000);
    // Equipamento marcado como mantido na conclusão.
    const eqs = await customer.api.get<Array<{ lastMaintenanceAt: string }>>('/v1/me/equipments');
    expect(new Date(eqs.body[0]?.lastMaintenanceAt ?? 0).getTime()).toBe(t.clock.now().getTime());
  });
});
