'use client';

import { Folder } from 'lucide-react';
import { use } from 'react';
import { useWorkspace } from '@/components/shell/workspace-context';
import { mergeStatuses, ViewContainer } from '@/components/views/view-container';

export default function FolderPage({
  params,
}: {
  params: Promise<{ ws: string; folderId: string }>;
}) {
  const { folderId } = use(params);
  const { wsId, hierarchy } = useWorkspace();
  if (!hierarchy) return <div className="p-6 text-[13px] muted">Carregando...</div>;
  const space = hierarchy.spaces.find((s) => s.folders.some((f) => f.id === folderId));
  const folder = space?.folders.find((f) => f.id === folderId);
  if (!space || !folder) return <div className="p-6 text-[13px] muted">Pasta não encontrada.</div>;
  const header = (
    <div className="flex items-center gap-3 px-5 pt-3 pb-1">
      <Folder size={22} className="muted" />
      <div>
        <h1 className="text-[18px] font-semibold">{folder.name}</h1>
        <div className="text-[12px] muted">{folder.lists.length} lista(s)</div>
      </div>
    </div>
  );
  return (
    <ViewContainer
      parent={{ type: 'folder', id: folder.id }}
      scope={{ folderIds: [folder.id] }}
      crumbs={[{ label: space.name, href: `/w/${wsId}/s/${space.id}` }, { label: folder.name }]}
      title={folder.name}
      statuses={mergeStatuses([{ statuses: space.statuses }, ...folder.lists])}
      header={header}
      favoriteType="folder"
      listId={folder.lists[0]?.id}
    />
  );
}
