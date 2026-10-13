import { ErrorState, ListSkeleton } from '@velio/ui/native';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/errors';

interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  isFetching?: boolean;
}

/** Envelope padrão: skeleton em carregando, erro com "Tentar novamente", senão o conteúdo. */
export function QueryState({ query, skeleton, children }: { query: QueryLike; skeleton?: ReactNode; children: () => ReactNode }) {
  if (query.isPending) return <>{skeleton ?? <ListSkeleton />}</>;
  if (query.isError) return <ErrorState description={errorMessage(query.error)} onRetry={() => query.refetch()} retrying={query.isFetching} />;
  return <>{children()}</>;
}
