import { ErrorState, useTheme } from '@velio/ui/native';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSession } from '@/auth/session';
import { useProviderGate } from '@/hooks/useProviderGate';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { errorMessage } from '@/lib/errors';

/** Árvore do prestador (VÉLIO Pro): auth → onboarding → aprovação pendente → app. */
export default function ProviderLayout() {
  const session = useSession();
  const { colors } = useTheme();
  const authed = session.status === 'authenticated' && !session.needsOnboarding;
  const { gate, query } = useProviderGate(authed);

  if (authed && gate === 'loading') return <View style={[styles.flex, { backgroundColor: colors.bg }]} />;
  if (authed && gate === 'error') {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: colors.bg }]}>
        <ErrorState
          description={errorMessage(query.error)}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      </View>
    );
  }

  return (
    <>
      {authed && gate === 'approved' ? <RealtimeBinder /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!authed}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={authed && gate === 'onboarding'}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={authed && gate === 'pending'}>
          <Stack.Screen name="pending" />
        </Stack.Protected>
        <Stack.Protected guard={authed && gate === 'approved'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="offer/[id]"
            options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
          />
          <Stack.Screen name="order/[id]/index" />
          <Stack.Screen name="order/[id]/chat" />
          <Stack.Screen name="order/[id]/quote" options={{ presentation: 'modal' }} />
          <Stack.Screen name="order/[id]/custody" options={{ presentation: 'modal' }} />
          <Stack.Screen name="order/[id]/handover" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

function RealtimeBinder() {
  useRealtimeInvalidation('provider');
  return null;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, center: { justifyContent: 'center' } });
