import { useMutation } from '@tanstack/react-query';
import { formatBRL, ORDER_STATUS_LABELS, type Quote, TERMINAL_ORDER_STATUSES } from '@velio/contracts';
import {
  Button,
  CardSkeleton,
  ErrorState,
  IconButton,
  OrderStatusTimeline,
  OTPInput,
  PriceSummary,
  QuoteApprovalCard,
  StatusPill,
  Text,
  useTheme,
  useToast,
} from '@velio/ui/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { OrderMap } from '@/components/OrderMap';
import { ProviderCard } from '@/components/ProviderCard';
import { Screen } from '@/components/Screen';
import { KeyValue, Section } from '@/components/Section';
import { CancelSheet } from '@/features/shared/CancelSheet';
import { useCountdown } from '@/hooks/useCountdown';
import { useOrder, useOrderCacheUpdater } from '@/hooks/useOrder';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage, isConflict } from '@/lib/errors';
import { etaLabel, firstName, formatCountdown, formatSchedule } from '@/lib/format';

const LIVE_STATUSES = new Set(['EN_ROUTE', 'ARRIVED', 'EN_ROUTE_PICKUP', 'IN_TRANSIT', 'RETURNING']);
const SEARCHING = new Set(['REQUESTED', 'MATCHING', 'OFFERED', 'NO_PROVIDER_FOUND']);

