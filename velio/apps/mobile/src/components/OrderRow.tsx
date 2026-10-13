import { formatBRL, ORDER_STATUS_LABELS, type ServiceOrder, TERMINAL_ORDER_STATUSES } from '@velio/contracts';
import { Button, Icon, StatusPill, Text, useTheme } from '@velio/ui/native';
import { Pressable, StyleSheet, View } from 'react-native';
import { etaLabel, firstName, formatDateTime, formatSchedule } from '@/lib/format';

/** Cartão de pedido em listas (cliente e prestador). */
export function OrderRow({
  order,
  audience: role,
  onPress,
  onReorder,
}: {
  order: ServiceOrder;
  audience: 'customer' | 'provider';
  onPress: () => void;
  onReorder?: () => void;
}) {
  const { colors, radius } = useTheme();
  const labels = ORDER_STATUS_LABELS[order.status];
  const terminal = TERMINAL_ORDER_STATUSES.has(order.status);
  const eta = etaLabel(order.etaAt);
  const when = order.scheduledFor
    ? formatSchedule(order.scheduledFor, order.windowMinutes)
    : formatDateTime(order.createdAt);
  const money = role === 'provider' ? order.providerPayoutCents : order.totalCents;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${order.serviceName}, ${labels.label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.lg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.top}>
        <View style={styles.texts}>
          <Text variant="heading" numberOfLines={1}>
            {order.serviceName}
          </Text>
          <Text variant="bodySm" color="muted" numberOfLines={1}>
            {when}
            {role === 'customer' && order.provider ? ` · ${firstName(order.provider.displayName)}` : ''}
            {order.address ? ` · ${order.address.summary}` : ''}
          </Text>
        </View>
        <StatusPill label={labels.label} status={order.status} size="sm" />
      </View>
      <View style={styles.bottom}>
        <Text variant="bodySm" color={eta ? 'brand' : 'muted'} style={{ flex: 1 }} numberOfLines={1}>
          {eta ?? labels[role]}
        </Text>
        {money != null ? <Text variant="mono">{formatBRL(money)}</Text> : null}
        {terminal && onReorder ? null : <Icon name="chevron-right" size="md" color={colors.textMuted} />}
      </View>
      {terminal && onReorder ? (
        <Button
          label="Pedir de novo"
          variant="secondary"
          size="md"
          onPress={onReorder}
          icon="refresh-cw"
          style={{ marginTop: 8 }}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  texts: { flex: 1, gap: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
