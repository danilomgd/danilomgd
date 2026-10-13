import type { OrderStatus } from '@velio/contracts';
import type { Transition } from '../types';

/** Transições de cancelamento e disputa compartilhadas. `from` é injetado por workflow. */
export function cancellationTransitions(
  cancellableByCustomer: OrderStatus[],
  cancellableByProvider: OrderStatus[],
): Transition[] {
  return [
    {
      from: cancellableByCustomer,
      to: 'CANCELLED_BY_CUSTOMER',
      action: 'customer.cancel',
      allowedActors: ['customer', 'operator'],
      guards: ['actorIsOrderCustomer', 'customerCancelAllowed'],
      effects: [
        'dispatch.cancelOffers',
        'payments.chargeCancellationFee',
        'payments.cancelAuthorization',
        'booking.release',
        'provider.setOnline',
        'notify.provider:order_cancelled',
        'analytics.track',
      ],
      describe: 'Cliente cancela; taxa conforme política e etapa',
    },
    {
      from: cancellableByProvider,
      to: 'MATCHING',
      action: 'provider.cancel',
      allowedActors: ['provider'],
      guards: ['actorIsAssignedProvider', 'providerCancelAllowed'],
      effects: [
        'reputation.penalizeProviderCancel',
        'provider.setOnline',
        'dispatch.restart',
        'notify.customer:order_cancelled',
        'analytics.track',
      ],
      describe: 'Prestador cancela; ordem volta para matching automaticamente',
    },
    {
      from: [...new Set([...cancellableByCustomer, ...cancellableByProvider, 'IN_PROGRESS' as OrderStatus])],
      to: 'CANCELLED_BY_PLATFORM',
      action: 'operator.cancel',
      allowedActors: ['operator', 'system'],
      effects: [
        'dispatch.cancelOffers',
        'payments.cancelAuthorization',
        'payments.refund',
        'booking.release',
        'provider.setOnline',
        'notify.customer:order_cancelled',
        'notify.provider:order_cancelled',
        'analytics.track',
      ],
      describe: 'Plataforma cancela com reembolso integral',
    },
    {
      from: ['COMPLETED', 'REVIEWED'],
      to: 'DISPUTED',
      action: 'customer.open_dispute',
      allowedActors: ['customer', 'operator'],
      guards: ['actorIsOrderCustomer'],
      effects: ['wallet.hold', 'ops.alert:dispute', 'analytics.track'],
      describe: 'Cliente contesta após conclusão; repasse congelado',
    },
    {
      from: 'DISPUTED',
      to: 'CLOSED',
      action: 'operator.resolve_dispute',
      allowedActors: ['operator'],
      effects: ['payments.refund', 'wallet.settle', 'reputation.recompute', 'analytics.track'],
      describe: 'Operador resolve a disputa (favor cliente, prestador ou divisão)',
    },
    {
      from: ['CANCELLED_BY_PLATFORM', 'DISPUTED'],
      to: 'REFUNDED',
      action: 'operator.refund',
      allowedActors: ['operator', 'system'],
      effects: ['payments.refund', 'analytics.track'],
    },
  ];
}

export const reviewTransition: Transition = {
  from: 'COMPLETED',
  to: 'REVIEWED',
  action: 'customer.review',
  allowedActors: ['customer'],
  guards: ['actorIsOrderCustomer'],
  effects: ['reputation.recompute', 'analytics.track'],
  describe: 'Cliente avalia; avaliação só existe após conclusão',
};

export const autoCloseTransition: Transition = {
  from: ['COMPLETED', 'REVIEWED'],
  to: 'CLOSED',
  action: 'system.auto_close',
  allowedActors: ['system'],
  describe: 'Encerramento automático após a janela de avaliação/disputa',
};

/** Trecho comum de execução presencial: a caminho → chegou → iniciou → concluiu. */
export function onSiteExecution(fromAccepted: OrderStatus[]): Transition[] {
  return [
    {
      from: fromAccepted,
      to: 'EN_ROUTE',
      action: 'provider.en_route',
      allowedActors: ['provider', 'operator'],
      guards: ['hasProvider', 'actorIsAssignedProvider'],
      effects: [
        'provider.setBusy',
        'notify.customer:provider_en_route',
        'chat.systemMessage',
        'analytics.track',
      ],
    },
    {
      from: 'EN_ROUTE',
      to: 'ARRIVED',
      action: 'provider.arrive',
      allowedActors: ['provider', 'operator'],
      guards: ['actorIsAssignedProvider'],
      effects: ['notify.customer:provider_arriving', 'chat.systemMessage', 'analytics.track'],
    },
    {
      from: ['ARRIVED', 'EN_ROUTE'],
      to: 'IN_PROGRESS',
      action: 'provider.start',
      allowedActors: ['provider', 'operator'],
      guards: ['actorIsAssignedProvider', 'requiresPin', 'requiresEvidence:BEFORE'],
      effects: ['notify.customer:service_started', 'chat.systemMessage', 'analytics.track'],
    },
    {
      from: 'IN_PROGRESS',
      to: 'COMPLETED',
      action: 'provider.complete',
      allowedActors: ['provider', 'operator'],
      guards: ['actorIsAssignedProvider', 'noOpenAdditionalQuote', 'requiresEvidence:AFTER'],
      effects: [
        'payments.capture',
        'wallet.settle',
        'provider.setOnline',
        'notify.customer:service_completed',
        'notify.customer:review_request',
        'chat.systemMessage',
        'analytics.track',
      ],
    },
  ];
}
