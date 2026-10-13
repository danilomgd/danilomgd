import type { LatLng, OrderStatus } from '@velio/contracts';
import { haversineKm } from '../geo/distance';

export interface LocationPolicyInput {
  availability: 'ONLINE' | 'BUSY' | 'OFFLINE' | 'UNAVAILABLE';
  activeOrderStatus: OrderStatus | null;
  distanceToTargetKm: number | null;
}

/** Intervalo de envio de GPS (segundos) para poupar bateria. 0 = não enviar. */
export function locationIntervalSeconds(i: LocationPolicyInput): number {
  if (i.availability === 'OFFLINE' || i.availability === 'UNAVAILABLE') return 0;
  const live = new Set<OrderStatus>([
    'EN_ROUTE',
    'ARRIVED',
    'EN_ROUTE_PICKUP',
    'PICKED_UP',
    'IN_TRANSIT',
    'RETURN_PICKUP',
    'RETURNING',
  ]);
  if (i.activeOrderStatus && live.has(i.activeOrderStatus)) {
    if (i.distanceToTargetKm !== null && i.distanceToTargetKm < 0.5) return 3;
    return 10;
  }
  if (i.activeOrderStatus === 'IN_PROGRESS' || i.activeOrderStatus === 'AT_DESTINATION') return 120;
  return 60;
}

export interface PingFilterInput {
  accuracyM: number | null;
  previous: (LatLng & { recordedAt: Date }) | null;
  current: LatLng & { recordedAt: Date };
  maxAccuracyM: number;
}

/** Rejeita pontos imprecisos, repetidos ou fisicamente impossíveis (> 50 m/s). */
export function acceptPing(i: PingFilterInput): { accept: boolean; reason?: string } {
  if (i.accuracyM !== null && i.accuracyM > i.maxAccuracyM)
    return { accept: false, reason: 'Precisão insuficiente' };
  if (!i.previous) return { accept: true };
  const dtS = (i.current.recordedAt.getTime() - i.previous.recordedAt.getTime()) / 1000;
  if (dtS <= 0) return { accept: false, reason: 'Fora de ordem' };
  const dKm = haversineKm(i.previous, i.current);
  if (dKm < 0.005) return { accept: false, reason: 'Deslocamento desprezível' };
  if (dKm / dtS > 0.05) return { accept: false, reason: 'Velocidade implausível' };
  return { accept: true };
}
