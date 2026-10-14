'use client';

import { use } from 'react';
import { SpaceIcon } from '@/components/shell/sidebar';
import { useWorkspace } from '@/components/shell/workspace-context';
import { mergeStatuses, ViewContainer } from '@/components/views/view-container';

export default function SpacePage({
  params,
}: {
  params: Promise<{ ws: string; spaceId: string }>;
}) {
  const { spaceId } = use(params);
  const { hierarchy } = useWorkspace();
  if (!hierarchy) return <div className="p-6 text-[13px] muted">Carregando...</div>;
  const space = hierarchy.spaces.find((s) => s.id === spaceId);
  if (!space) return <div className="p-6 text-[13px] muted">Space não encontrado.</div>;
  const lists = [...space.lists, ...space.folders.flatMap((f) => f.lists)];
  const header = (
    <div className="flex items-center gap-3 px-5 pt-3 pb-1">
      <SpaceIcon space={space} size={28} />
      <div>
        <h1 className="text-[18px] font-semibold">{space.name}</h1>
        <div className="text-[12px] muted">
          {space.folders.length} pasta(s) · {lists.length} lista(s)
        </div>
      </div>
    </div>
  );
  return (
    <ViewContainer
      parent={{ type: 'space', id: space.id }}
      scope={{ spaceIds: [space.id] }}
      crumbs={[{ label: space.name }]}
      title={space.name}
      statuses={mergeStatuses([{ statuses: space.statuses }, ...lists])}
      header={header}
      favoriteType="space"
      listId={lists[0]?.id}
    />
  );
}
