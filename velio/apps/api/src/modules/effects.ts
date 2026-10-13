import { type AnalyticsEventName, ORDER_STATUS_LABELS, type OrderStatus } from '@velio/contracts';
import type { EffectName } from '@velio/domain';
import type { AppContext } from '../context';
import type { AnalyticsService } from './analytics/service';
import type { CommunicationService } from './communication/service';
import type { ConciergeService } from './concierge/service';
import type { DispatchService } from './dispatch/service';
import type { OrdersService } from './orders/service';
import { type EffectContext, type EffectExecutor, meta } from './orders/types';
import type { PaymentsService } from './payments/service';
import type { ProvidersService } from './providers/service';
import type { ReputationService } from './reputation/service';
import type { SupportService } from './support/service';
import type { WalletService } from './wallet/service';

export interface EffectDeps {
  orders: OrdersService;
  dispatch: DispatchService;
  payments: PaymentsService;
  wallet: WalletService;
  communication: CommunicationService;
  support: SupportService;
  reputation: ReputationService;
  providers: ProvidersService;
  concierge: ConciergeService;
  analytics: AnalyticsService;
}

/** Nome de evento de analytics por transição; ações sem evento de produto não são rastreadas. */
const ANALYTICS_BY_ACTION: Partial<Record<string, AnalyticsEventName>> = {
  'system.start_matching': 'service_request_started',
  'provider.accept': 'provider_accepted',
  'operator.assign': 'provider_matched',
  'provider.en_route': 'provider_en_route',
  'provider.arrive': 'provider_arrived',
  'provider.start': 'service_started',
  'provider.pickup': 'service_started',
  'provider.deliver': 'provider_arrived',
  'provider.complete': 'service_completed',
  'system.children_completed': 'service_completed',
  'customer.cancel': 'order_cancelled',
  'provider.cancel': 'order_cancelled',
  'operator.cancel': 'order_cancelled',
  'system.no_provider': 'no_provider_found',
  'customer.review': 'review_created',
  'customer.open_dispute': 'dispute_opened',
  'provider.submit_quote': 'quote_sent',
  'customer.approve_quote': 'quote_approved',
  'customer.reject_quote': 'quote_rejected',
  'customer.approve_plan': 'concierge_plan_approved',
  'customer.authorize_payment': 'checkout_view',
};

