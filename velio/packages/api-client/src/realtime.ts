import type { RealtimeEventName, RealtimePayload } from '@velio/contracts';
import { io, type Socket } from 'socket.io-client';

// biome-ignore lint/suspicious/noExplicitAny: assinatura exigida pelo socket.io-client
type Listener = (...args: any[]) => void;

export interface RealtimeOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null> | string | null;
}

/** Cliente Socket.IO autenticado. Reconecta com token atualizado. */
export class RealtimeClient {
  private socket: Socket | null = null;
  constructor(private readonly o: RealtimeOptions) {}

  async connect(): Promise<Socket> {
    if (this.socket?.connected) return this.socket;
    const token = await this.o.getAccessToken();
    this.socket = io(this.o.baseUrl, {
      path: '/realtime',
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    this.socket.on('reconnect_attempt', async () => {
      if (this.socket) this.socket.auth = { token: await this.o.getAccessToken() };
    });
    return this.socket;
  }

  on<K extends RealtimeEventName>(event: K, handler: (p: RealtimePayload<K>) => void): () => void {
    const s = this.socket as unknown as {
      on(e: string, h: Listener): void;
      off(e: string, h: Listener): void;
    } | null;
    if (!s) throw new Error('connect() antes de on()');
    s.on(event, handler as Listener);
    return () => s.off(event, handler as Listener);
  }

  subscribeOrder(orderId: string) {
    this.socket?.emit('order.subscribe', { orderId });
  }
  unsubscribeOrder(orderId: string) {
    this.socket?.emit('order.unsubscribe', { orderId });
  }
  pushLocation(p: {
    lat: number;
    lng: number;
    accuracyM?: number;
    headingDeg?: number;
    speedMps?: number;
    recordedAt: string;
  }) {
    this.socket?.emit('location.push', p);
  }
  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}
