'use client';

import { useRouter } from 'next/navigation';
import { Button, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function ForbiddenPage() {
  const { logout, user } = useAuth();
  const router = useRouter();
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <EmptyState
        title="Acesso negado"
        description={
          user
            ? `A conta ${user.email ?? user.name ?? ''} não tem papel de operador ou administrador.`
            : 'Esta área é restrita à equipe do VÉLIO.'
        }
        action={
          <Button
            variant="secondary"
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
          >
            Entrar com outra conta
          </Button>
        }
      />
    </main>
  );
}
