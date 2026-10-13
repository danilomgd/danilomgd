import type { RealtimePayload, ServiceOrderDetail } from '@velio/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { getRealtime, onRealtimeStatus, subscribe } from '@/lib/realtime';

/**
 * Ordem com atualização em tempo real (sala `order:{id}`) e fallback para polling de 15 s
 * quando o socket cai. Também expõe a última posição do prestador recebida.
 */
export function useOrder(orderId: string | undefined) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [providerLocation, setProviderLocation] = useState<RealtimePayload<'provider.location'> | null>(null);

  const query = useQuery({
    queryKey: qk.order(orderId ?? ''),
    queryFn: () => api.orders.get(orderId as string),
    enabled: Boolean(orderId),
    refetchInterval: connected ? false : 15_000,
  });

  useEffect(() => onRealtimeStatus(setConnected), []);

  useEffect(() => {
    if (!orderId) return;
    const invalidate = () => qc.invalidateQueries({ queryKey: qk.order(orderId) });
    const offs = [
      subscribe('order.updated', (p) => p.orderId === orderId && invalidate()),
      subscribe('order.event', (p) => p.orderId === orderId && invalidate()),
      subscribe('quote.created', (p) => p.orderId === orderId && invalidate()),
      subscribe('quote.decided', (p) => p.orderId === orderId && invalidate()),
      subscribe('payment.updated', (p) => p.orderId === orderId && invalidate()),
      subscribe('provider.location', (p) => p.orderId === orderId && setProviderLocation(p)),
    ];
    getRealtime()
      .then((c) => c.subscribeOrder(orderId))
      .catch(() => {});
    return () => {
      for (const off of offs) off();
      getRealtime()
        .then((c) => c.unsubscribeOrder(orderId))
        .catch(() => {});
    };
  }, [orderId, qc]);

  return { ...query, order: query.data as ServiceOrderDetail | undefined, connected, providerLocation };
}

/** Atualiza o cache da ordem com a resposta de uma transição. */
export function useOrderCacheUpdater() {
  const qc = useQueryClient();
  return (order: ServiceOrderDetail) => {
    qc.setQueryData(qk.order(order.id), order);
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['provider.orders'] });
  };
}
