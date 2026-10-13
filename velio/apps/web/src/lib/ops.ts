import type { ServiceOrder } from '@velio/contracts';
import { TERMINAL_ORDER_STATUSES } from '@velio/contracts';

export type QueueKey = 'no_provider' | 'needs_human' | 'disputed' | 'late';

export const QUEUES: Array<{ key: QueueKey; label: string; description: string }> = [
  {
    key: 'no_provider',
    label: 'Sem profissional',
    description: 'Matching esgotou as ondas. Atribua manualmente.',
  },
  { key: 'needs_human', label: 'Precisa de humano', description: 'Planos de concierge aguardando revisão.' },
  { key: 'disputed', label: 'Em disputa', description: 'Contestações abertas pelo cliente.' },
  { key: 'late', label: 'Atrasados', description: 'Agendamento ou previsão de chegada já passou.' },
];

const IN_FLIGHT = new Set([
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'SCHEDULED',
  'REMINDED',
  'AUTHORIZED',
  'DRIVER_ASSIGNED',
  'EN_ROUTE_PICKUP',
  'RETURNING',
]);

export function isLate(o: ServiceOrder, now = Date.now()): boolean {
  if (TERMINAL_ORDER_STATUSES.has(o.status)) return false;
  if (o.etaAt && IN_FLIGHT.has(o.status) && new Date(o.etaAt).getTime() < now - 5 * 60_000) return true;
  if (o.scheduledFor && IN_FLIGHT.has(o.status)) {
    const window = (o.windowMinutes ?? 60) * 60_000;
    return new Date(o.scheduledFor).getTime() + window < now;
  }
  return false;
}

export function queueOf(o: ServiceOrder, now = Date.now()): QueueKey | null {
  if (o.status === 'NO_PROVIDER_FOUND') return 'no_provider';
  if (o.status === 'NEEDS_HUMAN') return 'needs_human';
  if (o.status === 'DISPUTED') return 'disputed';
  if (isLate(o, now)) return 'late';
  return null;
}

export function groupQueues(orders: ServiceOrder[], now = Date.now()): Record<QueueKey, ServiceOrder[]> {
  const out: Record<QueueKey, ServiceOrder[]> = { no_provider: [], needs_human: [], disputed: [], late: [] };
  for (const o of orders) {
    const q = queueOf(o, now);
    if (q) out[q].push(o);
  }
  for (const k of Object.keys(out) as QueueKey[]) {
    out[k].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  }
  return out;
}

export const SLA_LABELS: Record<string, string> = {
  matchingP50Seconds: 'Matching (mediana)',
  matchingP90Seconds: 'Matching (p90)',
  avgMatchingSeconds: 'Matching (média)',
  arrivalP50Seconds: 'Chegada (mediana)',
  arrivalP90Seconds: 'Chegada (p90)',
  avgArrivalSeconds: 'Chegada (média)',
  noProviderCount: 'Sem profissional',
  needsHumanCount: 'Precisam de humano',
  disputedCount: 'Em disputa',
  lateCount: 'Atrasados',
  breachedCount: 'SLA estourado',
  activeOrders: 'Pedidos ativos',
  onlineProviders: 'Profissionais online',
  openIncidents: 'Incidentes abertos',
  openDisputes: 'Disputas abertas',
};

export function humanizeKey(key: string): string {
  return (
    SLA_LABELS[key] ??
    key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/^./, (m) => m.toUpperCase())
  );
}