/** C-10 / C-11: busca e acompanhamento com mapa, PIN, orçamento inline, linha do tempo e ações. */
export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { colors, spacing, radius } = useTheme();
  const { order, isPending, isError, error, refetch, isFetching, connected, providerLocation } = useOrder(id);
  const updateCache = useOrderCacheUpdater();
  const [cancelOpen, setCancelOpen] = useState(false);

  const cancel = useMutation({
    mutationFn: (reason: string) => api.orders.cancel(id, { reason }),
    onSuccess: (o) => {
      updateCache(o);
      setCancelOpen(false);
      track('order_cancelled', { status: o.status }, o.id);
      toast.show({ message: 'Pedido cancelado.', tone: 'neutral' });
    },
    onError: (e) => {
      toast.show({ message: errorMessage(e), tone: 'error' });
      if (isConflict(e)) refetch();
    },
  });

  const decide = useMutation({
    mutationFn: ({ quoteId, decision }: { quoteId: string; decision: 'APPROVE' | 'REJECT' }) =>
      api.orders.decideQuote(quoteId, decision),
    onSuccess: (q, vars) => {
      track(
        vars.decision === 'APPROVE' ? 'quote_approved' : 'quote_rejected',
        { amountCents: q.amountCents, kind: q.kind },
        id,
      );
      refetch();
    },
    onError: (e) => {
      toast.show({ message: errorMessage(e), tone: 'error' });
      refetch();
    },
  });

  if (isPending) {
    return (
      <Screen>
        <Header title="Pedido" />
        <CardSkeleton height={240} />
        <View style={{ height: 16 }} />
        <CardSkeleton height={120} />
      </Screen>
    );
  }
  if (isError || !order) {
    return (
      <Screen>
        <Header title="Pedido" />
        <ErrorState
          title="Pedido não encontrado"
          description={errorMessage(error)}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      </Screen>
    );
  }

  const labels = ORDER_STATUS_LABELS[order.status];
  const live = LIVE_STATUSES.has(order.status);
  const searching = SEARCHING.has(order.status);
  const terminal = TERMINAL_ORDER_STATUSES.has(order.status);
  const pendingQuotes = order.quotes.filter((q) => q.status === 'SENT');
  const decidedQuotes = order.quotes.filter((q) => q.status !== 'SENT' && q.status !== 'DRAFT');
  const canCancel = order.allowedActions.includes('customer.cancel');
  const canReview = order.allowedActions.includes('customer.review') || order.status === 'COMPLETED';
  const canDispute = order.allowedActions.includes('customer.open_dispute');
  const showPin = Boolean(order.startPin) && (order.status === 'EN_ROUTE' || order.status === 'ARRIVED');
  const who = firstName(order.provider?.displayName);
  const eta =
    etaLabel(order.etaAt) ??
    (providerLocation?.etaMinutes != null
      ? `Chega em ${Math.max(1, Math.round(providerLocation.etaMinutes))} min`
      : null);
  const acceptedAt = order.events.find((e) => e.toStatus === 'ACCEPTED')?.createdAt ?? null;
  const mapHeight = live ? 300 : searching ? 220 : 160;
  const destination = order.address ? { lat: order.address.lat, lng: order.address.lng } : null;
  const providerPos = providerLocation
    ? { lat: providerLocation.lat, lng: providerLocation.lng, headingDeg: providerLocation.headingDeg }
    : null;

  return (
    <Screen padded={false} refreshing={isFetching} onRefresh={() => refetch()}>
      <View style={{ paddingHorizontal: spacing[2] }}>
        <Header
          title={order.serviceName}
          subtitle={connected ? null : 'Atualizando a cada 15 s'}
          right={
            <IconButton
              icon="message-circle"
              accessibilityLabel="Abrir chat"
              onPress={() => router.push(`/(customer)/order/${order.id}/chat`)}
              disabled={!order.providerId}
            />
          }
        />
      </View>

      {!terminal && order.status !== 'IN_PROGRESS' ? (
        <OrderMap
          destination={destination}
          provider={live ? providerPos : null}
          secondary={order.destination ? { lat: order.destination.lat, lng: order.destination.lng } : null}
          height={mapHeight}
          accessibilitySummary={eta ? `${labels.customer} ${eta}` : labels.customer}
        />
      ) : null}
      {live && !providerLocation ? (
        <View style={[styles.notice, { backgroundColor: colors.surfaceAlt }]}>
          <Text variant="caption" color="muted">
            Aguardando a posição do profissional.
          </Text>
        </View>
      ) : null}

      <View style={{ padding: spacing[4], gap: spacing[6] }}>
        <View style={{ gap: spacing[2] }}>
          <StatusPill label={labels.label} status={order.status} />
          <Text variant="title" accessibilityLiveRegion="polite">
            {who && order.status === 'EN_ROUTE' && eta
              ? `${who} ${eta.charAt(0).toLowerCase()}${eta.slice(1)}`
              : who && order.status === 'ARRIVED'
                ? `${who} chegou`
                : labels.customer}
          </Text>
          {order.scheduledFor && !live ? (
            <Text variant="body" color="muted">
              {formatSchedule(order.scheduledFor, order.windowMinutes)}
            </Text>
          ) : null}
          {searching ? (
            <Text variant="bodySm" color="muted">
              {order.status === 'NO_PROVIDER_FOUND'
                ? 'Ainda estamos buscando. Você pode aguardar ou cancelar sem custo.'
                : 'Isso costuma levar poucos minutos.'}
            </Text>
          ) : null}
        </View>

        {order.provider ? (
          <ProviderCard
            provider={order.provider}
            onChat={() => router.push(`/(customer)/order/${order.id}/chat`)}
          />
        ) : null}

        {showPin && order.startPin ? (
          <View style={[styles.pinCard, { backgroundColor: colors.primarySoft, borderRadius: radius.lg }]}>
            <Text variant="labelSm" color="brand">
              Informe este PIN ao profissional
            </Text>
            <OTPInput
              length={4}
              value={order.startPin}
              onChange={() => {}}
              readOnly
              accessibilityLabel={`PIN de início: ${order.startPin.split('').join(' ')}`}
            />
            <Text variant="caption" color="muted">
              O serviço só começa quando {who || 'o profissional'} digitar o PIN.
            </Text>
          </View>
        ) : null}

        {pendingQuotes.map((q) => (
          <PendingQuote
            key={q.id}
            quote={q}
            order={{ priceCents: order.priceCents, providerName: order.provider?.displayName ?? null }}
            onDecide={(decision) => decide.mutate({ quoteId: q.id, decision })}
            loading={
              decide.isPending ? (decide.variables?.decision === 'APPROVE' ? 'approve' : 'reject') : null
            }
          />
        ))}

        {order.status === 'COMPLETED' && canReview ? (
          <Button
            label={`Avaliar ${who || 'o atendimento'}`}
            icon="star"
            onPress={() => router.push(`/(customer)/order/${order.id}/review`)}
          />
        ) : null}

        <Section title="Acompanhamento">
          <OrderStatusTimeline events={order.events} audience="customer" />
        </Section>

        <Section title="Detalhes">
          <KeyValue label="Serviço" value={order.serviceName} />
          {order.address ? <KeyValue label="Endereço" value={order.address.summary} /> : null}
          {order.destination ? <KeyValue label="Destino" value={order.destination.summary} /> : null}
          <KeyValue
            label="Quando"
            value={order.scheduledFor ? formatSchedule(order.scheduledFor, order.windowMinutes) : 'Imediato'}
          />
          {order.notes ? <KeyValue label="Observações" value={order.notes} /> : null}
          <View style={{ marginTop: spacing[3] }}>
            <PriceSummary
              lines={[
                { label: 'Serviço', amountCents: order.priceCents, pending: order.priceCents == null },
                ...(order.additionalApprovedCents
                  ? [
                      {
                        label: 'Adicionais aprovados',
                        amountCents: order.additionalApprovedCents,
                        kind: 'addition' as const,
                      },
                    ]
                  : []),
                ...(order.discountCents
                  ? [{ label: 'Desconto', amountCents: order.discountCents, kind: 'discount' as const }]
                  : []),
              ]}
              totalCents={order.totalCents}
              note={terminal ? undefined : 'Cobramos só quando o serviço terminar.'}
            />
          </View>
          {decidedQuotes.length ? (
            <View style={{ gap: 8, marginTop: spacing[3] }}>
              {decidedQuotes.map((q) => (
                <KeyValue
                  key={q.id}
                  label={`Orçamento ${q.kind === 'ADDITIONAL' ? 'adicional' : 'inicial'} · ${formatBRL(q.amountCents)}`}
                  value={
                    q.status === 'APPROVED' ? 'Aprovado' : q.status === 'REJECTED' ? 'Recusado' : 'Expirado'
                  }
                />
              ))}
            </View>
          ) : null}
        </Section>

        <View style={{ gap: spacing[2] }}>
          {canCancel ? (
            <Button label="Cancelar pedido" variant="ghost" onPress={() => setCancelOpen(true)} />
          ) : null}
          {canDispute ? (
            <Button
              label="Abrir contestação"
              variant="ghost"
              onPress={() => router.push(`/(customer)/order/${order.id}/dispute`)}
            />
          ) : null}
          {terminal ? (
            <Button
              label="Pedir de novo"
              variant="secondary"
              icon="refresh-cw"
              onPress={() => router.push(`/(customer)/checkout?serviceId=${order.serviceId}`)}
            />
          ) : null}
        </View>
      </View>

      <CancelSheet
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={(reason) => cancel.mutate(reason)}
        loading={cancel.isPending}
        audience="customer"
        status={order.status}
        acceptedAt={acceptedAt}
        priceCents={order.priceCents}
      />
    </Screen>
  );
}

function PendingQuote({
  quote,
  order,
  onDecide,
  loading,
}: {
  quote: Quote;
  order: { priceCents: number | null; providerName: string | null };
  onDecide: (d: 'APPROVE' | 'REJECT') => void;
  loading: 'approve' | 'reject' | null;
}) {
  const remaining = useCountdown(quote.expiresAt);
  return (
    <QuoteApprovalCard
      quote={quote}
      agreedCents={quote.kind === 'ADDITIONAL' ? order.priceCents : null}
      providerName={order.providerName}
      countdown={quote.expiresAt ? formatCountdown(remaining) : null}
      onApprove={() => onDecide('APPROVE')}
      onReject={() => onDecide('REJECT')}
      loading={loading}
    />
  );
}

const styles = StyleSheet.create({
  notice: { paddingVertical: 6, alignItems: 'center' },
  pinCard: { padding: 20, gap: 12, alignItems: 'center' },
});
