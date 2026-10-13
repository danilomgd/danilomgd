import type { OrderStatus } from '@velio/contracts';
import { applyBps } from '../pricing/estimate';

export interface CancellationSettings {
  freeMinutesAfterAccept: number;
  lateFeeCents: number;
  enRouteFeeBps: number;
  enRouteFeeMinCents: number;
}

export const DEFAULT_CANCELLATION: CancellationSettings = {
  freeMinutesAfterAccept: 10,
  lateFeeCents: 1500,
  enRouteFeeBps: 2000,
  enRouteFeeMinCents: 2000,
};

export interface CancellationOutcome {
  allowed: boolean;
  feeCents: number;
  /** Para quem vai a taxa: prestador (deslocamento) ou plataforma. */
  feeBeneficiary: 'provider' | 'platform' | null;
  reason: string;
}

export function customerCancellation(
  status: OrderStatus,
  acceptedAt: Date | null,
  now: Date,
  priceCents: number | null,
  s: CancellationSettings = DEFAULT_CANCELLATION,
): CancellationOutcome {
  switch (status) {
    case 'REQUESTED':
    case 'MATCHING':
    case 'OFFERED':
    case 'SCHEDULED':
    case 'NO_PROVIDER_FOUND':
    case 'UNDER_REVIEW':
    case 'QUOTED':
    case 'QUOTE_REJECTED':
    case 'SUBMITTED':
    case 'INTERPRETING':
    case 'PLAN_PROPOSED':
    case 'NEEDS_HUMAN':
    case 'PLAN_APPROVED':
      return { allowed: true, feeCents: 0, feeBeneficiary: null, reason: 'Sem prestador confirmado' };
    case 'ACCEPTED':
    case 'REMINDED':
    case 'QUOTE_APPROVED':
    case 'AUTHORIZED':
    case 'DRIVER_ASSIGNED': {
      const minutes = acceptedAt ? (now.getTime() - acceptedAt.getTime()) / 60000 : 0;
      if (minutes <= s.freeMinutesAfterAccept) {
        return {
          allowed: true,
          feeCents: 0,
          feeBeneficiary: null,
          reason: 'Dentro da janela gratuita após o aceite',
        };
      }
      return {
        allowed: true,
        feeCents: s.lateFeeCents,
        feeBeneficiary: 'provider',
        reason: 'Cancelamento tardio após confirmação',
      };
    }
    case 'EN_ROUTE':
    case 'ARRIVED':
    case 'EN_ROUTE_PICKUP': {
      const fee = Math.max(s.enRouteFeeMinCents, applyBps(priceCents ?? 0, s.enRouteFeeBps));
      return {
        allowed: true,
        feeCents: fee,
        feeBeneficiary: 'provider',
        reason: 'Prestador já em deslocamento',
      };
    }
    default:
      return {
        allowed: false,
        feeCents: 0,
        feeBeneficiary: null,
        reason: 'Não é possível cancelar nesta etapa',
      };
  }
}
