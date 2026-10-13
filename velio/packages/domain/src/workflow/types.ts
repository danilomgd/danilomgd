import type { ActorType, OrderStatus, QuoteStatus, TransitionAction, WorkflowKind } from '@velio/contracts';

/** Nome de guard registrado em `guards.ts`. Pode carregar argumento após ':'. */
export type GuardName =
  | 'hasProvider'
  | 'requiresPin'
  | 'requiresEvidence:BEFORE'
  | 'requiresEvidence:AFTER'
  | 'requiresEvidence:PICKUP'
  | 'requiresEvidence:DELIVERY'
  | 'requiresCustodyScan'
  | 'requiresVehicleHandover'
  | 'noOpenAdditionalQuote'
  | 'customerCancelAllowed'
  | 'providerCancelAllowed'
  | 'paymentAuthorized'
  | 'allChildrenDone'
  | 'hasApprovedQuote'
  | 'hasSentQuote'
  | 'planPresent'
  | 'actorIsAssignedProvider'
  | 'actorIsOrderCustomer';

/** Efeitos que a API executa após a transição (nunca dentro do domínio). */
export type EffectName =
  | 'dispatch.start'
  | 'dispatch.cancelOffers'
  | 'dispatch.restart'
  | 'payments.authorize'
  | 'payments.capture'
  | 'payments.cancelAuthorization'
  | 'payments.refund'
  | 'payments.chargeCancellationFee'
  | 'wallet.settle'
  | 'wallet.hold'
  | 'notify.customer:provider_found'
  | 'notify.customer:provider_en_route'
  | 'notify.customer:provider_arriving'
  | 'notify.customer:service_started'
  | 'notify.customer:service_completed'
  | 'notify.customer:review_request'
  | 'notify.customer:order_cancelled'
  | 'notify.customer:quote_available'
  | 'notify.customer:plan_proposed'
  | 'notify.customer:booking_reminder'
  | 'notify.provider:order_cancelled'
  | 'notify.provider:quote_decided'
  | 'notify.provider:booking_reminder'
  | 'ops.alert:no_provider'
  | 'ops.alert:needs_human'
  | 'ops.alert:dispute'
  | 'reputation.recompute'
  | 'reputation.penalizeProviderCancel'
  | 'provider.setBusy'
  | 'provider.setOnline'
  | 'booking.scheduleReminders'
  | 'booking.release'
  | 'concierge.plan'
  | 'concierge.spawnChildren'
  | 'concierge.quote'
  | 'custody.record'
  | 'chat.systemMessage'
  | 'analytics.track';

export interface Transition {
  from: OrderStatus | OrderStatus[];
  to: OrderStatus;
  action: TransitionAction;
  allowedActors: ActorType[];
  guards?: GuardName[];
  effects?: EffectName[];
  /** Descrição curta para documentação gerada e painel ops. */
  describe?: string;
}

export interface StateMeta {
  terminal?: boolean;
  /** SLA em segundos para sair deste estado; a API agenda um job de escalonamento. */
  slaSeconds?: number;
  /** Estados em que o prestador conta como BUSY. */
  providerBusy?: boolean;
  /** Estados em que o cliente vê localização em tempo real. */
  liveLocation?: boolean;
}

export interface WorkflowDefinition {
  kind: WorkflowKind;
  version: number;
  initial: OrderStatus;
  states: Partial<Record<OrderStatus, StateMeta>>;
  transitions: Transition[];
}

/** Recorte da ordem necessário para avaliar guards. Fornecido pela API. */
export interface OrderSnapshot {
  id: string;
  customerId: string;
  providerId: string | null;
  status: OrderStatus;
  workflowKind: WorkflowKind;
  priceCents: number | null;
  acceptedAt: Date | null;
  scheduledFor: Date | null;
  startPin: string | null;
  requiresStartPin: boolean;
  requiresBeforeAfterPhotos: boolean;
  requiresCustody: boolean;
  requiresVehicleHandover: boolean;
  evidenceKinds: string[];
  quotes: Array<{ kind: 'INITIAL' | 'ADDITIONAL'; status: QuoteStatus }>;
  paymentAuthorized: boolean;
  childOrders: Array<{ status: OrderStatus }>;
  hasPlan: boolean;
  custodyScannedForCurrentStep: boolean;
  vehicleHandoverRecorded: boolean;
}

export interface Actor {
  type: ActorType;
  userId: string | null;
  providerId?: string | null;
}

export interface TransitionContext {
  now: Date;
  payload: Record<string, unknown>;
}

export type TransitionResult =
  | { ok: true; from: OrderStatus; to: OrderStatus; effects: EffectName[]; transition: Transition }
  | {
      ok: false;
      code: 'INVALID_ACTION' | 'FORBIDDEN_ACTOR' | 'GUARD_FAILED' | 'TERMINAL';
      reason: string;
      guard?: GuardName;
    };
