import type { AnalyticsEventName } from '@velio/contracts';
import { AppState } from 'react-native';
import { api } from './api';
import { AnalyticsQueue, type QueuedEvent } from './analytics-queue';
import { APP_ROLE, APP_VERSION } from './config';
import { sessionStorage } from './storage';

const queue = new AnalyticsQueue({
  send: async (events: QueuedEvent[]) => {
    // Sem sessão não há como autenticar o lote; mantém na fila.
    const session = await sessionStorage.load();
    if (!session) throw new Error('no-session');
    await api.analytics.track({ app: APP_ROLE, events: events.map((e) => ({ ...e, properties: { ...e.properties, appVersion: APP_VERSION } })) });
  },
});

let appStateBound = false;

/** Registra um evento do catálogo fechado (ADR-013). Enviado em lote: 10 eventos ou 30 s. */
export function track(name: AnalyticsEventName, properties?: QueuedEvent['properties'], orderId?: string): void {
  queue.track(name, properties, orderId);
  if (!appStateBound) {
    appStateBound = true;
    AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') void queue.flush();
    });
  }
}

export function flushAnalytics(): Promise<void> {
  return queue.flush();
}
