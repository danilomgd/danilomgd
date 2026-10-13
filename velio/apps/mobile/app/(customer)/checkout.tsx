import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PriceEstimate, ScheduleWindow } from '@velio/contracts';
import {
  Button,
  Card,
  CardSkeleton,
  Chip,
  ErrorState,
  Input,
  PriceSummary,
  SegmentedControl,
  Select,
  Text,
  useTheme,
  useToast,
} from '@velio/ui/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DateTimeField } from '@/components/DateTimeField';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import type { OptionValues } from '@/features/customer/ServiceOptionsForm';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatSchedule } from '@/lib/format';
import { qk } from '@/lib/query';

const WINDOWS = [60, 120, 180, 240] as const;

function randomKey() {
  return `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function nextSlot(): Date {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0);
  return d;
}

/** C-09: confirmação. Endereço, veículo/equipamento quando exigidos, agora ou agendar, estimativa, cupom, pagamento. */
export default function CheckoutScreen() {
  const params = useLocalSearchParams<{
    serviceSlug?: string;
    serviceId?: string;
    mode?: 'now' | 'schedule';
    options?: string;
  }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const idempotencyKey = useRef(randomKey());

  const options = useMemo<OptionValues>(() => {
    try {
      return params.options ? (JSON.parse(params.options) as OptionValues) : {};
    } catch {
      return {};
    }
  }, [params.options]);

  const servicesList = useQuery({
    queryKey: qk.services(),
    queryFn: () => api.catalog.services(),
    enabled: !params.serviceSlug && Boolean(params.serviceId),
  });
  const slug = params.serviceSlug ?? servicesList.data?.find((s) => s.id === params.serviceId)?.slug ?? '';
  const service = useQuery({
    queryKey: qk.service(slug),
    queryFn: () => api.catalog.service(slug),
    enabled: Boolean(slug),
  });
  const s = service.data;

  const addresses = useQuery({ queryKey: qk.addresses, queryFn: () => api.me.addresses() });
  const vehicles = useQuery({
    queryKey: qk.vehicles,
    queryFn: () => api.me.vehicles(),
    enabled: Boolean(s?.requiresVehicle),
  });
  const equipments = useQuery({
    queryKey: qk.equipments,
    queryFn: () => api.me.equipments(),
    enabled: Boolean(s?.requiresEquipment),
  });
  const methods = useQuery({ queryKey: qk.paymentMethods, queryFn: () => api.me.paymentMethods() });

  const [addressId, setAddressId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [mode, setMode] = useState<'now' | 'schedule'>(params.mode === 'schedule' ? 'schedule' : 'now');
  const [startsAt, setStartsAt] = useState<Date>(nextSlot);
  const [windowMinutes, setWindowMinutes] = useState<(typeof WINDOWS)[number]>(60);
  const [notes, setNotes] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState<string | undefined>(undefined);
  const [couponError, setCouponError] = useState<string | null>(null);

  useEffect(() => {
    if (!addressId && addresses.data?.length)
      setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0])?.id ?? null);
  }, [addresses.data, addressId]);
  useEffect(() => {
    if (!paymentMethodId && methods.data?.length)
      setPaymentMethodId((methods.data.find((m) => m.isDefault) ?? methods.data[0])?.id ?? null);
  }, [methods.data, paymentMethodId]);
  useEffect(() => {
    if (s) {
      if (!s.allowsImmediate) setMode('schedule');
      track('checkout_view', { slug: s.slug });
    }
  }, [s]);

  const estimate = useQuery({
    queryKey: ['estimate', s?.id, options, couponCode],
    queryFn: () => api.catalog.estimate({ serviceId: s?.id ?? '', options, couponCode }),
    enabled: Boolean(s),
    retry: false,
  });
  useEffect(() => {
    if (estimate.isError && couponCode) {
      setCouponError(errorMessage(estimate.error, 'Cupom inválido.'));
      setCouponCode(undefined);
    }
  }, [estimate.isError, estimate.error, couponCode]);

  const create = useMutation({
    mutationFn: () => {
      const schedule: ScheduleWindow =
        mode === 'now'
          ? { mode: 'NOW' }
          : { mode: 'SCHEDULED', startsAt: startsAt.toISOString(), windowMinutes };
      return api.orders.create({
        serviceId: s?.id ?? '',
        addressId: addressId ?? undefined,
        vehicleId: vehicleId ?? undefined,
        equipmentId: equipmentId ?? undefined,
        paymentMethodId: paymentMethodId ?? undefined,
        schedule,
        options,
        notes: notes.trim() || undefined,
        mediaUrls: [],
        couponCode,
        idempotencyKey: idempotencyKey.current,
      });
    },
    onSuccess: (order) => {
      track(
        'service_request_completed',
        { slug: s?.slug ?? '', mode, hasCoupon: Boolean(couponCode) },
        order.id,
      );
      qc.setQueryData(qk.order(order.id), order);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['home'] });
      router.replace(`/(customer)/order/${order.id}`);
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  const requiresAddress = s?.requiresAddress ?? true;
  const blockers: string[] = [];
  if (requiresAddress && !addressId) blockers.push('endereço');
  if (s?.requiresVehicle && !vehicleId) blockers.push('veículo');
  if (s?.requiresEquipment && !equipmentId) blockers.push('equipamento');
  if (!paymentMethodId) blockers.push('pagamento');
  if (mode === 'schedule' && startsAt.getTime() < Date.now() + 30 * 60_000) blockers.push('horário futuro');

  const est: PriceEstimate | undefined = estimate.data;
  const totalLabel = est?.requiresQuote ? 'Estimativa' : 'Total';

  return (
    <Screen
      keyboard
      footer={
        <Button
          label={
            mode === 'now'
              ? 'Confirmar pedido'
              : s?.workflowKind === 'QUOTE'
                ? 'Solicitar orçamento'
                : 'Confirmar agendamento'
          }
          onPress={() => create.mutate()}
          loading={create.isPending}
          disabled={!s || blockers.length > 0 || estimate.isFetching}
          disabledReason={blockers.length ? `Falta: ${blockers.join(', ')}` : undefined}
        />
      }
    >
      <Header title="Confirmar pedido" close />
      {service.isPending || (!slug && servicesList.isPending) ? (
        <CardSkeleton height={320} />
      ) : service.isError || !s ? (
        <ErrorState description={errorMessage(service.error)} onRetry={() => service.refetch()} />
      ) : (
        <View style={{ gap: spacing[2] }}>
          <Card variant="outlined" padding={14}>
            <Text variant="heading">{s.name}</Text>
            {Object.keys(options).length ? (
              <Text variant="bodySm" color="muted">
                {Object.entries(options)
                  .filter(([, v]) => v !== '' && v !== false)
                  .map(
                    ([k, v]) =>
                      `${s.options.find((o) => o.key === k)?.label ?? k}: ${v === true ? 'sim' : String(v)}`,
                  )
                  .join(' · ')}
              </Text>
            ) : null}
          </Card>

          <Section title="Onde" style={{ marginTop: spacing[4] }}>
            <Select
              label="Endereço"
              value={addressId}
              options={(addresses.data ?? []).map((a) => ({
                value: a.id,
                label: `${a.label} · ${a.street}, ${a.number}`,
                description: `${a.neighborhood}, ${a.city}`,
              }))}
              onChange={setAddressId}
              placeholder={addresses.isPending ? 'Carregando…' : 'Escolher endereço'}
              extraAction={{
                label: 'Adicionar endereço',
                onPress: () => router.push('/(customer)/account/addresses'),
              }}
            />
            {s.requiresVehicle ? (
              <View style={{ marginTop: spacing[3] }}>
                <Select
                  label="Veículo"
                  value={vehicleId}
                  options={(vehicles.data ?? []).map((v) => ({
                    value: v.id,
                    label: `${v.brand} ${v.model}`,
                    description: v.plate,
                  }))}
                  onChange={setVehicleId}
                  placeholder="Escolher veículo"
                  extraAction={{
                    label: 'Cadastrar veículo',
                    onPress: () => router.push('/(customer)/account/vehicles'),
                  }}
                />
              </View>
            ) : null}
            {s.requiresEquipment ? (
              <View style={{ marginTop: spacing[3] }}>
                <Select
                  label="Equipamento"
                  value={equipmentId}
                  options={(equipments.data ?? []).map((e) => ({
                    value: e.id,
                    label: `${e.brand}${e.model ? ` ${e.model}` : ''} · ${e.room}`,
                    description: e.btus ? `${e.btus} BTU` : undefined,
                  }))}
                  onChange={setEquipmentId}
                  placeholder="Escolher equipamento"
                  extraAction={{
                    label: 'Cadastrar equipamento',
                    onPress: () => router.push('/(customer)/account/equipments'),
                  }}
                />
              </View>
            ) : null}
          </Section>

          <Section title="Quando">
            {s.allowsImmediate && s.allowsScheduling ? (
              <SegmentedControl
                options={[
                  { value: 'now', label: 'Agora' },
                  { value: 'schedule', label: 'Agendar' },
                ]}
                value={mode}
                onChange={setMode}
              />
            ) : null}
            {mode === 'schedule' ? (
              <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
                <DateTimeField
                  label="Início"
                  value={startsAt}
                  onChange={setStartsAt}
                  minimumDate={new Date()}
                />
                <Text variant="labelSm" color="muted">
                  Janela de chegada
                </Text>
                <View style={styles.chips}>
                  {WINDOWS.map((w) => (
                    <Chip
                      key={w}
                      label={w < 120 ? `${w} min` : `${w / 60} h`}
                      selected={windowMinutes === w}
                      onPress={() => setWindowMinutes(w)}
                    />
                  ))}
                </View>
                <Text variant="bodySm" color="muted">
                  {formatSchedule(startsAt.toISOString(), windowMinutes)}
                </Text>
              </View>
            ) : (
              <Text variant="bodySm" color="muted" style={{ marginTop: spacing[2] }}>
                Procuramos um profissional assim que você confirmar.
              </Text>
            )}
          </Section>

          <Section title="Observações">
            <Input
              kind="multiline"
              placeholder="Algo que o profissional precisa saber? (opcional)"
              value={notes}
              onChangeText={setNotes}
              maxLength={1000}
            />
          </Section>

          <Section title="Pagamento">
            <Select
              label="Método"
              value={paymentMethodId}
              options={(methods.data ?? []).map((m) => ({
                value: m.id,
                label:
                  m.kind === 'CARD'
                    ? `${m.brand ?? 'Cartão'} final ${m.last4 ?? ''}`
                    : m.kind === 'PIX'
                      ? 'PIX'
                      : 'Carteira',
              }))}
              onChange={setPaymentMethodId}
              placeholder={methods.isPending ? 'Carregando…' : 'Escolher método'}
              extraAction={{
                label: 'Adicionar método de pagamento',
                onPress: () => router.push('/(customer)/account/payment-methods'),
              }}
            />
            <View style={[styles.coupon, { marginTop: spacing[3] }]}>
              <Input
                placeholder="Cupom"
                value={couponInput}
                onChangeText={(t) => {
                  setCouponInput(t.toUpperCase());
                  setCouponError(null);
                }}
                autoCapitalize="characters"
                error={couponError}
                containerStyle={{ flex: 1 }}
                editable={!couponCode}
              />
              <Button
                label={couponCode ? 'Remover' : 'Aplicar'}
                variant="secondary"
                size="lg"
                fullWidth={false}
                onPress={() => {
                  if (couponCode) {
                    setCouponCode(undefined);
                    setCouponInput('');
                  } else if (couponInput.trim()) setCouponCode(couponInput.trim());
                }}
                disabled={!couponInput.trim() && !couponCode}
              />
            </View>
          </Section>

          <Section title="Valores">
            {estimate.isPending ? (
              <CardSkeleton height={120} />
            ) : est ? (
              <PriceSummary
                lines={[
                  ...est.breakdown.map((b) => ({
                    label: b.label,
                    amountCents: b.amountCents,
                    kind: b.amountCents < 0 ? ('discount' as const) : ('base' as const),
                  })),
                  ...(est.discountCents > 0 && !est.breakdown.some((b) => b.amountCents < 0)
                    ? [{ label: 'Cupom', amountCents: est.discountCents, kind: 'discount' as const }]
                    : []),
                ]}
                totalCents={est.totalCents}
                rangeCents={{ min: est.minCents, max: est.maxCents }}
                totalLabel={totalLabel}
                note={
                  est.requiresQuote
                    ? 'O valor final vem no orçamento, que você aprova antes de qualquer cobrança.'
                    : 'Cobramos só quando o serviço terminar.'
                }
              />
            ) : (
              <ErrorState
                compact
                description={errorMessage(estimate.error)}
                onRetry={() => estimate.refetch()}
              />
            )}
            <Text variant="caption" color="muted" style={{ marginTop: spacing[3] }}>
              Cancelamento grátis até o profissional aceitar.
            </Text>
          </Section>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  coupon: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
});
