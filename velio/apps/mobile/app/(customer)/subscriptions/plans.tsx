import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatBRL, type SubscriptionPlan } from '@velio/contracts';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ListSkeleton,
  Select,
  StatusPill,
  Text,
  useTheme,
  useToast,
} from '@velio/ui/native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/query';

/** C-20 / C-21: planos de manutenção e assinatura. */
export default function PlansScreen() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const plans = useQuery({ queryKey: qk.plans, queryFn: () => api.catalog.plans() });
  const subs = useQuery({ queryKey: qk.subscriptions, queryFn: () => api.me.subscriptions() });
  const equipments = useQuery({ queryKey: qk.equipments, queryFn: () => api.me.equipments() });
  const addresses = useQuery({ queryKey: qk.addresses, queryFn: () => api.me.addresses() });
  const methods = useQuery({ queryKey: qk.paymentMethods, queryFn: () => api.me.paymentMethods() });

  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [period, setPeriod] = useState<'MORNING' | 'AFTERNOON' | null>(null);

  const subscribe = useMutation({
    mutationFn: () =>
      api.me.subscribe({
        planId: plan?.id ?? '',
        equipmentIds,
        addressId: addressId ?? '',
        paymentMethodId: paymentMethodId ?? '',
        preferredPeriod: period ?? undefined,
      }),
    onSuccess: (s) => {
      track('subscription_started', { plan: plan?.slug ?? '' });
      qc.invalidateQueries({ queryKey: qk.subscriptions });
      setPlan(null);
      router.push(`/(customer)/subscriptions/${s.id}`);
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  const active = subs.data?.filter((s) => s.status !== 'CANCELLED') ?? [];

  return (
    <Screen>
      <Header title="Planos de manutenção" />
      {active.length ? (
        <Section title="Suas assinaturas">
          <View style={{ gap: spacing[2] }}>
            {active.map((s) => (
              <Card
                key={s.id}
                onPress={() => router.push(`/(customer)/subscriptions/${s.id}`)}
                accessibilityLabel={`Assinatura ${s.planName}`}
              >
                <View style={styles.row}>
                  <Text variant="heading" style={{ flex: 1 }}>
                    {s.planName}
                  </Text>
                  <StatusPill
                    label={
                      s.status === 'ACTIVE'
                        ? 'Ativa'
                        : s.status === 'PAUSED'
                          ? 'Pausada'
                          : 'Pagamento pendente'
                    }
                    tone={s.status === 'ACTIVE' ? 'success' : 'warning'}
                    size="sm"
                  />
                </View>
                <Text variant="bodySm" color="muted">
                  {s.nextVisitDueAt
                    ? `Próxima visita: ${formatDate(s.nextVisitDueAt)}`
                    : 'Próxima visita a agendar'}
                </Text>
              </Card>
            ))}
          </View>
        </Section>
      ) : null}
      <Section title="Planos" subtitle="Visitas recorrentes, sem lembrar.">
        <QueryState query={plans} skeleton={<ListSkeleton rows={3} />}>
          {() =>
            plans.data?.filter((p) => p.active).length ? (
              <View style={{ gap: spacing[3] }}>
                {plans.data
                  .filter((p) => p.active)
                  .map((p) => (
                    <Card key={p.id} variant="elevated">
                      <Text variant="titleSm">{p.name}</Text>
                      {p.description ? (
                        <Text variant="bodySm" color="muted" style={{ marginTop: 2 }}>
                          {p.description}
                        </Text>
                      ) : null}
                      <Text variant="mono" style={{ marginTop: 8 }}>
                        {formatBRL(p.priceCents)} a cada{' '}
                        {p.intervalMonths === 1 ? 'mês' : `${p.intervalMonths} meses`} · {p.visitsPerCycle}{' '}
                        {p.visitsPerCycle === 1 ? 'visita' : 'visitas'}
                      </Text>
                      {p.benefits.length ? (
                        <View style={{ marginTop: 8, gap: 4 }}>
                          {p.benefits.map((b) => (
                            <Text key={b} variant="bodySm">
                              · {b}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                      <Button
                        label={`Assinar ${p.name}`}
                        size="md"
                        style={{ marginTop: 12 }}
                        onPress={() => setPlan(p)}
                      />
                    </Card>
                  ))}
              </View>
            ) : (
              <EmptyState
                icon="calendar"
                title="Sem planos na sua região"
                description="Avisaremos quando houver."
              />
            )
          }
        </QueryState>
      </Section>

      <BottomSheet
        visible={Boolean(plan)}
        onClose={() => setPlan(null)}
        title={plan ? `Assinar ${plan.name}` : ''}
      >
        <ScrollView
          style={{ maxHeight: 520 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing[3], paddingBottom: spacing[2] }}
        >
          <Text variant="labelSm" color="muted">
            Equipamentos
          </Text>
          <View style={styles.chips}>
            {(equipments.data ?? []).map((e) => (
              <Chip
                key={e.id}
                label={`${e.brand} · ${e.room}`}
                selected={equipmentIds.includes(e.id)}
                onPress={() =>
                  setEquipmentIds((c) => (c.includes(e.id) ? c.filter((x) => x !== e.id) : [...c, e.id]))
                }
              />
            ))}
            {!equipments.data?.length ? (
              <Button
                label="Cadastrar equipamento"
                variant="secondary"
                size="md"
                onPress={() => router.push('/(customer)/account/equipments')}
              />
            ) : null}
          </View>
          <Select
            label="Endereço"
            value={addressId}
            options={(addresses.data ?? []).map((a) => ({
              value: a.id,
              label: `${a.label} · ${a.street}, ${a.number}`,
            }))}
            onChange={setAddressId}
          />
          <Select
            label="Pagamento"
            value={paymentMethodId}
            options={(methods.data ?? []).map((m) => ({
              value: m.id,
              label: m.kind === 'CARD' ? `${m.brand ?? 'Cartão'} final ${m.last4 ?? ''}` : m.kind,
            }))}
            onChange={setPaymentMethodId}
          />
          <Text variant="labelSm" color="muted">
            Período preferido
          </Text>
          <View style={styles.chips}>
            <Chip label="Manhã" selected={period === 'MORNING'} onPress={() => setPeriod('MORNING')} />
            <Chip label="Tarde" selected={period === 'AFTERNOON'} onPress={() => setPeriod('AFTERNOON')} />
          </View>
          <Button
            label={plan ? `Confirmar ${formatBRL(plan.priceCents)}` : 'Confirmar'}
            onPress={() => subscribe.mutate()}
            loading={subscribe.isPending}
            disabled={!equipmentIds.length || !addressId || !paymentMethodId}
            disabledReason="Escolha equipamento, endereço e pagamento."
          />
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
