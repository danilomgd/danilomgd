import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiRequestError } from '@velio/api-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

/** Erros de regra (4xx) não devem ser repetidos; falhas de rede sim. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: shouldRetry,
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
});

/** Persistência leve: catálogo, home e listas sobrevivem ao fechar o app. */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'velio.query.v1',
  throttleTime: 1000,
});

/** Só persiste leituras baratas e não sensíveis. */
export const PERSISTED_QUERY_PREFIXES = ['home', 'categories', 'services', 'service', 'plans', 'orders', 'provider.orders'];

export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const first = queryKey[0];
  return typeof first === 'string' && PERSISTED_QUERY_PREFIXES.includes(first);
}

/** Chaves centralizadas para invalidação consistente. */
export const qk = {
  me: ['me'] as const,
  home: (lat?: number, lng?: number) => ['home', lat ?? null, lng ?? null] as const,
  categories: ['categories'] as const,
  services: (category?: string) => ['services', category ?? 'all'] as const,
  service: (slug: string) => ['service', slug] as const,
  search: (q: string) => ['search', q] as const,
  plans: ['plans'] as const,
  orders: (scope: string) => ['orders', scope] as const,
  order: (id: string) => ['order', id] as const,
  messages: (orderId: string) => ['messages', orderId] as const,
  payments: (orderId: string) => ['payments', orderId] as const,
  addresses: ['addresses'] as const,
  vehicles: ['vehicles'] as const,
  equipments: ['equipments'] as const,
  paymentMethods: ['paymentMethods'] as const,
  notifications: ['notifications'] as const,
  subscriptions: ['subscriptions'] as const,
  concierge: (id: string) => ['concierge', id] as const,
  provider: {
    me: ['provider.me'] as const,
    offers: ['provider.offers'] as const,
    orders: (scope: string) => ['provider.orders', scope] as const,
    wallet: ['provider.wallet'] as const,
    ledger: ['provider.ledger'] as const,
    payouts: ['provider.payouts'] as const,
    indicators: (days: number) => ['provider.indicators', days] as const,
  },
};
