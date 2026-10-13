import { formatBRL } from '@velio/contracts';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';

export interface PriceLine {
  label: string;
  amountCents: number | null;
  /** `discount` mostra com sinal negativo em verde; `addition` com "+". */
  kind?: 'base' | 'addition' | 'discount';
  pending?: boolean;
}

export interface PriceSummaryProps {
  lines: PriceLine[];
  totalCents: number | null;
  totalLabel?: string;
  /** Faixa quando não há total fechado. */
  rangeCents?: { min: number | null; max: number | null } | null;
  note?: string;
  variant?: 'inline' | 'full';
}

export function formatSignedBRL(cents: number, kind: PriceLine['kind']): string {
  if (kind === 'discount') return `− ${formatBRL(Math.abs(cents))}`;
  if (kind === 'addition') return `+ ${formatBRL(cents)}`;
  return formatBRL(cents);
}

/** Linhas de valor com total em destaque. Valores em centavos → `formatBRL`. */
export function PriceSummary({
  lines,
  totalCents,
  totalLabel = 'Total',
  rangeCents,
  note,
  variant = 'full',
}: PriceSummaryProps) {
  const { colors } = useTheme();
  const totalText =
    totalCents != null
      ? formatBRL(totalCents)
      : rangeCents?.min != null && rangeCents?.max != null
        ? `${formatBRL(rangeCents.min)} – ${formatBRL(rangeCents.max)}`
        : rangeCents?.min != null
          ? `A partir de ${formatBRL(rangeCents.min)}`
          : 'Sob orçamento';

  if (variant === 'inline') {
    return (
      <View style={styles.inline}>
        <Text variant="body" color="muted">
          {totalLabel}
        </Text>
        <Text variant="mono">{totalText}</Text>
      </View>
    );
  }
  return (
    <View accessibilityLabel={`${totalLabel}: ${totalText}`}>
      {lines.map((l, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: linhas estáticas por render
        <View key={`${l.label}-${i}`} style={styles.line}>
          <Text variant="body" color="muted" style={{ flex: 1 }}>
            {l.label}
          </Text>
          <Text variant="mono" color={l.kind === 'discount' ? 'success' : l.pending ? 'muted' : 'primary'}>
            {l.amountCents == null
              ? l.pending
                ? 'sob orçamento'
                : '—'
              : formatSignedBRL(l.amountCents, l.kind)}
          </Text>
        </View>
      ))}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.total}>
        <Text variant="title">{totalLabel}</Text>
        <Text variant="title" style={{ fontVariant: ['tabular-nums'] }}>
          {totalText}
        </Text>
      </View>
      {note ? (
        <Text variant="caption" color="muted" style={styles.note}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 32,
    gap: 12,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 },
  note: { marginTop: 6 },
});
