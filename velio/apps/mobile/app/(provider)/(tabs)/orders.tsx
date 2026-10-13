import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, EmptyState, ListSkeleton, SegmentedControl, Text, useTheme } from '@velio/ui/native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { OrderRow } from '@/components/OrderRow';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/** Serviços do prestador: ativos e histórico. */
export default function ProviderOrdersScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [scope, setScope] = useState<'active' | 'history'>('active');
  const query = useInfiniteQuery({
    queryKey: qk.provider.orders(scope),
    queryFn: ({ pageParam }) => api.provider.orders({ scope, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Screen refreshing={query.isFetching && !query.isPending} onRefresh={() => query.refetch()}>
      <Text variant="title" accessibilityRole="header" style={{ marginBottom: spacing[4] }}>
        Serviços
      </Text>
      <SegmentedControl
        options={[
          { value: 'active', label: 'Ativos' },
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
                <OrderRow
                  key={o.id}
                  order={o}
                  audience="provider"
                  onPress={() => router.push(`/(provider)/order/${o.id}`)}
                />
              ))}
              {query.hasNextPage ? (
                <Button
                  label="Carregar mais"
                  variant="ghost"
                  onPress={() => query.fetchNextPage()}
                  loading={query.isFetchingNextPage}
                />
              ) : null}
            </View>
          ) : (
            <EmptyState
              icon="clipboard"
              title={scope === 'active' ? 'Nenhum serviço ativo' : 'Sem histórico ainda'}
              description={
                scope === 'active'
                  ? 'Fique online para receber ofertas.'
                  : 'Seus serviços concluídos aparecem aqui.'
              }
            />
          )
        }
      </QueryState>
    </Screen>
  );
}
