import type { OrderStatus } from '@velio/contracts';
import { describe, expect, it } from 'vitest';
import {
  allowedActions,
  applyTransition,
  describeWorkflow,
  getWorkflow,
  listWorkflows,
  validateDefinition,
} from './engine';
import type { Actor, OrderSnapshot } from './types';

const customer: Actor = { type: 'customer', userId: 'u1' };
const provider: Actor = { type: 'provider', userId: 'u2', providerId: 'p1' };
const otherProvider: Actor = { type: 'provider', userId: 'u3', providerId: 'p9' };
const system: Actor = { type: 'system', userId: null };
const operator: Actor = { type: 'operator', userId: 'op' };

function order(partial: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id: 'o1',
    customerId: 'u1',
    providerId: null,
    status: 'REQUESTED',
    workflowKind: 'IMMEDIATE',
    priceCents: 8000,
    acceptedAt: null,
    scheduledFor: null,
    startPin: '1234',
    requiresStartPin: false,
    requiresBeforeAfterPhotos: false,
    requiresCustody: false,
    requiresVehicleHandover: false,
    evidenceKinds: [],
    quotes: [],
    paymentAuthorized: false,
    childOrders: [],
    hasPlan: false,
    custodyScannedForCurrentStep: false,
    vehicleHandoverRecorded: false,
    ...partial,
  };
}

const ctx = { now: new Date('2026-10-13T12:00:00Z'), payload: {} };

describe('definições embutidas', () => {
  it('registra os seis workflows e todos validam', () => {
    const kinds = listWorkflows()
      .map((w) => w.kind)
      .sort();
    expect(kinds).toEqual(['CONCIERGE', 'IMMEDIATE', 'LAUNDRY', 'LOGISTICS', 'QUOTE', 'SCHEDULED']);
    for (const w of listWorkflows()) expect(() => validateDefinition(w)).not.toThrow();
  });

  it('describeWorkflow serializa transições', () => {
    const d = describeWorkflow(getWorkflow('IMMEDIATE'));
    expect(d.initial).toBe('REQUESTED');
    expect(d.transitions.some((t) => t.action === 'provider.accept')).toBe(true);
  });
});

describe('IMMEDIATE: caminho feliz', () => {
  const def = getWorkflow('IMMEDIATE');

  it('percorre REQUESTED → REVIEWED com os atores corretos', () => {
    let o = order();
    const steps: Array<[Actor, Parameters<typeof applyTransition>[2], OrderStatus]> = [
      [system, 'system.start_matching', 'MATCHING'],
      [system, 'system.offer', 'OFFERED'],
      [provider, 'provider.accept', 'ACCEPTED'],
      [provider, 'provider.en_route', 'EN_ROUTE'],
      [provider, 'provider.arrive', 'ARRIVED'],
      [provider, 'provider.start', 'IN_PROGRESS'],
      [provider, 'provider.complete', 'COMPLETED'],
      [customer, 'customer.review', 'REVIEWED'],
    ];
    for (const [actor, action, expected] of steps) {
      const r = applyTransition(def, o, action, actor, ctx);
      expect(r.ok, `${action} em ${o.status}`).toBe(true);
      if (!r.ok) return;
      expect(r.to).toBe(expected);
      o = { ...o, status: r.to, providerId: action === 'provider.accept' ? 'p1' : o.providerId };
    }
    expect(applyTransition(def, o, 'customer.cancel', customer, ctx)).toMatchObject({
      ok: false,
      code: 'TERMINAL',
    });
  });

  it('aceite dispara autorização de pagamento e notificação', () => {
    const r = applyTransition(def, order({ status: 'OFFERED' }), 'provider.accept', provider, ctx);
    expect(r.ok && r.effects).toContain('payments.authorize');
    expect(r.ok && r.effects).toContain('notify.customer:provider_found');
  });

  it('conclusão captura pagamento e liquida carteira', () => {
    const r = applyTransition(
      def,
      order({ status: 'IN_PROGRESS', providerId: 'p1' }),
      'provider.complete',
      provider,
      ctx,
    );
    expect(r.ok && r.effects).toEqual(expect.arrayContaining(['payments.capture', 'wallet.settle']));
  });
});

