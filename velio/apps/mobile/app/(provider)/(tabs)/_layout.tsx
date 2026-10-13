import { TERMINAL_ORDER_STATUSES } from '@velio/contracts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { ActiveOrderBanner } from '@/components/ActiveOrderBanner';
import { TabBar, type TabSpec } from '@/components/TabBar';
import { useProviderGate } from '@/hooks/useProviderGate';
import { useProviderTracking } from '@/hooks/useProviderTracking';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { subscribe } from '@/lib/realtime';

const TABS: TabSpec[] = [
  { name: 'index', label: 'Painel', icon: 'activity' },
  { name: 'orders', label: 'Serviços', icon: 'clipboard' },
  { name: 'schedule', label: 'Agenda', icon: 'calendar' },
  { name: 'earnings', label: 'Ganhos', icon: 'dollar-sign' },
  { name: 'profile', label: 'Perfil', icon: 'user' },
];

export default function ProviderTabs() {
  const router = useRouter();
  const { provider } = useProviderGate(true);
  const active = useQuery({ queryKey: qk.provider.orders('active'), queryFn: () => api.provider.orders({ scope: 'active', limit: 5 }), refetchInterval: 30_000 });
  const activeOrder = active.data?.items.find((o) => !TERMINAL_ORDER_STATUSES.has(o.status)) ?? null;
  const offers = useQuery({ queryKey: qk.provider.offers, queryFn: () => api.provider.offers(), refetchInterval: 20_000 });
  const pendingOffers = offers.data?.filter((o) => o.response === 'PENDING').length ?? 0;

  useProviderTracking(provider?.availability ?? 'OFFLINE', activeOrder);

  // Oferta recebida interrompe qualquer tela (modal de tela cheia).
  useEffect(
    () =>
      subscribe('offer.created', (p) => {
        track('offer_received', { source: 'realtime' }, p.orderId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        router.push(`/(provider)/offer/${p.offerId}`);
      }),
    [router],
  );

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} tabs={TABS} above={<ActiveOrderBanner role="provider" />} badges={{ index: pendingOffers }} />}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
