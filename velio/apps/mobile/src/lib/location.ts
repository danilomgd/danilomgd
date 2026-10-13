import type { LatLng, OrderStatus, ProviderAvailability } from '@velio/contracts';
import { haversineKm, locationIntervalSeconds } from '@velio/domain';
import * as Location from 'expo-location';
import { api } from './api';
import { LocationBatch } from './location-batch';
import { getRealtime } from './realtime';

export type LocationPermission = 'granted' | 'denied' | 'undetermined';

/** Pede permissão em uso (cliente e prestador). */
export async function requestForegroundLocation(): Promise<LocationPermission> {
  const r = await Location.requestForegroundPermissionsAsync();
  return r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied';
}

/** Posição atual (uma leitura, precisão equilibrada). Devolve null sem permissão. */
export async function getCurrentPosition(): Promise<LatLng | null> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted) return null;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  }
}

export interface ProviderTrackingState {
  availability: ProviderAvailability;
  activeOrderStatus: OrderStatus | null;
  /** Destino atual (endereço do cliente ou do terceiro), para o intervalo de 3 s perto do local. */
  target: LatLng | null;
}

/**
 * Rastreamento do prestador: intervalo vem de `locationIntervalSeconds` (domínio) e muda com
 * disponibilidade, status da ordem ativa e distância ao destino. OFFLINE/UNAVAILABLE = parado.
 * Os pings vão em lote por `POST /v1/providers/me/location` e, quando conectado, também pelo socket.
 */
export class ProviderLocationTracker {
  private sub: Location.LocationSubscription | null = null;
  private batch = new LocationBatch();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private currentInterval = 0;
  private state: ProviderTrackingState = { availability: 'OFFLINE', activeOrderStatus: null, target: null };
  private lastPosition: LatLng | null = null;

  getLastPosition(): LatLng | null {
    return this.lastPosition;
  }

  /** Recalcula o intervalo e (re)inicia ou para o watcher conforme necessário. */
  async update(state: ProviderTrackingState): Promise<void> {
    this.state = state;
    const distanceToTargetKm =
      state.target && this.lastPosition ? haversineKm(this.lastPosition, state.target) : null;
    const interval = locationIntervalSeconds({
      availability: state.availability,
      activeOrderStatus: state.activeOrderStatus,
      distanceToTargetKm,
    });
    if (interval === this.currentInterval) return;
    this.currentInterval = interval;
    await this.stopWatching();
    if (interval === 0) {
      await this.flush();
      return;
    }
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return;
    this.sub = await Location.watchPositionAsync(
      {
        accuracy: interval <= 10 ? Location.Accuracy.High : Location.Accuracy.Balanced,
        timeInterval: interval * 1000,
        distanceInterval: interval <= 3 ? 5 : interval <= 10 ? 15 : 50,
      },
      (pos) => this.onPosition(pos),
    );
    this.flushTimer = setInterval(() => void this.flush(), Math.max(interval, 5) * 1000);
  }

  private onPosition(pos: Location.LocationObject) {
    const ping = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? undefined,
      headingDeg: pos.coords.heading != null && pos.coords.heading >= 0 ? pos.coords.heading : undefined,
      speedMps: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed : undefined,
      recordedAt: new Date(pos.timestamp).toISOString(),
    };
    const previous = this.lastPosition;
    this.lastPosition = { lat: ping.lat, lng: ping.lng };
    this.batch.push(ping);
    // Em deslocamento, o socket entrega ao cliente sem esperar o lote.
    if (this.currentInterval <= 10) {
      getRealtime()
        .then((c) => c.pushLocation(ping))
        .catch(() => {});
    }
    if (this.batch.size >= 10) void this.flush();
    // Ao cruzar os 500 m do destino, o intervalo muda (10 s → 3 s): reavalia.
    if (this.state.target && previous) {
      const before = haversineKm(previous, this.state.target) < 0.5;
      const after = haversineKm(this.lastPosition, this.state.target) < 0.5;
      if (before !== after) void this.update(this.state);
    }
  }

  async flush(): Promise<void> {
    const pings = this.batch.drain();
    if (!pings.length) return;
    try {
      await api.provider.pushLocation({ pings });
    } catch {
      // Falha de rede: reinsere para o próximo ciclo (mantém no máximo 60).
      for (const p of pings) this.batch.push(p);
    }
  }

  private async stopWatching() {
    this.sub?.remove();
    this.sub = null;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async stop(): Promise<void> {
    this.currentInterval = 0;
    await this.stopWatching();
    await this.flush();
  }
}

export const providerLocationTracker = new ProviderLocationTracker();
