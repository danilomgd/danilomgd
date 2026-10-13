'use client';

import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useInvalidate, useTasks } from '@/lib/hooks';
import type { CustomField, Status, View, ViewSettings } from '@/lib/types';
import { QuickCreateTask } from '../shell/quick-create';
import { type Crumb, Topbar } from '../shell/topbar';
import { useWorkspace } from '../shell/workspace-context';
import { IconButton } from '../ui/button';
import { BoardView } from './board-view';
import { CalendarView } from './calendar-view';
import { GanttView } from './gantt-view';
import { ListView } from './list-view';
import { TableView } from './table-view';
import { ViewBar } from './view-bar';
import { applyView, groupTasks, splitSubtasks } from './view-engine';

interface Props {
  parent: { type: 'workspace' | 'space' | 'folder' | 'list'; id: string };
  scope: { listIds?: string[]; folderIds?: string[]; spaceIds?: string[]; assignees?: string[] };
  crumbs: Crumb[];
  title: string;
  description?: string | null;
  statuses: Status[];
  listId?: string;
  header?: ReactNode;
  favoriteType?: 'space' | 'folder' | 'list';
}

export function ViewContainer(p: Props) {
  const { wsId, members, me, hierarchy } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const inv = useInvalidate();
  const viewsQ = useQuery({
    queryKey: ['views', p.parent.type, p.parent.id],
    queryFn: () =>
      api.get<{ views: View[] }>(
        p.parent.type === 'workspace'
          ? `team/${p.parent.id}/view`
          : `${p.parent.type}/${p.parent.id}/view`,
      ),
    select: (d) => d.views,
  });
  const views = viewsQ.data ?? [];
  const wanted = params.get('view');
  const current =
    views.find((v) => v.id === wanted) ?? views.find((v) => v.type === wanted) ?? views[0];
  const fieldsQ = useQuery({
    queryKey: ['fields-scope', p.parent.type, p.parent.id],
    queryFn: async () => {
      if (p.parent.type === 'list')
        return (await api.get<{ fields: CustomField[] }>(`list/${p.parent.id}/field`)).fields;
      const ws = (await api.get<{ fields: CustomField[] }>(`team/${wsId}/field`)).fields;
      if (p.parent.type === 'workspace') return ws;
      const spaceId =
        p.parent.type === 'space'
          ? p.parent.id
          : hierarchy?.spaces.find((s) => s.folders.some((f) => f.id === p.parent.id))?.id;
      const sp = spaceId
        ? (await api.get<{ fields: CustomField[] }>(`space/${spaceId}/field`)).fields
        : [];
      return [...sp, ...ws];
    },
    enabled: !!hierarchy,
  });
  const fields = fieldsQ.data ?? [];

  const [settings, setSettings] = useState<ViewSettings>({});
  const [search, setSearch] = useState('');
  const [create, setCreate] = useState(false);
  const currentId = current?.id;
  useEffect(() => {
    if (current) setSettings(current.settings ?? {});
  }, [currentId]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateSettings = (s: ViewSettings) => {
    setSettings(s);
    if (!current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api
        .put(`view/${current.id}`, { settings: s })
        .then(() => inv.qc.invalidateQueries({ queryKey: ['views', p.parent.type, p.parent.id] }));
    }, 600);
  };

  const tasksQ = useTasks(wsId, { ...p.scope, includeClosed: true });
  const ctx = useMemo(
    () => ({ statuses: p.statuses, members, fields, meId: me?.id }),
    [p.statuses, members, fields, me?.id],
  );
  const filtered = useMemo(
    () => applyView(tasksQ.data ?? [], settings, ctx, search),
    [tasksQ.data, settings, ctx, search],
  );
  const { roots, children } = useMemo(
    () => splitSubtasks(filtered, settings.showSubtasks),
    [filtered, settings.showSubtasks],
  );
  const groups = useMemo(
    () => groupTasks(roots, settings.groupBy ?? 'status', ctx),
    [roots, settings.groupBy, ctx],
  );

  const isFav =
    p.favoriteType &&
    hierarchy?.favorites.some((f) => f.itemType === p.favoriteType && f.itemId === p.parent.id);
  const selectView = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('view', id);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const actions = p.favoriteType ? (
    <IconButton
      label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      onClick={async () => {
        await api.post(`team/${wsId}/favorite`, { itemType: p.favoriteType, itemId: p.parent.id });
        inv.hierarchy();
      }}
    >
      <Star size={16} className={isFav ? 'fill-amber-400 text-amber-400' : ''} />
    </IconButton>
  ) : null;

  return (
    <>
      <Topbar crumbs={p.crumbs} actions={actions} />
      {p.header}
      {current && (
        <ViewBar
          views={views}
          current={current}
          onSelect={selectView}
          settings={settings}
          onSettings={updateSettings}
          search={search}
          onSearch={setSearch}
          onNewTask={() => setCreate(true)}
          statuses={p.statuses}
          members={members}
          fields={fields}
          parent={p.parent}
          count={filtered.length}
        />
      )}
      <div className="min-h-0 flex-1 overflow-auto bg-page pt-3">
        {tasksQ.isLoading || !current ? (
          <div className="p-6 text-[13px] muted">Carregando tarefas...</div>
        ) : current.type === 'board' ? (
          <BoardView
            groups={groups}
            subtasks={children}
            settings={settings}
            statuses={p.statuses}
            members={members}
            fields={fields}
            listId={p.listId}
            onCollapse={(keys) => updateSettings({ ...settings, collapsedGroups: keys })}
          />
        ) : current.type === 'calendar' ? (
          <CalendarView
            tasks={filtered}
            listId={p.listId}
            statuses={p.statuses}
            members={members}
          />
        ) : current.type === 'gantt' || current.type === 'timeline' ? (
          <GanttView tasks={filtered} />
        ) : current.type === 'table' ? (
          <TableView
            tasks={filtered}
            statuses={p.statuses}
            members={members}
            fields={fields}
            listId={p.listId}
          />
        ) : (
          <ListView
            groups={groups}
            subtasks={children}
            settings={settings}
            statuses={p.statuses}
            members={members}
            fields={fields}
            listId={p.listId}
            onCollapse={(keys) => updateSettings({ ...settings, collapsedGroups: keys })}
            showList={p.parent.type !== 'list'}
          />
        )}
      </div>
      <QuickCreateTask open={create} onClose={() => setCreate(false)} defaultListId={p.listId} />
    </>
  );
}

/** Statuses únicos (por nome) de um conjunto de spaces, para views acima do nível de lista. */
export function mergeStatuses(lists: { statuses: Status[] }[]): Status[] {
  const seen = new Map<string, Status>();
  for (const l of lists)
    for (const st of l.statuses) if (!seen.has(st.status)) seen.set(st.status, st);
  const order = { open: 0, custom: 1, done: 2, closed: 3 };
  return [...seen.values()].sort(
    (a, b) => order[a.type] - order[b.type] || a.orderIndex - b.orderIndex,
  );
}