describe('IMMEDIATE: guards', () => {
  const def = getWorkflow('IMMEDIATE');

  it('outro prestador não pode iniciar a ordem', () => {
    const r = applyTransition(
      def,
      order({ status: 'ARRIVED', providerId: 'p1' }),
      'provider.start',
      otherProvider,
      ctx,
    );
    expect(r).toMatchObject({ ok: false, code: 'GUARD_FAILED', guard: 'actorIsAssignedProvider' });
  });

  it('exige PIN quando a categoria pede', () => {
    const o = order({ status: 'ARRIVED', providerId: 'p1', requiresStartPin: true });
    expect(applyTransition(def, o, 'provider.start', provider, ctx)).toMatchObject({
      ok: false,
      guard: 'requiresPin',
    });
    expect(
      applyTransition(def, o, 'provider.start', provider, { ...ctx, payload: { pin: '0000' } }),
    ).toMatchObject({ ok: false });
    expect(
      applyTransition(def, o, 'provider.start', provider, { ...ctx, payload: { pin: '1234' } }),
    ).toMatchObject({ ok: true, to: 'IN_PROGRESS' });
  });

  it('exige foto "depois" quando a categoria pede', () => {
    const o = order({
      status: 'IN_PROGRESS',
      providerId: 'p1',
      requiresBeforeAfterPhotos: true,
      evidenceKinds: ['BEFORE'],
    });
    expect(applyTransition(def, o, 'provider.complete', provider, ctx)).toMatchObject({
      ok: false,
      guard: 'requiresEvidence:AFTER',
    });
    expect(
      applyTransition(def, { ...o, evidenceKinds: ['BEFORE', 'AFTER'] }, 'provider.complete', provider, ctx),
    ).toMatchObject({ ok: true });
  });

  it('não conclui com orçamento adicional pendente', () => {
    const o = order({
      status: 'IN_PROGRESS',
      providerId: 'p1',
      quotes: [{ kind: 'ADDITIONAL', status: 'SENT' }],
    });
    expect(applyTransition(def, o, 'provider.complete', provider, ctx)).toMatchObject({
      ok: false,
      guard: 'noOpenAdditionalQuote',
    });
    expect(
      applyTransition(
        def,
        { ...o, quotes: [{ kind: 'ADDITIONAL', status: 'APPROVED' }] },
        'provider.complete',
        provider,
        ctx,
      ),
    ).toMatchObject({ ok: true });
  });

  it('cliente não cancela durante a execução; pode abrir disputa após conclusão', () => {
    expect(
      applyTransition(
        def,
        order({ status: 'IN_PROGRESS', providerId: 'p1' }),
        'customer.cancel',
        customer,
        ctx,
      ),
    ).toMatchObject({ ok: false });
    const r = applyTransition(
      def,
      order({ status: 'COMPLETED', providerId: 'p1' }),
      'customer.open_dispute',
      customer,
      ctx,
    );
    expect(r).toMatchObject({ ok: true, to: 'DISPUTED' });
    expect(r.ok && r.effects).toContain('wallet.hold');
  });

  it('outro cliente não cancela a ordem', () => {
    const r = applyTransition(
      def,
      order({ status: 'MATCHING' }),
      'customer.cancel',
      { type: 'customer', userId: 'intruso' },
      ctx,
    );
    expect(r).toMatchObject({ ok: false, guard: 'actorIsOrderCustomer' });
  });

  it('cliente comum não executa ação de sistema', () => {
    expect(applyTransition(def, order(), 'system.start_matching', customer, ctx)).toMatchObject({
      ok: false,
      code: 'FORBIDDEN_ACTOR',
    });
  });

  it('prestador cancela e a ordem volta para MATCHING com penalidade', () => {
    const r = applyTransition(
      def,
      order({ status: 'ACCEPTED', providerId: 'p1' }),
      'provider.cancel',
      provider,
      ctx,
    );
    expect(r).toMatchObject({ ok: true, to: 'MATCHING' });
    expect(r.ok && r.effects).toEqual(
      expect.arrayContaining(['reputation.penalizeProviderCancel', 'dispatch.restart']),
    );
  });

  it('sem prestador: sistema escala e operador atribui manualmente', () => {
    const r1 = applyTransition(def, order({ status: 'OFFERED' }), 'system.no_provider', system, ctx);
    expect(r1).toMatchObject({ ok: true, to: 'NO_PROVIDER_FOUND' });
    const r2 = applyTransition(def, order({ status: 'NO_PROVIDER_FOUND' }), 'operator.assign', operator, ctx);
    expect(r2).toMatchObject({ ok: true, to: 'ACCEPTED' });
  });

  it('allowedActions lista o que o ator pode fazer agora', () => {
    expect(allowedActions(def, order({ status: 'ARRIVED', providerId: 'p1' }), provider, ctx)).toEqual(
      expect.arrayContaining(['provider.start', 'provider.cancel']),
    );
    expect(allowedActions(def, order({ status: 'ARRIVED', providerId: 'p1' }), customer, ctx)).toEqual([
      'customer.cancel',
    ]);
    expect(allowedActions(def, order({ status: 'REVIEWED' }), customer, ctx)).toEqual([]);
  });
});