export function buildEffects(ctx: AppContext, d: EffectDeps): EffectExecutor {
  const providerOf = (c: EffectContext) => c.order.providerId ?? c.previous.providerId;

  const notifyCustomer =
    (kind: Parameters<CommunicationService['notifyUser']>[1]) => async (c: EffectContext) => {
      await d.communication.notifyUser(c.order.customerId, kind, {
        orderId: c.order.id,
        status: c.order.status,
      });
    };
  const notifyProvider =
    (
      kind: Parameters<CommunicationService['notifyProvider']>[1],
      override?: { title: string; body: string },
    ) =>
    async (c: EffectContext) => {
      const pid = providerOf(c);
      if (pid)
        await d.communication.notifyProvider(
          pid,
          kind,
          { orderId: c.order.id, status: c.order.status },
          override,
        );
    };
  const alert = (kind: string, title: string, severity: 'MEDIUM' | 'HIGH') => async (c: EffectContext) => {
    await d.support.createIncident({
      orderId: c.order.id,
      kind,
      title,
      severity,
      details: { action: c.action, status: c.order.status, payload: c.payload },
    });
  };

  const effects: EffectExecutor = {
    'dispatch.start': async (c) => d.dispatch.start(c.order.id),
    'dispatch.cancelOffers': async (c) => d.dispatch.cancelOffers(c.order.id),
    'dispatch.restart': async (c) => d.dispatch.restart(c.order.id),

    'payments.authorize': async (c) => {
      await d.payments.authorizeForOrder(c.order);
    },
    'payments.capture': async (c) => d.payments.capture(c.order),
    'payments.cancelAuthorization': async (c) => d.payments.cancelAuthorization(c.order),
    'payments.refund': async (c) => {
      const amount = typeof c.payload.refundCents === 'number' ? c.payload.refundCents : null;
      if (amount === 0) return;
      await d.payments.refund(
        c.order,
        amount,
        String(c.payload.reason ?? c.payload.note ?? c.action),
        c.actor.userId,
      );
    },
    'payments.chargeCancellationFee': async (c) => d.payments.chargeCancellationFee(c),

    'wallet.settle': async (c) => {
      const m = meta(c.order);
      if (c.action === 'operator.resolve_dispute') {
        const pid = providerOf(c);
        const held = m.disputeHeldCents ?? 0;
        if (pid && held > 0) {
          const finalPayout =
            typeof c.payload.providerPayoutCents === 'number' ? c.payload.providerPayoutCents : held;
          await d.wallet.releaseHold(c.order.id, pid, held, finalPayout);
          await d.orders.setFinancials(c.order.id, {
            platformFeeCents: c.order.platformFeeCents ?? 0,
            providerPayoutCents: finalPayout,
          });
          await d.orders.patchMetadata(c.order.id, { disputeHeldCents: 0 });
        }
        return;
      }
      const s = await d.wallet.settleOrder({
        orderId: c.order.id,
        providerId: c.order.providerId,
        categoryId: c.order.categoryId,
        regionId: c.order.regionId,
        grossCents: (c.order.priceCents ?? 0) + c.order.additionalApprovedCents,
        discountCents: c.order.discountCents,
        billedViaParent: m.billedViaParent === true,
      });
      if (s)
        await d.orders.setFinancials(c.order.id, {
          platformFeeCents: s.platformFeeCents,
          providerPayoutCents: s.providerPayoutCents,
        });
    },
    'wallet.hold': async (c) => {
      const pid = providerOf(c);
      const payout = c.order.providerPayoutCents ?? 0;
      if (pid && payout > 0) {
        await d.wallet.hold(c.order.id, pid, payout);
        await d.orders.patchMetadata(c.order.id, { disputeHeldCents: payout });
      }
    },

    'notify.customer:provider_found': notifyCustomer('provider_found'),
    'notify.customer:provider_en_route': notifyCustomer('provider_en_route'),
    'notify.customer:provider_arriving': notifyCustomer('provider_arriving'),
    'notify.customer:service_started': notifyCustomer('service_started'),
    'notify.customer:service_completed': notifyCustomer('service_completed'),
    'notify.customer:review_request': notifyCustomer('review_request'),
    'notify.customer:order_cancelled': notifyCustomer('order_cancelled'),
    'notify.customer:quote_available': notifyCustomer('quote_available'),
    'notify.customer:plan_proposed': notifyCustomer('plan_proposed'),
    'notify.customer:booking_reminder': notifyCustomer('booking_reminder'),
    'notify.provider:order_cancelled': notifyProvider('order_cancelled'),
    'notify.provider:quote_decided': notifyProvider('generic', {
      title: 'Orçamento decidido',
      body: 'O cliente respondeu ao seu orçamento.',
    }),
    'notify.provider:booking_reminder': notifyProvider('booking_reminder'),

    'ops.alert:no_provider': alert('NO_PROVIDER', 'Nenhum prestador encontrado', 'HIGH'),
    'ops.alert:needs_human': alert('NEEDS_HUMAN', 'Plano de concierge exige revisão humana', 'MEDIUM'),
    'ops.alert:dispute': alert('DISPUTE', 'Contestação aberta pelo cliente', 'HIGH'),

    'reputation.recompute': async (c) => {
      const pid = providerOf(c);
      if (pid) await d.reputation.recompute(pid);
    },
    'reputation.penalizeProviderCancel': async (c) => {
      const pid = c.previous.providerId;
      if (pid) await d.reputation.penalizeProviderCancel(pid);
    },

    'provider.setBusy': async (c) => {
      const pid = providerOf(c);
      if (pid) await d.providers.setBusy(pid);
    },
    'provider.setOnline': async (c) => {
      const pid = providerOf(c);
      if (pid) await d.providers.setOnline(pid);
    },

    'booking.scheduleReminders': async (c) => d.orders.scheduleReminders(c.order),
    'booking.release': async (c) => d.orders.releaseBooking(c.order),

    'concierge.plan': async (c) => d.concierge.runPlanner(c.order),
    'concierge.spawnChildren': async (c) => d.concierge.spawnChildren(c.order),
    'concierge.quote': async (c) => {
      await d.concierge.quoteFromPlan(c.order);
    },

    'custody.record': async (c) => d.orders.recordCustodyForTransition(c),

    'chat.systemMessage': async (c) => {
      const label = ORDER_STATUS_LABELS[c.order.status as OrderStatus];
      await d.communication.systemMessage(c.order.id, c.order.status, label?.customer ?? c.order.status);
    },

    'analytics.track': async (c) => {
      const name = ANALYTICS_BY_ACTION[c.action];
      if (!name) return;
      await d.analytics.track(name, {
        userId: c.order.customerId,
        providerId: providerOf(c),
        orderId: c.order.id,
        properties: {
          action: c.action,
          from: c.previous.status,
          to: c.order.status,
          kind: c.order.workflowKind,
        },
      });
    },
  };

  // Garantia em tempo de execução de que toda effect da definição tem executor.
  for (const name of Object.keys(effects) as EffectName[])
    if (!effects[name]) ctx.log.warn({ name }, 'efeito sem executor');
  return effects;
}
