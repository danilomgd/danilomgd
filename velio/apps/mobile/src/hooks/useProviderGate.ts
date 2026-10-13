import { useQuery } from '@tanstack/react-query';
import type { ProviderMe } from '@velio/contracts';
import { api } from '@/lib/api';
import { isNotFound } from '@/lib/errors';
import { qk } from '@/lib/query';

export type ProviderGate = 'loading' | 'error' | 'onboarding' | 'pending' | 'approved';

/** Decide a árvore do prestador: sem cadastro → onboarding; PENDING/SUSPENDED/BLOCKED → pending; APPROVED → app. */
export function useProviderGate(enabled: boolean) {
  const query = useQuery({
    queryKey: qk.provider.me,
    queryFn: async (): Promise<ProviderMe | null> => {
      try {
        return await api.provider.me();
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },
    enabled,
    staleTime: 60_000,
  });
  let gate: ProviderGate = 'loading';
  if (!enabled) gate = 'loading';
  else if (query.isError) gate = 'error';
  else if (query.isSuccess) {
    if (query.data === null) gate = 'onboarding';
    else if (query.data.status === 'APPROVED') gate = 'approved';
    else gate = 'pending';
  }
  return { gate, provider: query.data ?? null, query };
}
