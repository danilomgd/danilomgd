import { useQuery } from '@tanstack/react-query';
import { EmptyState, ListItem, ListSkeleton } from '@velio/ui/native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Header } from '@/components/Header';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { resolveNotificationTarget } from '@/lib/notifications';
import { qk } from '@/lib/query';

/** C-30 / P-25: histórico de notificações com deep link. */
export function NotificationsScreen() {
  const router = useRouter();
  const list = useQuery({ queryKey: qk.notifications, queryFn: () => api.me.notifications() });
  return (
    <Screen refreshing={list.isFetching && !list.isPending} onRefresh={() => list.refetch()}>
      <Header title="Notificações" />
      <QueryState query={list} skeleton={<ListSkeleton rows={6} />}>
        {() =>
          list.data?.length ? (
            <View>
              {list.data.map((n) => {
                const target = resolveNotificationTarget(n.data);
                return (
                  <ListItem
                    key={n.id}
                    title={n.title}
                    subtitle={`${n.body} · ${formatDateTime(n.createdAt)}`}
                    icon={n.readAt ? 'bell' : 'bell'}
                    onPress={
                      target
                        ? () => {
                            track('notification_opened', { kind: n.kind, source: 'inbox' }, target.orderId);
                            router.push(target.path);
                          }
                        : undefined
                    }
                  />
                );
              })}
            </View>
          ) : (
            <EmptyState
              icon="bell"
              title="Nenhuma notificação"
              description="Avisos sobre seus pedidos aparecem aqui."
            />
          )
        }
      </QueryState>
    </Screen>
  );
}
