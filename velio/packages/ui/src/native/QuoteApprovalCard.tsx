import { type Quote, formatBRL } from '@velio/contracts';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { PriceSummary } from './PriceSummary';
import { StatusPill } from './StatusPill';
import { Text } from './Text';
import { useTheme } from './theme';

export interface QuoteApprovalCardProps {
  quote: Quote;
  /** Valor já combinado da ordem, para mostrar o impacto. */
  agreedCents?: number | null;
  providerName?: string | null;
  countdown?: string | null;
  onApprove?: () => void;
  onReject?: () => void;
  loading?: 'approve' | 'reject' | null;
}

const STATUS_LABEL: Record<Quote['status'], string> = {
  DRAFT: 'Rascunho',
  SENT: 'Aguardando sua decisão',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  EXPIRED: 'Expirado',
};

/** Orçamento (inicial ou adicional) com itens, impacto no total e [RECUSAR] [APROVAR]. */
export function QuoteApprovalCard({ quote, agreedCents, providerName, countdown, onApprove, onReject, loading }: QuoteApprovalCardProps) {
  const { colors, radius, elevation } = useTheme();
  const pending = quote.status === 'SENT';
  const isAdditional = quote.kind === 'ADDITIONAL';
  const tone = pending ? 'warning' : quote.status === 'APPROVED' ? 'success' : 'neutral';
  const decidedAt = quote.decidedAt ? new Date(quote.decidedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: pending ? colors.warning : colors.border, ...elevation.sm }]}>
      <View style={styles.header}>
        <Text variant="titleSm">{isAdditional ? 'Orçamento adicional' : 'Orçamento'}</Text>
        <StatusPill label={STATUS_LABEL[quote.status]} tone={tone} countdown={pending ? (countdown ?? undefined) : undefined} />
      </View>
      {providerName && pending ? (
        <Text variant="bodySm" color="muted">
          {isAdditional ? `${providerName} encontrou algo além do combinado.` : `${providerName} enviou um orçamento.`}
        </Text>
      ) : null}
      {quote.notes ? <Text variant="body">{quote.notes}</Text> : null}
      <View style={styles.items}>
        {quote.items.map((it, i) => (
          <View key={`${it.description}-${i}`} style={styles.item}>
            <Text variant="body" style={{ flex: 1 }}>
              {it.description}
              {it.quantity !== 1 ? (
                <Text variant="bodySm" color="muted">
                  {'  '}× {it.quantity}
                </Text>
              ) : null}
            </Text>
            <Text variant="mono">{formatBRL(Math.round(it.unitPriceCents * it.quantity))}</Text>
          </View>
        ))}
      </View>
      {isAdditional && agreedCents != null ? (
        <PriceSummary
          lines={[
            { label: 'Já combinado', amountCents: agreedCents },
            { label: 'Adicional', amountCents: quote.amountCents, kind: 'addition' },
          ]}
          totalCents={agreedCents + quote.amountCents}
          totalLabel="Novo total"
          note={pending ? 'Cobrado só na conclusão do serviço.' : undefined}
        />
      ) : (
        <PriceSummary lines={[]} totalCents={quote.amountCents} totalLabel="Valor" note={pending ? 'Cobrado só na conclusão do serviço.' : undefined} />
      )}
      {pending ? (
        <View style={styles.actions}>
          <Button label="Recusar" variant="dangerSoft" onPress={onReject} loading={loading === 'reject'} disabled={loading === 'approve'} fullWidth={false} style={{ flex: 1 }} />
          <Button
            label={`Aprovar ${formatBRL(quote.amountCents)}`}
            onPress={onApprove}
            loading={loading === 'approve'}
            disabled={loading === 'reject'}
            fullWidth={false}
            style={{ flex: 2 }}
            accessibilityLabel={`Aprovar orçamento de ${formatBRL(quote.amountCents)}`}
          />
        </View>
      ) : decidedAt ? (
        <Text variant="caption" color="muted">
          Decidido em {decidedAt}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 12, borderWidth: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  items: { gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
