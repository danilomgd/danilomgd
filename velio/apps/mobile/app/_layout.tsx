import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ThemeProvider, ToastProvider, useTheme } from '@velio/ui/native';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/auth/session';
import { track } from '@/lib/analytics';
import { APP_ROLE } from '@/lib/config';
import { listenNotificationOpens, registerPushToken } from '@/lib/notifications';
import { queryClient, queryPersister, shouldPersistQuery } from '@/lib/query';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { initialRouteName: `(${APP_ROLE})` };

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider scheme="system">
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              persister: queryPersister,
              maxAge: 24 * 60 * 60 * 1000,
              dehydrateOptions: {
                shouldDehydrateQuery: (q) => q.state.status === 'success' && shouldPersistQuery(q.queryKey),
              },
            }}
          >
            <SessionProvider>
              <ToastProvider bottomOffset={96}>
                <RootNavigator />
              </ToastProvider>
            </SessionProvider>
          </PersistQueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const session = useSession();
  const router = useRouter();
  const { scheme, colors } = useTheme();

  useEffect(() => {
    track('app_open', { role: APP_ROLE });
  }, []);

  useEffect(() => {
    if (session.status === 'loading') return;
    SplashScreen.hideAsync().catch(() => {});
  }, [session.status]);

  useEffect(() => {
    if (session.status !== 'authenticated') return;
    registerPushToken().catch(() => {});
    return listenNotificationOpens((path) => router.push(path));
  }, [session.status, router]);

  if (session.status === 'loading') return <View style={[styles.flex, { backgroundColor: colors.bg }]} />;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={APP_ROLE === 'customer'}>
          <Stack.Screen name="(customer)" />
        </Stack.Protected>
        <Stack.Protected guard={APP_ROLE === 'provider'}>
          <Stack.Screen name="(provider)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
