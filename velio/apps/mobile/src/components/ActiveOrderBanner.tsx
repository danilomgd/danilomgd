import { ORDER_STATUS_LABELS, type ServiceOrder, TERMINAL_ORDER_STATUSES } from '@velio/contracts';
import { StatusPill, Text, useTheme } from '@velio/ui/native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '@/lib/api';
import { etaLabel, firstName } from '@/lib/format';
import { qk } from '@/lib/query';

/** Cartão fixo "Em andamento" acima das abas; some sem ordem ativa. */
export function ActiveOrderBanner({ role }: { role: 'customer' | 'provider' }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { data } = useQuery({
    queryKey: role === 'customer' ? qk.orders('active') : qk.provider.orders('active'),
    queryFn: () => (role === 'customer' ? api.orders.list({ scope: 'active', limit: 5 }) : api.provider.orders({ scope: 'active', limit: 5 })),
    refetchInterval: 30_000,
  });
  const order: ServiceOrder | undefined = data?.items.find((o) => !TERMINAL_ORDER_STATUSES.has(o.status));
  if (!order) return null;
  const labels = ORDER_STATUS_LABELS[order.status];
  const eta = etaLabel(order.etaAt);
  const who = role === 'customer' ? firstName(order.provider?.displayName) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Pedido em andamento: ${order.serviceName}, ${labels.label}`}
      onPress={() => router.push(`/(${role})/order/${order.id}`)}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.primarySoft, borderBottomColor: colors.border, paddingHorizontal: spacing[4], opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.texts}>
        <Text variant="label" numberOfLines={1}>
          {order.serviceName}
        </Text>
        <Text variant="bodySm" color="muted" numberOfLines={1}>
          {who ? `${who} · ` : ''}
          {eta ?? labels[role]}
        </Text>
      </View>
      <StatusPill label={labels.label} status={order.status} size="sm" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  texts: { flex: 1, gap: 2 },
});
