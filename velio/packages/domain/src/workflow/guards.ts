import type { Actor, GuardName, OrderSnapshot, TransitionContext } from './types';

export type GuardFn = (order: OrderSnapshot, actor: Actor, ctx: TransitionContext) => true | string;

const CANCELLABLE_BY_CUSTOMER = new Set([
  'REQUESTED',
  'MATCHING',
  'OFFERED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'SCHEDULED',
  'REMINDED',
  'UNDER_REVIEW',
  'QUOTED',
  'QUOTE_APPROVED',
  'QUOTE_REJECTED',
  'AUTHORIZED',
  'NO_PROVIDER_FOUND',
  'DRIVER_ASSIGNED',
  'EN_ROUTE_PICKUP',
  'SUBMITTED',
  'INTERPRETING',
  'PLAN_PROPOSED',
  'NEEDS_HUMAN',
  'PLAN_APPROVED',
]);

const CANCELLABLE_BY_PROVIDER = new Set([
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'DRIVER_ASSIGNED',
  'EN_ROUTE_PICKUP',
  'UNDER_REVIEW',
  'QUOTED',
]);

export const guards: Record<GuardName, GuardFn> = {
  hasProvider: (o) => (o.providerId ? true : 'Ordem sem prestador atribuído'),

  actorIsAssignedProvider: (o, a) =>
    a.type === 'operator' || a.type === 'system' || (a.type === 'provider' && a.providerId === o.providerId)
      ? true
      : 'Somente o prestador atribuído pode executar esta ação',

  actorIsOrderCustomer: (o, a) =>
    a.type === 'operator' || a.type === 'system' || (a.type === 'customer' && a.userId === o.customerId)
      ? true
      : 'Somente o cliente da ordem pode executar esta ação',

  requiresPin: (o, _a, ctx) => {
    if (!o.requiresStartPin) return true;
    const pin = typeof ctx.payload.pin === 'string' ? ctx.payload.pin : null;
    if (!pin) return 'PIN de início obrigatório para esta categoria';
    return pin === o.startPin ? true : 'PIN inválido';
  },

  'requiresEvidence:BEFORE': (o) =>
    !o.requiresBeforeAfterPhotos || o.evidenceKinds.includes('BEFORE') ? true : 'Foto "antes" obrigatória',
  'requiresEvidence:AFTER': (o) =>
    !o.requiresBeforeAfterPhotos || o.evidenceKinds.includes('AFTER') ? true : 'Foto "depois" obrigatória',
  'requiresEvidence:PICKUP': (o) =>
    o.evidenceKinds.includes('PICKUP') ? true : 'Foto da coleta obrigatória',
  'requiresEvidence:DELIVERY': (o) =>
    o.evidenceKinds.includes('DELIVERY') ? true : 'Foto da entrega obrigatória',

  requiresCustodyScan: (o) =>
    !o.requiresCustody || o.custodyScannedForCurrentStep
      ? true
      : 'Leitura do código de custódia obrigatória nesta etapa',

  requiresVehicleHandover: (o) =>
    !o.requiresVehicleHandover || o.vehicleHandoverRecorded
      ? true
      : 'Registro de entrega do veículo (fotos, odômetro, checklist) obrigatório',

  noOpenAdditionalQuote: (o) =>
    o.quotes.some((q) => q.kind === 'ADDITIONAL' && q.status === 'SENT')
      ? 'Há um orçamento adicional aguardando decisão do cliente'
      : true,

  customerCancelAllowed: (o) =>
    CANCELLABLE_BY_CUSTOMER.has(o.status)
      ? true
      : 'Não é possível cancelar nesta etapa; abra uma contestação',

  providerCancelAllowed: (o) =>
    CANCELLABLE_BY_PROVIDER.has(o.status) ? true : 'O prestador não pode cancelar nesta etapa',

  paymentAuthorized: (o) => (o.paymentAuthorized ? true : 'Pagamento ainda não autorizado'),

  allChildrenDone: (o) =>
    o.childOrders.length > 0 &&
    o.childOrders.every((c) =>
      ['COMPLETED', 'REVIEWED', 'CLOSED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_PLATFORM'].includes(
        c.status,
      ),
    )
      ? true
      : 'Há tarefas filhas ainda em andamento',

  hasApprovedQuote: (o) =>
    o.quotes.some((q) => q.kind === 'INITIAL' && q.status === 'APPROVED')
      ? true
      : 'Nenhum orçamento aprovado',

  hasSentQuote: (o) => (o.quotes.some((q) => q.status === 'SENT') ? true : 'Nenhum orçamento enviado'),

  planPresent: (o) => (o.hasPlan ? true : 'Plano do concierge ausente'),
};
