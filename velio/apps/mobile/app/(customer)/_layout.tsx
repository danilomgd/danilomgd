import { Stack } from 'expo-router';
import { useSession } from '@/auth/session';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

/** Árvore do cliente (VÉLIO). Auth protegida por sessão; demais rotas exigem perfil completo. */
export default function CustomerLayout() {
  const session = useSession();
  const authed = session.status === 'authenticated' && !session.needsOnboarding;
  return (
    <>
      {authed ? <RealtimeBinder /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!authed}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={authed}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="search" />
          <Stack.Screen name="category/[slug]" />
          <Stack.Screen name="service/[slug]" />
          <Stack.Screen name="checkout" options={{ presentation: 'modal' }} />
          <Stack.Screen name="order/[id]/index" />
          <Stack.Screen name="order/[id]/chat" />
          <Stack.Screen name="order/[id]/review" options={{ presentation: 'modal' }} />
          <Stack.Screen name="order/[id]/dispute" options={{ presentation: 'modal' }} />
          <Stack.Screen name="concierge/[id]" />
          <Stack.Screen name="subscriptions/plans" />
          <Stack.Screen name="subscriptions/[id]" />
          <Stack.Screen name="account/addresses" />
          <Stack.Screen name="account/vehicles" />
          <Stack.Screen name="account/equipments" />
          <Stack.Screen name="account/payment-methods" />
          <Stack.Screen name="account/notifications" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

function RealtimeBinder() {
  useRealtimeInvalidation('customer');
  return null;
}
