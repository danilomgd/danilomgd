import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHOTO, type TestApp, createTestApp, requestAndAccept, transition } from '../harness';

describe('D) lavanderia com cadeia de custódia', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('coleta exige scan do custodyCode; ciclo completo com 4 custody_events', async () => {
    const customer = await t.asCustomer('+5511999990004');
    const driver = await t.asProvider('+5511988880020', { categorySlugs: ['lavanderia'] });
    const { orderId } = await requestAndAccept(t, customer, driver, 'lavanderia-coleta', { options: { sacos: 1 } });
    let order = await t.read.order(orderId);
    expect(order?.status).toBe('DRIVER_ASSIGNED');
    expect(order?.flags.requiresCustody).toBe(true);
    expect(order?.custodyCode).toMatch(/^VL-[A-Z0-9]{6}$/);
    expect(order?.totalCents).toBe(8900 + 6900);
    const code = order?.custodyCode ?? '';

    expect((await transition(driver.api, orderId, 'provider.en_route')).body.status).toBe('EN_ROUTE_PICKUP');

    // Sem scan → 409.
    await driver.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'PICKUP', url: PHOTO });
    const noScan = await transition(driver.api, orderId, 'provider.pickup');
    expect(noScan.status).toBe(409);
    expect(noScan.body.error?.code).toBe('INVALID_TRANSITION');

    // Código errado → 422.
    const wrong = await driver.api.post(`/v1/orders/${orderId}/custody/scan`, { itemCode: 'VL-ZZZZZZ' });
    expect(wrong.status).toBe(422);

    const scan = await driver.api.post<{ status: string }>(`/v1/orders/${orderId}/custody/scan`, { itemCode: code, photoUrl: PHOTO, location: { lat: -23.56, lng: -46.68 } });
    expect(scan.status, JSON.stringify(scan.body)).toBe(200);
    expect((await transition(driver.api, orderId, 'provider.pickup')).body.status).toBe('PICKED_UP');
    expect((await transition(driver.api, orderId, 'provider.depart')).body.status).toBe('IN_TRANSIT');
    expect((await transition(driver.api, orderId, 'provider.arrive_destination')).body.status).toBe('AT_DESTINATION');
    expect((await transition(driver.api, orderId, 'provider.third_party_start')).body.status).toBe('THIRD_PARTY_IN_PROGRESS');
    expect((await t.read.provider(driver.providerId))?.availability).toBe('ONLINE'); // motorista liberado
    expect((await transition(driver.api, orderId, 'provider.third_party_done')).body.status).toBe('THIRD_PARTY_DONE');

    // Nova coleta exige scan de novo.
    expect((await transition(driver.api, orderId, 'provider.return_pickup')).status).toBe(409);
    await driver.api.post(`/v1/orders/${orderId}/custody/scan`, { itemCode: code });
    expect((await transition(driver.api, orderId, 'provider.return_pickup')).body.status).toBe('RETURN_PICKUP');
    expect((await transition(driver.api, orderId, 'provider.return_depart')).body.status).toBe('RETURNING');

    // Entrega: scan + foto.
    await driver.api.post(`/v1/orders/${orderId}/evidence`, { kind: 'DELIVERY', url: PHOTO });
    expect((await transition(driver.api, orderId, 'provider.deliver')).status).toBe(409);
    await driver.api.post(`/v1/orders/${orderId}/custody/scan`, { itemCode: code.toLowerCase() });
    expect((await transition(driver.api, orderId, 'provider.deliver')).body.status).toBe('DELIVERED');

    const custody = await t.read.custody(orderId);
    expect(custody.map((c) => `${c.step}:${c.fromParty}>${c.toParty}`)).toEqual([
      'EN_ROUTE_PICKUP:CUSTOMER>PROVIDER',
      'IN_TRANSIT:PROVIDER>THIRD_PARTY',
      'THIRD_PARTY_DONE:THIRD_PARTY>PROVIDER',
      'RETURNING:PROVIDER>CUSTOMER',
    ]);
    expect(custody.every((c) => c.itemCode === code)).toBe(true);

    const done = await driver.api.post<{ status: string }>(`/v1/orders/${orderId}/complete`, {});
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.status).toBe('COMPLETED');
    await t.drain();
    order = await t.read.order(orderId);
    expect(order?.providerPayoutCents).toBe(Math.round(15800 * 0.8));
    expect((await t.read.intents(orderId))[0]?.status).toBe('CAPTURED');
  });
});
