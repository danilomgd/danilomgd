'use client';

import {
  ArrowUpRight,
  Bell,
  BellOff,
  Copy,
  Eye,
  Maximize2,
  MoreHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { cx, fmtDateTime, fmtDuration } from '@/lib/format';
import {
  useDeleteTask,
  useFields,
  useInvalidate,
  useListStatuses,
  useTask,
  useUpdateTask,
} from '@/lib/hooks';
import type { Task } from '@/lib/types';
import { findList, useWorkspace } from '../shell/workspace-context';
import { Avatar, AvatarStack } from '../ui/avatar';
import { PriorityFlag, TagChip } from '../ui/badges';
import { Button, IconButton } from '../ui/button';
import { Markdown } from '../ui/markdown';
import { Confirm, textareaClass } from '../ui/modal';
import { MenuItem, MenuSeparator, Popover } from '../ui/popover';
import { toast } from '../ui/toast';
import { FieldEditor } from './custom-fields';
import {
  AssigneePicker,
  DatePicker,
  EstimatePicker,
  PriorityPicker,
  StatusPicker,
  TagPicker,
} from './pickers';
import {
  Attachments,
  Checklists,
  CommentsPanel,
  Relations,
  Subtasks,
  TimeTracking,
} from './task-sections';

export function TaskModal({
  taskId,
  onClose,
  fullPage,
}: {
  taskId: string;
  onClose: () => void;
  fullPage?: boolean;
}) {
  const task = useTask(taskId);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (fullPage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, fullPage]);

  const body = task.data ? (
    <TaskBody task={task.data} onClose={onClose} fullPage={fullPage} />
  ) : (
    <div className="flex h-64 items-center justify-center text-sm muted">
      {task.isError ? 'Tarefa não encontrada.' : 'Carregando...'}
    </div>
  );
  if (fullPage) return <div className="h-full overflow-hidden">{body}</div>;
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-3 md:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="animate-fade-in flex h-full max-h-[92vh] w-full max-w-[1280px] overflow-hidden rounded-xl surface shadow-pop">
        {body}
      </div>
    </div>,
    document.body,
  );
}

