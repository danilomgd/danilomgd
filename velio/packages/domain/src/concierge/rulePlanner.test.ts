import { ConciergePlan } from '@velio/contracts';
import { describe, expect, it } from 'vitest';
import { needsHumanReview, RuleBasedPlanner } from './rulePlanner';

const ctx = {
  now: new Date('2026-10-13T12:00:00Z'),
  timezone: 'America/Sao_Paulo',
  hasVehicle: true,
  hasAddress: true,
  settings: { humanReviewAboveCents: 50000, humanReviewAboveTasks: 4, alwaysHumanForKinds: ['PURCHASE'] },
};

describe('RuleBasedPlanner', () => {
  const planner = new RuleBasedPlanner();

  it('carro para revisão vira 6 tarefas encadeadas e exige humano', async () => {
    const plan = await planner.plan(
      'Pegue meu carro amanhã às 8h, leve para revisão na concessionária e devolva quando terminar.',
      ctx,
    );
    expect(ConciergePlan.safeParse(plan).success).toBe(true);
    expect(plan.tasks.map((t) => t.kind)).toEqual([
      'VEHICLE_PICKUP',
      'TRANSPORT',
      'THIRD_PARTY_SERVICE',
      'WAIT',
      'RETURN_PICKUP',
      'VEHICLE_RETURN',
    ]);
    expect(plan.tasks[0]?.startsAt).toBeDefined();
    expect(plan.tasks[5]?.dependsOnSeq).toEqual([5]);
    expect(plan.requiresHuman).toBe(true);
    expect(plan.clarifications).toHaveLength(0);
  });

  it('sem veículo cadastrado pede esclarecimento e baixa a confiança', async () => {
    const plan = await planner.plan('Busque meu carro e leve para lavar', { ...ctx, hasVehicle: false });
    expect(plan.clarifications.some((c) => /placa/i.test(c))).toBe(true);
    expect(plan.confidence).toBeLessThan(0.6);
  });

  it('padrão desconhecido sempre vai para humano', async () => {
    const plan = await planner.plan('Preciso de alguém para organizar minha biblioteca por cor', ctx);
    expect(plan.requiresHuman).toBe(true);
    expect(plan.confidence).toBeLessThan(0.5);
  });

  it('needsHumanReview aplica limites da plataforma mesmo se o planejador não pediu', () => {
    const plan: ConciergePlan = {
      summary: 'x',
      tasks: [{ seq: 1, title: 'Comprar peça', kind: 'PURCHASE', dependsOnSeq: [] }],
      estimateMinCents: 1000,
      estimateMaxCents: 2000,
      confidence: 0.9,
      clarifications: [],
      requiresHuman: false,
      requiresHumanReasons: [],
    };
    const r = needsHumanReview(plan, ctx.settings);
    expect(r.required).toBe(true);
    expect(r.reasons[0]).toMatch(/sempre exige humano/);
  });
});
