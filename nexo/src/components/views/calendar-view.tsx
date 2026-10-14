'use client';

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { cx } from '@/lib/format';
import { useCreateTask, useUpdateTask } from '@/lib/hooks';
import type { Status, Task, User } from '@/lib/types';
import { useWorkspace } from '../shell/workspace-context';
import { AvatarStack } from '../ui/avatar';
import { StatusDot } from '../ui/badges';
import { Button } from '../ui/button';

export function CalendarView({
  tasks,
  listId,
  members,
}: {
  tasks: Task[];
  listId?: string;
  statuses: Status[];
  members: User[];
}) {
  const { openTask } = useWorkspace();
  const update = useUpdateTask();
  const create = useCreateTask();
  const [cursor, setCursor] = useState(new Date());
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [active, setActive] = useState<Task | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [name, setName] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const start =
    mode === 'month'
      ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
      : startOfWeek(cursor, { weekStartsOn: 0 });
  const end =
    mode === 'month'
      ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
      : endOfWeek(cursor, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start, end });
  const byDay = (d: Date) => tasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), d));
  const noDate = tasks.filter((t) => !t.dueDate);

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const t = tasks.find((x) => x.id === String(e.active.id));
    const day = e.over ? String(e.over.id) : null;
    if (!t || !day) return;
    const base = t.dueDate ? new Date(t.dueDate) : new Date();
    const target = new Date(day);
    target.setHours(
      t.dueDateTime ? base.getHours() : 17,
      t.dueDateTime ? base.getMinutes() : 0,
      0,
      0,
    );
    update.mutate({ id: t.id, patch: { dueDate: target.toISOString() } });
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActive(tasks.find((x) => x.id === String(e.active.id)) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="flex h-full flex-col px-4 pb-4">
        <div className="flex items-center gap-2 py-2">
          <Button
            size="sm"
            onClick={() => setCursor(mode === 'month' ? subMonths(cursor, 1) : subWeeks(cursor, 1))}
            icon={<ChevronLeft size={14} />}
            aria-label="Anterior"
          />
          <Button size="sm" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          <Button
            size="sm"
            onClick={() => setCursor(mode === 'month' ? addMonths(cursor, 1) : addWeeks(cursor, 1))}
            icon={<ChevronRight size={14} />}
            aria-label="Próximo"
          />
          <span className="ml-2 text-[15px] font-semibold capitalize">
            {format(cursor, mode === 'month' ? 'MMMM yyyy' : "'Semana de' d 'de' MMMM", {
              locale: ptBR,
            })}
          </span>
          <div className="ml-auto flex gap-0.5 rounded-md surface p-0.5 text-[12px]">
            <button
              type="button"
              className={cx('rounded px-2 py-0.5', mode === 'month' && 'bg-ink-100 font-medium')}
              onClick={() => setMode('month')}
            >
              Mês
            </button>
            <button
              type="button"
              className={cx('rounded px-2 py-0.5', mode === 'week' && 'bg-ink-100 font-medium')}
              onClick={() => setMode('week')}
            >
              Semana
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-t border-l border-line text-[11px] font-medium uppercase muted">
          {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => (
            <div key={d} className="border-r border-b border-line px-2 py-1">
              {d}
            </div>
          ))}
        </div>
        <div
          className={cx(
            'grid flex-1 grid-cols-7 border-l border-line',
            mode === 'month' ? 'auto-rows-fr' : '',
          )}
        >
          {days.map((d) => (
            <DayCell
              key={d.toISOString()}
              day={d}
              inMonth={mode === 'week' || isSameMonth(d, cursor)}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cx(
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                    isToday(d) && 'bg-brand-500 font-semibold text-white',
                  )}
                >
                  {format(d, 'd')}
                </span>
                {listId && (
                  <button
                    type="button"
                    className="opacity-0 muted hover:text-ink group-hover:opacity-100"
                    aria-label="Nova tarefa"
                    onClick={() => {
                      setAdding(d.toISOString());
                      setName('');
                    }}
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                {byDay(d).map((t) => (
                  <CalItem key={t.id} t={t} onOpen={() => openTask(t.id)} />
                ))}
                {adding === d.toISOString() && (
                  <input
                    autoFocus
                    className="h-6 w-full rounded border border-brand-300 px-1 text-[11px] outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setAdding(null)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && name.trim() && listId) {
                        const due = new Date(d);
                        due.setHours(17, 0, 0, 0);
                        await create.mutateAsync({
                          listId,
                          input: { name: name.trim(), dueDate: due.toISOString() },
                        });
                        setAdding(null);
                      }
                      if (e.key === 'Escape') setAdding(null);
                    }}
                  />
                )}
              </div>
            </DayCell>
          ))}
        </div>
        {noDate.length > 0 && (
          <div className="mt-3 rounded-md border border-dashed border-line p-2">
            <div className="mb-1 text-[11px] font-semibold uppercase muted">
              Sem prazo ({noDate.length}) — arraste para um dia
            </div>
            <div className="flex flex-wrap gap-1">
              {noDate.slice(0, 20).map((t) => (
                <CalItem key={t.id} t={t} onOpen={() => openTask(t.id)} chip />
              ))}
            </div>
          </div>
        )}
      </div>
      <DragOverlay>
        {active ? (
          <div className="rounded surface px-2 py-1 text-[11px] shadow-pop">{active.name}</div>
        ) : null}
      </DragOverlay>
      <span className="hidden">
        <AvatarStack users={members.slice(0, 0)} />
      </span>
    </DndContext>
  );
}

function DayCell({
  day,
  inMonth,
  children,
}: {
  day: Date;
  inMonth: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.toISOString() });
  return (
    <div
      ref={setNodeRef}
      className={cx(
        'group min-h-[96px] border-r border-b border-line p-1',
        !inMonth && 'bg-muted-page/60 text-ink-400',
        isOver && 'bg-brand-50',
      )}
    >
      {children}
    </div>
  );
}

function CalItem({ t, onOpen, chip }: { t: Task; onOpen: () => void; chip?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id });
  const closed = t.status?.type === 'closed';
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cx(
        'flex cursor-grab items-center gap-1 rounded px-1 py-0.5 text-[11px] hover:bg-ink-100',
        chip ? 'surface' : 'bg-page',
        isDragging && 'opacity-40',
      )}
      style={{ borderLeft: `3px solid ${t.status?.color ?? '#ccc'}` }}
    >
      <button
        type="button"
        className={cx('min-w-0 flex-1 truncate text-left', closed && 'line-through muted')}
        onClick={onOpen}
      >
        {t.name}
      </button>
      {t.assignees[0] && (
        <span
          className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ background: t.assignees[0].color }}
          title={t.assignees[0].username}
        />
      )}
    </div>
  );
}

export { addDays, StatusDot };
