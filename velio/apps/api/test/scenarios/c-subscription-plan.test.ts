import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY, DEFAULT_NOW, type TestApp, createTestApp } from '../harness';

describe('C) assinatura Plano Residencial', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('cobra SUBSCRIPTION capturada, gera visita SCHEDULED com preço 0 e a home sugere manutenção vencida', async () => {
    const customer = await t.asCustomer('+5511999990003', { name: 'Ana Souza' });
    const sevenMonthsAgo = new Date(DEFAULT_NOW);
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
    const eq1 = await customer.api.post<{ id: string; nextMaintenanceDueAt: string }>('/v1/me/equipments', { kind: 'AIR_CONDITIONER', brand: 'Samsung', room: 'Sala', lastMaintenanceAt: sevenMonthsAgo.toISOString(), maintenanceIntervalMonths: 6 });
    expect(eq1.status).toBe(201);
    expect(new Date(eq1.body.nextMaintenanceDueAt).getTime()).toBeLessThan(DEFAULT_NOW.getTime());

    // Home: contextHint com fonte real equipment_due.
    const home = await customer.api.get<{ greeting: string; contextHint: { source: string; text: string }; sections: Array<{ id: string; items: unknown[] }> }>('/v1/catalog/home');
    expect(home.status).toBe(200);
    expect(home.body.greeting).toBe('Bom dia, Ana!');
    expect(home.body.contextHint.source).toBe('equipment_due');
    expect(home.body.contextHint.text).toContain('Sala');
    expect(home.body.sections.find((s) => s.id === 'equipment_due')?.items.length).toBeGreaterThan(0);
    expect(home.body.sections.find((s) => s.id === 'morning')).toBeDefined(); // 09:00 em SP
    expect(home.body.sections.find((s) => s.id === 'evening')).toBeUndefined();

    const plans = await t.anon.get<Array<{ id: string; slug: string; priceCents: number; serviceId: string }>>('/v1/catalog/plans');
    const plan = plans.body.find((p) => p.slug === 'ac-residencial');
    expect(plan).toBeDefined();

    const sub = await customer.api.post<{ id: string; status: string; nextVisitDueAt: string; nextChargeAt: string }>('/v1/me/subscriptions', { planId: plan?.id, equipmentIds: [eq1.body.id], addressId: customer.addressId, paymentMethodId: customer.paymentMethodId, preferredPeriod: 'MORNING' });
    expect(sub.status, JSON.stringify(sub.body)).toBe(201);
    expect(sub.body.status).toBe('ACTIVE');
    const due = new Date(sub.body.nextVisitDueAt);
    const expectedDue = new Date(DEFAULT_NOW);
    expectedDue.setMonth(expectedDue.getMonth() + 6);
    expect(due.toISOString()).toBe(expectedDue.toISOString());

    const subIntents = await t.db.select().from(t.schema.paymentIntents);
    const charge = subIntents.find((i) => i.kind === 'SUBSCRIPTION');
    expect(charge?.status).toBe('CAPTURED');
    expect(charge?.amountCents).toBe(69900);
    expect(charge?.subscriptionId).toBe(sub.body.id);

    // Até a data devida (menos a antecedência) nenhuma ordem existe.
    await t.advanceTo(new Date(due.getTime() - 10 * DAY), 5 * DAY);
    expect(await t.db.select().from(t.schema.serviceOrders)).toHaveLength(0);

    // Na janela devida a visita é gerada: ordem SCHEDULED, preço 0, para o serviço do plano.
    await t.advanceTo(new Date(due.getTime() - 6 * DAY), DAY);
    const orders = await t.db.select().from(t.schema.serviceOrders);
    expect(orders).toHaveLength(1);
    const visit = orders[0];
    expect(visit?.status).toBe('SCHEDULED');
    expect(visit?.priceCents).toBe(0);
    expect(visit?.totalCents).toBe(0);
    expect(visit?.serviceId).toBe(plan?.serviceId);
    expect(visit?.scheduledFor?.toISOString().slice(0, 10)).toBe(due.toISOString().slice(0, 10));
    const visits = await t.db.select().from(t.schema.subscriptionVisits);
    expect(visits).toHaveLength(1);
    expect(visits[0]?.orderId).toBe(visit?.id);
    const mine = await customer.api.get<Array<{ nextVisitDueAt: string }>>('/v1/me/subscriptions');
    expect(new Date(mine.body[0]?.nextVisitDueAt ?? 0).getTime()).toBeGreaterThan(due.getTime());

    // Cancelamento encerra e evita novas visitas.
    const cancel = await customer.api.post<{ status: string }>(`/v1/me/subscriptions/${sub.body.id}/cancel`, { reason: 'Mudei de casa' });
    expect(cancel.body.status).toBe('CANCELLED');
  });
});
