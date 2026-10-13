import { describe, expect, it } from 'vitest';
import { customerCancellation, DEFAULT_CANCELLATION } from './cancellation';
import { acceptPing, locationIntervalSeconds } from './location';
import {
  maintenanceDue,
  nextVisitDue,
  parseWhenSafe,
  reminderTimes,
  scheduledMatchingStart,
} from './scheduling-test-helpers';

describe('cancelamento do cliente', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  it('grátis antes de aceite', () => {
    expect(customerCancellation('MATCHING', null, now, 8000)).toMatchObject({ allowed: true, feeCents: 0 });
  });
  it('grátis dentro da janela após aceite; taxa fixa depois', () => {
    const acc = new Date(now.getTime() - 5 * 60000);
    expect(customerCancellation('ACCEPTED', acc, now, 8000)).toMatchObject({ feeCents: 0 });
    const late = new Date(now.getTime() - 30 * 60000);
    expect(customerCancellation('ACCEPTED', late, now, 8000)).toMatchObject({
      feeCents: DEFAULT_CANCELLATION.lateFeeCents,
      feeBeneficiary: 'provider',
    });
  });
  it('em deslocamento cobra percentual com mínimo', () => {
    expect(customerCancellation('EN_ROUTE', null, now, 8000).feeCents).toBe(2000); // 20% = 1600 < min 2000
    expect(customerCancellation('EN_ROUTE', null, now, 30000).feeCents).toBe(6000);
  });
  it('não permite em execução', () => {
    expect(customerCancellation('IN_PROGRESS', null, now, 8000).allowed).toBe(false);
  });
});

describe('localização', () => {
  it('intervalo adaptativo', () => {
    expect(
      locationIntervalSeconds({ availability: 'OFFLINE', activeOrderStatus: null, distanceToTargetKm: null }),
    ).toBe(0);
    expect(
      locationIntervalSeconds({ availability: 'ONLINE', activeOrderStatus: null, distanceToTargetKm: null }),
    ).toBe(60);
    expect(
      locationIntervalSeconds({ availability: 'BUSY', activeOrderStatus: 'EN_ROUTE', distanceToTargetKm: 3 }),
    ).toBe(10);
    expect(
      locationIntervalSeconds({
        availability: 'BUSY',
        activeOrderStatus: 'EN_ROUTE',
        distanceToTargetKm: 0.2,
      }),
    ).toBe(3);
    expect(
      locationIntervalSeconds({
        availability: 'BUSY',
        activeOrderStatus: 'IN_PROGRESS',
        distanceToTargetKm: 0,
      }),
    ).toBe(120);
  });
  it('filtra pings imprecisos, repetidos e implausíveis', () => {
    const t0 = new Date('2026-10-13T12:00:00Z');
    const prev = { lat: -23.55, lng: -46.63, recordedAt: t0 };
    expect(
      acceptPing({ accuracyM: 500, previous: null, current: { ...prev, recordedAt: t0 }, maxAccuracyM: 100 })
        .accept,
    ).toBe(false);
    expect(
      acceptPing({
        accuracyM: 10,
        previous: prev,
        current: { lat: -23.55, lng: -46.63, recordedAt: new Date(t0.getTime() + 5000) },
        maxAccuracyM: 100,
      }).reason,
    ).toBe('Deslocamento desprezível');
    expect(
      acceptPing({
        accuracyM: 10,
        previous: prev,
        current: { lat: -23.6, lng: -46.7, recordedAt: new Date(t0.getTime() + 5000) },
        maxAccuracyM: 100,
      }).reason,
    ).toBe('Velocidade implausível');
    expect(
      acceptPing({
        accuracyM: 10,
        previous: prev,
        current: { lat: -23.551, lng: -46.631, recordedAt: new Date(t0.getTime() + 10000) },
        maxAccuracyM: 100,
      }).accept,
    ).toBe(true);
  });
});

describe('agenda', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  it('lembretes só no futuro', () => {
    const soon = new Date(now.getTime() + 2 * 3600_000);
    expect(reminderTimes(soon, now)).toHaveLength(1);
    const far = new Date(now.getTime() + 48 * 3600_000);
    expect(reminderTimes(far, now)).toHaveLength(2);
  });
  it('matching de agendado começa 6h antes ou agora', () => {
    expect(scheduledMatchingStart(new Date(now.getTime() + 48 * 3600_000), now).getTime()).toBe(
      now.getTime() + 42 * 3600_000,
    );
    expect(scheduledMatchingStart(new Date(now.getTime() + 3600_000), now)).toEqual(now);
  });
  it('manutenção devida a partir do intervalo', () => {
    const last = new Date('2026-03-01T00:00:00Z');
    const r = maintenanceDue(last, 6, now);
    expect(r.due).toBe(true);
    expect(r.overdueDays).toBeGreaterThan(30);
    expect(maintenanceDue(new Date('2026-09-01T00:00:00Z'), 6, now).due).toBe(false);
    expect(maintenanceDue(null, 6, now).due).toBe(true);
  });
  it('próxima visita de assinatura', () => {
    const d = nextVisitDue(null, new Date('2026-01-15T00:00:00Z'), 12, 4);
    expect(d.toISOString().slice(0, 10)).toBe('2026-04-15');
  });
  it('parseWhen entende amanhã às 8h', () => {
    const d = parseWhenSafe('Pegue meu carro amanhã às 8h', now);
    expect(d?.getDate()).toBe(14);
    expect(d?.getHours()).toBe(8);
  });
});
