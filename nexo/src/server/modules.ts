/** Docs, Metas, Dashboards e Busca. */

import { subDays } from 'date-fns';
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { getDb, schema as s } from '@/db/client';
import { newId } from '@/lib/ids';
import { notFound } from './http';
import { queryTasks } from './tasks';

// ---------------------------------------------------------------- Docs

export async function getDocs(workspaceId: string) {
  const db = await getDb();
  const rows = await db.query.docs.findMany({
    where: and(eq(s.docs.workspaceId, workspaceId), eq(s.docs.archived, false)),
    orderBy: desc(s.docs.updatedAt),
    with: {
      creator: true,
      pages: {
        columns: { id: true, name: true, parentPageId: true, position: true },
        orderBy: asc(s.docPages.position),
      },
    },
  });
  return rows;
}

export async function getDoc(id: string) {
  const db = await getDb();
  const doc = await db.query.docs.findFirst({
    where: eq(s.docs.id, id),
    with: { creator: true, pages: { orderBy: asc(s.docPages.position) } },
  });
  if (!doc) throw notFound('Documento');
  return doc;
}

export async function createDoc(
  workspaceId: string,
  input: {
    name: string;
    parentType?: 'workspace' | 'space' | 'folder' | 'list' | 'task';
    parentId?: string | null;
    icon?: string;
  },
  userId: string,
) {
  const db = await getDb();
  const id = newId();
  await db.insert(s.docs).values({
    id,
    workspaceId,
    name: input.name,
    parentType: input.parentType ?? 'workspace',
    parentId: input.parentId ?? null,
    icon: input.icon,
    createdBy: userId,
  });
  await db.insert(s.docPages).values({
    id: newId(),
    docId: id,
    name: input.name,
    content: `# ${input.name}\n\n`,
    position: 0,
  });
  return getDoc(id);
}

export async function updateDoc(
  id: string,
  input: Partial<{
    name: string;
    icon: string | null;
    archived: boolean;
    parentType: 'workspace' | 'space' | 'folder' | 'list' | 'task';
    parentId: string | null;
  }>,
) {
  const db = await getDb();
  await db
    .update(s.docs)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(s.docs.id, id));
  return getDoc(id);
}

export async function deleteDoc(id: string) {
  const db = await getDb();
  await db.delete(s.docs).where(eq(s.docs.id, id));
}

export async function createPage(
  docId: string,
  input: { name: string; content?: string; parentPageId?: string | null; subtitle?: string },
) {
  const db = await getDb();
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${s.docPages.position}),0)` })
    .from(s.docPages)
    .where(eq(s.docPages.docId, docId));
  const [p] = await db
    .insert(s.docPages)
    .values({
      id: newId(),
      docId,
      name: input.name,
      subtitle: input.subtitle,
      content: input.content ?? `# ${input.name}\n\n`,
      parentPageId: input.parentPageId ?? null,
      position: Number(max.m) + 1,
    })
    .returning();
  await db.update(s.docs).set({ updatedAt: new Date() }).where(eq(s.docs.id, docId));
  return p;
}

export async function updatePage(
  id: string,
  input: Partial<{
    name: string;
    subtitle: string | null;
    content: string;
    parentPageId: string | null;
    position: number;
  }>,
) {
  const db = await getDb();
  const [p] = await db
    .update(s.docPages)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(s.docPages.id, id))
    .returning();
  if (!p) throw notFound('Página');
  await db.update(s.docs).set({ updatedAt: new Date() }).where(eq(s.docs.id, p.docId));
  return p;
}

export async function deletePage(id: string) {
  const db = await getDb();
  await db.delete(s.docPages).where(eq(s.docPages.id, id));
}

// ---------------------------------------------------------------- Metas

