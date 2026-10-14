'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useHierarchy, useMe } from '@/lib/hooks';
import { TaskModal } from '../task/task-modal';
import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';
import { WorkspaceProvider } from './workspace-context';

export function AppShell({ wsId, children }: { wsId: string; children: ReactNode }) {
  const me = useMe();
  const hierarchy = useHierarchy(wsId);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const taskId = params.get('t');
  const [search, setSearch] = useState(false);

  const openTask = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set('t', id);
      else next.delete('t');
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const workspace = me.data?.teams.find((t) => t.id === wsId) ?? null;
  const value = useMemo(
    () => ({
      wsId,
      workspace,
      me: me.data?.user ?? null,
      members: workspace?.members ?? [],
      hierarchy: hierarchy.data ?? null,
      openTask,
      taskId,
      openSearch: () => setSearch(true),
    }),
    [wsId, workspace, me.data, hierarchy.data, openTask, taskId],
  );

  return (
    <WorkspaceProvider value={value}>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
      <CommandPalette open={search} onClose={() => setSearch(false)} />
      {taskId && <TaskModal taskId={taskId} onClose={() => openTask(null)} />}
    </WorkspaceProvider>
  );
}
