'use client';

import {
  ArrowUpDown,
  Calendar,
  CheckSquare,
  ChevronDown,
  Columns3,
  Filter,
  GanttChart,
  Kanban,
  Layers,
  List as ListIcon,
  Plus,
  Search,
  Settings2,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import { useInvalidate } from '@/lib/hooks';
import {
  type CustomField,
  PRIORITIES,
  type Status,
  type User,
  type View,
  type ViewFilter,
  type ViewSettings,
  type ViewType,
} from '@/lib/types';
import { useWorkspace } from '../shell/workspace-context';
import { Avatar } from '../ui/avatar';
import { StatusDot } from '../ui/badges';
import { Button } from '../ui/button';
import { Field, inputClass, Modal } from '../ui/modal';
import { MenuItem, MenuLabel, MenuSeparator, Popover } from '../ui/popover';
import { GROUP_OPTIONS, SORT_OPTIONS } from './view-engine';

export const VIEW_ICONS: Record<string, React.ReactNode> = {
  list: <ListIcon size={14} />,
  board: <Kanban size={14} />,
  calendar: <Calendar size={14} />,
  gantt: <GanttChart size={14} />,
  table: <Table2 size={14} />,
  timeline: <GanttChart size={14} />,
  activity: <Layers size={14} />,
  workload: <Columns3 size={14} />,
};
const VIEW_LABELS: Record<string, string> = {
  list: 'Lista',
  board: 'Quadro',
  calendar: 'Calendário',
  gantt: 'Gantt',
  table: 'Tabela',
};

interface Props {
  views: View[];
  current: View;
  onSelect: (id: string) => void;
  settings: ViewSettings;
  onSettings: (s: ViewSettings) => void;
  search: string;
  onSearch: (q: string) => void;
  onNewTask: () => void;
  statuses: Status[];
  members: User[];
  fields: CustomField[];
  parent: { type: 'workspace' | 'space' | 'folder' | 'list'; id: string };
  count: number;
}

export function ViewBar(p: Props) {
  const { wsId } = useWorkspace();
  const inv = useInvalidate();
  const [addView, setAddView] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ViewType>('list');
  const s = p.settings;
  const set = (patch: Partial<ViewSettings>) => p.onSettings({ ...s, ...patch });
  const filters = s.filters ?? [];
  const sort = s.sortBy?.[0];

  const createView = async () => {
    const path =
      p.parent.type === 'workspace'
        ? `team/${p.parent.id}/view`
        : `${p.parent.type}/${p.parent.id}/view?workspaceId=${wsId}`;
    const v = await api.post<View>(path, {
      name: name.trim() || VIEW_LABELS[type] || type,
      type,
      settings: { groupBy: type === 'board' ? 'status' : 'status', showSubtasks: 'collapsed' },
    });
    inv.hierarchy();
    inv.qc.invalidateQueries({ queryKey: ['views'] });
    setAddView(false);
    setName('');
    p.onSelect(v.id);
  };

  return (
    <div className="shrink-0 border-b border-line bg-page">
      <div className="flex items-center gap-1 overflow-x-auto px-3">
        {p.views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => p.onSelect(v.id)}
            className={cx(
              'flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium',
              v.id === p.current.id
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent muted hover:text-ink',
            )}
          >
            {VIEW_ICONS[v.type] ?? <ListIcon size={14} />} {v.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAddView(true)}
          className="flex h-10 shrink-0 items-center gap-1 px-2 text-[13px] muted hover:text-ink"
        >
          <Plus size={14} /> Visualização
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1 py-1.5">
          <Popover
            align="end"
            trigger={
              <span className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] muted hover:bg-muted-page hover:text-ink">
                <Settings2 size={13} /> Opções
              </span>
            }
          >
            <div className="w-56">
              <MenuLabel>Subtarefas</MenuLabel>
              {(['collapsed', 'expanded', 'separate', 'hidden'] as const).map((m) => (
                <MenuItem
                  key={m}
                  active={(s.showSubtasks ?? 'collapsed') === m}
                  onClick={() => set({ showSubtasks: m })}
                >
                  {
                    {
                      collapsed: 'Recolhidas',
                      expanded: 'Expandidas',
                      separate: 'Como tarefas separadas',
                      hidden: 'Ocultas',
                    }[m]
                  }
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                active={!!s.showClosed}
                icon={<CheckSquare size={13} />}
                onClick={() => set({ showClosed: !s.showClosed })}
              >
                Mostrar concluídas
              </MenuItem>
              {!p.current.protected && (
                <>
                  <MenuSeparator />
                  <MenuItem
                    danger
                    icon={<Trash2 size={13} />}
                    onClick={async () => {
                      await api.del(`view/${p.current.id}`);
                      inv.hierarchy();
                      inv.qc.invalidateQueries({ queryKey: ['views'] });
                      p.onSelect(p.views[0].id);
                    }}
                  >
                    Excluir visualização
                  </MenuItem>
                </>
              )}
            </div>
          </Popover>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={p.onNewTask}>
            Tarefa
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5">
        <Popover
          trigger={
            <span
              className={cx(
                'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] hover:bg-muted-page',
                filters.length ? 'bg-brand-50 text-brand-700' : 'muted',
              )}
            >
              <Filter size={13} /> Filtro{filters.length ? ` (${filters.length})` : ''}
            </span>
          }
          className="w-80"
        >
          <FilterEditor
            filters={filters}
            onChange={(f) => set({ filters: f })}
            statuses={p.statuses}
            members={p.members}
            fields={p.fields}
          />
        </Popover>
        {p.current.type !== 'calendar' && p.current.type !== 'gantt' && (
          <Popover
            trigger={
              <span className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] muted hover:bg-muted-page">
                <Layers size={13} /> Agrupar:{' '}
                {GROUP_OPTIONS.find((g) => g.value === (s.groupBy ?? 'status'))?.label ??
                  p.fields.find((f) => `cf:${f.id}` === s.groupBy)?.name ??
                  'Status'}
              </span>
            }
          >
            {(close) => (
              <div className="w-48">
                {GROUP_OPTIONS.map((g) => (
                  <MenuItem
                    key={g.value}
                    active={(s.groupBy ?? 'status') === g.value}
                    onClick={() => {
                      set({ groupBy: g.value });
                      close();
                    }}
                  >
                    {g.label}
                  </MenuItem>
                ))}
                {p.fields.filter((f) => f.type === 'drop_down' || f.type === 'labels').length >
                  0 && <MenuSeparator />}
                {p.fields
                  .filter((f) => f.type === 'drop_down' || f.type === 'labels')
                  .map((f) => (
                    <MenuItem
                      key={f.id}
                      active={s.groupBy === `cf:${f.id}`}
                      onClick={() => {
                        set({ groupBy: `cf:${f.id}` });
                        close();
                      }}
                    >
                      {f.name}
                    </MenuItem>
                  ))}
              </div>
            )}
          </Popover>
        )}
        <Popover
          trigger={
            <span
              className={cx(
                'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] hover:bg-muted-page',
                sort && sort.field !== 'order' ? 'bg-brand-50 text-brand-700' : 'muted',
              )}
            >
              <ArrowUpDown size={13} /> Ordenar
              {sort && sort.field !== 'order'
                ? `: ${SORT_OPTIONS.find((o) => o.value === sort.field)?.label}`
                : ''}
            </span>
          }
        >
          {(close) => (
            <div className="w-48">
              {SORT_OPTIONS.map((o) => (
                <MenuItem
                  key={o.value}
                  active={sort?.field === o.value}
                  onClick={() => {
                    set({
                      sortBy:
                        o.value === 'order'
                          ? []
                          : [
                              {
                                field: o.value,
                                direction:
                                  sort?.field === o.value && sort.direction === 'asc'
                                    ? 'desc'
                                    : 'asc',
                              },
                            ],
                    });
                    close();
                  }}
                >
                  <span className="flex items-center justify-between">
                    {o.label}
                    {sort?.field === o.value && (
                      <span className="text-[10px] muted">
                        {sort.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </span>
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>
        <button
          type="button"
          onClick={() => set({ showClosed: !s.showClosed })}
          className={cx(
            'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] hover:bg-muted-page',
            s.showClosed ? 'bg-brand-50 text-brand-700' : 'muted',
          )}
        >
          <CheckSquare size={13} /> Concluídas
        </button>
        <span className="ml-1 text-[12px] muted">
          {p.count} tarefa{p.count === 1 ? '' : 's'}
        </span>
        <label className="ml-auto flex h-7 items-center gap-1 rounded-md surface px-2 text-[12px]">
          <Search size={13} className="muted" />
          <input
            className="w-36 bg-transparent outline-none"
            placeholder="Buscar nesta view"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
          />
          {p.search && (
            <button type="button" onClick={() => p.onSearch('')} aria-label="Limpar">
              <X size={12} />
            </button>
          )}
        </label>
      </div>
      <Modal open={addView} onClose={() => setAddView(false)} title="Nova visualização" width={520}>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-5 gap-2">
            {(['list', 'board', 'calendar', 'gantt', 'table'] as ViewType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cx(
                  'flex flex-col items-center gap-1 rounded-lg border p-3 text-[12px]',
                  type === t
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-line hover:bg-muted-page',
                )}
              >
                {VIEW_ICONS[t]} {VIEW_LABELS[t]}
              </button>
            ))}
          </div>
          <Field label="Nome">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={VIEW_LABELS[type]}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAddView(false)}>Cancelar</Button>
            <Button variant="primary" onClick={createView}>
              Criar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const FILTER_FIELDS = [
  { value: 'status', label: 'Status' },
  { value: 'status_type', label: 'Tipo de status' },
  { value: 'assignee', label: 'Responsável' },
  { value: 'priority', label: 'Prioridade' },
  { value: 'due_date', label: 'Prazo' },
  { value: 'tag', label: 'Tag' },
  { value: 'name', label: 'Nome' },
];

function FilterEditor({
  filters,
  onChange,
  statuses,
  members,
  fields,
}: {
  filters: ViewFilter[];
  onChange: (f: ViewFilter[]) => void;
  statuses: Status[];
  members: User[];
  fields: CustomField[];
}) {
  const update = (i: number, f: ViewFilter) => onChange(filters.map((x, j) => (j === i ? f : x)));
  const remove = (i: number) => onChange(filters.filter((_, j) => j !== i));
  const allFields = [
    ...FILTER_FIELDS,
    ...fields.map((f) => ({ value: `cf:${f.id}`, label: f.name })),
  ];
  return (
    <div className="p-1">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold">Filtros</span>
        {filters.length > 0 && (
          <button
            type="button"
            className="text-[11px] muted hover:text-ink"
            onClick={() => onChange([])}
          >
            Limpar
          </button>
        )}
      </div>
      <div className="space-y-2">
        {filters.map((f, i) => (
          <div key={i} className="rounded-md border border-line p-2">
            <div className="mb-1 flex items-center gap-1">
              <select
                className="h-7 flex-1 rounded surface px-1 text-[12px]"
                value={f.field}
                onChange={(e) =>
                  update(i, {
                    field: e.target.value,
                    op: e.target.value === 'name' ? 'contains' : 'in',
                    value: e.target.value === 'name' ? '' : [],
                  })
                }
              >
                {allFields.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
              <select
                className="h-7 rounded surface px-1 text-[12px]"
                value={f.op}
                onChange={(e) => update(i, { ...f, op: e.target.value as ViewFilter['op'] })}
              >
                {f.field === 'name' ? (
                  <option value="contains">contém</option>
                ) : f.field === 'due_date' ? (
                  <>
                    <option value="lt">antes de</option>
                    <option value="is_set">definido</option>
                    <option value="not_set">não definido</option>
                  </>
                ) : (
                  <>
                    <option value="in">é</option>
                    <option value="nin">não é</option>
                    <option value="is_set">definido</option>
                    <option value="not_set">não definido</option>
                  </>
                )}
              </select>
              <button
                type="button"
                className="muted hover:text-red-600"
                onClick={() => remove(i)}
                aria-label="Remover filtro"
              >
                <X size={13} />
              </button>
            </div>
            <FilterValue
              f={f}
              onChange={(v) => update(i, { ...f, value: v })}
              statuses={statuses}
              members={members}
              fields={fields}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-1 text-[12px] text-brand-600 hover:underline"
        onClick={() => onChange([...filters, { field: 'status', op: 'in', value: [] }])}
      >
        <Plus size={12} /> Adicionar filtro
      </button>
      <MenuSeparator />
      <MenuLabel>Atalhos</MenuLabel>
      <MenuItem onClick={() => onChange([{ field: 'assignee', op: 'in', value: ['me'] }])}>
        Minhas tarefas
      </MenuItem>
      <MenuItem onClick={() => onChange([{ field: 'due_date', op: 'lt', value: 'today' }])}>
        Atrasadas
      </MenuItem>
      <MenuItem onClick={() => onChange([{ field: 'priority', op: 'in', value: [1, 2] }])}>
        Urgente ou alta
      </MenuItem>
    </div>
  );
}

function FilterValue({
  f,
  onChange,
  statuses,
  members,
  fields,
}: {
  f: ViewFilter;
  onChange: (v: unknown) => void;
  statuses: Status[];
  members: User[];
  fields: CustomField[];
}) {
  if (f.op === 'is_set' || f.op === 'not_set') return null;
  const vals = Array.isArray(f.value) ? (f.value as unknown[]) : [];
  const toggle = (v: unknown) =>
    onChange(vals.includes(v) ? vals.filter((x) => x !== v) : [...vals, v]);
  const chip = (key: string, label: React.ReactNode, v: unknown) => (
    <button
      key={key}
      type="button"
      onClick={() => toggle(v)}
      className={cx(
        'inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px]',
        vals.includes(v)
          ? 'border-brand-400 bg-brand-50 text-brand-700'
          : 'border-line hover:bg-muted-page',
      )}
    >
      {label}
    </button>
  );
  if (f.field === 'name')
    return (
      <input
        className={inputClass}
        placeholder="texto"
        value={String(f.value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (f.field === 'due_date')
    return (
      <select
        className="h-7 w-full rounded surface px-1 text-[12px]"
        value={String(f.value ?? 'today')}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="today">hoje (atrasadas)</option>
        <option value="week">próximos 7 dias</option>
      </select>
    );
  if (f.field === 'status')
    return (
      <div className="flex flex-wrap gap-1">
        {statuses.map((s) =>
          chip(
            s.id,
            <>
              <StatusDot status={s} size={8} /> {s.status}
            </>,
            s.id,
          ),
        )}
      </div>
    );
  if (f.field === 'status_type')
    return (
      <div className="flex flex-wrap gap-1">
        {['open', 'custom', 'done', 'closed'].map((t) => chip(t, t, t))}
      </div>
    );
  if (f.field === 'assignee')
    return (
      <div className="flex flex-wrap gap-1">
        {chip('me', 'Eu', 'me')}
        {members.map((m) =>
          chip(
            m.id,
            <>
              <Avatar user={m} size={14} /> {m.username.split(' ')[0]}
            </>,
            m.id,
          ),
        )}
      </div>
    );
  if (f.field === 'priority')
    return (
      <div className="flex flex-wrap gap-1">
        {Object.entries(PRIORITIES).map(([k, v]) => chip(k, v.label, Number(k)))}
      </div>
    );
  if (f.field === 'tag')
    return (
      <input
        className={inputClass}
        placeholder="nome da tag (Enter)"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            toggle((e.target as HTMLInputElement).value.toLowerCase());
            (e.target as HTMLInputElement).value = '';
          }
        }}
      />
    );
  if (f.field.startsWith('cf:')) {
    const field = fields.find((x) => `cf:${x.id}` === f.field);
    if (field?.typeConfig.options)
      return (
        <div className="flex flex-wrap gap-1">
          {field.typeConfig.options.map((o) => chip(o.id, o.name, o.id))}
        </div>
      );
    return (
      <input
        className={inputClass}
        placeholder="valor"
        value={String(vals[0] ?? '')}
        onChange={(e) => onChange([e.target.value])}
      />
    );
  }
  return null;
}

export { ChevronDown };
