import type { LatLng, MatchingWeights } from '@velio/contracts';
import { haversineKm } from '../geo/distance';

export interface MatchCandidate {
  providerId: string;
  location: LatLng;
  availability: 'ONLINE' | 'BUSY' | 'OFFLINE' | 'UNAVAILABLE';
  serviceRadiusKm: number;
  /** 0..1: quão qualificado para a categoria (nível declarado + verificado + certificações). */
  qualification: number;
  ratingAvg: number | null;
  ratingCount: number;
  acceptanceRate: number | null;
  cancellationRate: number | null;
  avgResponseSeconds: number | null;
  /** Conflito de agenda com a janela do pedido. */
  hasScheduleConflict: boolean;
  /** Prestador já atendeu este cliente com boa avaliação. */
  servedCustomerBefore: boolean;
  /** Tempo desde a última ordem concluída (para distribuir demanda). */
  minutesSinceLastOrder: number | null;
}

export interface MatchRequest {
  location: LatLng;
  scheduledFor: Date | null;
  now: Date;
  /** Raio máximo da onda atual. */
  radiusKm: number;
}

export interface ScoreBreakdown {
  proximity: number;
  qualification: number;
  reputation: number;
  availability: number;
  compatibility: number;
  acceptanceRate: number;
  cancellationPenalty: number;
}

export interface ScoredCandidate {
  providerId: string;
  distanceKm: number;
  score: number;
  breakdown: ScoreBreakdown;
  eligible: boolean;
  ineligibleReason: string | null;
}

export const DEFAULT_WEIGHTS: MatchingWeights = {
  proximity: 0.3,
  qualification: 0.15,
  reputation: 0.2,
  availability: 0.15,
  compatibility: 0.1,
  acceptanceRate: 0.1,
  cancellationPenalty: 0.1,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Média bayesiana: poucos reviews puxam para 4,2 (prior), muitos reviews dominam. */
export function bayesianRating(avg: number | null, count: number, prior = 4.2, priorWeight = 5): number {
  if (avg === null || count === 0) return prior;
  return (avg * count + prior * priorWeight) / (count + priorWeight);
}

export function scoreCandidate(
  c: MatchCandidate,
  req: MatchRequest,
  weights: MatchingWeights = DEFAULT_WEIGHTS,
): ScoredCandidate {
  const distanceKm = haversineKm(c.location, req.location);
  const immediate = req.scheduledFor === null;

  let ineligibleReason: string | null = null;
  if (c.availability === 'OFFLINE' || c.availability === 'UNAVAILABLE')
    ineligibleReason = 'Prestador indisponível';
  else if (immediate && c.availability === 'BUSY') ineligibleReason = 'Prestador ocupado';
  else if (distanceKm > Math.min(req.radiusKm, c.serviceRadiusKm)) ineligibleReason = 'Fora do raio';
  else if (c.hasScheduleConflict) ineligibleReason = 'Conflito de agenda';
  else if (c.qualification <= 0) ineligibleReason = 'Sem qualificação para a categoria';

  const breakdown: ScoreBreakdown = {
    proximity: clamp01(1 - distanceKm / Math.max(req.radiusKm, 0.1)),
    qualification: clamp01(c.qualification),
    reputation: clamp01((bayesianRating(c.ratingAvg, c.ratingCount) - 3) / 2),
    availability: c.availability === 'ONLINE' ? 1 : c.availability === 'BUSY' && !immediate ? 0.6 : 0,
    compatibility: clamp01(
      (c.servedCustomerBefore ? 0.5 : 0.2) +
        (c.minutesSinceLastOrder === null ? 0.2 : clamp01(c.minutesSinceLastOrder / 240) * 0.3) +
        (c.avgResponseSeconds === null ? 0.1 : clamp01(1 - c.avgResponseSeconds / 120) * 0.3),
    ),
    acceptanceRate: c.acceptanceRate === null ? 0.7 : clamp01(c.acceptanceRate),
    cancellationPenalty: c.cancellationRate === null ? 0.9 : clamp01(1 - c.cancellationRate * 4),
  };

  const totalWeight =
    weights.proximity +
    weights.qualification +
    weights.reputation +
    weights.availability +
    weights.compatibility +
    weights.acceptanceRate +
    weights.cancellationPenalty;

  const raw =
    breakdown.proximity * weights.proximity +
    breakdown.qualification * weights.qualification +
    breakdown.reputation * weights.reputation +
    breakdown.availability * weights.availability +
    breakdown.compatibility * weights.compatibility +
    breakdown.acceptanceRate * weights.acceptanceRate +
    breakdown.cancellationPenalty * weights.cancellationPenalty;

  const score = totalWeight > 0 ? raw / totalWeight : 0;
  return {
    providerId: c.providerId,
    distanceKm: Math.round(distanceKm * 100) / 100,
    score: Math.round(score * 10000) / 10000,
    breakdown,
    eligible: ineligibleReason === null,
    ineligibleReason,
  };
}

export function rankCandidates(
  cands: MatchCandidate[],
  req: MatchRequest,
  weights?: MatchingWeights,
): ScoredCandidate[] {
  return cands
    .map((c) => scoreCandidate(c, req, weights))
    .sort(
      (a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.distanceKm - b.distanceKm,
    );
}