function krProgress(kr: typeof s.keyResults.$inferSelect) {
  if (kr.type === 'boolean') return kr.completed ? 100 : 0;
  const span = kr.stepsEnd - kr.stepsStart;
  if (span === 0) return kr.completed ? 100 : 0;
  const pct = ((kr.stepsCurrent - kr.stepsStart) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

async function withTaskProgress(kr: typeof s.keyResults.$inferSelect) {
  if (kr.type !== 'task' || !kr.taskIds.length) return { ...kr, percent: krProgress(kr) };
  const db = await getDb();
  const rows = await db.query.tasks.findMany({
    where: inArray(s.tasks.id, kr.taskIds),
    with: { status: true },
  });
  const done = rows.filter((t) => t.status?.type === 'closed').length;
  return {
    ...kr,
    stepsCurrent: done,
    stepsEnd: rows.length || kr.stepsEnd,
    percent: rows.length ? Math.round((done / rows.length) * 100) : 0,
    tasks: rows.map((t) => ({ id: t.id, name: t.name, customId: t.customId, status: t.status })),
  };
}

export async function getGoals(workspaceId: string) {
  const db = await getDb();
  const rows = await db.query.goals.findMany({
    where: and(eq(s.goals.workspaceId, workspaceId), eq(s.goals.archived, false)),
    orderBy: asc(s.goals.createdAt),
    with: { owner: true, keyResults: true },
  });
  return Promise.all(
    rows.map(async (g) => {
      const keyResults = await Promise.all(g.keyResults.map(withTaskProgress));
      const percent = keyResults.length
        ? Math.round(keyResults.reduce((a, k) => a + k.percent, 0) / keyResults.length)
        : 0;
      return { ...g, keyResults, percent };
    }),
  );
}

export async function getGoal(id: string) {
  const db = await getDb();
  const g = await db.query.goals.findFirst({
    where: eq(s.goals.id, id),
    with: { owner: true, keyResults: true },
  });
  if (!g) throw notFound('Meta');
  const keyResults = await Promise.all(g.keyResults.map(withTaskProgress));
  const percent = keyResults.length
    ? Math.round(keyResults.reduce((a, k) => a + k.percent, 0) / keyResults.length)
    : 0;
  return { ...g, keyResults, percent };
}

export async function createGoal(
  workspaceId: string,
  input: {
    name: string;
    description?: string;
    color?: string;
    dueDate?: string | null;
    ownerId?: string | null;
    folderName?: string | null;
  },
  userId: string,
) {
  const db = await getDb();
  const id = newId();
  await db.insert(s.goals).values({
    id,
    workspaceId,
    name: input.name,
    description: input.description ?? '',
    color: input.color ?? '#7b68ee',
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    ownerId: input.ownerId ?? userId,
    folderName: input.folderName ?? null,
  });
  return getGoal(id);
}

export async function updateGoal(
  id: string,
  input: Partial<{
    name: string;
    description: string;
    color: string;
    dueDate: string | null;
    ownerId: string | null;
    archived: boolean;
    folderName: string | null;
  }>,
) {
  const db = await getDb();
  const { dueDate, ...rest } = input;
  await db
    .update(s.goals)
    .set({
      ...rest,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
    })
    .where(eq(s.goals.id, id));
  return getGoal(id);
}

export async function deleteGoal(id: string) {
  const db = await getDb();
  await db.delete(s.goals).where(eq(s.goals.id, id));
}

export async function createKeyResult(
  goalId: string,
  input: {
    name: string;
    type?: 'number' | 'currency' | 'boolean' | 'percentage' | 'task';
    stepsStart?: number;
    stepsEnd?: number;
    stepsCurrent?: number;
    unit?: string;
    taskIds?: string[];
  },
) {
  const db = await getDb();
  await db.insert(s.keyResults).values({
    id: newId(),
    goalId,
    name: input.name,
    type: input.type ?? 'number',
    stepsStart: input.stepsStart ?? 0,
    stepsEnd: input.stepsEnd ?? 100,
    stepsCurrent: input.stepsCurrent ?? input.stepsStart ?? 0,
    unit: input.unit,
    taskIds: input.taskIds ?? [],
  });
  return getGoal(goalId);
}

export async function updateKeyResult(
  id: string,
  input: Partial<{
    name: string;
    stepsCurrent: number;
    stepsEnd: number;
    stepsStart: number;
    completed: boolean;
    unit: string | null;
    taskIds: string[];
  }>,
) {
  const db = await getDb();
  const [k] = await db.update(s.keyResults).set(input).where(eq(s.keyResults.id, id)).returning();
  if (!k) throw notFound('Resultado-chave');
  return getGoal(k.goalId);
}

export async function deleteKeyResult(id: string) {
  const db = await getDb();
  const k = await db.query.keyResults.findFirst({ where: eq(s.keyResults.id, id) });
  if (!k) throw notFound('Resultado-chave');
  await db.delete(s.keyResults).where(eq(s.keyResults.id, id));
  return getGoal(k.goalId);
}

// ---------------------------------------------------------------- Dashboards

export async function getDashboards(workspaceId: string) {
  const db = await getDb();
  return db.query.dashboards.findMany({
    where: eq(s.dashboards.workspaceId, workspaceId),
    orderBy: asc(s.dashboards.createdAt),
    with: { widgets: true },
  });
}

export async function getDashboard(id: string) {
  const db = await getDb();
  const d = await db.query.dashboards.findFirst({
    where: eq(s.dashboards.id, id),
    with: { widgets: true },
  });
  if (!d) throw notFound('Dashboard');
  return d;
}

export async function createDashboard(
  workspaceId: string,
  input: { name: string },
  userId: string,
) {
  const db = await getDb();
  const id = newId();
  await db.insert(s.dashboards).values({ id, workspaceId, name: input.name, createdBy: userId });
  await db.insert(s.dashboardWidgets).values([
    {
      id: newId(),
      dashboardId: id,
      type: 'number',
      title: 'Tarefas abertas',
      config: { filter: 'open' },
      x: 0,
      y: 0,
      w: 3,
      h: 1,
    },
    {
      id: newId(),
      dashboardId: id,
      type: 'number',
      title: 'Atrasadas',
      config: { filter: 'overdue' },
      x: 3,
      y: 0,
      w: 3,
      h: 1,
    },
    {
      id: newId(),
      dashboardId: id,
      type: 'tasks_by_status',
      title: 'Tarefas por status',
      config: {},
      x: 0,
      y: 1,
      w: 6,
      h: 2,
    },
    {
      id: newId(),
      dashboardId: id,
      type: 'tasks_by_assignee',
      title: 'Carga por responsável',
      config: {},
      x: 6,
      y: 1,
      w: 6,
      h: 2,
    },
  ]);
  return getDashboard(id);
}

export async function updateDashboard(id: string, input: Partial<{ name: string }>) {
  const db = await getDb();
  await db.update(s.dashboards).set(input).where(eq(s.dashboards.id, id));
  return getDashboard(id);
}

export async function deleteDashboard(id: string) {
  const db = await getDb();
  await db.delete(s.dashboards).where(eq(s.dashboards.id, id));
}

export async function createWidget(
  dashboardId: string,
  input: { type: s.WidgetType; title: string; config?: s.WidgetConfig; w?: number; h?: number },
) {
  const db = await getDb();
  const [maxY] = await db
    .select({ m: sql<number>`coalesce(max(${s.dashboardWidgets.y} + ${s.dashboardWidgets.h}),0)` })
    .from(s.dashboardWidgets)
    .where(eq(s.dashboardWidgets.dashboardId, dashboardId));
  await db.insert(s.dashboardWidgets).values({
    id: newId(),
    dashboardId,
    type: input.type,
    title: input.title,
    config: input.config ?? {},
    x: 0,
    y: Number(maxY.m),
    w: input.w ?? 6,
    h: input.h ?? 2,
  });
  return getDashboard(dashboardId);
}

export async function updateWidget(
  id: string,
  input: Partial<{
    title: string;
    config: s.WidgetConfig;
    x: number;
    y: number;
    w: number;
    h: number;
    type: s.WidgetType;
  }>,
) {
  const db = await getDb();
  const [w] = await db
    .update(s.dashboardWidgets)
    .set(input)
    .where(eq(s.dashboardWidgets.id, id))
    .returning();
  if (!w) throw notFound('Widget');
  return getDashboard(w.dashboardId);
}

export async function deleteWidget(id: string) {
  const db = await getDb();
  const w = await db.query.dashboardWidgets.findFirst({ where: eq(s.dashboardWidgets.id, id) });
  if (!w) throw notFound('Widget');
  await db.delete(s.dashboardWidgets).where(eq(s.dashboardWidgets.id, id));
  return getDashboard(w.dashboardId);
}

/** Calcula os dados de cada widget de um dashboard. */
export async function getDashboardData(id: string, userId: string) {
  const db = await getDb();
  const d = await getDashboard(id);
  const out: Record<string, unknown> = {};
  for (const w of d.widgets) {
    const c = w.config;
    const scope = {
      workspaceId: d.workspaceId,
      listIds: c.listIds?.length ? c.listIds : undefined,
      spaceIds: c.spaceIds?.length ? c.spaceIds : undefined,
      includeClosed: true,
      includeSubtasks: true,
    };
    switch (w.type) {
      case 'number': {
        const tasks = await queryTasks(scope);
        const now = new Date();
        let n = tasks.length;
        if (c.filter === 'open') n = tasks.filter((t) => t.status?.type !== 'closed').length;
        if (c.filter === 'closed')
          n = tasks.filter(
            (t) =>
              t.status?.type === 'closed' &&
              (!c.days || (t.dateClosed && t.dateClosed >= subDays(now, c.days))),
          ).length;
        if (c.filter === 'overdue')
          n = tasks.filter(
            (t) => t.status?.type !== 'closed' && t.dueDate && t.dueDate < now,
          ).length;
        if (c.filter === 'mine')
          n = tasks.filter(
            (t) => t.status?.type !== 'closed' && t.assignees.some((a) => a.id === userId),
          ).length;
        out[w.id] = { value: n };
        break;
      }
      case 'tasks_by_status': {
        const tasks = await queryTasks(scope);
        const map = new Map<string, { label: string; color: string; value: number }>();
        for (const t of tasks) {
          const k = t.status?.status ?? 'sem status';
          const cur = map.get(k) ?? { label: k, color: t.status?.color ?? '#999', value: 0 };
          cur.value += 1;
          map.set(k, cur);
        }
        out[w.id] = { series: [...map.values()] };
        break;
      }
      case 'tasks_by_priority': {
        const tasks = await queryTasks({ ...scope, includeClosed: false });
        const labels: Record<string, [string, string]> = {
          1: ['Urgente', '#d33'],
          2: ['Alta', '#f0a30a'],
          3: ['Normal', '#1090e0'],
          4: ['Baixa', '#87909e'],
          none: ['Sem prioridade', '#ccc'],
        };
        const map = new Map<string, number>();
        for (const t of tasks)
          map.set(String(t.priority ?? 'none'), (map.get(String(t.priority ?? 'none')) ?? 0) + 1);
        out[w.id] = {
          series: [...map.entries()].map(([k, v]) => ({
            label: labels[k][0],
            color: labels[k][1],
            value: v,
          })),
        };
        break;
      }
      case 'tasks_by_assignee':
      case 'workload': {
        const tasks = await queryTasks({ ...scope, includeClosed: false });
        const map = new Map<
          string,
          { label: string; color: string; value: number; estimate: number }
        >();
        for (const t of tasks) {
          const as = t.assignees.length
            ? t.assignees
            : [{ id: 'none', username: 'Sem responsável', color: '#ccc' }];
          for (const a of as) {
            const cur = map.get(a.id) ?? {
              label: a.username,
              color: a.color,
              value: 0,
              estimate: 0,
            };
            cur.value += 1;
            cur.estimate += t.timeEstimateMs ?? 0;
            map.set(a.id, cur);
          }
        }
        out[w.id] = { series: [...map.values()].sort((a, b) => b.value - a.value) };
        break;
      }
      case 'time_tracked': {
        const from = subDays(new Date(), c.days ?? 7);
        const conds = [
          eq(s.timeEntries.workspaceId, d.workspaceId),
          gte(s.timeEntries.start, from),
        ];
        const entries = await db.query.timeEntries.findMany({
          where: and(...conds),
          with: { task: { columns: { spaceId: true, listId: true } }, user: true },
        });
        const filtered = entries.filter(
          (e) =>
            (!c.spaceIds?.length || (e.task && c.spaceIds.includes(e.task.spaceId))) &&
            (!c.listIds?.length || (e.task && c.listIds.includes(e.task.listId))),
        );
        const total = filtered.reduce((a, e) => a + (e.durationMs ?? 0), 0);
        const billable = filtered
          .filter((e) => e.billable)
          .reduce((a, e) => a + (e.durationMs ?? 0), 0);
        const byUser = new Map<string, { label: string; color: string; value: number }>();
        for (const e of filtered) {
          const cur = byUser.get(e.userId) ?? {
            label: e.user.username,
            color: e.user.color,
            value: 0,
          };
          cur.value += e.durationMs ?? 0;
          byUser.set(e.userId, cur);
        }
        out[w.id] = { totalMs: total, billableMs: billable, series: [...byUser.values()] };
        break;
      }
      case 'completed_over_time': {
        const days = c.days ?? 14;
        const from = subDays(new Date(), days);
        const tasks = await queryTasks(scope);
        const buckets: { label: string; value: number }[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const day = subDays(new Date(), i);
          const key = day.toISOString().slice(0, 10);
          buckets.push({
            label: key.slice(5),
            value: tasks.filter(
              (t) => t.dateClosed && t.dateClosed.toISOString().slice(0, 10) === key,
            ).length,
          });
        }
        out[w.id] = {
          series: buckets,
          total: tasks.filter((t) => t.dateClosed && t.dateClosed >= from).length,
        };
        break;
      }
      case 'overdue':
      case 'task_list': {
        const now = new Date();
        let tasks = await queryTasks({ ...scope, includeClosed: c.filter === 'closed' });
        if (c.filter === 'overdue' || w.type === 'overdue')
          tasks = tasks.filter((t) => t.dueDate && t.dueDate < now);
        if (c.filter === 'mine')
          tasks = tasks.filter((t) => t.assignees.some((a) => a.id === userId));
        tasks.sort(
          (a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity),
        );
        out[w.id] = { tasks: tasks.slice(0, 15) };
        break;
      }
      case 'goal_progress': {
        out[w.id] = c.goalId ? { goal: await getGoal(c.goalId).catch(() => null) } : { goal: null };
        break;
      }
      case 'text':
        out[w.id] = { text: c.text ?? '' };
        break;
    }
  }
  return { dashboard: d, data: out };
}

// ---------------------------------------------------------------- Busca

export async function search(workspaceId: string, q: string) {
  const db = await getDb();
  const term = `%${q}%`;
  const [tasks, docs, pages, lists, folders, spaces] = await Promise.all([
    db.query.tasks.findMany({
      where: and(
        eq(s.tasks.workspaceId, workspaceId),
        eq(s.tasks.archived, false),
        sql`(${s.tasks.name} ilike ${term} or ${s.tasks.customId} ilike ${term} or ${s.tasks.description} ilike ${term})`,
      ),
      with: { status: true, list: { columns: { id: true, name: true } } },
      limit: 20,
    }),
    db.query.docs.findMany({
      where: and(eq(s.docs.workspaceId, workspaceId), sql`${s.docs.name} ilike ${term}`),
      limit: 10,
    }),
    db
      .select({
        id: s.docPages.id,
        name: s.docPages.name,
        docId: s.docPages.docId,
        docName: s.docs.name,
      })
      .from(s.docPages)
      .innerJoin(s.docs, eq(s.docPages.docId, s.docs.id))
      .where(
        and(
          eq(s.docs.workspaceId, workspaceId),
          sql`(${s.docPages.name} ilike ${term} or ${s.docPages.content} ilike ${term})`,
        ),
      )
      .limit(10),
    db
      .select({ id: s.lists.id, name: s.lists.name, spaceId: s.lists.spaceId })
      .from(s.lists)
      .innerJoin(s.spaces, eq(s.lists.spaceId, s.spaces.id))
      .where(and(eq(s.spaces.workspaceId, workspaceId), sql`${s.lists.name} ilike ${term}`))
      .limit(10),
    db
      .select({ id: s.folders.id, name: s.folders.name, spaceId: s.folders.spaceId })
      .from(s.folders)
      .innerJoin(s.spaces, eq(s.folders.spaceId, s.spaces.id))
      .where(and(eq(s.spaces.workspaceId, workspaceId), sql`${s.folders.name} ilike ${term}`))
      .limit(10),
    db.query.spaces.findMany({
      where: and(eq(s.spaces.workspaceId, workspaceId), sql`${s.spaces.name} ilike ${term}`),
      limit: 10,
    }),
  ]);
  return { tasks, docs, pages, lists, folders, spaces };
}

/** Painel inicial: minhas tarefas, atrasadas, hoje, próximas, atividade recente, lembretes. */
export async function getHome(workspaceId: string, userId: string) {
  const db = await getDb();
  const mine = await queryTasks({
    workspaceId,
    assigneeIds: [userId],
    includeClosed: false,
    includeSubtasks: true,
  });
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const in7 = new Date(now.getTime() + 7 * 86400_000);
  const overdue = mine.filter((t) => t.dueDate && t.dueDate < now);
  const today = mine.filter((t) => t.dueDate && t.dueDate >= now && t.dueDate <= endOfToday);
  const upcoming = mine.filter((t) => t.dueDate && t.dueDate > endOfToday && t.dueDate <= in7);
  const noDate = mine.filter((t) => !t.dueDate);
  const later = mine.filter((t) => t.dueDate && t.dueDate > in7);
  const recentDone = await db.query.tasks.findMany({
    where: and(eq(s.tasks.workspaceId, workspaceId), gte(s.tasks.dateClosed, subDays(now, 7))),
    orderBy: desc(s.tasks.dateClosed),
    limit: 10,
    with: { status: true },
  });
  const activity = await db.query.activities.findMany({
    where: eq(s.activities.workspaceId, workspaceId),
    orderBy: desc(s.activities.createdAt),
    limit: 20,
    with: { user: true, task: { columns: { id: true, name: true, customId: true } } },
  });
  const reminders = await db.query.reminders.findMany({
    where: and(
      eq(s.reminders.workspaceId, workspaceId),
      eq(s.reminders.userId, userId),
      eq(s.reminders.completed, false),
    ),
    orderBy: asc(s.reminders.dueDate),
  });
  const assignedComments = await db.query.comments.findMany({
    where: and(
      eq(s.comments.workspaceId, workspaceId),
      eq(s.comments.assigneeId, userId),
      eq(s.comments.resolved, false),
    ),
    with: { user: true, task: { columns: { id: true, name: true, customId: true } } },
    orderBy: desc(s.comments.createdAt),
    limit: 10,
  });
  const [unread] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.notifications)
    .where(
      and(
        eq(s.notifications.userId, userId),
        eq(s.notifications.workspaceId, workspaceId),
        eq(s.notifications.read, false),
      ),
    );
  const timeThisWeek = await db
    .select({ ms: sql<number>`coalesce(sum(${s.timeEntries.durationMs}),0)::bigint` })
    .from(s.timeEntries)
    .where(
      and(
        eq(s.timeEntries.userId, userId),
        eq(s.timeEntries.workspaceId, workspaceId),
        gte(s.timeEntries.start, subDays(now, 7)),
        lt(s.timeEntries.start, now),
      ),
    );
  return {
    overdue,
    today,
    upcoming,
    later,
    noDate,
    recentDone,
    activity,
    reminders,
    assignedComments,
    unread: unread.n,
    timeThisWeekMs: Number(timeThisWeek[0]?.ms ?? 0),
    totals: { mine: mine.length, overdue: overdue.length, today: today.length },
  };
}

export const _internal = { isNull };
