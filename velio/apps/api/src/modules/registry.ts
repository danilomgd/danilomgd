import { TERMINAL_ORDER_STATUSES, type OrderStatus } from '@velio/contracts';
import { customerCancellation } from '@velio/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { createPlatformService, registerAdminModule } from './admin';
import { registerAnalyticsModule } from './analytics';
import { registerAssetsModule } from './assets';
import { registerCatalogModule } from './catalog';
import { registerCommunicationModule } from './communication';
import { registerConciergeModule } from './concierge';
import { registerDispatchModule } from './dispatch';
import { buildEffects } from './effects';
import { registerGeoModule } from './geo';
import { registerIdentityModule } from './identity';
import type { Modules } from './index';
import { registerOpsModule } from './ops';
import { registerOrdersModule } from './orders';
import type { EffectContext } from './orders/types';
import { meta } from './orders/types';
import { registerPaymentsModule } from './payments';
import { createProvidersModule, mountProvidersRoutes } from './providers';
import { registerQuotesModule } from './quotes';
import { registerReputationModule } from './reputation';
import { registerSubscriptionsModule } from './subscriptions';
import { registerSupportModule } from './support';
import { registerWalletModule } from './wallet';

const DONE_FOR_PARENT = new Set<OrderStatus>(['COMPLETED', 'REVIEWED', 'CLOSED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_PLATFORM']);

/**
 * Monta todos os módulos (ADR-003) na ordem de dependência e liga as referências tardias
 * (orders ↔ dispatch/payments/quotes/concierge) depois que todos existem.
 */
