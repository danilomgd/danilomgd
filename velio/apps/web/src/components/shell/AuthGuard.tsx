'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Guarda de rota no cliente: sem token → /login; sem papel → acesso negado. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { status, isAdmin, isOperator } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status !== 'authenticated') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Spinner />
      </div>
    );
  }

  const needsAdmin = pathname.startsWith('/admin');
  const allowed = needsAdmin ? isAdmin : isOperator;
  if (!allowed) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <EmptyState
          title="Acesso negado"
          description={
            needsAdmin
              ? 'Esta área exige papel de administrador.'
              : 'Esta área exige papel de operador ou administrador.'
          }
          action={<Link href={isOperator ? '/ops' : isAdmin ? '/admin' : '/forbidden'}>Voltar</Link>}
        />
      </div>
    );
  }
  return <>{children}</>;
}
