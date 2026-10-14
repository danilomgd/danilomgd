import { type ReactNode, Suspense } from 'react';
import { AppShell } from '@/components/shell/app-shell';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-sm muted">Carregando...</div>}>
      <AppShell wsId={ws}>{children}</AppShell>
    </Suspense>
  );
}
