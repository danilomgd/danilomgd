import { BottomSheet, Button, CardSkeleton, ErrorState, Input, StatusPill, Text, useTheme, useToast } from '@velio/ui/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { KeyValue, Section } from '@/components/Section';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/query';

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  ACTIVE: { label: 'Ativa', tone: 'success' },
  PAUSED: { label: 'Pausada', tone: 'warning' },
  PAST_DUE: { label: 'Pagamento pendente', tone: 'danger' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};

/** C-22: gerir assinatura. */
export default function SubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const subs = useQuery({ queryKey: qk.subscriptions, queryFn: () => api.me.subscriptions() });
  const sub = subs.data?.find((s) => s.id === id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const cancel = useMutation({
    mutationFn: () => api.me.cancelSubscription(id, reason.trim()),
    onSuccess: () => {
      track('subscription_cancelled', { reason });
      qc.invalidateQueries({ queryKey: qk.subscriptions });
      setCancelOpen(false);
      toast.show({ message: 'Assinatura cancelada.', tone: 'neutral' });
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  return (
    <Screen>
      <Header title="Assinatura" />
      {subs.isPending ? (
        <CardSkeleton height={200} />
      ) : subs.isError || !sub ? (
        <ErrorState title="Assinatura não encontrada" description={errorMessage(subs.error)} onRetry={() => subs.refetch()} />
      ) : (
        <View style={{ gap: spacing[6] }}>
          <View style={{ gap: spacing[2] }}>
            <StatusPill label={STATUS[sub.status]?.label ?? sub.status} tone={STATUS[sub.status]?.tone ?? 'neutral'} />
            <Text variant="title">{sub.planName}</Text>
            {sub.status === 'PAST_DUE' ? (
              <Button label="Atualizar pagamento" variant="secondary" size="md" onPress={() => router.push('/(customer)/account/payment-methods')} />
            ) : null}
          </View>
          <Section title="Visitas">
            <KeyValue label="Próxima visita" value={sub.nextVisitDueAt ? formatDate(sub.nextVisitDueAt) : 'A agendar'} />
            <KeyValue label="Próxima cobrança" value={sub.nextChargeAt ? formatDate(sub.nextChargeAt) : '—'} />
            <KeyValue label="Desde" value={formatDate(sub.startedAt)} />
            <KeyValue label="Equipamentos" value={`${sub.equipmentIds.length}`} />
          </Section>
          {sub.status !== 'CANCELLED' ? <Button label="Cancelar assinatura" variant="ghost" onPress={() => setCancelOpen(true)} /> : null}
        </View>
      )}
      <BottomSheet visible={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancelar assinatura?">
        <View style={{ gap: spacing[3] }}>
          <Text variant="body" color="muted">
            As visitas futuras deixam de ser agendadas. Visitas já confirmadas permanecem.
          </Text>
          <Input label="Motivo" value={reason} onChangeText={setReason} placeholder="Conte o motivo" maxLength={300} />
          <Button label="Confirmar cancelamento" variant="danger" onPress={() => cancel.mutate()} loading={cancel.isPending} disabled={reason.trim().length < 3} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
