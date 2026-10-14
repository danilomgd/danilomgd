'use client';

import { use, useState } from 'react';
import { findList, useWorkspace } from '@/components/shell/workspace-context';
import { textareaClass } from '@/components/ui/modal';
import { ViewContainer } from '@/components/views/view-container';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useInvalidate } from '@/lib/hooks';

export default function ListPage({ params }: { params: Promise<{ ws: string; listId: string }> }) {
  const { listId } = use(params);
  const { wsId, hierarchy } = useWorkspace();
  const loc = findList(hierarchy, listId);
  const inv = useInvalidate();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  if (!hierarchy) return <div className="p-6 text-[13px] muted">Carregando...</div>;
  if (!loc) return <div className="p-6 text-[13px] muted">Lista não encontrada.</div>;
  const { list, space, folder } = loc;
  const base = `/w/${wsId}`;
  const crumbs = [
    { label: space.name, href: `${base}/s/${space.id}` },
    ...(folder ? [{ label: folder.name, href: `${base}/f/${folder.id}` }] : []),
    { label: list.name },
  ];
  const header = (
    <div className="flex items-start gap-3 px-5 pt-3 pb-1">
      <div className="min-w-0 flex-1">
        <h1 className="text-[18px] font-semibold">{list.name}</h1>
        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              className={textareaClass}
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={async () => {
                await api.put(`list/${list.id}`, { content });
                inv.hierarchy();
                setEditing(false);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="mt-0.5 text-left text-[12px] muted hover:text-ink"
            onClick={() => {
              setContent(list.content ?? '');
              setEditing(true);
            }}
          >
            {list.content || 'Adicionar descrição da lista'}
          </button>
        )}
      </div>
      {list.dueDate && (
        <span className="text-[12px] muted">Prazo da lista: {fmtDate(list.dueDate)}</span>
      )}
    </div>
  );
  return (
    <ViewContainer
      parent={{ type: 'list', id: list.id }}
      scope={{ listIds: [list.id] }}
      crumbs={crumbs}
      title={list.name}
      statuses={list.statuses}
      listId={list.id}
      header={header}
      favoriteType="list"
    />
  );
}
