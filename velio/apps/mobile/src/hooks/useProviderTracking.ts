import type { ServiceOrder } from '@velio/contracts';
import { useEffect } from 'react';
import { providerLocationTracker } from '@/lib/location';

const TO_DESTINATION = new Set(['IN_TRANSIT', 'AT_DESTINATION', 'THIRD_PARTY_IN_PROGRESS', 'THIRD_PARTY_DONE', 'RETURN_PICKUP']);

/** Liga o rastreamento de GPS do prestador ao estado atual (disponibilidade + ordem ativa). */
export function useProviderTracking(availability: ServiceOrder['status'] extends never ? never : 'OFFLINE' | 'ONLINE' | 'BUSY' | 'UNAVAILABLE', activeOrder: ServiceOrder | null) {
  useEffect(() => {
    const target = activeOrder
      ? TO_DESTINATION.has(activeOrder.status) && activeOrder.destination
        ? { lat: activeOrder.destination.lat, lng: activeOrder.destination.lng }
        : activeOrder.address
          ? { lat: activeOrder.address.lat, lng: activeOrder.address.lng }
          : null
      : null;
    providerLocationTracker.update({ availability, activeOrderStatus: activeOrder?.status ?? null, target }).catch(() => {});
  }, [availability, activeOrder]);
}
