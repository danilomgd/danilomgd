import { useQuery } from '@tanstack/react-query';
import { formatBRL, LedgerEntryPublic, Payout } from '@velio/contracts';
import {
  Card,
  CardSkeleton,
  EmptyState,
  ListItem,
  ListSkeleton,
  SegmentedControl,
  StatusPill,
  Text,
  useTheme,
} from '@velio/ui/native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { z } from 'zod';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { qk } from '@/lib/query';

type Ledger = z.infer<typeof LedgerEntryPublic>;
type PayoutT = z.infer<typeof Payout>;

const PAYOUT_LABEL: Record<
  PayoutT['status'],
  { label: string; tone: 'success' | 'info' | 'warning' | 'danger' }
> = {
  SCHEDULED: { label: 'Programado', tone: 'info' },
  PROCESSING: { label: 'Processando', tone: 'info' },
  PAID: { label: 'Pago', tone: 'success' },
  FAILED: { label: 'Falhou', tone: 'danger' },
};

function periodStart(p: 'today' | 'week' | 'month'): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === 'week') d.setDate(d.getDate() - d.getDay());
  if (p === 'month') d.setDate(1);
  return d.getTime();
}

/** P-20 / P-21: saldo, pendente, retido, próximo repasse, extrato e repasses. */
export default function EarningsScreen() {
  const { spacing } = useTheme();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const wallet = useQuery({ queryKey: qk.provider.wallet, queryFn: () => api.provider.wallet() });
  const ledger = useQuery({
    queryKey: qk.provider.ledger,
    queryFn: async () =>
      (await api.provider.ledger())
        .map((r) => LedgerEntryPublic.safeParse(r))
        .flatMap((r) => (r.success ? [r.data] : [])),
  });
  const payouts = useQuery({
    queryKey: qk.provider.payouts,
    queryFn: async () =>
      (await api.provider.payouts())
        .map((r) => Payout.safeParse(r))
        .flatMap((r) => (r.success ? [r.data] : [])),
  });

  const entries = useMemo(() => {
    const from = periodStart(period);
    return (ledger.data ?? [])
      .filter((e: Ledger) => new Date(e.createdAt).getTime() >= from)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [ledger.data, period]);
  const credits = entries.filter((e) => e.direction === 'CREDIT').reduce((s, e) => s + e.amountCents, 0);
  const debits = entries.filter((e) => e.direction === 'DEBIT').reduce((s, e) => s + e.amountCents, 0);

  return (
    <Screen
      refreshing={wallet.isFetching && !wallet.isPending}
      onRefresh={() => Promise.all([wallet.refetch(), ledger.refetch(), payouts.refetch()])}
    >
      <Text variant="title" accessibilityRole="header" style={{ marginBottom: spacing[4] }}>
        Ganhos
      </Text>
      {wallet.isPending ? (
        <CardSkeleton height={140} />
      ) : wallet.data ? (
        <Card variant="elevated">
          <View style={styles.kpis}>
            <Kpi label="Disponível" value={formatBRL(wallet.data.balanceCents)} big />
            <Kpi label="A liberar" value={formatBRL(wallet.data.pendingCents)} big />
          </View>
          <View style={[styles.kpis, { marginTop: spacing[3] }]}>
            <Kpi label="Retido" value={formatBRL(wallet.data.heldCents)} />
            <Kpi
              label="Próximo repasse"
              value={wallet.data.nextPayoutAt ? formatDate(wallet.data.nextPayoutAt) : '—'}
            />
          </View>
        </Card>
      ) : null}

      <Section title="Extrato" style={{ marginTop: spacing[6] }}>
        <SegmentedControl
          options={[
            { value: 'today', label: 'Hoje' },
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mês' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <View style={[styles.kpis, { marginVertical: spacing[3] }]}>
          <Kpi label="Lançamentos" value={String(entries.length)} />
          <Kpi label="Créditos" value={formatBRL(credits)} />
          <Kpi label="Débitos" value={formatBRL(debits)} />
        </View>
        <QueryState query={ledger} skeleton={<ListSkeleton rows={4} />}>
          {() =>
            entries.length ? (
              <View>
                {entries.map((e) => (
                  <ListItem
                    key={e.id}
                    title={e.description}
                    subtitle={formatDateTime(e.createdAt)}
                    value={`${e.direction === 'DEBIT' ? '− ' : ''}${formatBRL(e.amountCents)}`}
                    icon={e.direction === 'CREDIT' ? 'arrow-down-left' : 'arrow-up-right'}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                compact
                icon="dollar-sign"
                title="Seus ganhos aparecem aqui"
                description="Após o primeiro serviço concluído."
              />
            )
          }
        </QueryState>
      </Section>

      <Section title="Repasses">
        <QueryState query={payouts} skeleton={<ListSkeleton rows={2} />}>
          {() =>
            payouts.data?.length ? (
              <View>
                {payouts.data.map((p) => (
                  <ListItem
                    key={p.id}
                    title={`${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}`}
                    subtitle={
                      p.paidAt
                        ? `Pago em ${formatDate(p.paidAt)}`
                        : p.status === 'FAILED'
                          ? 'Verifique seus dados de recebimento'
                          : null
                    }
                    value={formatBRL(p.amountCents)}
                    trailing={
                      <StatusPill
                        label={PAYOUT_LABEL[p.status].label}
                        tone={PAYOUT_LABEL[p.status].tone}
                        size="sm"
                      />
                    }
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                compact
                icon="credit-card"
                title="Nenhum repasse ainda"
                description="Repasses são semanais."
              />
            )
          }
        </QueryState>
      </Section>
    </Screen>
  );
}

function Kpi({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="mono" style={big ? { fontSize: 22, lineHeight: 28 } : undefined}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ kpis: { flexDirection: 'row', gap: 12 } });
