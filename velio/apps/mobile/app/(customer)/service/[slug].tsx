import { useQuery } from '@tanstack/react-query';
import { WORKFLOW_KIND_LABELS } from '@velio/contracts';
import {
  Button,
  CardSkeleton,
  durationLine,
  ErrorState,
  Icon,
  priceLine,
  SegmentedControl,
  Skeleton,
  StatusPill,
  Text,
  useTheme,
} from '@velio/ui/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import {
  defaultOptionValues,
  missingRequired,
  type OptionValues,
  ServiceOptionsForm,
} from '@/features/customer/ServiceOptionsForm';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { qk } from '@/lib/query';

/** C-07: detalhe do serviço com preço, exigências, opções dinâmicas e uma ação principal. */
export default function ServiceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const service = useQuery({
    queryKey: qk.service(slug),
    queryFn: () => api.catalog.service(slug),
    enabled: Boolean(slug),
  });
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => api.catalog.categories() });
  const category = categories.data?.find((c) => c.id === service.data?.categoryId);
  const [values, setValues] = useState<OptionValues>({});
  const [mode, setMode] = useState<'now' | 'schedule'>('now');

  useEffect(() => {
    if (!service.data) return;
    setValues(defaultOptionValues(service.data.options));
    setMode(service.data.allowsImmediate ? 'now' : 'schedule');
    track('service_view', {
      slug: service.data.slug,
      pricingModel: service.data.pricingModel,
      workflowKind: service.data.workflowKind,
    });
  }, [service.data]);

  const missing = useMemo(
    () => (service.data ? missingRequired(service.data.options, values) : []),
    [service.data, values],
  );
  const s = service.data;
  const requirements: string[] = [];
  if (category?.config.requiresStartPin) requirements.push('PIN de início');
  if (category?.config.requiresBeforeAfterPhotos) requirements.push('Fotos antes e depois');
  if (s?.requiresVehicle || category?.config.requiresVehicle) requirements.push('Precisa do veículo');
  if (s?.requiresEquipment || category?.config.requiresEquipment) requirements.push('Precisa do equipamento');
  if (category?.config.requiresCustody) requirements.push('Custódia com QR');

  function proceed() {
    if (!s) return;
    track('service_request_started', { slug: s.slug, mode });
    const params = new URLSearchParams({ serviceSlug: s.slug, mode, options: JSON.stringify(values) });
    router.push(`/(customer)/checkout?${params.toString()}`);
  }

  const canSchedule = Boolean(s?.allowsScheduling);
  const canNow = Boolean(s?.allowsImmediate);
  const ctaLabel =
    mode === 'now' ? 'Pedir agora' : s?.workflowKind === 'QUOTE' ? 'Solicitar orçamento' : 'Agendar';

  return (
    <Screen
      padded={false}
      footer={
        s ? (
          <View style={{ gap: spacing[3] }}>
            {canNow && canSchedule ? (
              <SegmentedControl
                options={[
                  { value: 'now', label: 'Agora' },
                  { value: 'schedule', label: 'Agendar' },
                ]}
                value={mode}
                onChange={setMode}
              />
            ) : null}
            <View style={styles.footerRow}>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="muted">
                  {s.pricingModel === 'RANGE' || s.pricingModel === 'HOURLY'
                    ? 'A partir de'
                    : s.pricingModel === 'QUOTE'
                      ? 'Valor'
                      : 'Preço'}
                </Text>
                <Text variant="mono" style={{ fontSize: 18 }}>
                  {priceLine(s)}
                </Text>
              </View>
              <Button
                label={ctaLabel}
                onPress={proceed}
                disabled={!s.active || missing.length > 0}
                disabledReason={
                  !s.active
                    ? 'Indisponível no momento'
                    : missing.length
                      ? `Escolha: ${missing.join(', ')}`
                      : undefined
                }
                fullWidth={false}
                style={{ flex: 1.4 }}
              />
            </View>
          </View>
        ) : null
      }
    >
      <View style={{ paddingHorizontal: spacing[2] }}>
        <Header title="" />
      </View>
      {service.isPending ? (
        <View style={{ padding: spacing[4], gap: spacing[4] }}>
          <CardSkeleton height={200} />
          <Skeleton height={28} width="70%" />
          <Skeleton height={20} width="40%" />
        </View>
      ) : service.isError || !s ? (
        <ErrorState
          description={errorMessage(service.error)}
          onRetry={() => service.refetch()}
          retrying={service.isFetching}
        />
      ) : (
        <View style={{ paddingHorizontal: spacing[4], gap: spacing[6] }}>
          {s.imageUrl ? (
            <Image
              source={{ uri: s.imageUrl }}
              style={{ width: '100%', aspectRatio: 3 / 2, borderRadius: radius.lg }}
            />
          ) : (
            <View style={[styles.cover, { backgroundColor: colors.primarySoft, borderRadius: radius.lg }]}>
              <Icon name={category?.icon ?? 'tool'} size={48} color={colors.primary} />
            </View>
          )}
          <View style={{ gap: spacing[2] }}>
            <Text variant="title" accessibilityRole="header">
              {s.name}
            </Text>
            <Text variant="caption" color="muted">
              {category?.name ?? ''}
              {category ? ' · ' : ''}
              {WORKFLOW_KIND_LABELS[s.workflowKind]}
            </Text>
            {s.shortDescription ? (
              <Text variant="body" color="muted">
                {s.shortDescription}
              </Text>
            ) : null}
            <View style={styles.priceRow}>
              <Text variant="mono" style={{ fontSize: 20, lineHeight: 28 }}>
                {priceLine(s)}
              </Text>
              {durationLine(s.estimatedDurationMinutes) ? (
                <Text variant="bodySm" color="muted">
                  {durationLine(s.estimatedDurationMinutes)}
                </Text>
              ) : null}
            </View>
            {requirements.length ? (
              <View style={styles.pills}>
                {requirements.map((r) => (
                  <StatusPill key={r} label={r} tone="info" size="sm" />
                ))}
              </View>
            ) : null}
          </View>

          {s.options.length ? (
            <Section title="Personalize">
              <ServiceOptionsForm options={s.options} values={values} onChange={setValues} />
            </Section>
          ) : null}

          {s.description ? (
            <Section title="O que inclui">
              <Text variant="body">{s.description}</Text>
            </Section>
          ) : null}

          <Section title="Como funciona">
            <View style={{ gap: spacing[2] }}>
              {[
                mode === 'now'
                  ? 'Você confirma e procuramos o profissional mais próximo.'
                  : 'Você escolhe data e janela; um profissional confirma.',
                'Acompanhe tudo pelo app, com chat e localização.',
                'Cobramos só quando o serviço terminar. Depois, avalie.',
              ].map((t, i) => (
                <View key={t} style={styles.step}>
                  <View style={[styles.stepNum, { backgroundColor: colors.primarySoft }]}>
                    <Text variant="labelSm" color="brand">
                      {i + 1}
                    </Text>
                  </View>
                  <Text variant="body" style={{ flex: 1 }}>
                    {t}
                  </Text>
                </View>
              ))}
            </View>
          </Section>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 3 / 2, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