function TaskBody({
  task,
  onClose,
  fullPage,
}: {
  task: Task;
  onClose: () => void;
  fullPage?: boolean;
}) {
  const { wsId, members, me, hierarchy, openTask } = useWorkspace();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const inv = useInvalidate();
  const statuses = useListStatuses(task.listId);
  const fields = useFields(task.listId);
  const loc = findList(hierarchy, task.listId);
  const [name, setName] = useState(task.name);
  const [desc, setDesc] = useState(task.description);
  const [editDesc, setEditDesc] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => setName(task.name), [task.name]);
  useEffect(() => {
    if (!editDesc) setDesc(task.description);
  }, [task.description, editDesc]);

  const patch = (p: Record<string, unknown>) => update.mutate({ id: task.id, patch: p });
  const closed = task.status?.type === 'closed';
  const watching = task.watchers.includes(me?.id ?? '');
  const features = loc?.space.features ?? {};

  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/w/${wsId}/t/${task.customId}`);
    toast('Link copiado');
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-700">
          {task.customId}
        </span>
        <nav className="flex min-w-0 items-center gap-1 text-[12px] muted">
          {loc && (
            <>
              <Link href={`/w/${wsId}/s/${loc.space.id}`} className="truncate hover:text-ink">
                {loc.space.name}
              </Link>
              {loc.folder && (
                <>
                  <span>/</span>
                  <Link href={`/w/${wsId}/f/${loc.folder.id}`} className="truncate hover:text-ink">
                    {loc.folder.name}
                  </Link>
                </>
              )}
              <span>/</span>
              <Link href={`/w/${wsId}/l/${loc.list.id}`} className="truncate hover:text-ink">
                {loc.list.name}
              </Link>
            </>
          )}
          {task.parentId && (
            <>
              <span>/</span>
              <button
                type="button"
                className="truncate hover:text-ink"
                onClick={() => openTask(task.parentId!)}
              >
                tarefa pai
              </button>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label={watching ? 'Parar de acompanhar' : 'Acompanhar'}
            onClick={() => patch({ watchers: watching ? { rem: [me?.id] } : { add: [me?.id] } })}
          >
            {watching ? <BellOff size={15} /> : <Bell size={15} />}
          </IconButton>
          <IconButton label="Copiar link" onClick={copyLink}>
            <Copy size={15} />
          </IconButton>
          {!fullPage && (
            <Link
              href={`/w/${wsId}/t/${task.customId}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md muted hover:bg-muted-page hover:text-ink"
              title="Abrir em página inteira"
            >
              <Maximize2 size={15} />
            </Link>
          )}
          <Popover
            align="end"
            trigger={
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md muted hover:bg-muted-page hover:text-ink">
                <MoreHorizontal size={15} />
              </span>
            }
          >
            {(close) => (
              <div className="w-52">
                <MenuItem
                  icon={<ArrowUpRight size={13} />}
                  onClick={() => {
                    close();
                    window.open(`/w/${wsId}/t/${task.customId}`, '_blank');
                  }}
                >
                  Abrir em nova aba
                </MenuItem>
                <MenuItem
                  icon={<Copy size={13} />}
                  onClick={async () => {
                    close();
                    const t = await api.post<Task>(`list/${task.listId}/task`, {
                      name: `${task.name} (cópia)`,
                      description: task.description,
                      priority: task.priority,
                      assignees: task.assignees.map((a) => a.id),
                      tags: task.tags.map((x) => x.name),
                      customFields: task.customFields,
                      dueDate: task.dueDate,
                    });
                    inv.tasks();
                    openTask(t.id);
                  }}
                >
                  Duplicar
                </MenuItem>
                <MenuItem
                  icon={<Eye size={13} />}
                  onClick={() => {
                    close();
                    patch({ archived: true });
                    toast('Tarefa arquivada');
                    onClose();
                  }}
                >
                  Arquivar
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={<Trash2 size={13} />}
                  danger
                  onClick={() => {
                    close();
                    setConfirmDel(true);
                  }}
                >
                  Excluir
                </MenuItem>
              </div>
            )}
          </Popover>
          {!fullPage && (
            <IconButton label="Fechar" onClick={onClose}>
              <X size={16} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-[3] flex-col overflow-y-auto">
          <div className="px-6 pt-5 pb-8">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusPicker
                value={task.status}
                statuses={statuses.data ?? []}
                onChange={(id) => patch({ statusId: id })}
              />
              {statuses.data &&
                !closed &&
                (() => {
                  const next =
                    statuses.data[
                      (statuses.data.findIndex((s) => s.id === task.statusId) + 1) %
                        statuses.data.length
                    ];
                  return next ? (
                    <button
                      type="button"
                      className="inline-flex h-7 items-center rounded-md border border-line px-2 text-[11px] font-medium uppercase muted hover:bg-muted-page"
                      onClick={() => patch({ statusId: next.id })}
                      title={`Avançar para ${next.status}`}
                    >
                      → {next.status}
                    </button>
                  ) : null;
                })()}
              {closed && (
                <span className="text-[12px] text-emerald-700">
                  Concluída {task.dateClosed ? fmtDateTime(task.dateClosed) : ''}
                </span>
              )}
            </div>
            <textarea
              className={cx(
                'mb-4 w-full resize-none border-0 bg-transparent text-[22px] font-semibold leading-tight outline-none',
                closed && 'line-through muted',
              )}
              rows={1}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onBlur={() => name.trim() && name !== task.name && patch({ name: name.trim() })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
              }}
            />

            <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] md:grid-cols-3">
              <Prop label="Responsáveis">
                <AssigneePicker
                  value={task.assignees}
                  members={members}
                  onChange={(ids) => patch({ assignees: ids })}
                >
                  <span className="inline-flex items-center gap-2">
                    <AvatarStack users={task.assignees} size={24} />
                    {task.assignees.length ? (
                      <span className="truncate">
                        {task.assignees.map((a) => a.username.split(' ')[0]).join(', ')}
                      </span>
                    ) : (
                      <span className="muted">Atribuir</span>
                    )}
                  </span>
                </AssigneePicker>
              </Prop>
              {features.priorities !== false && (
                <Prop label="Prioridade">
                  <PriorityPicker value={task.priority} onChange={(p) => patch({ priority: p })} />
                </Prop>
              )}
              <Prop label="Prazo">
                <DatePicker
                  value={task.dueDate}
                  withTime={task.dueDateTime}
                  allowTime
                  onChange={(d, t) => patch({ dueDate: d, dueDateTime: !!t })}
                  label="Definir prazo"
                />
              </Prop>
              {features.startDates !== false && (
                <Prop label="Início">
                  <DatePicker
                    value={task.startDate}
                    onChange={(d) => patch({ startDate: d })}
                    label="Definir início"
                  />
                </Prop>
              )}
              {features.timeEstimates !== false && (
                <Prop label="Estimativa">
                  <EstimatePicker
                    value={task.timeEstimateMs}
                    onChange={(ms) => patch({ timeEstimateMs: ms })}
                  />
                </Prop>
              )}
              {features.timeTracking !== false && (
                <Prop label="Tempo registrado">
                  <span className={cx('text-[12px]', !task.timeSpentMs && 'muted')}>
                    {task.timeSpentMs ? fmtDuration(task.timeSpentMs) : '—'}
                  </span>
                </Prop>
              )}
              {features.points && (
                <Prop label="Pontos">
                  <input
                    className="h-6 w-16 rounded bg-transparent px-1 text-[12px] outline-none focus:bg-muted-page"
                    type="number"
                    defaultValue={task.points ?? ''}
                    onBlur={(e) =>
                      patch({ points: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    placeholder="—"
                  />
                </Prop>
              )}
              {features.tags !== false && (
                <Prop label="Tags" wide>
                  <TagPicker
                    value={task.tags}
                    spaceId={task.spaceId}
                    onChange={(names) => patch({ tags: names })}
                  />
                </Prop>
              )}
              <Prop label="Acompanhando" wide>
                <span className="inline-flex items-center gap-1">
                  {task.watchers.map((id) => (
                    <Avatar key={id} user={members.find((m) => m.id === id)} size={20} />
                  ))}
                  {!task.watchers.length && <span className="muted">—</span>}
                </span>
              </Prop>
            </div>

            {fields.data && fields.data.length > 0 && (
              <div className="mb-6 rounded-lg border border-line">
                <div className="border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide muted">
                  Campos personalizados
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2">
                  {fields.data.map((f) => (
                    <div
                      key={f.id}
                      className="flex min-h-[40px] items-center gap-3 border-b border-line px-3 py-1.5 md:odd:border-r"
                    >
                      <span className="w-32 shrink-0 truncate text-[12px] muted">
                        {f.name}
                        {f.required && <span className="text-red-500"> *</span>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <FieldEditor
                          field={f}
                          value={task.customFields[f.id]}
                          members={members}
                          onChange={(v) => patch({ customFields: { [f.id]: v } })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <section className="mb-6">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-wide muted">
                  Descrição
                </span>
                {!editDesc && (
                  <Button size="xs" variant="ghost" onClick={() => setEditDesc(true)}>
                    Editar
                  </Button>
                )}
              </div>
              {editDesc ? (
                <div>
                  <textarea
                    autoFocus
                    className={`${textareaClass} min-h-[160px] font-mono text-[12.5px]`}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                  />
                  <div className="mt-1 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        patch({ description: desc });
                        setEditDesc(false);
                      }}
                    >
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setDesc(task.description);
                        setEditDesc(false);
                      }}
                    >
                      Cancelar
                    </Button>
                    <span className="text-[11px] muted">
                      Markdown: # títulos, **negrito**, - listas, - [ ] checklists, tabelas
                    </span>
                  </div>
                </div>
              ) : task.description ? (
                <div
                  className="cursor-text rounded-md p-2 hover:bg-muted-page"
                  onClick={() => setEditDesc(true)}
                >
                  <Markdown source={task.description} className="text-[13.5px]" />
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full rounded-md border border-dashed border-line p-3 text-left text-[13px] muted hover:bg-muted-page"
                  onClick={() => setEditDesc(true)}
                >
                  Adicione uma descrição...
                </button>
              )}
            </section>

            <div className="space-y-6">
              <Subtasks task={task} />
              {features.checklists !== false && <Checklists task={task} />}
              <Attachments task={task} />
              {features.dependencies !== false && <Relations task={task} />}
              {features.timeTracking !== false && <TimeTracking task={task} />}
            </div>
          </div>
        </div>
        <div className="hidden w-[380px] shrink-0 border-l border-line bg-muted-page md:flex md:flex-col">
          <CommentsPanel task={task} />
        </div>
      </div>
      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Excluir tarefa?"
        text={`"${task.name}" e suas subtarefas serão excluídas.`}
        onConfirm={async () => {
          await del.mutateAsync(task.id);
          toast('Tarefa excluída');
          onClose();
        }}
      />
    </div>
  );
}

function Prop({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cx('min-w-0', wide && 'col-span-2 md:col-span-3')}>
      <div className="mb-0.5 text-[11px] font-medium muted">{label}</div>
      <div className="flex min-h-[26px] items-center">{children}</div>
    </div>
  );
}

export function TagList({ task }: { task: Task }) {
  return (
    <span className="inline-flex gap-1">
      {task.tags.map((t) => (
        <TagChip key={t.id} tag={t} small />
      ))}
    </span>
  );
}

export { PriorityFlag };