export async function registerAllModules(app: FastifyInstance, ctx: AppContext) {
  const platform = createPlatformService(ctx);
  const identity = registerIdentityModule(app, ctx);
  const geo = registerGeoModule(app, ctx);
  const assets = registerAssetsModule(app, ctx);
  const catalog = registerCatalogModule(app, ctx, { identity, assets });
  const wallet = registerWalletModule(app, ctx);
  const providers = createProvidersModule(ctx, { identity, catalog, wallet, platform });
  const analytics = registerAnalyticsModule(app, ctx);
  const reputation = registerReputationModule(app, ctx, { providers });
  const orders = registerOrdersModule(app, ctx, { catalog, geo, assets, identity, providers, platform });
  const canAccessOrder = orders.canUserAccessOrder;
  const communication = registerCommunicationModule(app, ctx, { identity, canAccessOrder });
  const payments = registerPaymentsModule(app, ctx, { identity, wallet, communication, platform, canAccessOrder });
  const support = registerSupportModule(app, ctx, { communication, reputation });
  const quotes = registerQuotesModule(app, ctx, { communication, platform });
  const dispatch = registerDispatchModule(app, ctx, { orders, providers, catalog, communication, reputation });
  const subscriptions = registerSubscriptionsModule(app, ctx, { orders, payments, assets, geo, identity, analytics });
  const concierge = registerConciergeModule(app, ctx, { orders, quotes, catalog, identity, geo, assets, platform, communication });
  registerOpsModule(app, ctx, { orders, dispatch, providers, support, platform });
  registerAdminModule(app, ctx, { platform, catalog, geo, wallet, dispatch, payments, subscriptions, identity, providers, analytics });
  mountProvidersRoutes(app, providers, {
    listOffers: (providerId) => dispatch.listPendingOffers(providerId),
    listOrders: (providerId, q) => orders.listForProvider(providerId, q),
    indicators: async (providerId, days) => {
      const p = await providers.getById(providerId);
      const s = await reputation.stats(providerId);
      const since = new Date(ctx.adapters.clock.now().getTime() - days * 86_400_000);
      const ledger = await wallet.ledger('PROVIDER', providerId, 500);
      const earnings = ledger.filter((l) => l.direction === 'CREDIT' && new Date(l.createdAt) >= since && (l.kind === 'provider_payout' || l.kind === 'cancellation_fee')).reduce((sum, l) => sum + l.amountCents, 0);
      return {
        periodDays: days,
        completed: s.completedCount,
        cancelled: s.cancelledCount,
        offersReceived: s.offersReceived,
        offersAccepted: s.offersAccepted,
        acceptanceRate: p.acceptanceRate,
        earningsCents: earnings,
        ratingAvg: p.ratingAvg,
        avgResponseSeconds: p.avgResponseSeconds,
      };
    },
  });

  // ---- Ligações tardias -----------------------------------------------------------------------
  const effects = buildEffects(ctx, { orders, dispatch, payments, wallet, communication, support, reputation, providers, concierge, analytics });

  const afterTransition = async (c: EffectContext) => {
    const settings = await platform.getSettings();
    if (c.order.status === 'COMPLETED') {
      if (c.order.providerId) await reputation.recordCompletion(c.order.providerId, c.order.customerId);
      const equipmentIds = meta(c.order).equipmentIds ?? [];
      if (equipmentIds.length > 0) await assets.markMaintained(equipmentIds, c.now);
      await ctx.scheduler.schedule(ctx.db, {
        kind: 'order.auto_close',
        runAt: new Date(c.now.getTime() + settings.reviews.windowDays * 86_400_000),
        payload: { orderId: c.order.id },
        dedupeKey: `order.auto_close:${c.order.id}`,
      });
    }
    if (c.action === 'customer.cancel') {
      const outcome = customerCancellation(c.previous.status as OrderStatus, c.previous.acceptedAt, c.now, c.previous.priceCents, settings.cancellation);
      if (outcome.feeCents > 0) await reputation.recordLateCancellation(c.order.customerId);
    }
    if (c.order.parentOrderId && DONE_FOR_PARENT.has(c.order.status as OrderStatus)) await concierge.onChildTerminal(c.order);
  };

  orders.bind({ quotes, payments, concierge, effects, hooks: { afterTransition } });
  payments.bind({ orders, support, analytics });
  quotes.bind({ orders, payments, analytics });
  support.bind({ orders });
  providers.bindSources({
    activeLiveOrder: (providerId) => orders.activeLiveOrderForProvider(providerId),
    providersWithBookingConflict: (ids, s, e) => orders.providersWithBookingConflict(ids, s, e),
    providersWhoServedCustomer: (ids, customerId) => orders.providersWhoServedCustomer(ids, customerId),
  });
  communication.bindSources({
    orderParticipants: (orderId) => orders.orderParticipants(orderId),
    providerUserId: (providerId) => providers.userIdOf(providerId),
  });
  reputation.bindSources({
    orderForReview: async (orderId) => {
      const o = await orders.findById(orderId);
      if (!o) return null;
      return { id: o.id, customerId: o.customerId, providerId: o.providerId, providerUserId: o.providerId ? await providers.userIdOf(o.providerId) : null, status: o.status };
    },
    onCustomerReviewed: async (orderId, userId, review) => {
      await orders.tryTransition(orderId, 'customer.review', { type: 'customer', userId }, { reviewId: review.id, rating: review.rating });
    },
  });
  catalog.bindSources({
    activeOrders: (userId) => orders.activeOrdersForCustomer(userId),
    upcomingBooking: (userId, now) => orders.upcomingBooking(userId, now),
    hasActiveSubscription: (userId) => subscriptions.hasActive(userId),
    listPlans: () => subscriptions.listPlans(),
    validateCoupon: (code, userId, categoryId, now) => payments.validateCoupon(code, userId, categoryId, now),
    resolveRegion: (lat, lng) => geo.resolveRegion(lat, lng),
  });

  // ---- Jobs restantes -------------------------------------------------------------------------
  ctx.scheduler.register('booking.remind', async (p) => {
    const orderId = String(p.orderId);
    const hours = Number(p.hours ?? 1);
    await orders.remind(orderId, hours, async (o) => {
      await communication.notifyUser(o.customerId, 'booking_reminder', { orderId: o.id, hours, scheduledFor: o.scheduledFor?.toISOString() ?? null });
      if (o.providerId) await communication.notifyProvider(o.providerId, 'booking_reminder', { orderId: o.id, hours });
    });
  });
  ctx.scheduler.register('order.auto_close', async (p) => {
    const orderId = String(p.orderId);
    const o = await orders.findById(orderId);
    if (!o || TERMINAL_ORDER_STATUSES.has(o.status as OrderStatus)) return;
    if (o.status === 'COMPLETED' || o.status === 'REVIEWED') await orders.tryTransition(orderId, 'system.auto_close', { type: 'system', userId: null }, {});
  });

  // Primeiro lote semanal de repasses no próximo dia configurado às 03:00 UTC.
  const settings = await platform.getSettings();
  const now = ctx.adapters.clock.now();
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  while (next.getUTCDay() !== settings.payouts.weekday || next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  await ctx.scheduler.schedule(ctx.db, { kind: 'payout.batch', runAt: next, payload: { cadence: settings.payouts.cadence }, dedupeKey: `payout.batch:${next.toISOString().slice(0, 10)}` });

  const modules = {
    platform,
    identity,
    geo,
    assets,
    catalog,
    wallet,
    providers,
    analytics,
    reputation,
    orders,
    communication,
    payments,
    support,
    quotes,
    dispatch,
    subscriptions,
    concierge,
  };
  return modules satisfies Modules;
}

export type AllModules = Awaited<ReturnType<typeof registerAllModules>>;
