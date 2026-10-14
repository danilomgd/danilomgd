'use client';

import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Link2,
  Paperclip,
  Play,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cx, fmtAgo, fmtDate, fmtDateTime, fmtDuration, parseDuration } from '@/lib/format';
import {
  keys,
  useActivity,
  useChecklists,
  useComments,
  useInvalidate,
  useRelated,
  useTasks,
  useTaskTime,
  useTimer,
  useUpdateTask,
} from '@/lib/hooks';
import type { Activity, Comment, Task, User } from '@/lib/types';
import { useWorkspace } from '../shell/workspace-context';
import { Avatar } from '../ui/avatar';
import { PriorityFlag, StatusDot } from '../ui/badges';
import { Button } from '../ui/button';
import { Markdown } from '../ui/markdown';
import { inputClass, textareaClass } from '../ui/modal';
import { MenuItem, Popover } from '../ui/popover';
import { toast } from '../ui/toast';
import { AssigneePicker } from './pickers';

function SectionHeader({
  title,
  count,
  action,
  open,
  onToggle,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide muted hover:text-ink"
      >
        {onToggle && (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
        {title}
        {count !== undefined && (
          <span className="rounded bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-600">
            {count}
          </span>
        )}
      </button>
      <div className="ml-auto">{action}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Subtarefas

export function Subtasks({ task }: { task: Task }) {
  const { wsId, members, openTask } = useWorkspace();
  const subs = useTasks(wsId, { listIds: [task.listId], includeClosed: true });
  const children = (subs.data ?? []).filter((t) => t.parentId === task.id);
  const update = useUpdateTask();
  const inv = useInvalidate();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(true);
  const add = async () => {
    if (!name.trim()) return;
    await api.post(`list/${task.listId}/task`, { name: name.trim(), parentId: task.id });
    setName('');
    inv.tasks(task.id);
  };
  return (
    <section>
      <SectionHeader
        title="Subtarefas"
        count={children.length}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        action={
          <Button
            size="xs"
            variant="ghost"
            icon={<Plus size={12} />}
            onClick={() => {
              setOpen(true);
              setAdding(true);
            }}
          >
            Adicionar
          </Button>
        }
      />
      {open && (
        <div className="rounded-md border border-line">
          {children.map((st) => (
            <div
              key={st.id}
              className="flex h-9 items-center gap-2 border-b border-line px-2 last:border-b-0 row-hover"
            >
              <StatusDot status={st.status} />
              <button
                type="button"
                className={cx(
                  'flex-1 truncate text-left text-[13px] hover:text-brand-600',
                  st.status?.type === 'closed' && 'line-through muted',
                )}
                onClick={() => openTask(st.id)}
              >
                {st.name}
              </button>
              <AssigneePicker
                value={st.assignees}
                members={members}
                onChange={(ids) => update.mutate({ id: st.id, patch: { assignees: ids } })}
              />
              <PriorityFlag priority={st.priority} />
              {st.dueDate && <span className="text-[11px] muted">{fmtDate(st.dueDate)}</span>}
            </div>
          ))}
          {adding ? (
            <div className="flex h-9 items-center gap-2 px-2">
              <StatusDot status={null} />
              <input
                autoFocus
                className="h-7 flex-1 bg-transparent text-[13px] outline-none"
                placeholder="Nome da subtarefa (Enter para salvar)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') add();
                  if (e.key === 'Escape') setAdding(false);
                }}
                onBlur={() => !name && setAdding(false)}
              />
            </div>
          ) : children.length === 0 ? (
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 px-2 text-[12px] muted hover:bg-muted-page"
              onClick={() => setAdding(true)}
            >
              <Plus size={13} /> Criar subtarefa
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Checklists

export function Checklists({ task }: { task: Task }) {
  const { members } = useWorkspace();
  const lists = useChecklists(task.id);
  const inv = useInvalidate();
  const refresh = () => {
    inv.qc.invalidateQueries({ queryKey: keys.checklists(task.id) });
    inv.tasks(task.id);
  };
  const [newList, setNewList] = useState<string | null>(null);
  return (
    <section>
      <SectionHeader
        title="Checklists"
        count={lists.data?.length}
        action={
          <Button
            size="xs"
            variant="ghost"
            icon={<Plus size={12} />}
            onClick={() => setNewList('')}
          >
            Nova checklist
          </Button>
        }
      />
      {newList !== null && (
        <form
          className="mb-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newList.trim()) return;
            await api.post(`task/${task.id}/checklist`, { name: newList.trim() });
            setNewList(null);
            refresh();
          }}
        >
          <input
            autoFocus
            className={inputClass}
            placeholder="Nome da checklist"
            value={newList}
            onChange={(e) => setNewList(e.target.value)}
          />
          <Button type="submit" variant="primary">
            Criar
          </Button>
          <Button type="button" onClick={() => setNewList(null)}>
            Cancelar
          </Button>
        </form>
      )}
      <div className="space-y-3">
        {lists.data?.map((cl) => {
          const done = cl.items.filter((i) => i.resolved).length;
          return (
            <div key={cl.id} className="rounded-md border border-line p-2">
              <div className="mb-1 flex items-center gap-2">
                <CheckSquare size={14} className="text-brand-500" />
                <span className="flex-1 text-[13px] font-medium">{cl.name}</span>
                <span className="text-[11px] muted">
                  {done}/{cl.items.length}
                </span>
                <button
                  type="button"
                  className="muted hover:text-red-600"
                  aria-label="Excluir checklist"
                  onClick={async () => {
                    await api.del(`checklist/${cl.id}`);
                    refresh();
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="mb-1 h-1 overflow-hidden rounded bg-ink-100">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${cl.items.length ? (done / cl.items.length) * 100 : 0}%` }}
                />
              </div>
              {cl.items.map((it) => (
                <div
                  key={it.id}
                  className="group flex h-8 items-center gap-2 rounded px-1 row-hover"
                >
                  <input
                    type="checkbox"
                    checked={it.resolved}
                    onChange={async (e) => {
                      await api.put(`checklist_item/${it.id}`, { resolved: e.target.checked });
                      refresh();
                    }}
                    className="accent-brand-500"
                  />
                  <span className={cx('flex-1 text-[13px]', it.resolved && 'line-through muted')}>
                    {it.name}
                  </span>
                  <AssigneePicker
                    single
                    value={it.assignee ? [it.assignee] : []}
                    members={members}
                    onChange={async (ids) => {
                      await api.put(`checklist_item/${it.id}`, { assigneeId: ids[0] ?? null });
                      refresh();
                    }}
                  >
                    <Avatar
                      user={it.assignee}
                      size={18}
                      className={cx(!it.assignee && 'opacity-0 group-hover:opacity-100')}
                    />
                  </AssigneePicker>
                  <button
                    type="button"
                    className="opacity-0 muted hover:text-red-600 group-hover:opacity-100"
                    aria-label="Excluir item"
                    onClick={async () => {
                      await api.del(`checklist_item/${it.id}`);
                      refresh();
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <NewItem
                onAdd={async (name) => {
                  await api.post(`checklist/${cl.id}/checklist_item`, { name });
                  refresh();
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NewItem({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [v, setV] = useState('');
  return (
    <input
      className="mt-1 h-7 w-full rounded bg-transparent px-1 text-[12px] outline-none placeholder:text-ink-400 focus:bg-muted-page"
      placeholder="+ Novo item (Enter)"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={async (e) => {
        if (e.key === 'Enter' && v.trim()) {
          await onAdd(v.trim());
          setV('');
        }
      }}
    />
  );
}

// ---------------------------------------------------------------- Relações

export function Relations({ task }: { task: Task }) {
  const { wsId, openTask } = useWorkspace();
  const rel = useRelated(task.id);
  const inv = useInvalidate();
  const all = useTasks(wsId, { includeClosed: true });
  const [mode, setMode] = useState<'waiting' | 'blocking' | 'link' | null>(null);
  const [q, setQ] = useState('');
  const refresh = () => {
    inv.qc.invalidateQueries({ queryKey: keys.related(task.id) });
    inv.tasks(task.id);
  };
  const candidates = (all.data ?? [])
    .filter(
      (t) =>
        t.id !== task.id &&
        (t.name.toLowerCase().includes(q.toLowerCase()) ||
          t.customId.toLowerCase().includes(q.toLowerCase())),
    )
    .slice(0, 8);
  const add = async (otherId: string) => {
    if (mode === 'waiting') await api.post(`task/${task.id}/dependency`, { dependsOn: otherId });
    if (mode === 'blocking')
      await api.post(`task/${task.id}/dependency`, { dependencyOf: otherId });
    if (mode === 'link') await api.post(`task/${task.id}/link/${otherId}`);
    setMode(null);
    setQ('');
    refresh();
  };
  const Row = ({
    t,
    onRemove,
  }: {
    t: NonNullable<typeof rel.data>['linked'][number];
    onRemove: () => void;
  }) => (
    <div className="group flex h-8 items-center gap-2 rounded px-1 row-hover">
      <StatusDot status={t.status} />
      <button
        type="button"
        className="flex-1 truncate text-left text-[13px] hover:text-brand-600"
        onClick={() => openTask(t.id)}
      >
        <span className="mr-1 text-[11px] muted">{t.customId}</span>
        {t.name}
      </button>
      <button
        type="button"
        className="opacity-0 muted hover:text-red-600 group-hover:opacity-100"
        onClick={onRemove}
        aria-label="Remover relação"
      >
        <X size={13} />
      </button>
    </div>
  );
  const groups: {
    key: 'waiting' | 'blocking' | 'link';
    label: string;
    items: NonNullable<typeof rel.data>['linked'];
  }[] = [
    { key: 'waiting', label: 'Aguardando', items: rel.data?.waitingOn ?? [] },
    { key: 'blocking', label: 'Bloqueando', items: rel.data?.blocking ?? [] },
    { key: 'link', label: 'Relacionadas', items: rel.data?.linked ?? [] },
  ];
  return (
    <section>
      <SectionHeader
        title="Relações"
        action={
          <Popover
            trigger={
              <span className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[12px] muted hover:bg-muted-page hover:text-ink">
                <Plus size={12} /> Adicionar
              </span>
            }
            align="end"
          >
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    setMode('waiting');
                    close();
                  }}
                >
                  Aguardando por...
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMode('blocking');
                    close();
                  }}
                >
                  Bloqueando...
                </MenuItem>
                <MenuItem
                  icon={<Link2 size={13} />}
                  onClick={() => {
                    setMode('link');
                    close();
                  }}
                >
                  Vincular tarefa
                </MenuItem>
              </>
            )}
          </Popover>
        }
      />
      {mode && (
        <div className="mb-2 rounded-md border border-brand-300 p-2">
          <div className="mb-1 text-[11px] font-medium muted">
            {mode === 'waiting'
              ? 'Esta tarefa aguarda por:'
              : mode === 'blocking'
                ? 'Esta tarefa bloqueia:'
                : 'Vincular com:'}
          </div>
          <input
            autoFocus
            className={inputClass}
            placeholder="Buscar por nome ou ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setMode(null)}
          />
          <div className="mt-1 max-h-48 overflow-auto">
            {candidates.map((t) => (
              <MenuItem key={t.id} icon={<StatusDot status={t.status} />} onClick={() => add(t.id)}>
                <span className="mr-1 text-[11px] muted">{t.customId}</span>
                {t.name}
              </MenuItem>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        {groups.map((g) =>
          g.items.length ? (
            <div key={g.key}>
              <div className="px-1 text-[11px] font-medium muted">{g.label}</div>
              {g.items.map((t) => (
                <Row
                  key={t.id}
                  t={t}
                  onRemove={async () => {
                    if (g.key === 'waiting')
                      await api.del(`task/${task.id}/dependency?depends_on=${t.id}`);
                    else if (g.key === 'blocking')
                      await api.del(`task/${task.id}/dependency?dependency_of=${t.id}`);
                    else await api.del(`task/${task.id}/link/${t.id}`);
                    refresh();
                  }}
                />
              ))}
            </div>
          ) : null,
        )}
        {!mode && groups.every((g) => !g.items.length) && (
          <div className="text-[12px] muted">Sem dependências ou vínculos.</div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Anexos

export function Attachments({ task }: { task: Task }) {
  const inv = useInvalidate();
  const [items, setItems] = useState<
    { id: string; title: string; url: string; createdAt: string; user: User | null }[] | null
  >(null);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const load = async () =>
    setItems(
      (await api.get<{ attachments: typeof items }>(`task/${task.id}/attachment`)).attachments,
    );
  if (items === null) load();
  return (
    <section>
      <SectionHeader
        title="Anexos"
        count={items?.length}
        action={
          <Button
            size="xs"
            variant="ghost"
            icon={<Paperclip size={12} />}
            onClick={() => setAdding(true)}
          >
            Adicionar link
          </Button>
        }
      />
      {adding && (
        <form
          className="mb-2 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!url.trim()) return;
            await api.post(`task/${task.id}/attachment`, {
              title: title.trim() || url.trim(),
              url: url.trim(),
            });
            setUrl('');
            setTitle('');
            setAdding(false);
            load();
            inv.tasks(task.id);
          }}
        >
          <input
            autoFocus
            className={`${inputClass} flex-1`}
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <input
            className={`${inputClass} w-40`}
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit" variant="primary">
            Anexar
          </Button>
          <Button type="button" onClick={() => setAdding(false)}>
            Cancelar
          </Button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {items?.map((a) => (
          <div
            key={a.id}
            className="group flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-[12px]"
          >
            <Paperclip size={13} className="muted" />
            <a
              href={a.url}
              target="_blank"
              rel="noopener"
              className="max-w-[220px] truncate hover:text-brand-600"
            >
              {a.title}
            </a>
            <button
              type="button"
              className="opacity-0 muted hover:text-red-600 group-hover:opacity-100"
              aria-label="Remover anexo"
              onClick={async () => {
                await api.del(`attachment/${a.id}`);
                load();
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {items && items.length === 0 && !adding && (
          <div className="text-[12px] muted">
            Nenhum anexo. Cole um link para arquivos no Drive, OneDrive ou outro storage.
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Tempo

export function TimeTracking({ task }: { task: Task }) {
  const { wsId, me } = useWorkspace();
  const entries = useTaskTime(wsId, task.id);
  const timer = useTimer(wsId);
  const inv = useInvalidate();
  const [manual, setManual] = useState('');
  const [desc, setDesc] = useState('');
  const running = timer.data?.taskId === task.id ? timer.data : null;
  const refresh = () => {
    inv.qc.invalidateQueries({ queryKey: ['time'] });
    inv.qc.invalidateQueries({ queryKey: ['timer'] });
    inv.tasks(task.id);
  };
  const total = (entries.data ?? []).reduce((a, e) => a + (e.durationMs ?? 0), 0);
  return (
    <section>
      <SectionHeader
        title="Tempo registrado"
        action={
          <span className="text-[12px] font-semibold tabular-nums">
            {fmtDuration(total)}
            {task.timeEstimateMs ? (
              <span className="font-normal muted"> / {fmtDuration(task.timeEstimateMs)} est.</span>
            ) : null}
          </span>
        }
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {running ? (
          <Button
            size="sm"
            variant="danger"
            icon={<Square size={12} fill="currentColor" />}
            onClick={async () => {
              await api.post(`team/${wsId}/time_entries/stop`);
              refresh();
            }}
          >
            Parar
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            icon={<Play size={12} fill="currentColor" />}
            onClick={async () => {
              await api.post(`team/${wsId}/time_entries/start`, { taskId: task.id });
              refresh();
            }}
          >
            Iniciar
          </Button>
        )}
        <input
          className={`${inputClass} w-24`}
          placeholder="1h 30m"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <input
          className={`${inputClass} w-44`}
          placeholder="Descrição"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <Button
          size="sm"
          onClick={async () => {
            const ms = parseDuration(manual);
            if (!ms) return toast('Informe uma duração válida (ex.: 1h 30m)', 'error');
            await api.post(`team/${wsId}/time_entries`, {
              taskId: task.id,
              start: new Date(Date.now() - ms).toISOString(),
              durationMs: ms,
              description: desc,
            });
            setManual('');
            setDesc('');
            refresh();
          }}
        >
          Registrar
        </Button>
      </div>
      <div className="divide-y divide-[var(--border)] rounded-md border border-line">
        {entries.data?.map((e) => (
          <div key={e.id} className="group flex h-8 items-center gap-2 px-2 text-[12px]">
            <Avatar user={e.user ?? null} size={18} />
            <span className="flex-1 truncate">
              {e.description || <span className="muted">Sem descrição</span>}
            </span>
            <span className="muted">{fmtDate(e.start)}</span>
            {e.billable && (
              <span className="rounded bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-700">
                $
              </span>
            )}
            <span className="w-14 text-right font-medium tabular-nums">
              {e.end ? (
                fmtDuration(e.durationMs)
              ) : (
                <span className="text-emerald-600">● ativo</span>
              )}
            </span>
            <button
              type="button"
              className="opacity-0 muted hover:text-red-600 group-hover:opacity-100"
              aria-label="Excluir registro"
              onClick={async () => {
                await api.del(`team/${wsId}/time_entries/${e.id}`);
                refresh();
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {entries.data && entries.data.length === 0 && (
          <div className="px-2 py-2 text-[12px] muted">
            Nenhum registro ainda. {me?.username.split(' ')[0]}, inicie o cronômetro ou registre
            manualmente.
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Comentários + atividade

function activityText(a: Activity) {
  const b = a.before as string | number | null;
  const af = a.after as string | number | null;
  switch (a.type) {
    case 'created':
      return 'criou a tarefa';
    case 'status':
      return `alterou o status de "${b ?? '—'}" para "${af ?? '—'}"`;
    case 'assignee':
      return af ? `atribuiu ${af}` : `removeu ${b}`;
    case 'priority':
      return `alterou a prioridade de ${b ?? '—'} para ${af ?? '—'}`;
    case 'due_date':
      return af ? `definiu o prazo para ${fmtDate(String(af))}` : 'removeu o prazo';
    case 'start_date':
      return af ? `definiu o início para ${fmtDate(String(af))}` : 'removeu a data de início';
    case 'renamed':
      return `renomeou para "${af}"`;
    case 'description':
      return 'editou a descrição';
    case 'tags':
      return 'alterou as tags';
    case 'custom_field':
      return 'alterou um campo personalizado';
    case 'comment':
      return 'comentou';
    case 'moved':
      return `moveu de "${b}" para "${af}"`;
    case 'dependency':
      return `adicionou dependência (${a.field === 'waiting_on' ? 'aguardando' : 'bloqueando'} ${af})`;
    case 'attachment':
      return `anexou ${af}`;
    default:
      return a.type;
  }
}

export function CommentsPanel({ task }: { task: Task }) {
  const { members, me } = useWorkspace();
  const comments = useComments(task.id);
  const activity = useActivity(task.id);
  const inv = useInvalidate();
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'all' | 'comments'>('all');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [assignTo, setAssignTo] = useState<string | null>(null);
  const [mention, setMention] = useState<{ q: string; at: number } | null>(null);
  const refresh = () => {
    inv.qc.invalidateQueries({ queryKey: keys.comments(task.id) });
    inv.qc.invalidateQueries({ queryKey: keys.activity(task.id) });
    inv.tasks(task.id);
    inv.qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const send = async () => {
    if (!text.trim()) return;
    await api.post(`task/${task.id}/comment`, {
      text: text.trim(),
      parentId: replyTo?.id,
      assigneeId: assignTo,
    });
    setText('');
    setReplyTo(null);
    setAssignTo(null);
    refresh();
  };

  type Item =
    | { kind: 'comment'; at: string; c: Comment }
    | { kind: 'activity'; at: string; a: Activity };
  const items: Item[] = [
    ...(comments.data ?? []).map((c) => ({ kind: 'comment' as const, at: c.createdAt, c })),
    ...(tab === 'all'
      ? (activity.data ?? [])
          .filter((a) => a.type !== 'comment')
          .map((a) => ({ kind: 'activity' as const, at: a.createdAt, a }))
      : []),
  ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());

  const mentionCandidates = mention
    ? members
        .filter((m) => m.username.toLowerCase().startsWith(mention.q.toLowerCase()))
        .slice(0, 5)
    : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line px-3 py-2 text-[12px]">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={cx(
            'rounded px-2 py-1',
            tab === 'all' ? 'bg-ink-100 font-medium' : 'muted hover:bg-muted-page',
          )}
        >
          Atividade
        </button>
        <button
          type="button"
          onClick={() => setTab('comments')}
          className={cx(
            'rounded px-2 py-1',
            tab === 'comments' ? 'bg-ink-100 font-medium' : 'muted hover:bg-muted-page',
          )}
        >
          Comentários ({comments.data?.length ?? 0})
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {items.map((it) =>
          it.kind === 'activity' ? (
            <div key={it.a.id} className="flex items-start gap-2 text-[12px] muted">
              <Avatar user={it.a.user} size={18} />
              <span className="flex-1">
                <span className="font-medium text-ink">{it.a.user?.username ?? 'Sistema'}</span>{' '}
                {activityText(it.a)}
              </span>
              <span className="shrink-0 text-[11px]" title={fmtDateTime(it.a.createdAt)}>
                {fmtAgo(it.a.createdAt)}
              </span>
            </div>
          ) : (
            <CommentCard
              key={it.c.id}
              c={it.c}
              parent={comments.data?.find((p) => p.id === it.c.parentId)}
              me={me}
              onReply={() => setReplyTo(it.c)}
              onChange={refresh}
            />
          ),
        )}
        {items.length === 0 && (
          <div className="py-6 text-center text-[12px] muted">Sem atividade ainda.</div>
        )}
      </div>
      <div className="border-t border-line p-3">
        {replyTo && (
          <div className="mb-1 flex items-center gap-1 text-[11px] muted">
            Respondendo a {replyTo.user?.username}{' '}
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta">
              <X size={11} />
            </button>
          </div>
        )}
        <div className="relative">
          <textarea
            className={`${textareaClass} min-h-[72px]`}
            placeholder="Escreva um comentário... use @ para mencionar"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const pos = e.target.selectionStart;
              const before = e.target.value.slice(0, pos);
              const m = before.match(/@([\wÀ-ú]*)$/);
              setMention(m ? { q: m[1], at: pos - m[0].length } : null);
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send();
            }}
          />
          {mention && mentionCandidates.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-56 rounded-md surface p-1 shadow-pop">
              {mentionCandidates.map((m) => (
                <MenuItem
                  key={m.id}
                  icon={<Avatar user={m} size={18} />}
                  onClick={() => {
                    setText(
                      (t) =>
                        `${t.slice(0, mention.at)}@${m.username} ${t.slice(mention.at + mention.q.length + 1)}`,
                    );
                    setMention(null);
                  }}
                >
                  {m.username}
                </MenuItem>
              ))}
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Popover
            trigger={
              <span className="inline-flex h-7 items-center gap-1 rounded-md surface px-2 text-[12px] hover:bg-muted-page">
                {assignTo ? (
                  <>
                    <Avatar user={members.find((m) => m.id === assignTo)} size={16} /> Atribuído
                  </>
                ) : (
                  'Atribuir comentário'
                )}
              </span>
            }
          >
            {(close) => (
              <>
                {members.map((m) => (
                  <MenuItem
                    key={m.id}
                    icon={<Avatar user={m} size={18} />}
                    active={assignTo === m.id}
                    onClick={() => {
                      setAssignTo(m.id);
                      close();
                    }}
                  >
                    {m.username}
                  </MenuItem>
                ))}
                <MenuItem
                  onClick={() => {
                    setAssignTo(null);
                    close();
                  }}
                >
                  Ninguém
                </MenuItem>
              </>
            )}
          </Popover>
          <span className="flex-1 text-[11px] muted">Ctrl+Enter para enviar</span>
          <Button variant="primary" onClick={send} disabled={!text.trim()}>
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentCard({
  c,
  parent,
  me,
  onReply,
  onChange,
}: {
  c: Comment;
  parent?: Comment;
  me: User | null;
  onReply: () => void;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.text);
  const reactions = Object.entries(c.reactions ?? {});
  return (
    <div
      className={cx(
        'group rounded-lg border border-line p-2.5',
        c.assigneeId && !c.resolved && 'border-amber-300 bg-amber-50/40',
        c.parentId && 'ml-6',
      )}
    >
      <div className="mb-1 flex items-center gap-2 whitespace-nowrap text-[12px]">
        <Avatar user={c.user} size={22} />
        <span className="font-medium">{c.user?.username ?? 'Usuário'}</span>
        <span className="muted" title={fmtDateTime(c.createdAt)}>
          {fmtAgo(c.createdAt)}
        </span>
        {parent && (
          <span className="truncate text-[11px] muted">↳ resposta a {parent.user?.username}</span>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100">
          {['👍', '✅', '👀'].map((e) => (
            <button
              key={e}
              type="button"
              className="rounded px-1 text-[12px] hover:bg-muted-page"
              onClick={async () => {
                await api.put(`comment/${c.id}`, { reaction: { emoji: e, userId: me?.id } });
                onChange();
              }}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            className="rounded px-1 text-[11px] muted hover:bg-muted-page hover:text-ink"
            onClick={onReply}
          >
            Responder
          </button>
          {c.userId === me?.id && (
            <>
              <button
                type="button"
                className="rounded px-1 text-[11px] muted hover:bg-muted-page hover:text-ink"
                onClick={() => setEditing(true)}
              >
                Editar
              </button>
              <button
                type="button"
                className="rounded px-1 text-[11px] muted hover:text-red-600"
                onClick={async () => {
                  await api.del(`comment/${c.id}`);
                  onChange();
                }}
              >
                Excluir
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <div>
          <textarea
            className={textareaClass}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          <div className="mt-1 flex gap-1">
            <Button
              size="xs"
              variant="primary"
              onClick={async () => {
                await api.put(`comment/${c.id}`, { text });
                setEditing(false);
                onChange();
              }}
            >
              Salvar
            </Button>
            <Button size="xs" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Markdown source={c.text} className="text-[13px]" />
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {reactions.map(([emoji, users]) => (
          <button
            key={emoji}
            type="button"
            className={cx(
              'rounded-full border px-1.5 py-0.5 text-[11px]',
              users.includes(me?.id ?? '') ? 'border-brand-300 bg-brand-50' : 'border-line',
            )}
            onClick={async () => {
              await api.put(`comment/${c.id}`, { reaction: { emoji, userId: me?.id } });
              onChange();
            }}
          >
            {emoji} {users.length}
          </button>
        ))}
        {c.assigneeId && (
          <button
            type="button"
            className={cx(
              'ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
              c.resolved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800',
            )}
            onClick={async () => {
              await api.put(`comment/${c.id}`, { resolved: !c.resolved });
              onChange();
            }}
          >
            <Avatar user={c.assignee} size={14} /> {c.resolved ? 'Resolvido' : 'Resolver'}
          </button>
        )}
      </div>
    </div>
  );
}

export { Clock };
