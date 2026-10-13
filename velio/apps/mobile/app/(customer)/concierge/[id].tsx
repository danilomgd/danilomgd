import { useMutation, useQuery } from '@tanstack/react-query';
import { formatBRL, ORDER_STATUS_LABELS } from '@velio/contracts';
import {
  Button,
  Card,
  CardSkeleton,
  ErrorState,
  Input,
  StatusPill,
  Text,
  useTheme,
  useToast,
} from '@velio/ui/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { useOrder } from '@/hooks/useOrder';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatSchedule } from '@/lib/format';
import { qk } from '@/lib/query';

const TASK_KIND: Record<string, string> = {
  VEHICLE_PICKUP: 'Retirada do veículo',
  TRANSPORT: 'Transporte',
  THIRD_PARTY_SERVICE: 'Serviço no destino',
  WAIT: 'Espera',
  RETURN_PICKUP: 'Coleta de retorno',
  VEHICLE_RETURN: 'Devolução do veículo',
  HOME_SERVICE: 'Serviço em casa',
  PURCHASE: 'Compra',
  DELIVERY: 'Entrega',
  CUSTOM: 'Tarefa',
};

/** C-25: plano do Concierge: tarefas, esclarecimentos, aprovar plano; orçamento aprovado na ordem. */
export default function ConciergeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { spacing, colors, radius } = useTheme();
  const request = useQuery({
    queryKey: qk.concierge(id),
    queryFn: () => api.concierge.get(id),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.plan ? 15_000 : 4_000),
  });
  const { order } = useOrder(request.data?.orderId);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const approve = useMutation({
    mutationFn: () => api.concierge.approvePlan(id),
    onSuccess: (o) => {
      track('concierge_plan_approved', { tasks: request.data?.plan?.tasks.length ?? 0 }, o.id);
      toast.show({ message: 'Plano aprovado. Preparando o orçamento.', tone: 'success' });
      request.refetch();
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });
  const answer = useMutation({
    mutationFn: () =>
      api.concierge.answer(
        id,
        Object.entries(answers).map(([question, a]) => ({ question, answer: a })),
      ),
    onSuccess: () => {
      setAnswers({});
      request.refetch();
      toast.show({ message: 'Respostas enviadas.', tone: 'success' });
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  const r = request.data;
  const plan = r?.plan;
  const status = order?.status;
  const pendingQuote = order?.quotes.find((q) => q.status === 'SENT');
  const canApprovePlan =
    status === 'PLAN_PROPOSED' || (order?.allowedActions.includes('customer.approve_plan') ?? false);
  const clarifications = plan?.clarifications ?? [];
  const allAnswered = clarifications.every((c) => (answers[c] ?? '').trim().length > 0);

  return (
    <Screen
      refreshing={request.isFetching && !request.isPending}
      onRefresh={() => request.refetch()}
      footer={
        plan && canApprovePlan ? (
          <Button label="Aprovar plano" onPress={() => approve.mutate()} loading={approve.isPending} />
        ) : pendingQuote && order ? (
          <Button
            label={`Ver orçamento de ${formatBRL(pendingQuote.amountCents)}`}
            onPress={() => router.push(`/(customer)/order/${order.id}`)}
          />
        ) : null
      }
    >
      <Header title="Concierge" />
      {request.isPending ? (
        <CardSkeleton height={260} />
      ) : request.isError || !r ? (
        <ErrorState description={errorMessage(request.error)} onRetry={() => request.refetch()} />
      ) : (
        <View style={{ gap: spacing[6] }}>
          <View style={{ gap: spacing[2] }}>
            {status ? <StatusPill label={ORDER_STATUS_LABELS[status].label} status={status} /> : null}
            <Text variant="title">
              {status ? ORDER_STATUS_LABELS[status].customer : 'Montando um plano para você.'}
            </Text>
            {r.rawText || r.transcript ? (
              <Text variant="body" color="muted">
                “{r.transcript ?? r.rawText}”
              </Text>
            ) : null}
          </View>

          {!plan ? (
            <View style={{ gap: spacing[3] }}>
              <CardSkeleton height={72} />
              <CardSkeleton height={72} />
              <Text variant="caption" color="muted" align="center">
                Costuma levar menos de 1 min. Acima de certos valores, nossa equipe revisa antes.
              </Text>
            </View>
          ) : (
            <>
              <Card variant="elevated">
                <Text variant="heading">{plan.summary}</Text>
                <Text variant="bodySm" color="muted" style={{ marginTop: 4 }}>
                  Estimativa: {formatBRL(plan.estimateMinCents)} – {formatBRL(plan.estimateMaxCents)}
                  {plan.requiresHuman ? ' · com revisão da nossa equipe' : ''}
                </Text>
              </Card>

              <Section title="Tarefas">
                <View style={{ gap: spacing[2] }}>
                  {[...plan.tasks]
                    .sort((a, b) => a.seq - b.seq)
                    .map((t) => {
                      const orderTask = order?.tasks.find((ot) => ot.seq === t.seq);
                      return (
                        <View
                          key={t.seq}
                          style={[
                            styles.task,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              borderRadius: radius.md,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.seq,
                              {
                                backgroundColor:
                                  orderTask?.status === 'DONE' ? colors.success : colors.primarySoft,
                              },
                            ]}
                          >
                            <Text
                              variant="labelSm"
                              style={{
                                color: orderTask?.status === 'DONE' ? colors.textOnPrimary : colors.primary,
                              }}
                            >
                              {t.seq}
                            </Text>
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text variant="body">{t.title}</Text>
                            <Text variant="caption" color="muted">
                              {TASK_KIND[t.kind] ?? t.kind}
                              {t.startsAt ? ` · ${formatSchedule(t.startsAt)}` : ''}
                              {t.estimateCents != null ? ` · ${formatBRL(t.estimateCents)}` : ''}
                            </Text>
                            {t.notes ? (
                              <Text variant="bodySm" color="muted">
                                {t.notes}
                              </Text>
                            ) : null}
                          </View>
                          {orderTask?.childOrderId ? (
                            <Button
                              label="Ver"
                              variant="ghost"
                              size="md"
                              fullWidth={false}
                              onPress={() => router.push(`/(customer)/order/${orderTask.childOrderId}`)}
                            />
                          ) : null}
                        </View>
                      );
                    })}
                </View>
              </Section>

              {clarifications.length ? (
                <Section title="Precisamos saber">
                  <View style={{ gap: spacing[3] }}>
                    {clarifications.map((q) => (
                      <Input
                        key={q}
                        label={q}
                        value={answers[q] ?? ''}
                        onChangeText={(t) => setAnswers((a) => ({ ...a, [q]: t }))}
                        maxLength={500}
                      />
                    ))}
                    <Button
                      label="Enviar respostas"
                      variant="secondary"
                      onPress={() => answer.mutate()}
                      loading={answer.isPending}
                      disabled={!allAnswered}
                    />
                  </View>
                </Section>
              ) : null}

              {order ? (
                <Button
                  label="Ver acompanhamento completo"
                  variant="ghost"
                  onPress={() => router.push(`/(customer)/order/${order.id}`)}
                />
              ) : null}
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  task: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  seq: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
