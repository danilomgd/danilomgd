import { describe, expect, it } from 'vitest';
import { DEFAULT_COMMISSION, pickCommissionRule, settle } from './commission';
import { couponDiscount, estimatePrice } from './estimate';

describe('estimatePrice', () => {
  it('preço fixo com opções e cupom percentual', () => {
    const e = estimatePrice(
      {
        pricingModel: 'FIXED',
        basePriceCents: 8000,
        priceMinCents: null,
        priceMaxCents: null,
        hourlyRateCents: null,
        estimatedDurationMinutes: 60,
        options: [
          {
            key: 'urgente',
            label: 'Atendimento urgente',
            type: 'boolean',
            required: false,
            unitPriceCents: 2000,
          },
          { key: 'pontos', label: 'Pontos extras', type: 'number', required: false, unitPriceCents: 1500 },
        ],
      },
      { urgente: true, pontos: 2 },
      { code: 'BEMVINDO10', kind: 'PERCENT', value: 10, minOrderCents: null, maxDiscountCents: 1000 },
    );
    expect(e.subtotalCents).toBe(13000);
    expect(e.discountCents).toBe(1000); // 10% = 1300, limitado a 1000
    expect(e.totalCents).toBe(12000);
    expect(e.requiresQuote).toBe(false);
  });

  it('por hora usa duração estimada e surge', () => {
    const e = estimatePrice({
      pricingModel: 'HOURLY',
      basePriceCents: null,
      priceMinCents: null,
      priceMaxCents: null,
      hourlyRateCents: 6000,
      estimatedDurationMinutes: 90,
      options: [],
      surgeMultiplierBps: 12000,
    });
    expect(e.subtotalCents).toBe(10800); // 6000*1.5 = 9000 ×1.2
  });

  it('QUOTE não tem total; RANGE tem faixa', () => {
    const q = estimatePrice({
      pricingModel: 'QUOTE',
      basePriceCents: null,
      priceMinCents: 15000,
      priceMaxCents: 60000,
      hourlyRateCents: null,
      estimatedDurationMinutes: null,
      options: [],
    });
    expect(q.requiresQuote).toBe(true);
    expect(q.totalCents).toBeNull();
    const r = estimatePrice({
      pricingModel: 'RANGE',
      basePriceCents: null,
      priceMinCents: 10000,
      priceMaxCents: 18000,
      hourlyRateCents: null,
      estimatedDurationMinutes: null,
      options: [],
    });
    expect(r.minCents).toBe(10000);
    expect(r.maxCents).toBe(18000);
  });

  it('cupom respeita pedido mínimo e nunca excede o subtotal', () => {
    expect(
      couponDiscount(5000, {
        code: 'X',
        kind: 'FIXED',
        value: 2000,
        minOrderCents: 8000,
        maxDiscountCents: null,
      }),
    ).toBe(0);
    expect(
      couponDiscount(1500, {
        code: 'X',
        kind: 'FIXED',
        value: 2000,
        minOrderCents: null,
        maxDiscountCents: null,
      }),
    ).toBe(1500);
  });
});

describe('settle', () => {
  it('divide bruto em comissão e repasse; desconto é custo da plataforma', () => {
    const s = settle(10000, 1000, DEFAULT_COMMISSION);
    expect(s.chargedCents).toBe(9000);
    expect(s.platformFeeCents).toBe(2000);
    expect(s.providerPayoutCents).toBe(8000);
    expect(s.platformNetCents).toBe(1000);
  });

  it('aplica mínimo e máximo de comissão', () => {
    expect(settle(1000, 0, { ...DEFAULT_COMMISSION, minCents: 500 }).platformFeeCents).toBe(500);
    expect(settle(100000, 0, { ...DEFAULT_COMMISSION, maxCents: 5000 }).platformFeeCents).toBe(5000);
  });

  it('taxa de pagamento pode ser repassada ao prestador', () => {
    const a = settle(10000, 0, { ...DEFAULT_COMMISSION, passPaymentFeeToProvider: true }, 320);
    const b = settle(10000, 0, DEFAULT_COMMISSION, 320);
    expect(a.providerPayoutCents).toBe(8000 - 320);
    expect(b.providerPayoutCents).toBe(8000);
    expect(b.platformNetCents).toBe(2000 - 320);
  });

  it('arredondamento meio para cima', () => {
    expect(
      settle(1001, 0, {
        percentBps: 1500,
        fixedCents: 0,
        minCents: 0,
        maxCents: null,
        passPaymentFeeToProvider: false,
      }).platformFeeCents,
    ).toBe(150);
    expect(
      settle(1003, 0, {
        percentBps: 1500,
        fixedCents: 0,
        minCents: 0,
        maxCents: null,
        passPaymentFeeToProvider: false,
      }).platformFeeCents,
    ).toBe(150);
    expect(
      settle(1010, 0, {
        percentBps: 1500,
        fixedCents: 0,
        minCents: 0,
        maxCents: null,
        passPaymentFeeToProvider: false,
      }).platformFeeCents,
    ).toBe(152);
  });
});

describe('pickCommissionRule', () => {
  const rules = [
    { id: 'g', categoryId: null, regionId: null },
    { id: 'c', categoryId: 'cat1', regionId: null },
    { id: 'cr', categoryId: 'cat1', regionId: 'reg1' },
    { id: 'other', categoryId: 'cat2', regionId: null },
  ];
  it('escolhe a mais específica aplicável', () => {
    expect(pickCommissionRule(rules, 'cat1', 'reg1')?.id).toBe('cr');
    expect(pickCommissionRule(rules, 'cat1', 'reg9')?.id).toBe('c');
    expect(pickCommissionRule(rules, 'cat3', null)?.id).toBe('g');
  });
});
