import { describe, expect, it } from 'vitest';
import {
  bayesianRating,
  DEFAULT_WEIGHTS,
  type MatchCandidate,
  rankCandidates,
  scoreCandidate,
} from './score';
import { DEFAULT_WAVES, planWave } from './waves';

const req = { location: { lat: -23.5505, lng: -46.6333 }, scheduledFor: null, now: new Date(), radiusKm: 5 };

function cand(p: Partial<MatchCandidate> & { providerId: string }): MatchCandidate {
  return {
    location: { lat: -23.555, lng: -46.64 },
    availability: 'ONLINE',
    serviceRadiusKm: 15,
    qualification: 0.8,
    ratingAvg: 4.7,
    ratingCount: 40,
    acceptanceRate: 0.9,
    cancellationRate: 0.02,
    avgResponseSeconds: 30,
    hasScheduleConflict: false,
    servedCustomerBefore: false,
    minutesSinceLastOrder: 120,
    ...p,
  };
}

describe('score', () => {
  it('prestador mais perto pontua mais, tudo o mais igual', () => {
    const near = scoreCandidate(cand({ providerId: 'near', location: { lat: -23.552, lng: -46.635 } }), req);
    const far = scoreCandidate(cand({ providerId: 'far', location: { lat: -23.58, lng: -46.66 } }), req);
    expect(near.score).toBeGreaterThan(far.score);
    expect(near.distanceKm).toBeLessThan(far.distanceKm);
  });

  it('offline, ocupado (imediato), fora do raio e conflito de agenda são inelegíveis', () => {
    expect(scoreCandidate(cand({ providerId: 'a', availability: 'OFFLINE' }), req).ineligibleReason).toBe(
      'Prestador indisponível',
    );
    expect(scoreCandidate(cand({ providerId: 'b', availability: 'BUSY' }), req).ineligibleReason).toBe(
      'Prestador ocupado',
    );
    expect(
      scoreCandidate(cand({ providerId: 'c', location: { lat: -23.7, lng: -46.9 } }), req).ineligibleReason,
    ).toBe('Fora do raio');
    expect(scoreCandidate(cand({ providerId: 'd', hasScheduleConflict: true }), req).ineligibleReason).toBe(
      'Conflito de agenda',
    );
  });

  it('ocupado é elegível para agendado', () => {
    const r = scoreCandidate(cand({ providerId: 'b', availability: 'BUSY' }), {
      ...req,
      scheduledFor: new Date(Date.now() + 86400000),
    });
    expect(r.eligible).toBe(true);
  });

  it('pesos configuráveis mudam o ranking', () => {
    const closeLowRating = cand({
      providerId: 'close',
      location: { lat: -23.551, lng: -46.634 },
      ratingAvg: 3.6,
      ratingCount: 60,
    });
    const farHighRating = cand({
      providerId: 'far',
      location: { lat: -23.575, lng: -46.655 },
      ratingAvg: 5,
      ratingCount: 60,
    });
    const byProximity = rankCandidates([closeLowRating, farHighRating], req, {
      ...DEFAULT_WEIGHTS,
      proximity: 0.9,
      reputation: 0.05,
    });
    const byReputation = rankCandidates([closeLowRating, farHighRating], req, {
      ...DEFAULT_WEIGHTS,
      proximity: 0.05,
      reputation: 0.9,
    });
    expect(byProximity[0]?.providerId).toBe('close');
    expect(byReputation[0]?.providerId).toBe('far');
  });

  it('bayesiano: poucas avaliações puxam para o prior', () => {
    expect(bayesianRating(5, 1)).toBeLessThan(4.5);
    expect(bayesianRating(5, 200)).toBeGreaterThan(4.95);
    expect(bayesianRating(null, 0)).toBe(4.2);
  });

  it('cancelamentos altos derrubam o score', () => {
    const good = scoreCandidate(cand({ providerId: 'g' }), req);
    const bad = scoreCandidate(cand({ providerId: 'b', cancellationRate: 0.3 }), req);
    expect(bad.score).toBeLessThan(good.score);
    expect(bad.breakdown.cancellationPenalty).toBe(0);
  });
});

describe('ondas', () => {
  const ranked = rankCandidates(
    [
      cand({ providerId: 'p1' }),
      cand({ providerId: 'p2' }),
      cand({ providerId: 'p3' }),
      cand({ providerId: 'p4', availability: 'OFFLINE' }),
    ],
    req,
  );

  it('primeira onda oferta aos N melhores elegíveis', () => {
    const plan = planWave(0, ranked, DEFAULT_WAVES);
    expect(plan.kind).toBe('OFFER');
    if (plan.kind === 'OFFER') {
      expect(plan.providerIds).toHaveLength(3);
      expect(plan.providerIds).not.toContain('p4');
      expect(plan.timeoutSeconds).toBe(90);
    }
  });

  it('não repete prestador já ofertado e avança de onda quando ninguém resta', () => {
    const plan = planWave(0, ranked, DEFAULT_WAVES, new Set(['p1', 'p2', 'p3']));
    expect(plan).toMatchObject({ kind: 'NEXT_WAVE', waveIndex: 1 });
  });

  it('esgotadas as ondas, escala para operação', () => {
    expect(planWave(3, ranked, DEFAULT_WAVES)).toMatchObject({ kind: 'ESCALATE_TO_OPS' });
    expect(
      planWave(2, ranked, { ...DEFAULT_WAVES, escalateToOps: false }, new Set(['p1', 'p2', 'p3'])),
    ).toMatchObject({ kind: 'FAIL' });
  });

  it('respeita score mínimo', () => {
    const plan = planWave(0, ranked, { ...DEFAULT_WAVES, minScore: 0.99 });
    expect(plan.kind).toBe('NEXT_WAVE');
  });
});
