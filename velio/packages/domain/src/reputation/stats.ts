export interface ReviewPoint {
  rating: number;
  createdAt: Date;
}

/** Média ponderada por recência: as 50 mais recentes pesam 70 %, o resto 30 %. */
export function recencyWeightedRating(reviews: ReviewPoint[]): number | null {
  if (reviews.length === 0) return null;
  const sorted = [...reviews].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const recent = sorted.slice(0, 50);
  const older = sorted.slice(50);
  const avg = (xs: ReviewPoint[]) => xs.reduce((s, r) => s + r.rating, 0) / xs.length;
  if (older.length === 0) return round2(avg(recent));
  return round2(avg(recent) * 0.7 + avg(older) * 0.3);
}

export function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export interface CustomerRiskInput {
  lateCancellations90d: number;
  disputesOpened90d: number;
  disputesRejected90d: number;
  chargebacks: number;
  completedOrders: number;
}

/**
 * Sinal interno (0..1) usado só para exigir pré-pagamento ou revisão humana.
 * Não considera dados sensíveis nem é exibido ao prestador.
 */
export function customerRiskScore(i: CustomerRiskInput): number {
  const base = i.completedOrders >= 5 ? 0 : 0.1;
  const s =
    base +
    i.lateCancellations90d * 0.1 +
    i.disputesRejected90d * 0.25 +
    i.chargebacks * 0.5 +
    Math.max(0, i.disputesOpened90d - 1) * 0.05;
  return Math.max(0, Math.min(1, s));
}
