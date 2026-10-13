import { ORDER_STATUS_LABELS, type OrderEvent, type OrderStatus } from '@velio/contracts';
import { StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export interface OrderStatusTimelineProps {
  events: OrderEvent[];
  /** `customer` ou `provider`: escolhe a frase de status. */
  audience?: 'customer' | 'provider';
  variant?: 'vertical' | 'mini';
  /** Mostra também eventos sem mudança de status (orçamento, evidência, mensagem de sistema). */
  includeNonTransitions?: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export interface TimelineNode {
  key: string;
  status: OrderStatus | null;
  label: string;
  description: string | null;
  at: string;
  current: boolean;
}

/** Converte `OrderEvent[]` em nós rotulados (pt-BR) a partir de `ORDER_STATUS_LABELS`. */
export function buildTimeline(
  events: OrderEvent[],
  audience: 'customer' | 'provider' = 'customer',
  includeNonTransitions = false,
): TimelineNode[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const nodes: TimelineNode[] = [];
  for (const e of sorted) {
    if (e.toStatus) {
      const labels = ORDER_STATUS_LABELS[e.toStatus];
      // Estados repetidos (ex.: REMINDED idempotente) colapsam no último.
      const prev = nodes[nodes.length - 1];
      if (prev && prev.status === e.toStatus) {
        prev.at = e.createdAt;
        continue;
      }
      nodes.push({
        key: e.id,
        status: e.toStatus,
        label: labels.label,
        description: labels[audience],
        at: e.createdAt,
        current: false,
      });
    } else if (includeNonTransitions) {
      const text = typeof e.payload.message === 'string' ? e.payload.message : null;
      nodes.push({
        key: e.id,
        status: null,
        label: humanizeEventType(e.type),
        description: text,
        at: e.createdAt,
        current: false,
      });
    }
  }
  const last = nodes[nodes.length - 1];
  if (last) last.current = true;
  return nodes;
}

function humanizeEventType(type: string): string {
  const map: Record<string, string> = {
    'quote.created': 'Orçamento enviado',
    'quote.approved': 'Orçamento aprovado',
    'quote.rejected': 'Orçamento recusado',
    'evidence.added': 'Foto registrada',
    'custody.scanned': 'Custódia registrada',
    'payment.authorized': 'Pagamento autorizado',
    'payment.captured': 'Pagamento concluído',
    'operator.note': 'Nota da operação',
  };
  return map[type] ?? type.replace(/[._]/g, ' ');
}

/** Linha do tempo da ordem. Lê somente `order_events` e rótulos de `contracts`. */
export function OrderStatusTimeline({
  events,
  audience = 'customer',
  variant = 'vertical',
  includeNonTransitions,
}: OrderStatusTimelineProps) {
  const { colors } = useTheme();
  const nodes = buildTimeline(events, audience, includeNonTransitions);

  if (variant === 'mini') {
    return (
      <View style={styles.miniRow} accessibilityLabel={`${nodes.length} etapas concluídas`}>
        {nodes.slice(-3).map((n) => (
          <View
            key={n.key}
            style={[styles.miniDot, { backgroundColor: n.current ? colors.primary : colors.border }]}
          />
        ))}
      </View>
    );
  }

  return (
    <View accessibilityRole="list">
      {nodes.map((n, i) => {
        const isLast = i === nodes.length - 1;
        return (
          <View
            key={n.key}
            style={styles.row}
            accessibilityLabel={`Etapa ${i + 1} de ${nodes.length}: ${n.label}, ${formatTime(n.at)}`}
          >
            <View style={styles.timeCol}>
              <Text variant="caption" color="muted">
                {formatTime(n.at)}
              </Text>
              {i === 0 || formatDay(n.at) !== formatDay(nodes[i - 1]?.at ?? n.at) ? (
                <Text variant="caption" color="muted">
                  {formatDay(n.at)}
                </Text>
              ) : null}
            </View>
            <View style={styles.railCol}>
              <View
                style={[
                  styles.dot,
                  n.current
                    ? { borderColor: colors.primary, backgroundColor: colors.surface, borderWidth: 3 }
                    : { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                {!n.current ? <Icon name="check" size={8} color={colors.textOnPrimary} /> : null}
              </View>
              {!isLast ? <View style={[styles.rail, { backgroundColor: colors.border }]} /> : null}
            </View>
            <View style={styles.content}>
              <Text variant={n.current ? 'label' : 'body'}>{n.label}</Text>
              {n.description ? (
                <Text variant="bodySm" color="muted">
                  {n.description}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, minHeight: 56 },
  timeCol: { width: 48, alignItems: 'flex-end', paddingTop: 2 },
  railCol: { width: 16, alignItems: 'center' },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  rail: { flex: 1, width: 2, marginVertical: 4 },
  content: { flex: 1, paddingBottom: 16, gap: 2 },
  miniRow: { flexDirection: 'row', gap: 6 },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
});
