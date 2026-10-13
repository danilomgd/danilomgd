import { Avatar, ListItem, Text, useTheme } from '@velio/ui/native';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSession } from '@/auth/session';
import { Screen } from '@/components/Screen';
import { APP_VERSION } from '@/lib/config';
import { maskPhoneBR } from '@/lib/format';

/** C-26: conta: endereços, veículos, equipamentos, pagamentos, assinaturas, notificações, sair. */
export default function AccountScreen() {
  const router = useRouter();
  const session = useSession();
  const { spacing } = useTheme();
  return (
    <Screen>
      <View style={[styles.head, { marginBottom: spacing[6] }]}>
        <Avatar name={session.user?.name} url={session.user?.avatarUrl} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="title">{session.user?.name ?? 'Sua conta'}</Text>
          <Text variant="bodySm" color="muted">
            {session.user?.phone ? maskPhoneBR(session.user.phone) : ''}
          </Text>
        </View>
      </View>
      <ListItem title="Endereços" icon="map-pin" onPress={() => router.push('/(customer)/account/addresses')} />
      <ListItem title="Veículos" icon="truck" onPress={() => router.push('/(customer)/account/vehicles')} />
      <ListItem title="Equipamentos" icon="wind" onPress={() => router.push('/(customer)/account/equipments')} />
      <ListItem title="Pagamento" icon="credit-card" onPress={() => router.push('/(customer)/account/payment-methods')} />
      <ListItem title="Assinaturas" icon="calendar" onPress={() => router.push('/(customer)/subscriptions/plans')} />
      <ListItem title="Notificações" icon="bell" onPress={() => router.push('/(customer)/account/notifications')} />
      <ListItem title="Sair" icon="log-out" destructive divider={false} onPress={() => session.signOut()} chevron={false} />
      <Text variant="caption" color="muted" align="center" style={{ marginTop: spacing[8] }}>
        VÉLIO {APP_VERSION}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({ head: { flexDirection: 'row', alignItems: 'center', gap: 12 } });
