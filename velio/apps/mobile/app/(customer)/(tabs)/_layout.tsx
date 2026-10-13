import { Tabs } from 'expo-router/js-tabs';
import { ActiveOrderBanner } from '@/components/ActiveOrderBanner';
import { TabBar, type TabSpec } from '@/components/TabBar';

const TABS: TabSpec[] = [
  { name: 'index', label: 'Início', icon: 'home' },
  { name: 'orders', label: 'Pedidos', icon: 'clipboard' },
  { name: 'concierge', label: 'Concierge', icon: 'message-square' },
  { name: 'account', label: 'Conta', icon: 'user' },
];

export default function CustomerTabs() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} tabs={TABS} above={<ActiveOrderBanner audience="customer" />} />}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
