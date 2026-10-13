import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { qk } from '@/lib/query';
import { subscribe } from '@/lib/realtime';

/** Mantém listas (pedidos, notificações, ofertas) frescas a partir dos eventos globais do usuário. */
export function useRealtimeInvalidation(role: 'customer' | 'provider') {
  const qc = useQueryClient();
  useEffect(() => {
    const offs = [
      subscribe('order.updated', (p) => {
        qc.invalidateQueries({ queryKey: qk.order(p.orderId) });
        qc.invalidateQueries({ queryKey: ['orders'] });
        qc.invalidateQueries({ queryKey: ['provider.orders'] });
        if (role === 'customer') qc.invalidateQueries({ queryKey: ['home'] });
        if (role === 'provider') qc.invalidateQueries({ queryKey: qk.provider.me });
      }),
      subscribe('notification.created', () => qc.invalidateQueries({ queryKey: qk.notifications })),
      subscribe(
        'message.created',
        (p) => p.orderId && qc.invalidateQueries({ queryKey: qk.messages(p.orderId) }),
      ),
      subscribe(
        'payment.updated',
        (p) => p.orderId && qc.invalidateQueries({ queryKey: qk.payments(p.orderId) }),
      ),
    ];
    if (role === 'provider') {
      offs.push(
        subscribe('offer.created', () => qc.invalidateQueries({ queryKey: qk.provider.offers })),
        subscribe('offer.expired', () => qc.invalidateQueries({ queryKey: qk.provider.offers })),
      );
    }
    return () => {
      for (const off of offs) off();
    };
  }, [qc, role]);
}
