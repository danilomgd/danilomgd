import { differenceInCalendarDays } from 'date-fns';
import type { CustomField, Status, Task, User, ViewFilter, ViewSettings } from '@/lib/types';
import { PRIORITIES } from '@/lib/types';

export interface Group {
  key: string;
  label: string;
  color: string;
  tasks: Task[];
  /** Patch aplicado a uma tarefa movida para este grupo (drag & drop). */
  patch: Record<string, unknown>;
}

export interface EngineCtx {
  statuses: Status[];
  members: User[];
  fields: CustomField[];
  meId?: string;
}

function taskValue(t: Task, field: string, ctx: EngineCtx): unknown {
  switch (field) {
    case 'name':
      return t.name.toLowerCase();
    case 'status':
      return ctx.statuses.findIndex((s) => s.id === t.statusId);
    case 'priority':
      return t.priority ?? 99;
    case 'due_date':
      return t.dueDate ? new Date(t.dueDate).getTime() : Number.POSITIVE_INFINITY;
    case 'start_date':
      return t.startDate ? new Date(t.startDate).getTime() : Number.POSITIVE_INFINITY;
    case 'created':
      return new Date(t.createdAt).getTime();
    case 'updated':
      return new Date(t.updatedAt).getTime();
    case 'assignee':
      return t.assignees[0]?.username.toLowerCase() ?? 'zzz';
    case 'estimate':
      return t.timeEstimateMs ?? 0;
    case 'order':
      return t.orderIndex;
    default:
      if (field.startsWith('cf:')) {
        const v = t.customFields[field.slice(3)];
        return typeof v === 'string' ? v.toLowerCase() : (v ?? null);
      }
      return null;
  }
}

export function matchFilter(t: Task, f: ViewFilter, ctx: EngineCtx): boolean {
  const now = new Date();
  const val = (() => {
    switch (f.field) {
      case 'status':
        return t.statusId;
      case 'status_type':
        return t.status?.type;
      case 'priority':
        return t.priority;
      case 'assignee':
        return t.assignees.map((a) => a.id);
      case 'tag':
        return t.tags.map((x) => x.name);
      case 'due_date':
        return t.dueDate;
      case 'name':
        return t.name;
      case 'list':
        return t.listId;
      default:
        return f.field.startsWith('cf:') ? t.customFields[f.field.slice(3)] : null;
    }
  })();
  const arr = Array.isArray(val) ? val : [val];
  const wanted: unknown[] = Array.isArray(f.value) ? f.value : [f.value];
  const wantedResolved = wanted.map((w) => (w === 'me' ? ctx.meId : w));
  switch (f.op) {
    case 'eq':
      return arr.some((v) => wantedResolved.includes(v));
    case 'neq':
      return !arr.some((v) => wantedResolved.includes(v));
    case 'in':
      return arr.some((v) => wantedResolved.includes(v));
    case 'nin':
      return !arr.some((v) => wantedResolved.includes(v));
    case 'contains':
      return String(val ?? '')
        .toLowerCase()
        .includes(String(f.value ?? '').toLowerCase());
    case 'is_set':
      return Array.isArray(val) ? val.length > 0 : val !== null && val !== undefined && val !== '';
    case 'not_set':
      return Array.isArray(val)
        ? val.length === 0
        : val === null || val === undefined || val === '';
    case 'lt': {
      if (f.field === 'due_date') {
        if (!t.dueDate) return false;
        if (f.value === 'today') return differenceInCalendarDays(new Date(t.dueDate), now) < 0;
        if (f.value === 'week') return differenceInCalendarDays(new Date(t.dueDate), now) <= 7;
      }
      return Number(val) < Number(f.value);
    }
    case 'gt':
      return Number(val) > Number(f.value);
    case 'between':
      return true;
    default:
      return true;
  }
}

export function applyView(
  tasks: Task[],
  settings: ViewSettings,
  ctx: EngineCtx,
  search = '',
): Task[] {
  let out = tasks;
  if (!settings.showClosed) out = out.filter((t) => t.status?.type !== 'closed');
  for (const f of settings.filters ?? []) out = out.filter((t) => matchFilter(t, f, ctx));
  if (search) {
    const q = search.toLowerCase();
    out = out.filter(
      (t) => t.name.toLowerCase().includes(q) || t.customId.toLowerCase().includes(q),
    );
  }
  const sorts = settings.sortBy?.length
    ? settings.sortBy
    : [{ field: 'order', direction: 'asc' as const }];
  out = [...out].sort((a, b) => {
    for (const s of sorts) {
      const va = taskValue(a, s.field, ctx) as number | string | null;
      const vb = taskValue(b, s.field, ctx) as number | string | null;
      if (va === vb) continue;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const r = va < vb ? -1 : 1;
      return s.direction === 'desc' ? -r : r;
    }
    return 0;
  });
  return out;
}

/** Separa subtarefas conforme a configuração da view. */
export function splitSubtasks(tasks: Task[], mode: ViewSettings['showSubtasks'] = 'collapsed') {
  if (mode === 'separate') return { roots: tasks, children: new Map<string, Task[]>() };
  const ids = new Set(tasks.map((t) => t.id));
  const roots = tasks.filter((t) => !t.parentId || !ids.has(t.parentId));
  const children = new Map<string, Task[]>();
  if (mode !== 'hidden') {
    for (const t of tasks) {
      if (t.parentId && ids.has(t.parentId))
        children.set(t.parentId, [...(children.get(t.parentId) ?? []), t]);
    }
  }
  return { roots: mode === 'hidden' ? tasks.filter((t) => !t.parentId) : roots, children };
}

