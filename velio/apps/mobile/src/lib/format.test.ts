import { describe, expect, it } from 'vitest';
import {
  etaLabel,
  formatCountdown,
  formatDistanceKm,
  formatSchedule,
  maskCardNumber,
  maskCpfCnpj,
  maskPhoneBR,
  normalizePhoneBR,
  secondsUntil,
} from './format';

describe('telefone', () => {
  it('normaliza para E.164', () => {
    expect(normalizePhoneBR('(11) 98765-4321')).toBe('+5511987654321');
    expect(normalizePhoneBR('+55 11 3456 7890')).toBe('+551134567890');
    expect(normalizePhoneBR('1234')).toBeNull();
  });
  it('mascara enquanto digita', () => {
    expect(maskPhoneBR('11')).toBe('(11');
    expect(maskPhoneBR('119876')).toBe('(11) 9876');
    expect(maskPhoneBR('11987654321')).toBe('(11) 98765-4321');
    expect(maskPhoneBR('+5511987654321')).toBe('(11) 98765-4321');
  });
});

describe('máscaras', () => {
  it('cartão e documento', () => {
    expect(maskCardNumber('4111111111111111')).toBe('4111 1111 1111 1111');
    expect(maskCpfCnpj('12345678909')).toBe('123.456.789-09');
    expect(maskCpfCnpj('12345678000195')).toBe('12.345.678/0001-95');
  });
});

describe('tempo e distância', () => {
  const now = new Date('2026-10-13T12:00:00.000Z');
  it('contagem regressiva', () => {
    expect(formatCountdown(95)).toBe('1:35');
    expect(formatCountdown(0)).toBe('0:00');
    expect(secondsUntil('2026-10-13T12:01:30.000Z', now.getTime())).toBe(90);
    expect(secondsUntil('2026-10-13T11:00:00.000Z', now.getTime())).toBe(0);
  });
  it('ETA e agenda em pt-BR', () => {
    expect(etaLabel('2026-10-13T12:12:00.000Z', now.getTime())).toBe('Chega em 12 min');
    expect(etaLabel('2026-10-13T12:00:30.000Z', now.getTime())).toBe('Chegando agora');
    const local = new Date(now);
    local.setHours(14, 0, 0, 0);
    expect(formatSchedule(local.toISOString(), 120, now)).toMatch(/^Hoje, 14h–16h$/);
    expect(formatSchedule(null)).toBe('Agora');
  });
  it('distância', () => {
    expect(formatDistanceKm(0.4)).toBe('400 m');
    expect(formatDistanceKm(3.26)).toBe('3,3 km');
  });
});
