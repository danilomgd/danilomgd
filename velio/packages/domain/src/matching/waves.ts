import type { WaveConfig } from '@velio/contracts';
import type { ScoredCandidate } from './score';

export const DEFAULT_WAVES: WaveConfig = {
  waves: [
    { radiusKm: 5, offerCount: 3, timeoutSeconds: 90 },
    { radiusKm: 10, offerCount: 5, timeoutSeconds: 120 },
    { radiusKm: 20, offerCount: 8, timeoutSeconds: 180 },
  ],
  escalateToOps: true,
  minScore: 0.2,
};

export type WavePlan =
  | { kind: 'OFFER'; waveIndex: number; radiusKm: number; timeoutSeconds: number; providerIds: string[] }
  | { kind: 'NEXT_WAVE'; waveIndex: number; reason: string }
  | { kind: 'ESCALATE_TO_OPS'; reason: string }
  | { kind: 'FAIL'; reason: string };

/**
 * Decide o que fazer na onda `waveIndex` dados os candidatos já pontuados com o raio dessa onda.
 * `alreadyOffered` evita ofertar duas vezes ao mesmo prestador na mesma ordem.
 */
export function planWave(
  waveIndex: number,
  ranked: ScoredCandidate[],
  config: WaveConfig = DEFAULT_WAVES,
  alreadyOffered: ReadonlySet<string> = new Set(),
): WavePlan {
  const wave = config.waves[waveIndex];
  if (!wave) {
    return config.escalateToOps
      ? { kind: 'ESCALATE_TO_OPS', reason: 'Todas as ondas esgotadas' }
      : { kind: 'FAIL', reason: 'Todas as ondas esgotadas e sem escalonamento' };
  }
  const chosen = ranked
    .filter((c) => c.eligible && c.score >= config.minScore && !alreadyOffered.has(c.providerId))
    .slice(0, wave.offerCount)
    .map((c) => c.providerId);

  if (chosen.length === 0) {
    const hasNext = waveIndex + 1 < config.waves.length;
    if (hasNext)
      return { kind: 'NEXT_WAVE', waveIndex: waveIndex + 1, reason: 'Nenhum candidato elegível nesta onda' };
    return config.escalateToOps
      ? { kind: 'ESCALATE_TO_OPS', reason: 'Nenhum candidato elegível em nenhuma onda' }
      : { kind: 'FAIL', reason: 'Nenhum candidato elegível' };
  }
  return {
    kind: 'OFFER',
    waveIndex,
    radiusKm: wave.radiusKm,
    timeoutSeconds: wave.timeoutSeconds,
    providerIds: chosen,
  };
}

export function waveRadius(waveIndex: number, config: WaveConfig = DEFAULT_WAVES): number {
  return config.waves[Math.min(waveIndex, config.waves.length - 1)]?.radiusKm ?? 10;
}
