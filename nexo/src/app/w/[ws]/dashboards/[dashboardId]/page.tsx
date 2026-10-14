'use client';

import { Plus, Settings2, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { Topbar } from '@/components/shell/topbar';
import { useWorkspace } from '@/components/shell/workspace-context';
import { AvatarStack } from '@/components/ui/avatar';
import { Progress, StatusDot } from '@/components/ui/badges';
import { Button, IconButton } from '@/components/ui/button';
import { ColumnChart, DonutChart, HBarChart, type Series, StatTile } from '@/components/ui/charts';
import { Markdown } from '@/components/ui/markdown';
import { Confirm, Field, inputClass, Modal, textareaClass } from '@/components/ui/modal';
import { MenuItem, Popover } from '@/components/ui/popover';
import { api } from '@/lib/api';
import { cx, fmtDate, fmtDuration } from '@/lib/format';
import { useDashboard, useInvalidate } from '@/lib/hooks';
import type { Goal, Task, Widget, WidgetType } from '@/lib/types';

const WIDGET_TYPES: { type: WidgetType; label: string; w: number; h: number }[] = [
  { type: 'number', label: 'Número (contagem)', w: 3, h: 1 },
  { type: 'tasks_by_status', label: 'Tarefas por status', w: 6, h: 2 },
  { type: 'tasks_by_assignee', label: 'Tarefas por responsável', w: 6, h: 2 },
  { type: 'tasks_by_priority', label: 'Tarefas por prioridade', w: 6, h: 2 },
  { type: 'workload', label: 'Workload (estimativas)', w: 6, h: 2 },
  { type: 'time_tracked', label: 'Tempo registrado', w: 6, h: 2 },
  { type: 'completed_over_time', label: 'Concluídas ao longo do tempo', w: 8, h: 2 },
  { type: 'task_list', label: 'Lista de tarefas', w: 6, h: 2 },
  { type: 'overdue', label: 'Atrasadas', w: 6, h: 2 },
  { type: 'goal_progress', label: 'Progresso de meta', w: 6, h: 1 },
  { type: 'text', label: 'Texto / notas', w: 12, h: 1 },
];

export default function DashboardPage({
  params,
}: {
  params: Promise<{ ws: string; dashboardId: string }>;
}) {
  const { dashboardId } = use(params);
  const { wsId, hierarchy, openTask } = useWorkspace();
  const q = useDashboard(dashboardId);
  const inv = useInvalidate();
  const router = useRouter();
  const [edit, setEdit] = useState<Widget | null>(null);
  const [add, setAdd] = useState(false);
  const [del, setDel] = useState(false);
  const refresh = () => inv.qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
  const d = q.data?.dashboard;
  const data = q.data?.data ?? {};
  const isFav = hierarchy?.favorites.some(
    (f) => f.itemType === 'dashboard' && f.itemId === dashboardId,
  );
  const widgets = [...(d?.widgets ?? [])].sort((a, b) => a.y - b.y || a.x - b.x);

  return (
    <>
      <Topbar
        crumbs={[
          { label: 'Dashboards', href: `/w/${wsId}/dashboards` },
          { label: d?.name ?? '...' },
        ]}
        actions={
          <>
            <IconButton
              label="Favoritar"
              onClick={async () => {
                await api.post(`team/${wsId}/favorite`, {
                  itemType: 'dashboard',
                  itemId: dashboardId,
                });
                inv.hierarchy();
              }}
            >
              <Star size={16} className={isFav ? 'fill-amber-400 text-amber-400' : ''} />
            </IconButton>
            <IconButton label="Excluir dashboard" onClick={() => setDel(true)}>
              <Trash2 size={16} />
            </IconButton>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setAdd(true)}
            >
              Widget
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto bg-muted-page">
        <div className="px-5 py-4">
          <input
            className="mb-3 bg-transparent text-[20px] font-semibold outline-none"
            defaultValue={d?.name ?? ''}
            onBlur={async (e) => {
              if (d && e.target.value.trim() && e.target.value !== d.name) {
                await api.put(`dashboard/${d.id}`, { name: e.target.value.trim() });
                refresh();
                inv.hierarchy();
              }
            }}
          />
          <div className="grid auto-rows-[150px] grid-cols-12 gap-3">
            {widgets.map((w) => (
              <div
                key={w.id}
                className="group flex flex-col rounded-lg border border-line bg-page p-3"
                style={{ gridColumn: `span ${Math.min(12, w.w)}`, gridRow: `span ${w.h}` }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="truncate text-[12px] font-semibold">{w.title}</span>
                  <Popover
                    align="end"
                    triggerClassName="ml-auto opacity-0 group-hover:opacity-100"
                    trigger={
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded muted hover:bg-muted-page">
                        <Settings2 size={13} />
                      </span>
                    }
                  >
                    {(close) => (
                      <>
                        <MenuItem
                          onClick={() => {
                            close();
                            setEdit(w);
                          }}
                        >
                          Configurar
                        </MenuItem>
                        <MenuItem
                          onClick={async () => {
                            close();
                            await api.put(`widget/${w.id}`, { w: w.w >= 12 ? 3 : w.w + 3 });
                            refresh();
                          }}
                        >
                          Alterar largura
                        </MenuItem>
                        <MenuItem
                          onClick={async () => {
                            close();
                            await api.put(`widget/${w.id}`, { h: w.h >= 3 ? 1 : w.h + 1 });
                            refresh();
                          }}
                        >
                          Alterar altura
                        </MenuItem>
                        <MenuItem
                          danger
                          onClick={async () => {
                            close();
                            await api.del(`widget/${w.id}`);
                            refresh();
                          }}
                        >
                          Remover
                        </MenuItem>
                      </>
                    )}
                  </Popover>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  <WidgetBody w={w} data={data[w.id]} openTask={openTask} />
                </div>
              </div>
            ))}
          </div>
          {d && widgets.length === 0 && (
            <div className="rounded-lg border border-dashed border-line p-10 text-center text-[13px] muted">
              Dashboard vazio. Adicione um widget.
            </div>
          )}
        </div>
      </div>
      <WidgetDialog
        open={add || !!edit}
        widget={edit}
        dashboardId={dashboardId}
        onClose={() => {
          setAdd(false);
          setEdit(null);
        }}
        onSaved={refresh}
      />
      <Confirm
        open={del}
        onClose={() => setDel(false)}
        title="Excluir dashboard?"
        onConfirm={async () => {
          await api.del(`dashboard/${dashboardId}`);
          inv.hierarchy();
          router.push(`/w/${wsId}/dashboards`);
        }}
      />
    </>
  );
}

function WidgetBody({
  w,
  data,
  openTask,
}: {
  w: Widget;
  data: unknown;
  openTask: (id: string) => void;
}) {
  // biome-ignore lint/suspicious/noExplicitAny: formato varia por tipo de widget
  const d = (data ?? {}) as any;
  switch (w.type) {
    case 'number':
      return (
        <StatTile
          value={d.value ?? 0}
          label={
            {
              open: 'abertas',
              closed: 'concluídas',
              overdue: 'atrasadas',
              mine: 'minhas',
              all: 'tarefas',
            }[w.config.filter ?? 'all'] ?? ''
          }
          tone={w.config.filter === 'overdue' && d.value > 0 ? 'text-red-600' : undefined}
        />
      );
    case 'tasks_by_status':
      return w.h >= 2 ? (
        <DonutChart series={d.series ?? []} />
      ) : (
        <HBarChart series={d.series ?? []} />
      );
    case 'tasks_by_priority':
      return <HBarChart series={d.series ?? []} />;
    case 'tasks_by_assignee':
      return <HBarChart series={d.series ?? []} />;
    case 'workload':
      return (
        <HBarChart
          series={(d.series ?? []).map((s: Series & { estimate: number }) => ({
            ...s,
            value: s.estimate,
          }))}
          format={(v) => fmtDuration(v)}
        />
      );
    case 'time_tracked':
      return (
        <div>
          <div className="mb-2 flex gap-4">
            <StatTile value={fmtDuration(d.totalMs ?? 0)} label="total" />
            <StatTile
              value={fmtDuration(d.billableMs ?? 0)}
              label="faturável"
              tone="text-emerald-700"
            />
          </div>
          <HBarChart series={d.series ?? []} format={(v) => fmtDuration(v)} />
        </div>
      );
    case 'completed_over_time':
      return (
        <div>
          <div className="mb-1 text-[11px] muted">{d.total ?? 0} concluída(s) no período</div>
          <ColumnChart series={d.series ?? []} color="#2ea44f" height={w.h >= 2 ? 150 : 70} />
        </div>
      );
    case 'task_list':
    case 'overdue':
      return (
        <div className="divide-y divide-[var(--border)]">
          {(d.tasks ?? []).map((t: Task) => (
            <button
              key={t.id}
              type="button"
              className="flex w-full items-center gap-2 py-1.5 text-left text-[12.5px] row-hover"
              onClick={() => openTask(t.id)}
            >
              <StatusDot status={t.status} />
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              <AvatarStack users={t.assignees} size={18} max={2} />
              <span
                className={cx(
                  'w-16 text-right text-[11px]',
                  t.dueDate && new Date(t.dueDate) < new Date() ? 'text-red-600' : 'muted',
                )}
              >
                {t.dueDate ? fmtDate(t.dueDate) : ''}
              </span>
            </button>
          ))}
          {(d.tasks ?? []).length === 0 && (
            <div className="py-4 text-center text-[12px] muted">Nenhuma tarefa.</div>
          )}
        </div>
      );
    case 'goal_progress': {
      const g = d.goal as Goal | null;
      if (!g) return <div className="text-[12px] muted">Selecione uma meta em "Configurar".</div>;
      return (
        <div>
          <div className="mb-1 flex items-center justify-between text-[12px]">
            <span className="truncate font-medium">{g.name}</span>
            <span className="font-semibold">{g.percent}%</span>
          </div>
          <Progress value={g.percent} color={g.color} height={8} />
          {w.h >= 2 && (
            <div className="mt-2 space-y-1">
              {g.keyResults.map((k) => (
                <div key={k.id} className="flex items-center gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate muted">{k.name}</span>
                  <div className="w-24">
                    <Progress value={k.percent} color={g.color} height={4} />
                  </div>
                  <span className="w-8 text-right tabular-nums">{k.percent}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'text':
      return <Markdown source={d.text ?? ''} className="text-[13px]" />;
  }
}

function WidgetDialog({
  open,
  widget,
  dashboardId,
  onClose,
  onSaved,
}: {
  open: boolean;
  widget: Widget | null;
  dashboardId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { wsId, hierarchy } = useWorkspace();
  const [type, setType] = useState<WidgetType>(widget?.type ?? 'number');
  const [title, setTitle] = useState(widget?.title ?? '');
  const [spaceIds, setSpaceIds] = useState<string[]>(widget?.config.spaceIds ?? []);
  const [listIds, setListIds] = useState<string[]>(widget?.config.listIds ?? []);
  const [filter, setFilter] = useState(widget?.config.filter ?? 'open');
  const [days, setDays] = useState(widget?.config.days ?? 14);
  const [text, setText] = useState(widget?.config.text ?? '');
  const [goalId, setGoalId] = useState(widget?.config.goalId ?? '');
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [key, setKey] = useState(widget?.id ?? 'new');
  if (open && key !== (widget?.id ?? 'new')) {
    setKey(widget?.id ?? 'new');
    setType(widget?.type ?? 'number');
    setTitle(widget?.title ?? '');
    setSpaceIds(widget?.config.spaceIds ?? []);
    setListIds(widget?.config.listIds ?? []);
    setFilter(widget?.config.filter ?? 'open');
    setDays(widget?.config.days ?? 14);
    setText(widget?.config.text ?? '');
    setGoalId(widget?.config.goalId ?? '');
  }
  if (open && goals === null)
    api.get<{ goals: Goal[] }>(`team/${wsId}/goal`).then((r) => setGoals(r.goals));
  const save = async () => {
    const def = WIDGET_TYPES.find((t) => t.type === type)!;
    const config = { spaceIds, listIds, filter, days, text, goalId: goalId || undefined };
    if (widget) await api.put(`widget/${widget.id}`, { type, title: title || def.label, config });
    else
      await api.post(`dashboard/${dashboardId}/widget`, {
        type,
        title: title || def.label,
        config,
        w: def.w,
        h: def.h,
      });
    onSaved();
    onClose();
  };
  const lists =
    hierarchy?.spaces.flatMap((s) =>
      [...s.lists, ...s.folders.flatMap((f) => f.lists)].map((l) => ({ ...l, spaceName: s.name })),
    ) ?? [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={widget ? 'Configurar widget' : 'Novo widget'}
      width={560}
    >
      <div className="space-y-4 p-4">
        <Field label="Tipo">
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as WidgetType)}
          >
            {WIDGET_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Título">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={WIDGET_TYPES.find((t) => t.type === type)?.label}
          />
        </Field>
        {type === 'text' ? (
          <Field label="Texto (markdown)">
            <textarea
              className={textareaClass}
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
        ) : type === 'goal_progress' ? (
          <Field label="Meta">
            <select
              className={inputClass}
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">Selecione</option>
              {goals?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Spaces (vazio = todos)">
              <div className="flex flex-wrap gap-1">
                {hierarchy?.spaces.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setSpaceIds((x) =>
                        x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id],
                      )
                    }
                    className={cx(
                      'rounded-md border px-2 py-0.5 text-[12px]',
                      spaceIds.includes(s.id)
                        ? 'border-brand-400 bg-brand-50 text-brand-700'
                        : 'border-line',
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Listas (vazio = todas)">
              <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
                {lists.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() =>
                      setListIds((x) =>
                        x.includes(l.id) ? x.filter((y) => y !== l.id) : [...x, l.id],
                      )
                    }
                    className={cx(
                      'rounded-md border px-2 py-0.5 text-[12px]',
                      listIds.includes(l.id)
                        ? 'border-brand-400 bg-brand-50 text-brand-700'
                        : 'border-line',
                    )}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </Field>
            {(type === 'number' || type === 'task_list') && (
              <Field label="Filtro">
                <select
                  className={inputClass}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                >
                  <option value="open">Abertas</option>
                  <option value="closed">Concluídas</option>
                  <option value="overdue">Atrasadas</option>
                  <option value="mine">Minhas</option>
                  <option value="all">Todas</option>
                </select>
              </Field>
            )}
            {(type === 'completed_over_time' ||
              type === 'time_tracked' ||
              (type === 'number' && filter === 'closed')) && (
              <Field label="Período (dias)">
                <input
                  type="number"
                  className={inputClass}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              </Field>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
