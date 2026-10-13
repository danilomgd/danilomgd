import { useMutation, useQuery } from '@tanstack/react-query';
import {
  formatBRL,
  ORDER_STATUS_LABELS,
  TERMINAL_ORDER_STATUSES,
  type TransitionAction,
} from '@velio/contracts';
import {
  BottomSheet,
  Button,
  CardSkeleton,
  ErrorState,
  EvidenceUploader,
  IconButton,
  ListItem,
  OrderStatusTimeline,
  OTPInput,
  PriceSummary,
  StatusPill,
  Text,
  useTheme,
  useToast,
} from '@velio/ui/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { KeyValue, Section } from '@/components/Section';
import { type ActionSpec, actionSpecs, currentStepIndex, STEPS_BY_KIND } from '@/features/provider/execution';
import { openNavigation } from '@/features/provider/navigation';
import { CancelSheet } from '@/features/shared/CancelSheet';
import { useEvidence } from '@/hooks/useEvidence';
import { useOrder, useOrderCacheUpdater } from '@/hooks/useOrder';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage, isConflict } from '@/lib/errors';
import { formatSchedule } from '@/lib/format';
import { getCurrentPosition } from '@/lib/location';
import { qk } from '@/lib/query';

const TO_DESTINATION = new Set([
  'IN_TRANSIT',
  'AT_DESTINATION',
  'THIRD_PARTY_IN_PROGRESS',
  'THIRD_PARTY_DONE',
]);
const QUOTE_ALLOWED_STATUSES = new Set(['IN_PROGRESS', 'THIRD_PARTY_IN_PROGRESS']);

