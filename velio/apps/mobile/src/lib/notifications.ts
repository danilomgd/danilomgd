import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { track } from './analytics';
import { IS_PROVIDER_APP } from './config';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Registra o token de push do aparelho na API. Sem efeito em simulador ou web. */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted && settings.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(IS_PROVIDER_APP ? 'offers' : 'orders', {
      name: IS_PROVIDER_APP ? 'Ofertas de serviço' : 'Pedidos',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await api.auth.registerDevice({ pushToken: token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
}

export interface NotificationTarget {
  path: string;
  orderId?: string;
}

/** Deep link a partir de `data` da notificação: `orderId`, `offerId`, `conciergeId` ou `path` explícito. */
export function resolveNotificationTarget(data: Record<string, unknown> | undefined): NotificationTarget | null {
  if (!data) return null;
  const group = IS_PROVIDER_APP ? '/(provider)' : '/(customer)';
  if (typeof data.path === 'string' && data.path.startsWith('/')) return { path: data.path };
  if (IS_PROVIDER_APP && typeof data.offerId === 'string') return { path: `${group}/offer/${data.offerId}` };
  if (typeof data.orderId === 'string') {
    const sub = typeof data.screen === 'string' && ['chat', 'review'].includes(data.screen) ? `/${data.screen}` : '';
    return { path: `${group}/order/${data.orderId}${sub}`, orderId: data.orderId };
  }
  if (!IS_PROVIDER_APP && typeof data.conciergeId === 'string') return { path: `${group}/concierge/${data.conciergeId}` };
  return null;
}

/** Escuta toques em notificações (app aberto ou vindo do segundo plano) e navega. */
export function listenNotificationOpens(navigate: (path: string) => void): () => void {
  const handle = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const target = resolveNotificationTarget(data);
    track('notification_opened', { kind: typeof data?.kind === 'string' ? data.kind : null }, target?.orderId);
    if (target) navigate(target.path);
  };
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  Notifications.getLastNotificationResponseAsync().then((r) => {
    if (r) handle(r);
  });
  return () => sub.remove();
}
