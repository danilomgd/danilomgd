'use client';

import { useState } from 'react';
import { cx, fmtDate, fmtDuration } from '@/lib/format';
import { useUpdateTask } from '@/lib/hooks';
import type { CustomField, Status, Task, User } from '@/lib/types';
import { useWorkspace } from '../shell/workspace-context';
import { FieldEditor } from '../task/custom-fields';
import {
  AssigneePicker,
  DatePicker,
  EstimatePicker,
  PriorityPicker,
  StatusPicker,
  TagPicker,
} from '../task/pickers';
import { AvatarStack } from '../ui/avatar';
import { PriorityFlag, StatusPill, TagChip } from '../ui/badges';
import { QuickAdd } from './list-view';
import { DueLabel } from './task-row-bits';

/** Tabela estilo planilha: todas as colunas, edição inline, seleção em massa. */
export function TableView({
  tasks,
  statuses,
  members,
  fields,
  listId,
}: {
  tasks: Task[];
  statuses: Status[];
  members: User[];
  fields: CustomField[];
  listId?: string;
}) {
  const { openTask, hierarchy } = useWorkspace();
  const update = useUpdateTask();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const listNameOf = (listId: string) => {
    for (const sp of hierarchy?.spaces ?? [])
      for (const l of [...sp.lists, ...sp.folders.flatMap((f) => f.lists)])
        if (l.id === listId) return l.name;
    return '';
  };
  const bulk = (patch: Record<string, unknown>) => {
    for (const id of sel) update.mutate({ id, patch });
    setSel(new Set());
  };
  const th =
    'sticky top-0 z-10 border-b border-r border-line bg-muted-page px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide muted whitespace-nowrap';
  const td = 'border-b border-r border-line px-2 py-1 text-[12.5px] align-middle';
  return (
    <div className="px-4 pb-16">
      {sel.size > 0 && (
        <div className="sticky top-0 z-20 mb-2 flex items-center gap-2 rounded-md bg-ink-900 px-3 py-1.5 text-[12px] text-white">
          <span className="font-medium">{sel.size} selecionada(s)</span>
          <StatusPicker value={null} statuses={statuses} onChange={(id) => bulk({ statusId: id })}>
            <span className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20">Status</span>
          </StatusPicker>
          <AssigneePicker value={[]} members={members} onChange={(ids) => bulk({ assignees: ids })}>
            <span className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20">Responsável</span>
          </AssigneePicker>
          <PriorityPicker value={null} onChange={(p) => bulk({ priority: p })}>
            <span className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20">Prioridade</span>
          </PriorityPicker>
          <DatePicker value={null} onChange={(d) => bulk({ dueDate: d })}>
            <span className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20">Prazo</span>
          </DatePicker>
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"
            onClick={() => bulk({ archived: true })}
          >
            Arquivar
          </button>
          <button
            type="button"
            className="ml-auto opacity-70 hover:opacity-100"
            onClick={() => setSel(new Set())}
          >
            Limpar
          </button>
        </div>
      )}
      <table className="w-max min-w-full border-separate border-spacing-0 border-l border-t border-line">
        <thead>
          <tr>
            <th className={cx(th, 'w-8')}>
              <input
                type="checkbox"
                checked={sel.size === tasks.length && tasks.length > 0}
                onChange={(e) =>
                  setSel(e.target.checked ? new Set(tasks.map((t) => t.id)) : new Set())
                }
              />
            </th>
            <th className={cx(th, 'w-20')}>ID</th>
            <th className={cx(th, 'min-w-[320px]')}>Nome</th>
            <th className={th}>Status</th>
            <th className={th}>Responsável</th>
            <th className={th}>Prioridade</th>
            <th className={th}>Prazo</th>
            <th className={th}>Início</th>
            <th className={th}>Tags</th>
            <th className={th}>Estimativa</th>
            <th className={th}>Tempo</th>
            {fields.map((f) => (
              <th key={f.id} className={th}>
                {f.name}
              </th>
            ))}
            <th className={th}>Lista</th>
            <th className={th}>Criada</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const closed = t.status?.type === 'closed';
            return (
              <tr key={t.id} className={cx('row-hover', sel.has(t.id) && 'bg-brand-50')}>
                <td className={td}>
                  <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} />
                </td>
                <td className={cx(td, 'font-mono text-[11px] muted')}>{t.customId}</td>
                <td className={td}>
                  {editing === t.id ? (
                    <input
                      autoFocus
                      className="h-6 w-full bg-transparent outline-none"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => {
                        if (name.trim() && name !== t.name)
                          update.mutate({ id: t.id, patch: { name } });
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                  ) : (
                    <div
                      className="flex items-center gap-2"
                      style={{ paddingLeft: t.parentId ? 16 : 0 }}
                    >
                      <button
                        type="button"
                        className={cx(
                          'truncate text-left hover:text-brand-600',
                          closed && 'line-through muted',
                        )}
                        onClick={() => openTask(t.id)}
                      >
                        {t.parentId ? '↳ ' : ''}
                        {t.name}
                      </button>
                      <button
                        type="button"
                        className="text-[10px] muted opacity-0 hover:text-ink group-hover:opacity-100"
                        onClick={() => {
                          setEditing(t.id);
                          setName(t.name);
                        }}
                      >
                        editar
                      </button>
                    </div>
                  )}
                </td>
                <td className={td}>
                  <StatusPicker
                    value={t.status}
                    statuses={statuses}
                    onChange={(id) => update.mutate({ id: t.id, patch: { statusId: id } })}
                  >
                    <StatusPill status={t.status} className="h-5 px-1.5 text-[10px]" />
                  </StatusPicker>
                </td>
                <td className={td}>
                  <AssigneePicker
                    value={t.assignees}
                    members={members}
                    onChange={(ids) => update.mutate({ id: t.id, patch: { assignees: ids } })}
                  >
                    <span className="inline-flex items-center gap-1">
                      <AvatarStack users={t.assignees} size={20} />
                      {t.assignees[0] && (
                        <span className="text-[12px]">
                          {t.assignees.map((a) => a.username.split(' ')[0]).join(', ')}
                        </span>
                      )}
                    </span>
                  </AssigneePicker>
                </td>
                <td className={td}>
                  <PriorityPicker
                    value={t.priority}
                    onChange={(p) => update.mutate({ id: t.id, patch: { priority: p } })}
                  >
                    <PriorityFlag priority={t.priority} withLabel />
                  </PriorityPicker>
                </td>
                <td className={td}>
                  <DatePicker
                    value={t.dueDate}
                    onChange={(d) => update.mutate({ id: t.id, patch: { dueDate: d } })}
                  >
                    <DueLabel task={t} />
                  </DatePicker>
                </td>
                <td className={td}>
                  <DatePicker
                    value={t.startDate}
                    onChange={(d) => update.mutate({ id: t.id, patch: { startDate: d } })}
                  >
                    <span className={cx('text-[12px]', !t.startDate && 'muted')}>
                      {t.startDate ? fmtDate(t.startDate) : '—'}
                    </span>
                  </DatePicker>
                </td>
                <td className={td}>
                  <TagPicker
                    value={t.tags}
                    spaceId={t.spaceId}
                    onChange={(names) => update.mutate({ id: t.id, patch: { tags: names } })}
                  >
                    <span className="inline-flex gap-1">
                      {t.tags.length ? (
                        t.tags.map((x) => <TagChip key={x.id} tag={x} small />)
                      ) : (
                        <span className="text-[12px] muted">—</span>
                      )}
                    </span>
                  </TagPicker>
                </td>
                <td className={td}>
                  <EstimatePicker
                    value={t.timeEstimateMs}
                    onChange={(ms) => update.mutate({ id: t.id, patch: { timeEstimateMs: ms } })}
                  />
                </td>
                <td className={cx(td, 'text-[12px] tabular-nums')}>
                  {t.timeSpentMs ? fmtDuration(t.timeSpentMs) : <span className="muted">—</span>}
                </td>
                {fields.map((f) => (
                  <td key={f.id} className={cx(td, 'min-w-[140px]')}>
                    <FieldEditor
                      compact
                      field={f}
                      value={t.customFields[f.id]}
                      members={members}
                      onChange={(v) =>
                        update.mutate({ id: t.id, patch: { customFields: { [f.id]: v } } })
                      }
                    />
                  </td>
                ))}
                <td className={cx(td, 'text-[12px] muted whitespace-nowrap')}>
                  {listNameOf(t.listId)}
                </td>
                <td className={cx(td, 'text-[12px] muted whitespace-nowrap')}>
                  {fmtDate(t.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {listId && (
        <div className="border-x border-b border-line">
          <QuickAdd listId={listId} patch={{}} inline />
        </div>
      )}
    </div>
  );
}