export function groupTasks(
  tasks: Task[],
  groupBy: ViewSettings['groupBy'] = 'status',
  ctx: EngineCtx,
): Group[] {
  const groups: Group[] = [];
  const push = (key: string, label: string, color: string, patch: Record<string, unknown>) => {
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label, color, tasks: [], patch };
      groups.push(g);
    }
    return g;
  };
  switch (groupBy) {
    case 'none':
      push('all', 'Tarefas', '#87909e', {});
      for (const t of tasks) groups[0].tasks.push(t);
      break;
    case 'status':
      for (const st of ctx.statuses) push(st.id, st.status, st.color, { statusId: st.id });
      for (const t of tasks) {
        const g =
          t.statusId && groups.find((x) => x.key === t.statusId)
            ? groups.find((x) => x.key === t.statusId)!
            : push(
                t.status?.id ?? 'none',
                t.status?.status ?? 'sem status',
                t.status?.color ?? '#c4c9d2',
                t.status ? { statusId: t.status.id } : {},
              );
        g.tasks.push(t);
      }
      break;
    case 'priority':
      for (const [k, v] of Object.entries(PRIORITIES))
        push(k, v.label, v.color, { priority: Number(k) });
      push('none', 'Sem prioridade', '#c4c9d2', { priority: null });
      for (const t of tasks)
        groups.find((g) => g.key === String(t.priority ?? 'none'))!.tasks.push(t);
      break;
    case 'assignee':
      for (const m of ctx.members) push(m.id, m.username, m.color, { assignees: [m.id] });
      push('none', 'Sem responsável', '#c4c9d2', { assignees: [] });
      for (const t of tasks) {
        if (!t.assignees.length) groups.find((g) => g.key === 'none')!.tasks.push(t);
        else
          for (const a of t.assignees)
            (
              groups.find((g) => g.key === a.id) ??
              push(a.id, a.username, a.color, { assignees: [a.id] })
            ).tasks.push(t);
      }
      break;
    case 'due_date': {
      const buckets: [string, string, (d: number | null) => boolean][] = [
        ['overdue', 'Atrasadas', (d) => d !== null && d < 0],
        ['today', 'Hoje', (d) => d === 0],
        ['tomorrow', 'Amanhã', (d) => d === 1],
        ['week', 'Esta semana', (d) => d !== null && d > 1 && d <= 7],
        ['later', 'Depois', (d) => d !== null && d > 7],
        ['none', 'Sem prazo', (d) => d === null],
      ];
      const colors: Record<string, string> = {
        overdue: '#d33',
        today: '#f0a30a',
        tomorrow: '#1090e0',
        week: '#7b68ee',
        later: '#2ea44f',
        none: '#c4c9d2',
      };
      for (const [k, l] of buckets) push(k, l, colors[k], {});
      for (const t of tasks) {
        const d = t.dueDate ? differenceInCalendarDays(new Date(t.dueDate), new Date()) : null;
        const b = buckets.find(([, , fn]) => fn(d))!;
        groups.find((g) => g.key === b[0])!.tasks.push(t);
      }
      break;
    }
    case 'tag': {
      push('none', 'Sem tag', '#c4c9d2', {});
      for (const t of tasks) {
        if (!t.tags.length) groups.find((g) => g.key === 'none')!.tasks.push(t);
        for (const tg of t.tags) push(tg.id, tg.name, tg.bg, { tags: [tg.name] }).tasks.push(t);
      }
      break;
    }
    default: {
      if (groupBy?.startsWith('cf:')) {
        const field = ctx.fields.find((f) => f.id === groupBy.slice(3));
        if (field?.type === 'drop_down' || field?.type === 'labels') {
          for (const o of field.typeConfig.options ?? [])
            push(o.id, o.name, o.color ?? '#7b68ee', {
              customFields: { [field.id]: field.type === 'labels' ? [o.id] : o.id },
            });
          push('none', `Sem ${field.name}`, '#c4c9d2', { customFields: { [field.id]: null } });
          for (const t of tasks) {
            const v = t.customFields[field.id];
            const vals = Array.isArray(v) ? v : v ? [v] : [];
            if (!vals.length) groups.find((g) => g.key === 'none')!.tasks.push(t);
            for (const x of vals) groups.find((g) => g.key === x)?.tasks.push(t);
          }
        } else {
          for (const t of tasks) {
            const v = t.customFields[field?.id ?? ''];
            const key = v === null || v === undefined || v === '' ? 'none' : String(v);
            push(
              key,
              key === 'none' ? `Sem ${field?.name ?? 'valor'}` : String(v),
              key === 'none' ? '#c4c9d2' : '#7b68ee',
              {},
            ).tasks.push(t);
          }
        }
      } else {
        push('all', 'Tarefas', '#87909e', {});
        for (const t of tasks) groups[0].tasks.push(t);
      }
    }
  }
  return groups;
}

export const GROUP_OPTIONS: { value: NonNullable<ViewSettings['groupBy']>; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Responsável' },
  { value: 'priority', label: 'Prioridade' },
  { value: 'due_date', label: 'Prazo' },
  { value: 'tag', label: 'Tag' },
  { value: 'none', label: 'Nenhum' },
];

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'order', label: 'Manual' },
  { value: 'name', label: 'Nome' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Prioridade' },
  { value: 'due_date', label: 'Prazo' },
  { value: 'start_date', label: 'Início' },
  { value: 'assignee', label: 'Responsável' },
  { value: 'created', label: 'Criação' },
  { value: 'updated', label: 'Atualização' },
  { value: 'estimate', label: 'Estimativa' },
];
