import type { ActorType, TransitionAction } from '@velio/contracts';
import type { EffectName } from '@velio/domain';
import type { orderEvents, serviceOrders } from '../../db/schema';

export type OrderRow = typeof serviceOrders.$inferSelect;
export type OrderEventRow = typeof orderEvents.$inferSelect;

export interface OrderActor {
  type: ActorType;
  userId: string | null;
  providerId?: string | null;
}

/** Contexto entregue a cada efeito após o commit da transição. */
export interface EffectContext {
  order: OrderRow;
  previous: OrderRow;
  action: TransitionAction;
  actor: OrderActor;
  payload: Record<string, unknown>;
  now: Date;
  eventId: string;
}

export type EffectExecutor = Record<EffectName, (c: EffectContext) => Promise<void>>;

/** Metadados internos da ordem (jsonb `metadata`). Nunca expostos diretamente. */
export interface OrderMetadata {
  paymentMethodId?: string | null;
  paymentMethodKind?: 'CARD' | 'PIX' | 'WALLET' | null;
  awaitingPixPayment?: boolean;
  billedViaParent?: boolean;
  coveredByPlan?: boolean;
  subscriptionId?: string;
  excludedProviderIds?: string[];
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  equipmentIds?: string[];
  neighborhood?: string | null;
  city?: string | null;
  settledAt?: string;
  disputeHeldCents?: number;
  [k: string]: unknown;
}

export function meta(o: OrderRow): OrderMetadata {
  return (o.metadata ?? {}) as OrderMetadata;
}
