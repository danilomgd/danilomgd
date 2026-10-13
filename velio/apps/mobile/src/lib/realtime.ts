import { RealtimeClient } from '@velio/api-client';
import type { RealtimeEventName, RealtimePayload } from '@velio/contracts';
import { API_URL } from './config';
import { tokenStore } from './api';

let client: RealtimeClient | null = null;
let connecting: Promise<RealtimeClient> | null = null;
let connected = false;
const statusListeners = new Set<(connected: boolean) => void>();

/** Conecta (uma vez) o Socket.IO autenticado. Reusa a instância. */
export async function getRealtime(): Promise<RealtimeClient> {
  if (client && connected) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const c = client ?? new RealtimeClient({ baseUrl: API_URL, getAccessToken: () => tokenStore.getAccessToken() });
    client = c;
    const socket = await c.connect();
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    if (socket.connected) setConnected(true);
    return c;
  })();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

function setConnected(v: boolean) {
  if (connected === v) return;
  connected = v;
  for (const l of statusListeners) l(v);
}

export function isRealtimeConnected() {
  return connected;
}

export function onRealtimeStatus(listener: (connected: boolean) => void): () => void {
  statusListeners.add(listener);
  listener(connected);
  return () => statusListeners.delete(listener);
}

export function disconnectRealtime() {
  client?.disconnect();
  client = null;
  setConnected(false);
}

/** Assina um evento; devolve função de cancelamento. Seguro antes da conexão. */
export function subscribe<K extends RealtimeEventName>(event: K, handler: (p: RealtimePayload<K>) => void): () => void {
  let off: (() => void) | null = null;
  let cancelled = false;
  getRealtime()
    .then((c) => {
      if (cancelled) return;
      off = c.on(event, handler);
    })
    .catch(() => {
      // sem realtime: as telas caem para polling
    });
  return () => {
    cancelled = true;
    off?.();
  };
}