/** P-12 / P-13 / P-14: execução pelo prestador, um botão por etapa, evidências e logística. */
export default function ProviderOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { colors, spacing, radius } = useTheme();
  const { order, isPending, isError, error, refetch, isFetching, connected } = useOrder(id);
  const updateCache = useOrderCacheUpdater();
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => api.catalog.categories() });
  const config = categories.data?.find((c) => c.slug === order?.categorySlug)?.config;
  const onEvidenceError = useCallback((m: string) => toast.show({ message: m, tone: 'error' }), [toast]);
  const evidence = useEvidence(id, onEvidenceError);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [confirm, setConfirm] = useState<ActionSpec | null>(null);

  const onSuccess = (next: Awaited<ReturnType<typeof api.orders.transition>>) => {
    updateCache(next);
    setConfirm(null);
    track('service_started', { status: next.status }, next.id);
  };
  const onError = (e: unknown) => {
    toast.show({
      message: isConflict(e) ? 'Este pedido foi atualizado. Veja o estado atual.' : errorMessage(e),
      tone: 'error',
    });
    setConfirm(null);
    if (isConflict(e)) refetch();
  };

  const transition = useMutation({
    mutationFn: (action: TransitionAction) => api.orders.transition(id, { action, payload: {} }),
    onSuccess,
    onError,
  });
  const start = useMutation({
    mutationFn: async () =>
      api.orders.start(id, { pin: pin || undefined, location: (await getCurrentPosition()) ?? undefined }),
    onSuccess: (o) => {
      setPin('');
      onSuccess(o);
    },
    onError: (e) => {
      if (!isConflict(e)) setPinError(true);
      onError(e);
    },
  });
  const complete = useMutation({
    mutationFn: () => api.orders.complete(id, { evidenceIds: evidence.uploadedIds }),
    onSuccess: (o) => {
      onSuccess(o);
      track('service_completed', {}, o.id);
      toast.show({
        message: `Serviço concluído. Repasse: ${o.providerPayoutCents != null ? formatBRL(o.providerPayoutCents) : 'a calcular'}.`,
        tone: 'success',
      });
    },
    onError,
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => api.orders.cancel(id, { reason }),
    onSuccess: (o) => {
      updateCache(o);
      setCancelOpen(false);
      track('order_cancelled', { by: 'provider' }, o.id);
    },
    onError,
  });

  if (isPending) {
    return (
      <Screen>
        <Header title="Serviço" />
        <CardSkeleton height={120} />
        <View style={{ height: 16 }} />
        <CardSkeleton height={220} />
      </Screen>
    );
  }
  if (isError || !order) {
    return (
      <Screen>
        <Header title="Serviço" />
        <ErrorState
          title="Serviço não encontrado"
          description={errorMessage(error)}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      </Screen>
    );
  }

  const labels = ORDER_STATUS_LABELS[order.status];
  const terminal = TERMINAL_ORDER_STATUSES.has(order.status);
  const steps = STEPS_BY_KIND[order.workflowKind];
  const stepIdx = currentStepIndex(order.workflowKind, order.status);
  const openQuote = order.quotes.find((q) => q.status === 'SENT');
  const specs = actionSpecs(order.allowedActions, {
    quoteAllowed:
      QUOTE_ALLOWED_STATUSES.has(order.status) && (config?.allowsAdditionalQuote ?? true) && !openQuote,
  });
  const primary = specs.find((s) => s.primary);
  const secondary = specs.filter((s) => !s.primary && s.kind !== 'cancel');
  const canCancel = specs.some((s) => s.kind === 'cancel');
  const target = TO_DESTINATION.has(order.status) && order.destination ? order.destination : order.address;
  const requiresPin = config?.requiresStartPin ?? false;
  const requiresPhotos = config?.requiresBeforeAfterPhotos ?? false;
  const requiresVehicle = config?.requiresVehicle ?? false;
  const requiresCustody = config?.requiresCustody ?? order.workflowKind === 'LAUNDRY';
  const beforeCount = evidence.uploadedCount('BEFORE');
  const afterCount = evidence.uploadedCount('AFTER');
  const isLogisticsPickup = primary?.kind === 'custody';

  function run(spec: ActionSpec) {
    switch (spec.kind) {
      case 'start':
        if (requiresPin && pin.length !== 4) {
          setPinError(true);
          return;
        }
        start.mutate();
        return;
      case 'complete':
        if (openQuote) {
          toast.show({ message: 'Aguarde a decisão do cliente sobre o orçamento.', tone: 'warning' });
          return;
        }
        setConfirm(spec);
        return;
      case 'quote':
        router.push(`/(provider)/order/${order?.id}/quote`);
        return;
      case 'cancel':
        setCancelOpen(true);
        return;
      case 'custody':
        // Pré-requisitos (QR, handover) são telas próprias; a transição em si é confirmada pela API.
        setConfirm(spec);
        return;
      default:
        transition.mutate(spec.action);
    }
  }

  const primaryBlockReason = (() => {
    if (!primary) return undefined;
    if (primary.kind === 'start' && requiresPhotos && beforeCount < 1) return 'Falta 1 foto antes';
    if (primary.kind === 'complete' && requiresPhotos && afterCount < 1) return 'Falta 1 foto depois';
    if (primary.kind === 'complete' && openQuote) return 'Aguardando decisão do orçamento';
    if (evidence.busy) return 'Enviando fotos';
    return undefined;
  })();
  const busy = transition.isPending || start.isPending || complete.isPending;

  return (
    <Screen
      padded={false}
      refreshing={isFetching}
      onRefresh={() => refetch()}
      footer={
        primary && !terminal ? (
          <Button
            label={primary.label}
            size="xl"
            onPress={() => run(primary)}
            loading={busy}
            disabled={Boolean(primaryBlockReason)}
            disabledReason={primaryBlockReason}
          />
        ) : null
      }
    >
      <View style={{ paddingHorizontal: spacing[2] }}>
        <Header
          title={order.serviceName}
          subtitle={
            connected
              ? order.scheduledFor
                ? formatSchedule(order.scheduledFor, order.windowMinutes)
                : null
              : 'Atualizando a cada 15 s'
          }
          right={
            <IconButton
              icon="message-circle"
              accessibilityLabel="Abrir chat"
              onPress={() => router.push(`/(provider)/order/${order.id}/chat`)}
            />
          }
        />
      </View>

      <View style={{ padding: spacing[4], gap: spacing[6] }}>
        <View style={{ gap: spacing[2] }}>
          <StatusPill label={labels.label} status={order.status} />
          <Text variant="title" accessibilityLiveRegion="polite">
            {labels.provider}
          </Text>
          {target ? (
            <View style={styles.addressRow}>
              <Text variant="body" color="muted" style={{ flex: 1 }}>
                {target.summary}
              </Text>
              <Button
                label="Abrir rota"
                variant="secondary"
                size="md"
                fullWidth={false}
                icon="navigation"
                onPress={() => setNavOpen(true)}
              />
            </View>
          ) : null}
          {order.address?.instructions ? (
            <Text variant="bodySm" color="muted">
              Acesso: {order.address.instructions}
            </Text>
          ) : null}
        </View>

        {steps.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {steps.map((s, i) => {
              const done = i < stepIdx;
              const current = i === stepIdx;
              return (
                <View
                  key={s.status}
                  style={[
                    styles.step,
                    {
                      borderRadius: radius.sm,
                      backgroundColor: current
                        ? colors.primary
                        : done
                          ? colors.primarySoft
                          : colors.surfaceAlt,
                    },
                  ]}
                  accessibilityLabel={`Etapa ${i + 1} de ${steps.length}: ${s.label}${current ? ', atual' : done ? ', concluída' : ''}`}
                >
                  <Text
                    variant="labelSm"
                    style={{
                      color: current ? colors.textOnPrimary : done ? colors.primary : colors.textMuted,
                    }}
                  >
                    {s.label}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        ) : null}

        {primary?.kind === 'start' ? (
          <View
            style={[
              styles.task,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg },
            ]}
          >
            {requiresPin ? (
              <>
                <Text variant="heading">Peça o PIN ao cliente</Text>
                <OTPInput
                  length={4}
                  value={pin}
                  onChange={(v) => {
                    setPin(v);
                    setPinError(false);
                  }}
                  error={pinError}
                  accessibilityLabel="PIN de início com 4 dígitos"
                />
                {pinError ? (
                  <Text variant="bodySm" color="danger" align="center">
                    PIN incorreto. Confira com o cliente.
                  </Text>
                ) : null}
              </>
            ) : null}
            <EvidenceUploader
              label="Fotos antes"
              required={requiresPhotos ? 1 : 0}
              items={evidence.ofKind('BEFORE')}
              onAdd={(p) => evidence.add('BEFORE', p)}
              onRemove={evidence.remove}
              onRetry={evidence.retry}
            />
          </View>
        ) : null}

        {primary?.kind === 'complete' ? (
          <View
            style={[
              styles.task,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg },
            ]}
          >
            <EvidenceUploader
              label="Fotos depois"
              required={requiresPhotos ? 1 : 0}
              items={evidence.ofKind('AFTER')}
              onAdd={(p) => evidence.add('AFTER', p)}
              onRemove={evidence.remove}
              onRetry={evidence.retry}
            />
            {openQuote ? (
              <Text variant="bodySm" color="warning">
                Orçamento adicional de {formatBRL(openQuote.amountCents)} aguardando o cliente.
              </Text>
            ) : null}
          </View>
        ) : null}

        {isLogisticsPickup ? (
          <View
            style={[
              styles.task,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg },
            ]}
          >
            <Text variant="heading">Antes de {primary?.label.toLowerCase()}</Text>
            {requiresCustody || order.custodyCode ? (
              <ListItem
                title="Ler código de custódia"
                subtitle="QR do item ou do veículo"
                icon="maximize"
                onPress={() => router.push(`/(provider)/order/${order.id}/custody`)}
              />
            ) : null}
            {requiresVehicle && primary?.handoverStep ? (
              <ListItem
                title={primary.handoverStep === 'PICKUP' ? 'Vistoria de retirada' : 'Vistoria de devolução'}
                subtitle="Odômetro, combustível, checklist e fotos"
                icon="truck"
                onPress={() =>
                  router.push(`/(provider)/order/${order.id}/handover?step=${primary.handoverStep}`)
                }
              />
            ) : null}
            <EvidenceUploader
              label="Fotos da etapa"
              items={evidence.ofKind(primary?.handoverStep === 'DELIVERY' ? 'DELIVERY' : 'PICKUP')}
              onAdd={(p) => evidence.add(primary?.handoverStep === 'DELIVERY' ? 'DELIVERY' : 'PICKUP', p)}
              onRemove={evidence.remove}
              onRetry={evidence.retry}
            />
          </View>
        ) : null}

        {secondary.length ? (
          <View style={{ gap: spacing[2] }}>
            {secondary.map((s) => (
              <Button
                key={s.action}
                label={s.label}
                variant="secondary"
                onPress={() => run(s)}
                disabled={busy}
              />
            ))}
          </View>
        ) : null}

        {order.quotes.length ? (
          <Section title="Orçamentos">
            {order.quotes.map((q) => (
              <KeyValue
                key={q.id}
                label={`${q.kind === 'ADDITIONAL' ? 'Adicional' : 'Inicial'} · ${formatBRL(q.amountCents)}`}
                value={
                  q.status === 'SENT'
                    ? 'Aguardando cliente'
                    : q.status === 'APPROVED'
                      ? 'Aprovado'
                      : q.status === 'REJECTED'
                        ? 'Recusado'
                        : q.status === 'EXPIRED'
                          ? 'Expirado'
                          : 'Rascunho'
                }
              />
            ))}
          </Section>
        ) : null}

        <Section title="Valor">
          <PriceSummary
            lines={[
              { label: 'Preço ao cliente', amountCents: order.priceCents, pending: order.priceCents == null },
              ...(order.additionalApprovedCents
                ? [
                    {
                      label: 'Adicionais aprovados',
                      amountCents: order.additionalApprovedCents,
                      kind: 'addition' as const,
                    },
                  ]
                : []),
              ...(order.platformFeeCents != null
                ? [
                    {
                      label: 'Taxa da plataforma',
                      amountCents: order.platformFeeCents,
                      kind: 'discount' as const,
                    },
                  ]
                : []),
            ]}
            totalCents={order.providerPayoutCents}
            totalLabel="Seu repasse"
            note={terminal ? undefined : 'Liberado após a conclusão, no próximo repasse.'}
          />
        </Section>

        <Section title="Detalhes">
          <KeyValue
            label="Quando"
            value={order.scheduledFor ? formatSchedule(order.scheduledFor, order.windowMinutes) : 'Imediato'}
          />
          {order.destination ? <KeyValue label="Destino" value={order.destination.summary} /> : null}
          {order.notes ? <KeyValue label="Observações" value={order.notes} /> : null}
          {order.custodyCode ? <KeyValue label="Código de custódia" value={order.custodyCode} /> : null}
        </Section>

        <Section title="Histórico">
          <OrderStatusTimeline events={order.events} audience="provider" />
        </Section>

        {canCancel ? (
          <Button label="Cancelar atendimento" variant="ghost" onPress={() => setCancelOpen(true)} />
        ) : null}
      </View>

      <CancelSheet
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={(r) => cancel.mutate(r)}
        loading={cancel.isPending}
        audience="provider"
        status={order.status}
      />

      <BottomSheet visible={navOpen} onClose={() => setNavOpen(false)} title="Abrir rota em">
        {target ? (
          <View>
            <ListItem
              title="Waze"
              icon="navigation"
              onPress={() => {
                setNavOpen(false);
                openNavigation(target, 'waze');
              }}
            />
            <ListItem
              title="Google Maps"
              icon="map"
              onPress={() => {
                setNavOpen(false);
                openNavigation(target, 'google');
              }}
            />
            {Platform.OS === 'ios' ? (
              <ListItem
                title="Apple Maps"
                icon="map-pin"
                divider={false}
                onPress={() => {
                  setNavOpen(false);
                  openNavigation(target, 'apple');
                }}
              />
            ) : null}
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.label}>
        <View style={{ gap: spacing[3] }}>
          <Text variant="body" color="muted">
            {confirm?.kind === 'complete'
              ? 'Ao concluir, o pagamento é capturado e o cliente avalia o serviço.'
              : 'Confirme que a etapa foi registrada com o cliente.'}
          </Text>
          <Button
            label={confirm?.label ?? 'Confirmar'}
            onPress={() =>
              confirm?.kind === 'complete' ? complete.mutate() : confirm && transition.mutate(confirm.action)
            }
            loading={busy}
          />
          <Button label="Voltar" variant="ghost" onPress={() => setConfirm(null)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { paddingHorizontal: 12, height: 32, justifyContent: 'center' },
  task: { padding: 16, gap: 16, borderWidth: StyleSheet.hairlineWidth },
});
