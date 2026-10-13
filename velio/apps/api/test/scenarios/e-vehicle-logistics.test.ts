import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, PHOTO, requestAndAccept, type TestApp, transition } from '../harness';

describe('E) leva e traz do carro para lavagem', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('handover PICKUP obrigatório, custódia pela placa, terceiro, retorno, handover DELIVERY, COMPLETED', async () => {
    const customer = await t.asCustomer('+5511999990005');
    const driver = await t.asProvider('+5511988880030', { categorySlugs: ['automotivo'] });
    const vehicle = await customer.api.post<{ id: string; plate: string }>('/v1/me/vehicles', {
      brand: 'Fiat',
      model: 'Argo',
      plate: 'abc-1d23',
      year: 2022,
      color: 'Prata',
    });
    expect(vehicle.status).toBe(201);
    expect(vehicle.body.plate).toBe('ABC1D23');

    // Sem veículo → 422.
    const service = await t.read.service('leva-e-traz-lavagem');
    const noVehicle = await customer.api.post('/v1/requests', {
      serviceId: service?.id,
      addressId: customer.addressId,
      schedule: { mode: 'NOW' },
    });
    expect(noVehicle.status).toBe(422);

    const { orderId } = await requestAndAccept(t, customer, driver, 'leva-e-traz-lavagem', {
      vehicleId: vehicle.body.id,
    });
    const order = await t.read.order(orderId);
    expect(order?.status).toBe('DRIVER_ASSIGNED');
    expect(order?.flags.requiresVehicleHandover).toBe(true);
    expect(order?.flags.requiresCustody).toBe(true);

    expect((await transition(driver.api, orderId, 'provider.en_route')).body.status).toBe('EN_ROUTE_PICKUP');

    // Só o scan não basta: handover (odômetro, checklist, fotos) é obrigatório.
    await driver.api.post(`/v1/orders/${orderId}/custody/scan`, { itemCode: 'ABC-1D23' });
    const noHandover = await transition(driver.api, orderId, 'provider.pickup');
    expect(noHandover.status).toBe(409);
    expect(JSON.stringify(noHandover.body)).toContain('odômetro');

    const badHandover = await driver.api.post(`/v1/orders/${orderId}/vehicle-handover/PICKUP`, {
      odometerKm: 45210,
      checklist: { riscos: false },
      photoUrls: [],
    });
    expect(badHandover.status).toBe(400);
    const handover = await driver.api.post(`/v1/orders/${orderId}/vehicle-handover/PICKUP`, {
      odometerKm: 45210,
      fuelLevelPct: 60,
      checklist: { riscos: false, estepe: true, documentos: true },
      photoUrls: [PHOTO, PHOTO],
    });
    expect(handover.status, JSON.stringify(handover.body)).toBe(200);
    expect((await transition(driver.api, orderId, 'provider.pickup')).body.status).toBe('PICKED_UP');
    expect((await transition(driver.api, orderId, 'provider.depart')).body.status).toBe('IN_TRANSIT');
    expect((await transition(driver.api, orderId, 'provider.arrive_destination')).body.status).toBe(
      'AT_DESTINATION',
    );
    expect((await transition(driver.api, orderId, 'provider.third_party_start')).body.status).toBe(
      'THIRD_PARTY_IN_PROGRESS',
    );
    expect((await transition(driver.api, orderId, 'provider.third_party_done')).body.status).toBe(
      'THIRD_PARTY_DONE',
    );
    await driver.api.post(`/v1/orders/${orderId}/custody/scan`, { itemCode: 'ABC1D23' });
    expect((await transition(driver.api, orderId, 'provider.return_pickup')).body.status).toBe(
      'RETURN_PICKUP',
    );
    expect((await transition(driver.api, orderId, 'provider.return_depart')).body.status).toBe('RETURNING');

    // Devolução: handover DELIVERY + scan.
    expect((await transition(driver.api, orderId, 'provider.deliver')).status).toBe(409);
    const delivery = await driver.api.post(`/v1/orders/${orderId}/vehicle-handover/DELIVERY`, {
      odometerKm: 45234,
      checklist: { riscos: false, estepe: true, documentos: true },
      photoUrls: [PHOTO],
    });
    expect(delivery.status).toBe(200);
    await driver.api.post(`/v1/orders/${orderId}/custody/scan`, { itemCode: 'ABC1D23' });
    expect((await transition(driver.api, orderId, 'provider.deliver')).body.status).toBe('DELIVERED');

    const custody = await t.read.custody(orderId);
    expect(custody).toHaveLength(4);
    expect(custody.every((c) => c.itemCode === 'ABC1D23')).toBe(true);
    const handovers = await t.db.select().from(t.schema.vehicleHandovers);
    expect(handovers.map((h) => h.step)).toEqual(['PICKUP', 'DELIVERY']);

    const done = await driver.api.post<{ status: string }>(`/v1/orders/${orderId}/complete`, {});
    expect(done.body.status).toBe('COMPLETED');
    await t.drain();
    expect((await t.read.intents(orderId))[0]?.capturedCents).toBe(16000);
  });
});
