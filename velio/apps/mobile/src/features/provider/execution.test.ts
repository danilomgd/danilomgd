import { describe, expect, it } from 'vitest';
import { actionSpecs, currentStepIndex } from './execution';

describe('execução do prestador', () => {
  it('posiciona a etapa atual por workflow com aliases', () => {
    expect(currentStepIndex('IMMEDIATE', 'ARRIVED')).toBe(2);
    expect(currentStepIndex('SCHEDULED', 'REMINDED')).toBe(0);
    expect(currentStepIndex('QUOTE', 'QUOTE_APPROVED')).toBe(2);
    expect(currentStepIndex('LOGISTICS', 'THIRD_PARTY_IN_PROGRESS')).toBe(4);
    expect(currentStepIndex('CONCIERGE', 'IN_EXECUTION')).toBe(-1);
  });
  it('deriva uma única ação principal de allowedActions e ignora ações de outros atores', () => {
    const specs = actionSpecs(['customer.cancel', 'provider.arrive', 'provider.cancel'], {
      quoteAllowed: false,
    });
    expect(specs.map((s) => s.action)).toEqual(['provider.arrive', 'provider.cancel']);
    expect(specs.filter((s) => s.primary)).toHaveLength(1);
    expect(specs[0]).toMatchObject({ label: 'Cheguei', kind: 'transition', primary: true });
  });
  it('adiciona orçamento adicional como ação secundária quando permitido', () => {
    const specs = actionSpecs(['provider.complete'], { quoteAllowed: true });
    expect(specs.map((s) => s.kind)).toEqual(['complete', 'quote']);
    expect(specs[1]?.primary).toBe(false);
  });
});
