import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../harness';

describe('payments: webhook idempotente', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('mesmo externalId processa uma vez; gateway desconhecido 404; corpo inválido 400', async () => {
    const payload = {
      id: 'evt_fixed_1',
      type: 'charge.paid',
      data: { id: 'pix_inexistente', status: 'paid', amount: 100 },
    };
    const first = await t.anon.post<{ ok: boolean; ignored?: boolean; duplicate?: boolean }>(
      '/v1/payments/webhooks/sandbox',
      payload,
    );
    expect(first.status).toBe(200);
    expect(first.body.ignored).toBe(true); // sem intent correspondente, registra e ignora
    const second = await t.anon.post<{ ok: boolean; duplicate?: boolean }>(
      '/v1/payments/webhooks/sandbox',
      payload,
    );
    expect(second.body.duplicate).toBe(true);
    const rows = await t.db.select().from(t.schema.webhookEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalId).toBe('evt_fixed_1');
    expect((await t.anon.post('/v1/payments/webhooks/pagarme', payload)).status).toBe(404);
    const bad = await t.fastify.inject({
      method: 'POST',
      url: '/v1/payments/webhooks/sandbox',
      payload: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('cartão só é aceito com gatewayToken; método padrão único por usuário', async () => {
    const c = await t.asCustomer('+5511977770010');
    const noToken = await c.api.post('/v1/me/payment-methods', { kind: 'CARD', holderName: 'X Y' });
    expect(noToken.status).toBe(400);
    const second = await c.api.post<{ isDefault: boolean; last4: string }>('/v1/me/payment-methods', {
      kind: 'CARD',
      gatewayToken: 'tok_sandbox_1881',
      holderName: 'CLIENTE',
      setDefault: true,
    });
    expect(second.body.isDefault).toBe(true);
    expect(second.body.last4).toBe('1881');
    const list = await c.api.get<Array<{ isDefault: boolean }>>('/v1/me/payment-methods');
    expect(list.body.filter((m) => m.isDefault)).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('tok_sandbox');
  });
});
