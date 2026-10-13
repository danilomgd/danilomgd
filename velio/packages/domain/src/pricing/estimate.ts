import type { PriceEstimate, PricingModel, ServiceOption } from '@velio/contracts';

export interface PriceSource {
  pricingModel: PricingModel;
  basePriceCents: number | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  hourlyRateCents: number | null;
  estimatedDurationMinutes: number | null;
  options: ServiceOption[];
  /** Multiplicador em bps (10000 = 1x). */
  surgeMultiplierBps?: number;
}

export interface CouponSource {
  code: string;
  kind: 'PERCENT' | 'FIXED';
  value: number;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
}

export function roundHalfUp(n: number): number {
  return Math.floor(n + 0.5);
}

export function applyBps(cents: number, bps: number): number {
  return roundHalfUp((cents * bps) / 10000);
}

export function optionsDelta(
  options: ServiceOption[],
  chosen: Record<string, string | number | boolean>,
): { total: number; lines: Array<{ label: string; amountCents: number }> } {
  let total = 0;
  const lines: Array<{ label: string; amountCents: number }> = [];
  for (const opt of options) {
    const v = chosen[opt.key];
    if (v === undefined) continue;
    if (opt.type === 'select' && typeof v === 'string') {
      const choice = opt.choices?.find((c) => c.value === v);
      if (choice && choice.priceDeltaCents) {
        total += choice.priceDeltaCents;
        lines.push({ label: `${opt.label}: ${choice.label}`, amountCents: choice.priceDeltaCents });
      }
    } else if (opt.type === 'number' && typeof v === 'number' && opt.unitPriceCents) {
      const amt = roundHalfUp(v * opt.unitPriceCents);
      total += amt;
      lines.push({ label: `${opt.label} ×${v}`, amountCents: amt });
    } else if (opt.type === 'boolean' && v === true && opt.unitPriceCents) {
      total += opt.unitPriceCents;
      lines.push({ label: opt.label, amountCents: opt.unitPriceCents });
    }
  }
  return { total, lines };
}

export function couponDiscount(subtotalCents: number, coupon: CouponSource | null): number {
  if (!coupon) return 0;
  if (coupon.minOrderCents !== null && subtotalCents < coupon.minOrderCents) return 0;
  let d = coupon.kind === 'PERCENT' ? applyBps(subtotalCents, coupon.value * 100) : coupon.value;
  if (coupon.maxDiscountCents !== null) d = Math.min(d, coupon.maxDiscountCents);
  return Math.min(d, subtotalCents);
}

export function estimatePrice(
  src: PriceSource,
  chosen: Record<string, string | number | boolean> = {},
  coupon: CouponSource | null = null,
): PriceEstimate {
  const surge = src.surgeMultiplierBps ?? 10000;
  const { total: delta, lines } = optionsDelta(src.options, chosen);
  const breakdown: Array<{ label: string; amountCents: number }> = [];

  if (src.pricingModel === 'QUOTE') {
    return {
      pricingModel: 'QUOTE',
      subtotalCents: null,
      minCents: src.priceMinCents,
      maxCents: src.priceMaxCents,
      discountCents: 0,
      totalCents: null,
      requiresQuote: true,
      breakdown: [{ label: 'Orçamento após análise', amountCents: 0 }, ...lines],
    };
  }

  if (src.pricingModel === 'RANGE') {
    const min = src.priceMinCents ?? 0;
    const max = src.priceMaxCents ?? min;
    return {
      pricingModel: 'RANGE',
      subtotalCents: null,
      minCents: applyBps(min + delta, surge),
      maxCents: applyBps(max + delta, surge),
      discountCents: 0,
      totalCents: null,
      requiresQuote: false,
      breakdown: [{ label: 'Faixa estimada', amountCents: 0 }, ...lines],
    };
  }

  let base = 0;
  if (src.pricingModel === 'FIXED') {
    base = src.basePriceCents ?? 0;
    breakdown.push({ label: 'Serviço', amountCents: base });
  } else {
    const hours = Math.max(1, (src.estimatedDurationMinutes ?? 60) / 60);
    base = roundHalfUp((src.hourlyRateCents ?? 0) * hours);
    breakdown.push({ label: `Mão de obra (${hours.toFixed(1)} h)`, amountCents: base });
  }
  breakdown.push(...lines);
  let subtotal = base + delta;
  if (surge !== 10000) {
    const surged = applyBps(subtotal, surge);
    breakdown.push({ label: 'Ajuste de demanda', amountCents: surged - subtotal });
    subtotal = surged;
  }
  const discount = couponDiscount(subtotal, coupon);
  if (discount > 0) breakdown.push({ label: `Cupom ${coupon?.code}`, amountCents: -discount });
  return {
    pricingModel: src.pricingModel,
    subtotalCents: subtotal,
    minCents: null,
    maxCents: null,
    discountCents: discount,
    totalCents: subtotal - discount,
    requiresQuote: false,
    breakdown,
  };
}