describe('QUOTE', () => {
  const def = getWorkflow('QUOTE');
  it('exige orçamento enviado, aprovação do cliente e pagamento autorizado antes de executar', () => {
    let o = order({ workflowKind: 'QUOTE', status: 'UNDER_REVIEW', providerId: 'p1' });
    expect(applyTransition(def, o, 'provider.submit_quote', provider, ctx)).toMatchObject({
      ok: false,
      guard: 'hasSentQuote',
    });
    o = { ...o, quotes: [{ kind: 'INITIAL', status: 'SENT' }] };
    const q = applyTransition(def, o, 'provider.submit_quote', provider, ctx);
    expect(q).toMatchObject({ ok: true, to: 'QUOTED' });
    o = { ...o, status: 'QUOTED' };
    expect(applyTransition(def, o, 'customer.approve_quote', customer, ctx)).toMatchObject({
      ok: false,
      guard: 'hasApprovedQuote',
    });
    o = { ...o, quotes: [{ kind: 'INITIAL', status: 'APPROVED' }] };
    expect(applyTransition(def, o, 'customer.approve_quote', customer, ctx)).toMatchObject({
      ok: true,
      to: 'QUOTE_APPROVED',
    });
    o = { ...o, status: 'QUOTE_APPROVED' };
    expect(applyTransition(def, o, 'customer.authorize_payment', customer, ctx)).toMatchObject({
      ok: false,
      guard: 'paymentAuthorized',
    });
    o = { ...o, paymentAuthorized: true };
    expect(applyTransition(def, o, 'customer.authorize_payment', customer, ctx)).toMatchObject({
      ok: true,
      to: 'AUTHORIZED',
    });
  });

  it('recusa volta a permitir novo orçamento', () => {
    const o = order({ workflowKind: 'QUOTE', status: 'QUOTED', providerId: 'p1' });
    expect(applyTransition(def, o, 'customer.reject_quote', customer, ctx)).toMatchObject({
      ok: true,
      to: 'QUOTE_REJECTED',
    });
    const again = applyTransition(
      def,
      { ...o, status: 'QUOTE_REJECTED', quotes: [{ kind: 'INITIAL', status: 'SENT' }] },
      'provider.submit_quote',
      provider,
      ctx,
    );
    expect(again).toMatchObject({ ok: true, to: 'QUOTED' });
  });
});

describe('LOGISTICS / LAUNDRY', () => {
  const def = getWorkflow('LOGISTICS');
  it('coleta exige custódia, foto e, para veículo, handover', () => {
    const o = order({
      workflowKind: 'LOGISTICS',
      status: 'EN_ROUTE_PICKUP',
      providerId: 'p1',
      requiresCustody: true,
      requiresVehicleHandover: true,
    });
    expect(applyTransition(def, o, 'provider.pickup', provider, ctx)).toMatchObject({
      ok: false,
      guard: 'requiresCustodyScan',
    });
    const o2 = { ...o, custodyScannedForCurrentStep: true };
    expect(applyTransition(def, o2, 'provider.pickup', provider, ctx)).toMatchObject({
      ok: false,
      guard: 'requiresVehicleHandover',
    });
    const o3 = { ...o2, vehicleHandoverRecorded: true };
    expect(applyTransition(def, o3, 'provider.pickup', provider, ctx)).toMatchObject({
      ok: false,
      guard: 'requiresEvidence:PICKUP',
    });
    const o4 = { ...o3, evidenceKinds: ['PICKUP'] };
    const r = applyTransition(def, o4, 'provider.pickup', provider, ctx);
    expect(r).toMatchObject({ ok: true, to: 'PICKED_UP' });
    expect(r.ok && r.effects).toContain('custody.record');
  });

  it('percorre o ciclo completo de leva e traz', () => {
    const seq: Array<[Parameters<typeof applyTransition>[2], OrderStatus]> = [
      ['provider.depart', 'IN_TRANSIT'],
      ['provider.arrive_destination', 'AT_DESTINATION'],
      ['provider.third_party_start', 'THIRD_PARTY_IN_PROGRESS'],
      ['provider.third_party_done', 'THIRD_PARTY_DONE'],
      ['provider.return_pickup', 'RETURN_PICKUP'],
      ['provider.return_depart', 'RETURNING'],
      ['provider.deliver', 'DELIVERED'],
      ['provider.complete', 'COMPLETED'],
    ];
    let o = order({
      workflowKind: 'LOGISTICS',
      status: 'PICKED_UP',
      providerId: 'p1',
      evidenceKinds: ['PICKUP', 'DELIVERY'],
    });
    for (const [a, to] of seq) {
      const r = applyTransition(def, o, a, provider, ctx);
      expect(r.ok, a).toBe(true);
      if (r.ok) o = { ...o, status: r.to };
      expect(o.status).toBe(to);
    }
  });

  it('LAUNDRY compartilha a máquina do LOGISTICS', () => {
    expect(getWorkflow('LAUNDRY').transitions.length).toBe(def.transitions.length);
  });
});

