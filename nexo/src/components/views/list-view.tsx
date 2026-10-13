'use client';

import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { cx } from '@/lib/format';
import { useCreateTask, useUpdateTask } from '@/lib/hooks';
import type { CustomField, Status, Task, User, ViewSettings } from '@/lib/types';
import { useWorkspace } from '../shell/workspace-context';
import { FieldEditor } from '../task/custom-fields';
import { AssigneePicker, DatePicker, PriorityPicker, StatusPicker } from '../task/pickers';
import { AvatarStack } from '../ui/avatar';
import { PriorityFlag, StatusDot, StatusPill } from '../ui/badges';
import { DroppableGroup, SortableTask, SortableTasks, TaskDnd } from './dnd';
import { Blocked, DueLabel, Tags, TaskMeta } from './task-row-bits';
import type { Group } from './view-engine';

interface Props {
  groups: Group[];
  subtasks: Map<string, Task[]>;
  settings: ViewSettings;
  statuses: Status[];
  members: User[];
  fields: CustomField[];
  listId?: string;
  onCollapse: (keys: string[]) => void;
  showList?: boolean;
}

export function ListView(p: Props) {
  const { openTask, hierarchy } = useWorkspace();
  const update = useUpdateTask();
  const collapsed = new Set(p.settings.collapsedGroups ?? []);
  const toggle = (k: string) =>
    p.onCollapse(collapsed.has(k) ? [...collapsed].filter((x) => x !== k) : [...collapsed, k]);
  const groupedByStatus = (p.settings.groupBy ?? 'status') === 'status';
  const visibleFields = p.fields.slice(0, 2);
  const listNameOf = (listId: string) => {
    for (const sp of hierarchy?.spaces ?? [])
      for (const l of [...sp.lists, ...sp.folders.flatMap((f) => f.lists)])
        if (l.id === listId) return l.name;
    return '';
  };

  const Row = ({ t, depth = 0 }: { t: Task; depth?: number }) => {
    const [open, setOpen] = useState(p.settings.showSubtasks === 'expanded');
    const kids = p.subtasks.get(t.id) ?? [];
    const closed = t.status?.type === 'closed';
    return (
      <>
        <div
          className="group flex h-9 items-center gap-2 border-b border-line px-2 text-[13px] row-hover"
          style={{ paddingLeft: 8 + depth * 24 }}
        >
          <StatusPicker
            value={t.status}
            statuses={p.statuses}
            onChange={(id) => update.mutate({ id: t.id, patch: { statusId: id } })}
          >
            <StatusDot status={t.status} size={12} />
          </StatusPicker>
          {kids.length > 0 ? (
            <button
              type="button"
              className="inline-flex h-5 w-4 items-center justify-center muted"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
              aria-label="Expandir subtarefas"
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              className={cx(
                'min-w-0 truncate text-left hover:text-brand-600',
                closed && 'line-through muted',
              )}
              onClick={() => openTask(t.id)}
            >
              {t.name}
            </button>
            <Blocked task={t} />
            <Tags task={t} max={2} />
            <TaskMeta task={t} className="hidden md:inline-flex" />
            {p.showList && (
              <span className="ml-auto hidden max-w-[140px] shrink-0 truncate text-[11px] muted lg:inline">
                {listNameOf(t.listId)}
              </span>
            )}
          </div>
          {visibleFields.map((f) => (
            <span
              key={f.id}
              className="hidden w-32 shrink-0 items-center truncate text-[12px] xl:inline-flex"
              onClick={(e) => e.stopPropagation()}
            >
              <FieldEditor
                compact
                field={f}
                value={t.customFields[f.id]}
                members={p.members}
                onChange={(v) =>
                  update.mutate({ id: t.id, patch: { customFields: { [f.id]: v } } })
                }
              />
            </span>
          ))}
          <span
            className="inline-flex w-16 shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <AssigneePicker
              value={t.assignees}
              members={p.members}
              onChange={(ids) => update.mutate({ id: t.id, patch: { assignees: ids } })}
            >
              <AvatarStack users={t.assignees} size={22} max={2} />
            </AssigneePicker>
          </span>
          <span
            className="inline-flex w-20 shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <DatePicker
              value={t.dueDate}
              onChange={(d) => update.mutate({ id: t.id, patch: { dueDate: d } })}
            >
              <DueLabel task={t} />
            </DatePicker>
          </span>
          <span
            className="inline-flex w-10 shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <PriorityPicker
              value={t.priority}
              onChange={(pr) => update.mutate({ id: t.id, patch: { priority: pr } })}
            >
              <PriorityFlag priority={t.priority} />
            </PriorityPicker>
          </span>
          {!groupedByStatus && (
            <span
              className="hidden w-28 shrink-0 sm:inline-flex"
              onClick={(e) => e.stopPropagation()}
            >
              <StatusPicker
                value={t.status}
                statuses={p.statuses}
                onChange={(id) => update.mutate({ id: t.id, patch: { statusId: id } })}
              >
                <StatusPill status={t.status} className="h-5 px-1.5 text-[10px]" />
              </StatusPicker>
            </span>
          )}
        </div>
        {open && kids.map((k) => <Row key={k.id} t={k} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <TaskDnd
      groups={p.groups}
      renderOverlay={(t) => (
        <div className="rounded-md surface px-3 py-2 text-[13px] shadow-pop">{t.name}</div>
      )}
    >
      <div className="min-w-[720px] px-4 pb-16">
        <div className="sticky top-0 z-10 flex h-8 items-center gap-2 bg-page px-2 text-[11px] font-medium uppercase tracking-wide muted">
          <span className="w-3 shrink-0" />
          <span className="w-4 shrink-0" />
          <span className="flex-1">Nome</span>
          {visibleFields.map((f) => (
            <span key={f.id} className="hidden w-32 shrink-0 truncate xl:inline">
              {f.name}
            </span>
          ))}
          <span className="w-16 shrink-0">Resp.</span>
          <span className="w-20 shrink-0">Prazo</span>
          <span className="w-10 shrink-0">Prior.</span>
          {!groupedByStatus && <span className="hidden w-28 shrink-0 sm:inline">Status</span>}
        </div>
        {p.groups.map((g) => {
          const isCollapsed = collapsed.has(g.key);
          return (
            <DroppableGroup
              key={g.key}
              id={g.key}
              className="mb-4 rounded-md data-[over]:ring-2 data-[over]:ring-brand-300"
            >
              <div className="flex h-9 items-center gap-2 px-1">
                <button
                  type="button"
                  className="inline-flex h-6 w-5 items-center justify-center muted"
                  onClick={() => toggle(g.key)}
                  aria-label="Recolher grupo"
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <span
                  className="inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide text-white"
                  style={{ background: g.color }}
                >
                  {g.label}
                </span>
                <span className="text-[12px] muted">{g.tasks.length}</span>
                <QuickAdd listId={p.listId} patch={g.patch} />
              </div>
              {!isCollapsed && (
                <div className="rounded-md border border-line">
                  <SortableTasks ids={g.tasks.map((t) => t.id)}>
                    {g.tasks.map((t) => (
                      <SortableTask key={t.id} id={t.id}>
                        <Row t={t} />
                      </SortableTask>
                    ))}
                  </SortableTasks>
                  {g.tasks.length === 0 && (
                    <div className="px-3 py-2 text-[12px] muted">
                      Nenhuma tarefa. Arraste tarefas para cá ou crie uma nova.
                    </div>
                  )}
                  {p.listId && <QuickAdd listId={p.listId} patch={g.patch} inline />}
                </div>
              )}
            </DroppableGroup>
          );
        })}
      </div>
    </TaskDnd>
  );
}

export function QuickAdd({
  listId,
  patch,
  inline,
}: {
  listId?: string;
  patch: Record<string, unknown>;
  inline?: boolean;
}) {
  const create = useCreateTask();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!listId) return null;
  const submit = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ listId, input: { name: name.trim(), ...patch } });
    setName('');
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          'inline-flex items-center gap-1 text-[12px] muted hover:text-ink',
          inline
            ? 'h-8 w-full px-3 hover:bg-muted-page'
            : 'ml-1 rounded px-1.5 py-0.5 opacity-0 hover:bg-muted-page group-hover:opacity-100',
        )}
      >
        <Plus size={13} /> {inline ? 'Nova tarefa' : ''}
      </button>
    );
  }
  return (
    <div
      className={cx('flex items-center gap-2', inline ? 'h-9 border-t border-line px-3' : 'ml-2')}
    >
      <input
        autoFocus
        className="h-7 flex-1 rounded bg-transparent px-1 text-[13px] outline-none"
        placeholder="Nome da tarefa — Enter para criar, Esc para sair"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            setOpen(false);
            setName('');
          }
        }}
        onBlur={() => {
          if (!name) setOpen(false);
        }}
      />
    </div>
  );
}
