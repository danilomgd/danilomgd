import Link from 'next/link';
import { EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <EmptyState
        title="Página não encontrada"
        description="O endereço não existe ou foi movido."
        action={<Link href="/">Ir para o início</Link>}
      />
    </main>
  );
}
