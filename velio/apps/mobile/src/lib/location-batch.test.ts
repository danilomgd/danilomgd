import { describe, expect, it } from 'vitest';
import { LocationBatch } from './location-batch';

const ping = (lat: number, lng: number, accuracyM?: number, t = '2026-10-13T12:00:00.000Z') => ({
  lat,
  lng,
  accuracyM,
  recordedAt: t,
});

describe('LocationBatch', () => {
  it('descarta leituras com precisão pior que 100 m', () => {
    const b = new LocationBatch();
    expect(b.push(ping(-23.55, -46.63, 150))).toBe(false);
    expect(b.size).toBe(0);
    expect(b.push(ping(-23.55, -46.63, 20))).toBe(true);
  });

  it('colapsa pontos repetidos (< 5 m) atualizando o horário', () => {
    const b = new LocationBatch();
    b.push(ping(-23.55, -46.63, 10, '2026-10-13T12:00:00.000Z'));
    expect(b.push(ping(-23.55001, -46.63001, 10, '2026-10-13T12:00:10.000Z'))).toBe(false);
    expect(b.size).toBe(1);
    expect(b.peek()?.recordedAt).toBe('2026-10-13T12:00:10.000Z');
  });

  it('mantém no máximo 60 pings (limite do contrato) e drena', () => {
    const b = new LocationBatch();
    for (let i = 0; i < 80; i++) b.push(ping(-23.5 + i * 0.001, -46.6, 5));
    expect(b.size).toBe(60);
    const drained = b.drain();
    expect(drained).toHaveLength(60);
    expect(b.size).toBe(0);
  });
});
