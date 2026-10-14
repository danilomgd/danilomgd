'use client';

import { useWorkspace } from '@/components/shell/workspace-context';
import { mergeStatuses, ViewContainer } from '@/components/views/view-container';

export default function MyTasksPage() {
  const { wsId, hierarchy, me } = useWorkspace();
  if (!hierarchy || !me) return <div className="p-6 text-[13px] muted">Carregando...</div>;
  const statuses = mergeStatuses(hierarchy.spaces.map((s) => ({ statuses: s.statuses })));
  return (
    <ViewContainer
      parent={{ type: 'workspace', id: wsId }}
      scope={{ assignees: [me.id] }}
      crumbs={[{ label: 'Minhas tarefas' }]}
      title="Minhas tarefas"
      statuses={statuses}
      header={
        <div className="px-5 pt-3 pb-1">
          <h1 className="text-[18px] font-semibold">Minhas tarefas</h1>
          <div className="text-[12px] muted">Tarefas atribuídas a {me.username}.</div>
        </div>
      }
    />
  );
}
