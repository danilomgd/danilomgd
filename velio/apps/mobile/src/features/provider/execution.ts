import type { OrderStatus, TransitionAction, WorkflowKind } from '@velio/contracts';

/** Etapas da linha do tempo horizontal por tipo de workflow (P-13). */
export const STEPS_BY_KIND: Record<WorkflowKind, Array<{ status: OrderStatus; label: string }>> = {
  IMMEDIATE: [
    { status: 'ACCEPTED', label: 'Aceito' },
    { status: 'EN_ROUTE', label: 'A caminho' },
    { status: 'ARRIVED', label: 'Cheguei' },
    { status: 'IN_PROGRESS', label: 'Em serviço' },
    { status: 'COMPLETED', label: 'Concluído' },
  ],
  SCHEDULED: [
    { status: 'ACCEPTED', label: 'Confirmado' },
    { status: 'EN_ROUTE', label: 'A caminho' },
    { status: 'ARRIVED', label: 'Cheguei' },
    { status: 'IN_PROGRESS', label: 'Em serviço' },
    { status: 'COMPLETED', label: 'Concluído' },
  ],
  QUOTE: [
    { status: 'UNDER_REVIEW', label: 'Análise' },
    { status: 'QUOTED', label: 'Orçamento' },
    { status: 'AUTHORIZED', label: 'Aprovado' },
    { status: 'EN_ROUTE', label: 'A caminho' },
    { status: 'ARRIVED', label: 'Cheguei' },
    { status: 'IN_PROGRESS', label: 'Em serviço' },
    { status: 'COMPLETED', label: 'Concluído' },
  ],
  LOGISTICS: [
    { status: 'DRIVER_ASSIGNED', label: 'Designado' },
    { status: 'EN_ROUTE_PICKUP', label: 'Indo coletar' },
    { status: 'PICKED_UP', label: 'Coletado' },
    { status: 'IN_TRANSIT', label: 'Em trânsito' },
    { status: 'AT_DESTINATION', label: 'No destino' },
    { status: 'THIRD_PARTY_DONE', label: 'Pronto' },
    { status: 'RETURNING', label: 'Voltando' },
    { status: 'DELIVERED', label: 'Entregue' },
  ],
  LAUNDRY: [
    { status: 'DRIVER_ASSIGNED', label: 'Designado' },
    { status: 'EN_ROUTE_PICKUP', label: 'Indo coletar' },
    { status: 'PICKED_UP', label: 'Coletado' },
    { status: 'IN_TRANSIT', label: 'Em trânsito' },
    { status: 'AT_DESTINATION', label: 'Na lavanderia' },
    { status: 'THIRD_PARTY_DONE', label: 'Pronto' },
    { status: 'RETURNING', label: 'Voltando' },
    { status: 'DELIVERED', label: 'Entregue' },
  ],
  CONCIERGE: [],
};

/** Status equivalentes para posicionar a etapa atual (ex.: QUOTE_APPROVED ≈ AUTHORIZED). */
const ALIASES: Partial<Record<OrderStatus, OrderStatus>> = {
  REMINDED: 'ACCEPTED',
  QUOTE_APPROVED: 'AUTHORIZED',
  THIRD_PARTY_IN_PROGRESS: 'AT_DESTINATION',
  RETURN_PICKUP: 'THIRD_PARTY_DONE',
  REVIEWED: 'COMPLETED',
  CLOSED: 'COMPLETED',
};

export function currentStepIndex(kind: WorkflowKind, status: OrderStatus): number {
  const steps = STEPS_BY_KIND[kind];
  const target = ALIASES[status] ?? status;
  return steps.findIndex((s) => s.status === target);
}

export type ActionKind =
  | 'transition'
  | 'start'
  | 'complete'
  | 'quote'
  | 'cancel'
  | 'custody'
  | 'handover'
  | 'hidden';

export interface ActionSpec {
  action: TransitionAction;
  label: string;
  kind: ActionKind;
  /** Etapa de handover do veículo, quando aplicável. */
  handoverStep?: 'PICKUP' | 'DELIVERY';
  /** Ação principal (uma por tela) ou secundária. */
  primary: boolean;
}

const SPECS: Partial<Record<TransitionAction, Omit<ActionSpec, 'action'>>> = {
  'provider.accept': { label: 'Aceitar', kind: 'transition', primary: true },
  'provider.reject': { label: 'Recusar', kind: 'transition', primary: false },
  'provider.en_route': { label: 'Saí para o atendimento', kind: 'transition', primary: true },
  'provider.arrive': { label: 'Cheguei', kind: 'transition', primary: true },
  'provider.start': { label: 'Iniciar serviço', kind: 'start', primary: true },
  'provider.complete': { label: 'Concluir serviço', kind: 'complete', primary: true },
  'provider.submit_quote': { label: 'Enviar orçamento', kind: 'quote', primary: true },
  'provider.start_review': { label: 'Iniciar análise', kind: 'transition', primary: true },
  'provider.cancel': { label: 'Cancelar atendimento', kind: 'cancel', primary: false },
  'provider.pickup': { label: 'Registrar coleta', kind: 'custody', handoverStep: 'PICKUP', primary: true },
  'provider.depart': { label: 'Sair com o item', kind: 'transition', primary: true },
  'provider.arrive_destination': { label: 'Cheguei ao destino', kind: 'custody', primary: true },
  'provider.third_party_start': { label: 'Iniciar serviço no destino', kind: 'transition', primary: true },
  'provider.third_party_done': { label: 'Serviço no destino concluído', kind: 'transition', primary: true },
  'provider.return_pickup': { label: 'Registrar coleta de retorno', kind: 'custody', primary: true },
  'provider.return_depart': { label: 'Voltar ao cliente', kind: 'transition', primary: true },
  'provider.deliver': {
    label: 'Registrar entrega',
    kind: 'custody',
    handoverStep: 'DELIVERY',
    primary: true,
  },
};

/** Converte `allowedActions` em botões: uma ação principal, demais secundárias. */
export function actionSpecs(allowed: TransitionAction[], opts: { quoteAllowed: boolean }): ActionSpec[] {
  const out: ActionSpec[] = [];
  for (const a of allowed) {
    if (!a.startsWith('provider.')) continue;
    const spec = SPECS[a];
    if (!spec) {
      out.push({
        action: a,
        label: a.replace('provider.', '').replace(/_/g, ' '),
        kind: 'transition',
        primary: false,
      });
      continue;
    }
    out.push({ action: a, ...spec });
  }
  // Orçamento adicional durante a execução não muda estado; a API o lista como ação quando permitido.
  if (opts.quoteAllowed && !out.some((o) => o.kind === 'quote')) {
    out.push({
      action: 'provider.submit_quote',
      label: 'Orçamento adicional',
      kind: 'quote',
      primary: false,
    });
  }
  // Só uma primária: a primeira na ordem da API.
  let primaryFound = false;
  return out.map((o) => {
    if (o.primary && !primaryFound) {
      primaryFound = true;
      return o;
    }
    return { ...o, primary: false };
  });
}