describe('CONCIERGE', () => {
  const def = getWorkflow('CONCIERGE');
  it('plano → aprovação → orçamento → execução → conclusão quando filhas terminam', () => {
    let o = order({ workflowKind: 'CONCIERGE', status: 'SUBMITTED' });
    expect(applyTransition(def, o, 'system.start_matching', system, ctx)).toMatchObject({
      ok: true,
      to: 'INTERPRETING',
    });
    o = { ...o, status: 'INTERPRETING' };
    expect(applyTransition(def, o, 'system.plan_ready', system, ctx)).toMatchObject({
      ok: false,
      guard: 'planPresent',
    });
    o = { ...o, hasPlan: true };
    expect(applyTransition(def, o, 'system.plan_ready', system, ctx)).toMatchObject({
      ok: true,
      to: 'PLAN_PROPOSED',
    });
    o = { ...o, status: 'PLAN_PROPOSED' };
    expect(applyTransition(def, o, 'customer.approve_plan', customer, ctx)).toMatchObject({
      ok: true,
      to: 'PLAN_APPROVED',
    });
    o = { ...o, status: 'PLAN_APPROVED', quotes: [{ kind: 'INITIAL', status: 'SENT' }] };
    expect(applyTransition(def, o, 'provider.submit_quote', system, ctx)).toMatchObject({
      ok: true,
      to: 'QUOTED',
    });
    o = { ...o, status: 'QUOTED', quotes: [{ kind: 'INITIAL', status: 'APPROVED' }] };
    expect(applyTransition(def, o, 'customer.approve_quote', customer, ctx)).toMatchObject({
      ok: true,
      to: 'QUOTE_APPROVED',
    });
    o = { ...o, status: 'QUOTE_APPROVED', paymentAuthorized: true };
    const ex = applyTransition(def, o, 'customer.authorize_payment', customer, ctx);
    expect(ex).toMatchObject({ ok: true, to: 'IN_EXECUTION' });
    expect(ex.ok && ex.effects).toContain('concierge.spawnChildren');
    o = { ...o, status: 'IN_EXECUTION', childOrders: [{ status: 'COMPLETED' }, { status: 'IN_PROGRESS' }] };
    expect(applyTransition(def, o, 'system.children_completed', system, ctx)).toMatchObject({
      ok: false,
      guard: 'allChildrenDone',
    });
    o = { ...o, childOrders: [{ status: 'COMPLETED' }, { status: 'REVIEWED' }] };
    expect(applyTransition(def, o, 'system.children_completed', system, ctx)).toMatchObject({
      ok: true,
      to: 'COMPLETED',
    });
  });

  it('baixa confiança vai para humano e operador devolve ao cliente', () => {
    const o = order({ workflowKind: 'CONCIERGE', status: 'INTERPRETING', hasPlan: true });
    expect(applyTransition(def, o, 'system.plan_needs_human', system, ctx)).toMatchObject({
      ok: true,
      to: 'NEEDS_HUMAN',
    });
    expect(
      applyTransition(def, { ...o, status: 'NEEDS_HUMAN' }, 'operator.approve_plan', operator, ctx),
    ).toMatchObject({ ok: true, to: 'PLAN_PROPOSED' });
  });
});

describe('SCHEDULED', () => {
  const def = getWorkflow('SCHEDULED');
  it('lembrete é idempotente no estado e aceita ida após lembrete', () => {
    const o = order({
      workflowKind: 'SCHEDULED',
      status: 'ACCEPTED',
      providerId: 'p1',
      scheduledFor: new Date('2026-10-14T12:00:00Z'),
    });
    expect(applyTransition(def, o, 'system.remind', system, ctx)).toMatchObject({ ok: true, to: 'REMINDED' });
    expect(
      applyTransition(def, { ...o, status: 'REMINDED' }, 'provider.en_route', provider, ctx),
    ).toMatchObject({ ok: true, to: 'EN_ROUTE' });
  });
});
