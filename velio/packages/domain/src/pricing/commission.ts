import { applyBps, roundHalfUp } from './estimate';

export interface CommissionRule {
  percentBps: number;
  fixedCents: number;
  minCents: number;
  maxCents: number | null;
  passPaymentFeeToProvider: boolean;
}

export const DEFAULT_COMMISSION: CommissionRule = {
  percentBps: 2000,
  fixedCents: 0,
  minCents: 500,
  maxCents: null,
  passPaymentFeeToProvider: false,
};

export interface Settlement {
  grossCents: number;
  discountCents: number;
  /** O que o cliente efetivamente pagou (gross − desconto financiado pela plataforma). */
  chargedCents: number;
  platformFeeCents: number;
  paymentFeeCents: number;
  providerPayoutCents: number;
  platformNetCents: number;
}

/**
 * Divide o valor de uma ordem concluída. Desconto de cupom é custo da plataforma, não do prestador.
 * Comissão incide sobre o bruto (preço + adicionais aprovados), nunca sobre o valor com desconto.
 */
export function settle(
  grossCents: number,
  discountCents: number,
  rule: CommissionRule = DEFAULT_COMMISSION,
  paymentFeeBps = 0,
): Settlement {
  if (grossCents < 0 || discountCents < 0) throw new Error('Valores negativos');
  const charged = Math.max(0, grossCents - discountCents);
  let fee = applyBps(grossCents, rule.percentBps) + rule.fixedCents;
  fee = Math.max(rule.minCents, fee);
  if (rule.maxCents !== null) fee = Math.min(rule.maxCents, fee);
  fee = Math.min(fee, grossCents);
  const paymentFee = applyBps(charged, paymentFeeBps);
  const providerPayout = Math.max(0, grossCents - fee - (rule.passPaymentFeeToProvider ? paymentFee : 0));
  const platformNet = charged - providerPayout - (rule.passPaymentFeeToProvider ? 0 : paymentFee);
  return {
    grossCents,
    discountCents,
    chargedCents: charged,
    platformFeeCents: fee,
    paymentFeeCents: paymentFee,
    providerPayoutCents: providerPayout,
    platformNetCents: roundHalfUp(platformNet),
  };
}

/** Escolhe a regra mais específica: categoria+região > categoria > região > global. */
export function pickCommissionRule<T extends { categoryId: string | null; regionId: string | null }>(
  rules: T[],
  categoryId: string | null,
  regionId: string | null,
): T | null {
  const score = (r: T) =>
    (r.categoryId && r.categoryId === categoryId ? 2 : r.categoryId ? -10 : 0) +
    (r.regionId && r.regionId === regionId ? 1 : r.regionId ? -10 : 0);
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const r of rules) {
    const s = score(r);
    if (s < 0) continue;
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}
