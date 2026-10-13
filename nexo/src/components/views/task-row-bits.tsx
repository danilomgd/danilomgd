'use client';

import { CheckSquare, Clock, GitBranch, MessageSquare } from 'lucide-react';
import { cx, dueClass, fmtDate, fmtDuration } from '@/lib/format';
import type { Task } from '@/lib/types';
import { TagChip } from '../ui/badges';

/** Pequenos indicadores usados em linhas e cartões. */
export function TaskMeta({ task, className }: { task: Task; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 text-[11px] muted', className)}>
      {task.subtaskCount > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Subtarefas">
          <GitBranch size={11} /> {task.subtaskDone}/{task.subtaskCount}
        </span>
      )}
      {task.checklistTotal > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Checklist">
          <CheckSquare size={11} /> {task.checklistDone}/{task.checklistTotal}
        </span>
      )}
      {task.commentCount > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Comentários">
          <MessageSquare size={11} /> {task.commentCount}
        </span>
      )}
      {task.timeSpentMs > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Tempo">
          <Clock size={11} /> {fmtDuration(task.timeSpentMs)}
        </span>
      )}
    </span>
  );
}

export function DueLabel({ task }: { task: Task }) {
  if (!task.dueDate) return <span className="text-[12px] muted">—</span>;
  return (
    <span className={cx('text-[12px]', dueClass(task.dueDate, task.status?.type === 'closed'))}>
      {fmtDate(task.dueDate, task.dueDateTime)}
    </span>
  );
}

export function Tags({ task, max = 3 }: { task: Task; max?: number }) {
  if (!task.tags.length) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {task.tags.slice(0, max).map((t) => (
        <TagChip key={t.id} tag={t} small />
      ))}
      {task.tags.length > max && (
        <span className="text-[10px] muted">+{task.tags.length - max}</span>
      )}
    </span>
  );
}

export function Blocked({ task }: { task: Task }) {
  if (!task.dependencies.waitingOn.length || task.status?.type === 'closed') return null;
  return (
    <span
      className="rounded bg-red-50 px-1 text-[10px] font-semibold text-red-600"
      title="Aguardando outras tarefas"
    >
      BLOQUEADA
    </span>
  );
}
