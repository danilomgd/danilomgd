import {
  type ActorType,
  type OrderStatus,
  TERMINAL_ORDER_STATUSES,
  type TransitionAction,
  type WorkflowKind,
} from '@velio/contracts';
import { builtinDefinitions } from './definitions';
import { guards } from './guards';
import type {
  Actor,
  OrderSnapshot,
  Transition,
  TransitionContext,
  TransitionResult,
  WorkflowDefinition,
} from './types';

const registry = new Map<string, WorkflowDefinition>();

function key(kind: WorkflowKind, version: number) {
  return `${kind}@${version}`;
}

/** Registra uma definição (embutida ou vinda do banco). A maior versão vira a padrão do tipo. */
export function registerWorkflow(def: WorkflowDefinition): void {
  validateDefinition(def);
  registry.set(key(def.kind, def.version), def);
}

export function getWorkflow(kind: WorkflowKind, version?: number): WorkflowDefinition {
  if (version !== undefined) {
    const d = registry.get(key(kind, version));
    if (!d) throw new Error(`Workflow ${kind}@${version} não registrado`);
    return d;
  }
  let best: WorkflowDefinition | undefined;
  for (const d of registry.values()) {
    if (d.kind === kind && (!best || d.version > best.version)) best = d;
  }
  if (!best) throw new Error(`Nenhuma definição para ${kind}`);
  return best;
}

export function listWorkflows(): WorkflowDefinition[] {
  return [...registry.values()];
}

function matchesFrom(t: Transition, status: OrderStatus): boolean {
  return Array.isArray(t.from) ? t.from.includes(status) : t.from === status;
}

/** Ações que um ator pode disparar agora, já avaliando guards (para a UI mostrar só o possível). */
export function allowedActions(
  def: WorkflowDefinition,
  order: OrderSnapshot,
  actor: Actor,
  ctx: TransitionContext = { now: new Date(), payload: {} },
): TransitionAction[] {
  if (TERMINAL_ORDER_STATUSES.has(order.status)) return [];
  const out: TransitionAction[] = [];
  for (const t of def.transitions) {
    if (!matchesFrom(t, order.status) || !t.allowedActors.includes(actor.type)) continue;
    // Guards que dependem de payload (PIN, evidências) não bloqueiam a listagem; os demais sim.
    const soft = new Set([
      'requiresPin',
      'requiresEvidence:AFTER',
      'requiresEvidence:BEFORE',
      'requiresEvidence:PICKUP',
      'requiresEvidence:DELIVERY',
      'requiresCustodyScan',
      'requiresVehicleHandover',
    ]);
    const blocked = (t.guards ?? []).some((g) => !soft.has(g) && guards[g](order, actor, ctx) !== true);
    if (!blocked && !out.includes(t.action)) out.push(t.action);
  }
  return out;
}

export function applyTransition(
  def: WorkflowDefinition,
  order: OrderSnapshot,
  action: TransitionAction,
  actor: Actor,
  ctx: TransitionContext = { now: new Date(), payload: {} },
): TransitionResult {
  if (TERMINAL_ORDER_STATUSES.has(order.status)) {
    return { ok: false, code: 'TERMINAL', reason: `Ordem em estado terminal (${order.status})` };
  }
  const candidates = def.transitions.filter((t) => matchesFrom(t, order.status) && t.action === action);
  if (candidates.length === 0) {
    return { ok: false, code: 'INVALID_ACTION', reason: `Ação ${action} não permitida em ${order.status}` };
  }
  const byActor = candidates.filter((t) => t.allowedActors.includes(actor.type));
  if (byActor.length === 0) {
    return { ok: false, code: 'FORBIDDEN_ACTOR', reason: `Ator ${actor.type} não pode executar ${action}` };
  }
  let lastFailure: { guard: GuardNameLike; reason: string } | null = null;
  for (const t of byActor) {
    let failed = false;
    for (const g of t.guards ?? []) {
      const r = guards[g](order, actor, ctx);
      if (r !== true) {
        lastFailure = { guard: g, reason: r };
        failed = true;
        break;
      }
    }
    if (!failed) {
      return { ok: true, from: order.status, to: t.to, effects: [...(t.effects ?? [])], transition: t };
    }
  }
  return {
    ok: false,
    code: 'GUARD_FAILED',
    reason: lastFailure?.reason ?? 'Guard falhou',
    guard: lastFailure?.guard,
  };
}

type GuardNameLike = Transition['guards'] extends (infer G)[] | undefined ? G : never;

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.has(status);
}

export function stateMeta(def: WorkflowDefinition, status: OrderStatus) {
  return def.states[status] ?? {};
}

export function validateDefinition(def: WorkflowDefinition): void {
  const reachable = new Set<OrderStatus>([def.initial]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of def.transitions) {
      const froms = Array.isArray(t.from) ? t.from : [t.from];
      if (froms.some((f) => reachable.has(f)) && !reachable.has(t.to)) {
        reachable.add(t.to);
        changed = true;
      }
    }
  }
  for (const t of def.transitions) {
    if (t.allowedActors.length === 0) throw new Error(`${def.kind}: transição ${t.action} sem atores`);
    for (const g of t.guards ?? []) {
      if (!(g in guards)) throw new Error(`${def.kind}: guard desconhecido ${g}`);
    }
  }
  const declared = Object.keys(def.states) as OrderStatus[];
  for (const s of declared) {
    if (!reachable.has(s)) throw new Error(`${def.kind}: estado ${s} declarado mas inalcançável`);
  }
}

/** Serializa a definição para o painel admin e para a documentação gerada. */
export function describeWorkflow(def: WorkflowDefinition) {
  return {
    kind: def.kind,
    version: def.version,
    initial: def.initial,
    transitions: def.transitions.map((t) => ({
      from: Array.isArray(t.from) ? t.from : [t.from],
      to: t.to,
      action: t.action,
      actors: t.allowedActors,
      guards: t.guards ?? [],
      effects: t.effects ?? [],
      describe: t.describe ?? null,
    })),
  };
}

export type { ActorType };

for (const d of builtinDefinitions) registerWorkflow(d);
