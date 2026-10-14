'use client';

import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { cx, dueClass, fmtDate } from '@/lib/format';
import { useCreateTask, useUpdateTask } from '@/lib/hooks';
import type { CustomField, Status, Task, User, ViewSettings } from '@/lib/types';
import { useWorkspace } from '../shell/workspace-context';
import { AssigneePicker, DatePicker, PriorityPicker } from '../task/pickers';
import { AvatarStack } from '../ui/avatar';
import { PriorityFlag } from '../ui/badges';
import { DroppableGroup, SortableTask, SortableTasks, TaskDnd } from './dnd';
import { Blocked, Tags, TaskMeta } from './task-row-bits';
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
}

export function BoardView(p: Props) {
  const { openTask } = useWorkspace();
  const update = useUpdateTask();
  const collapsed = new Set(p.settings.collapsedGroups ?? []);
  const toggle = (k: string) =>
    p.onCollapse(collapsed.has(k) ? [...collapsed].filter((x) => x !== k) : [...collapsed, k]);

  const Card = ({ t, overlay }: { t: Task; overlay?: boolean }) => {
    const closed = t.status?.type === 'closed';
    const kids = p.subtasks.get(t.id) ?? [];
    return (
      <div
        className={cx(
          'rounded-lg surface p-2.5 text-[13px] shadow-sm',
          overlay ? 'rotate-1 shadow-pop' : 'cursor-grab hover:border-brand-300',
        )}
        style={{ borderLeft: t.priority === 1 ? '3px solid #d33' : undefined }}
      >
        <div className="mb-1.5 flex items-start gap-1">
          <button
            type="button"
            className={cx(
              'flex-1 text-left font-medium leading-snug hover:text-brand-600',
              closed && 'line-through muted',
            )}
            onClick={() => openTask(t.id)}
          >
            {t.name}
          </button>
        </div>
        {t.tags.length > 0 && (
          <div className="mb-1.5">
            <Tags task={t} />
          </div>
        )}
        {kids.length > 0 && (
          <div className="mb-1.5 space-y-0.5 border-l-2 border-line pl-2">
            {kids.slice(0, 3).map((k) => (
              <button
                key={k.id}
                type="button"
                className={cx(
                  'block w-full truncate text-left text-[11px] muted hover:text-ink',
                  k.status?.type === 'closed' && 'line-through',
                )}
                onClick={() => openTask(k.id)}
              >
                • {k.name}
              </button>
            ))}
            {kids.length > 3 && <span className="text-[10px] muted">+{kids.length - 3}</span>}
          </div>
        )}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <AssigneePicker
            value={t.assignees}
            members={p.members}
            onChange={(ids) => update.mutate({ id: t.id, patch: { assignees: ids } })}
          >
            <AvatarStack users={t.assignees} size={20} max={2} />
          </AssigneePicker>
          <PriorityPicker
            value={t.priority}
            onChange={(pr) => update.mutate({ id: t.id, patch: { priority: pr } })}
          >
            <PriorityFlag priority={t.priority} size={13} />
          </PriorityPicker>
          <DatePicker
            value={t.dueDate}
            onChange={(d) => update.mutate({ id: t.id, patch: { dueDate: d } })}
          >
            <span className={cx('text-[11px]', dueClass(t.dueDate, closed))}>
              {t.dueDate ? fmtDate(t.dueDate) : ''}
            </span>
          </DatePicker>
          <Blocked task={t} />
          <span className="ml-auto">
            <TaskMeta task={t} />
          </span>
        </div>
        <div className="mt-1 text-[10px] muted">{t.customId}</div>
      </div>
    );
  };

  return (
    <TaskDnd
      groups={p.groups}
      renderOverlay={(t) => (
        <div className="w-[272px]">
          <Card t={t} overlay />
        </div>
      )}
    >
      <div className="flex h-full gap-3 px-4 pb-4">
        {p.groups.map((g) => {
          const isCollapsed = collapsed.has(g.key);
          if (isCollapsed) {
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => toggle(g.key)}
                className="flex h-full w-10 shrink-0 flex-col items-center gap-2 rounded-lg bg-muted-page py-3 muted hover:text-ink"
              >
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: g.color }} />
                <span className="text-[11px] font-semibold uppercase [writing-mode:vertical-rl]">
                  {g.label} · {g.tasks.length}
                </span>
              </button>
            );
          }
          return (
            <DroppableGroup
              key={g.key}
              id={g.key}
              className="flex h-full w-[288px] shrink-0 flex-col rounded-lg bg-muted-page data-[over]:ring-2 data-[over]:ring-brand-300"
            >
              <div className="flex h-10 shrink-0 items-center gap-2 px-3">
                <span
                  className="inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide text-white"
                  style={{ background: g.color }}
                >
                  {g.label}
                </span>
                <span className="text-[12px] muted">{g.tasks.length}</span>
                <button
                  type="button"
                  className="ml-auto muted hover:text-ink"
                  onClick={() => toggle(g.key)}
                  aria-label="Recolher coluna"
                >
                  <MoreHorizontal size={14} />
                </button>
                {p.listId && <ColumnAdd listId={p.listId} patch={g.patch} />}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                <SortableTasks ids={g.tasks.map((t) => t.id)}>
                  {g.tasks.map((t) => (
                    <SortableTask key={t.id} id={t.id}>
                      <Card t={t} />
                    </SortableTask>
                  ))}
                </SortableTasks>
                {p.listId && <ColumnAdd listId={p.listId} patch={g.patch} wide />}
              </div>
            </DroppableGroup>
          );
        })}
      </div>
    </TaskDnd>
  );
}

function ColumnAdd({
  listId,
  patch,
  wide,
}: {
  listId: string;
  patch: Record<string, unknown>;
  wide?: boolean;
}) {
  const create = useCreateTask();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open) {
    return wide ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center gap-1 rounded-md px-2 text-[12px] muted hover:bg-ink-100 hover:text-ink"
      >
        <Plus size={13} /> Nova tarefa
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="muted hover:text-ink"
        aria-label="Nova tarefa"
      >
        <Plus size={14} />
      </button>
    );
  }
  if (!wide) return null;
  return (
    <div className="rounded-lg surface p-2">
      <textarea
        autoFocus
        rows={2}
        className="w-full resize-none bg-transparent text-[13px] outline-none"
        placeholder="Nome da tarefa"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (name.trim()) {
              await create.mutateAsync({ listId, input: { name: name.trim(), ...patch } });
              setName('');
            }
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        onBlur={() => !name && setOpen(false)}
      />
      <div className="text-[10px] muted">Enter para criar · Esc para fechar</div>
    </div>
  );
}
