import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHOTO, type TestApp, createTestApp, transition } from '../harness';

describe('F) Concierge: carro para revisão', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('interpreta, exige humano, operador aprova, cliente aprova plano e orçamento, filhas executam, pai conclui', async () => {
    const customer = await t.asCustomer('+5511999990006');
    const driver = await t.asProvider('+5511988880070', { categorySlugs: ['automotivo'] });
    const vehicle = await customer.api.post<{ id: string }>('/v1/me/vehicles', { brand: 'Honda', model: 'Civic', plate: 'BRA2E19', year: 2021 });

    const created = await customer.api.post<{ id: string; orderId: string; plan: unknown }>('/v1/concierge/requests', {
      inputType: 'TEXT',
      text: 'Pegue meu carro amanhã às 8h, leve para revisão e depois devolva.',
      addressId: customer.addressId,
      vehicleId: vehicle.body.id,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.plan).toBeNull();
    const orderId = created.body.orderId;
    const reqId = created.body.id;
    expect((await t.read.order(orderId))?.status).toBe('SUBMITTED');

    await t.drain();
    let order = await t.read.order(orderId);
    const statuses = (await t.read.events(orderId)).map((e) => e.toStatus).filter(Boolean);
    expect(statuses).toEqual(['SUBMITTED', 'INTERPRETING', 'NEEDS_HUMAN']);
    expect(order?.status).toBe('NEEDS_HUMAN');
    const req = await customer.api.get<{ plan: { tasks: unknown[]; requiresHuman: boolean; requiresHumanReasons: string[] }; plannerName: string }>(`/v1/concierge/requests/${reqId}`);
    expect(req.body.plan.tasks).toHaveLength(6);
    expect(req.body.plan.requiresHuman).toBe(true);
    expect(req.body.plannerName).toBe('rules@1');
    const incidents = await t.read.incidents(orderId);
    expect(incidents.map((i) => i.kind)).toEqual(['NEEDS_HUMAN']);
    expect(await t.read.intents(orderId)).toHaveLength(0);

    // Cliente não pode aprovar plano ainda (NEEDS_HUMAN).
    const early = await customer.api.post(`/v1/concierge/requests/${reqId}/approve-plan`);
    expect(early.status).toBe(409);

    // Operador aprova com plano editado (nota adicionada).
    const admin = await t.asAdmin();
    const edited = { ...req.body.plan, summary: 'Retirar o Civic às 8h, levar à concessionária para revisão e devolver no fim do dia.' };
    const approved = await admin.api.post<{ status: string }>(`/v1/ops/concierge/${reqId}/approve-plan`, { plan: edited });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.status).toBe('PLAN_PROPOSED');
    await t.drain();
    expect((await t.read.notifications(customer.userId)).some((n) => n.kind === 'plan_proposed')).toBe(true);

    // Cliente aprova o plano → QUOTED com orçamento = soma das estimativas (60 + 60).
    const planOk = await customer.api.post<{ status: string; quotes: Array<{ id: string; kind: string; status: string; amountCents: number }> }>(`/v1/concierge/requests/${reqId}/approve-plan`);
    expect(planOk.status, JSON.stringify(planOk.body)).toBe(200);
    await t.drain();
    order = await t.read.order(orderId);
    expect(order?.status).toBe('QUOTED');
    const detail = await customer.api.get<{ quotes: Array<{ id: string; kind: string; status: string; amountCents: number }>; allowedActions: string[] }>(`/v1/orders/${orderId}`);
    const quote = detail.body.quotes[0];
    expect(quote?.kind).toBe('INITIAL');
    expect(quote?.status).toBe('SENT');
    expect(quote?.amountCents).toBe(12000);
    expect((await t.read.notifications(customer.userId)).some((n) => n.kind === 'quote_available')).toBe(true);
    expect(await t.read.intents(orderId)).toHaveLength(0); // nada cobrado antes da aprovação

    // Cliente aprova orçamento → pré-autorização → autorização de pagamento → IN_EXECUTION com filhas.
    const q = await customer.api.post<{ status: string }>(`/v1/quotes/${quote?.id}/approve`);
    expect(q.status, JSON.stringify(q.body)).toBe(200);
    await t.drain();
    order = await t.read.order(orderId);
    expect(order?.status).toBe('IN_EXECUTION');
    expect(order?.priceCents).toBe(12000);
    const intents = await t.read.intents(orderId);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.status).toBe('AUTHORIZED'); // autorizado, não capturado
    const tasks = await t.db.select().from(t.schema.orderTasks);
    expect(tasks).toHaveLength(6);
    const children = await t.read.children(orderId);
    expect(children).toHaveLength(1);
    const child = children[0];
    expect(child?.workflowKind).toBe('LOGISTICS');
    expect(child?.status).toBe('REQUESTED'); // agendado para amanhã 8h: matching 6h antes
    expect(child?.scheduledFor).not.toBeNull();
    expect(tasks.find((x) => x.seq === 1)?.childOrderId).toBe(child?.id);
    const allIntents = await t.db.select().from(t.schema.paymentIntents);
    expect(allIntents.filter((i) => i.status === 'CAPTURED')).toHaveLength(0);

    // Avança até o matching da filha, motorista aceita e executa o leva-e-traz.
    const childId = child?.id ?? '';
    await t.advanceTo(new Date((child?.scheduledFor?.getTime() ?? 0) - 6 * 3_600_000));
    expect((await t.read.order(childId))?.status).toBe('OFFERED');
    const offers = await driver.api.get<Array<{ id: string; orderId: string }>>('/v1/providers/me/offers');
    const offer = offers.body.find((o) => o.orderId === childId);
    expect(offer).toBeDefined();
    expect((await driver.api.post<{ status: string }>(`/v1/offers/${offer?.id}/accept`)).body.status).toBe('DRIVER_ASSIGNED');
    await t.drain();
    expect(await t.read.intents(childId)).toHaveLength(0); // filha cobrada pelo pai

    await t.advanceTo(child?.scheduledFor ?? new Date());
    await transition(driver.api, childId, 'provider.en_route');
    await driver.api.post(`/v1/orders/${childId}/custody/scan`, { itemCode: 'BRA2E19' });
    await driver.api.post(`/v1/orders/${childId}/vehicle-handover/PICKUP`, { odometerKm: 30000, checklist: { ok: true }, photoUrls: [PHOTO] });
    for (const a of ['provider.pickup', 'provider.depart', 'provider.arrive_destination', 'provider.third_party_start', 'provider.third_party_done']) {
      const r = await transition(driver.api, childId, a);
      expect(r.status, `${a}: ${JSON.stringify(r.body)}`).toBe(200);
    }
    await driver.api.post(`/v1/orders/${childId}/custody/scan`, { itemCode: 'BRA2E19' });
    await transition(driver.api, childId, 'provider.return_pickup');
    await transition(driver.api, childId, 'provider.return_depart');
    await driver.api.post(`/v1/orders/${childId}/vehicle-handover/DELIVERY`, { odometerKm: 30040, checklist: { ok: true }, photoUrls: [PHOTO] });
    await driver.api.post(`/v1/orders/${childId}/custody/scan`, { itemCode: 'BRA2E19' });
    expect((await transition(driver.api, childId, 'provider.deliver')).body.status).toBe('DELIVERED');
    const done = await driver.api.post<{ status: string }>(`/v1/orders/${childId}/complete`, {});
    expect(done.body.status).toBe('COMPLETED');
    await t.drain();

    // Pai concluído automaticamente; pagamento capturado só agora.
    order = await t.read.order(orderId);
    expect(order?.status).toBe('COMPLETED');
    expect((await t.read.intents(orderId))[0]?.status).toBe('CAPTURED');
    expect((await t.read.intents(orderId))[0]?.capturedCents).toBe(12000);
    const finalTasks = await t.db.select().from(t.schema.orderTasks);
    expect(finalTasks.every((x) => x.status === 'DONE')).toBe(true);
    // Motorista recebeu o repasse da filha (financiado pelo pai).
    expect(((await t.read.wallet('PROVIDER', driver.providerId))?.balanceCents ?? 0)).toBeGreaterThan(0);
  });
});
