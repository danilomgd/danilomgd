'use client';

import { useWorkspace } from '@/components/shell/workspace-context';
import { mergeStatuses, ViewContainer } from '@/components/views/view-container';

export default function EverythingPage() {
  const { wsId, hierarchy } = useWorkspace();
  if (!hierarchy) return <div className="p-6 text-[13px] muted">Carregando...</div>;
  const statuses = mergeStatuses(hierarchy.spaces.map((s) => ({ statuses: s.statuses })));
  return (
    <ViewContainer
      parent={{ type: 'workspace', id: wsId }}
      scope={{}}
      crumbs={[{ label: 'Tudo' }]}
      title="Tudo"
      statuses={statuses}
      header={
        <div className="px-5 pt-3 pb-1">
          <h1 className="text-[18px] font-semibold">Tudo</h1>
          <div className="text-[12px] muted">
            Todas as tarefas do workspace, em todos os Spaces.
          </div>
        </div>
      }
    />
  );
}
