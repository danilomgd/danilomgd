import { EmptyState, ListSkeleton, SegmentedControl, Text, useTheme } from '@velio/ui/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { OrderRow } from '@/components/OrderRow';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { Button } from '@velio/ui/native';

/** C-16: pedidos em andamento e histórico com recompra. */
export default function OrdersScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [scope, setScope] = useState<'active' | 'history'>('active');
  const query = useInfiniteQuery({
    queryKey: qk.orders(scope),
    queryFn: ({ pageParam }) => api.orders.list({ scope, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: scope === 'active' ? 30_000 : false,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen refreshing={query.isFetching && !query.isPending} onRefresh={() => query.refetch()}>
      <Text variant="title" accessibilityRole="header" style={{ marginBottom: spacing[4] }}>
        Pedidos
      </Text>
      <SegmentedControl
        options={[
          { value: 'active', label: 'Em andamento' },
          { value: 'history', label: 'Histórico' },
        ]}
        value={scope}
        onChange={setScope}
      />
      <View style={{ height: spacing[4] }} />
      <QueryState query={query} skeleton={<ListSkeleton rows={5} />}>
        {() =>
          items.length ? (
            <View style={{ gap: spacing[2] }}>
              {items.map((o) => (
                <OrderRow key={o.id} order={o} role="customer" onPress={() => router.push(`/(customer)/order/${o.id}`)} onReorder={() => router.push(`/(customer)/checkout?serviceId=${o.serviceId}`)} />
              ))}
              {query.hasNextPage ? <Button label="Carregar mais" variant="ghost" onPress={() => query.fetchNextPage()} loading={query.isFetchingNextPage} /> : null}
            </View>
          ) : (
            <EmptyState
              icon="clipboard"
              title={scope === 'active' ? 'Nada em andamento' : 'Você ainda não fez pedidos'}
              description={scope === 'active' ? 'Seus pedidos ativos aparecem aqui.' : 'Explore os serviços e peça em três toques.'}
              action={{ label: 'Explorar serviços', onPress: () => router.push('/(customer)/(tabs)') }}
            />
          )
        }
      </QueryState>
    </Screen>
  );
}
