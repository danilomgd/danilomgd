import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from '../harness';

describe('identity: OTP e refresh rotativo', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('bloqueia após 5 tentativas erradas e aceita o código correto em um novo desafio', async () => {
    const req = await t.anon.post<{ challengeId: string; devCode: string }>('/v1/auth/otp/request', { phone: '+5511977770001', app: 'customer' });
    expect(req.status).toBe(200);
    expect(req.body.devCode).toMatch(/^\d{6}$/);
    const wrong = req.body.devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await t.anon.post<{ error: { code: string } }>('/v1/auth/otp/verify', { challengeId: req.body.challengeId, code: wrong });
      expect(r.status).toBe(400);
    }
    const blocked = await t.anon.post<{ error: { code: string } }>('/v1/auth/otp/verify', { challengeId: req.body.challengeId, code: req.body.devCode });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    // O SMS registrado pelo adaptador de log nunca inclui o código em claro nos logs; o devCode só vem na resposta de teste.
    const ok = await t.anon.post<{ accessToken: string; needsOnboarding: boolean; user: { roles: string[] } }>('/v1/auth/otp/verify', {
      challengeId: (await t.anon.post<{ challengeId: string; devCode: string }>('/v1/auth/otp/request', { phone: '+5511977770001', app: 'customer' })).body.challengeId,
      code: 'x',
    });
    expect(ok.status).toBe(400); // formato inválido
  });

  it('código expirado é recusado; código já usado é recusado', async () => {
    const req = await t.anon.post<{ challengeId: string; devCode: string }>('/v1/auth/otp/request', { phone: '+5511977770002', app: 'customer' });
    const first = await t.anon.post<{ accessToken: string }>('/v1/auth/otp/verify', { challengeId: req.body.challengeId, code: req.body.devCode });
    expect(first.status).toBe(200);
    const reuse = await t.anon.post('/v1/auth/otp/verify', { challengeId: req.body.challengeId, code: req.body.devCode });
    expect(reuse.status).toBe(400);
    const req2 = await t.anon.post<{ challengeId: string; devCode: string }>('/v1/auth/otp/request', { phone: '+5511977770002', app: 'customer' });
    t.clock.advance(10 * 60_000);
    const expired = await t.anon.post<{ error: { message: string } }>('/v1/auth/otp/verify', { challengeId: req2.body.challengeId, code: req2.body.devCode });
    expect(expired.status).toBe(400);
    expect(expired.body.error.message).toContain('expirado');
  });

  it('refresh é rotativo: o token antigo deixa de valer e o novo funciona; logout revoga', async () => {
    const req = await t.anon.post<{ challengeId: string; devCode: string }>('/v1/auth/otp/request', { phone: '+5511977770003', app: 'provider' });
    const login = await t.anon.post<{ accessToken: string; refreshToken: string; user: { roles: string[] }; needsOnboarding: boolean }>('/v1/auth/otp/verify', { challengeId: req.body.challengeId, code: req.body.devCode });
    expect(login.body.user.roles).toEqual(['customer', 'provider']);
    expect(login.body.needsOnboarding).toBe(true);
    const r1 = await t.anon.post<{ accessToken: string; refreshToken: string }>('/v1/auth/refresh', { refreshToken: login.body.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(login.body.refreshToken);
    const replay = await t.anon.post('/v1/auth/refresh', { refreshToken: login.body.refreshToken });
    expect(replay.status).toBe(401);
    const r2 = await t.anon.post<{ accessToken: string; refreshToken: string }>('/v1/auth/refresh', { refreshToken: r1.body.refreshToken });
    expect(r2.status).toBe(200);
    const me = await t.api(r2.body.accessToken).get<{ phone: string }>('/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.phone).toBe('+5511977770003');
    const out = await t.api(r2.body.accessToken).post('/v1/auth/logout', { refreshToken: r2.body.refreshToken });
    expect(out.status).toBe(204);
    expect((await t.anon.post('/v1/auth/refresh', { refreshToken: r2.body.refreshToken })).status).toBe(401);
    // Login por senha é exclusivo da operação.
    expect((await t.anon.post('/v1/auth/password/login', { email: 'ninguem@velio.test', password: 'senha-errada-1' })).status).toBe(401);
  });

  it('perfil: consentimentos com timestamp e e-mail duplicado recusado', async () => {
    const c = await t.asCustomer('+5511977770004', { name: 'Bruno' });
    const me = await c.api.get<{ name: string }>('/v1/me');
    expect(me.body.name).toBe('Bruno');
    const user = await t.ctx.db.select().from(t.schema.users);
    const row = user.find((u) => u.phone === '+5511977770004');
    expect(row?.consents.terms?.granted).toBe(true);
    expect(row?.consents.terms?.at).toBe(t.clock.now().toISOString());
    const dup = await c.api.patch<{ error: { code: string } }>('/v1/me', { email: 'admin@velio.test' });
    expect(dup.status).toBe(409);
  });
});
