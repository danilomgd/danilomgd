/**
 * Serviço de tarefas: leitura "hidratada" (com relações) e escrita com
 * registro de atividade e notificações.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, schema as s } from '@/db/client';
import { newId } from '@/lib/ids';
import { HttpError, notFound } from './http';

export type TaskRow = typeof s.tasks.$inferSelect;

export interface HydratedTask extends TaskRow {
  status: typeof s.statuses.$inferSelect | null;
  assignees: (typeof s.users.$inferSelect)[];
  watchers: string[];
  tags: (typeof s.tags.$inferSelect)[];
  customFields: Record<string, unknown>;
  subtaskCount: number;
  subtaskDone: number;
  commentCount: number;
  checklistTotal: number;
  checklistDone: number;
  timeSpentMs: number;
  dependencies: { waitingOn: string[]; blocking: string[] };
  linkedTasks: string[];
  list: { id: string; name: string } | null;
}

export interface TaskQuery {
  workspaceId?: string;
  listIds?: string[];
  spaceIds?: string[];
  folderIds?: string[];
  assigneeIds?: string[];
  statusIds?: string[];
  includeClosed?: boolean;
  includeSubtasks?: boolean;
  parentId?: string | null;
  archived?: boolean;
  search?: string;
}

export async function queryTasks(q: TaskQuery): Promise<HydratedTask[]> {
  const db = await getDb();
  const conds = [eq(s.tasks.archived, q.archived ?? false)];
  if (q.workspaceId) conds.push(eq(s.tasks.workspaceId, q.workspaceId));
  if (q.listIds?.length) conds.push(inArray(s.tasks.listId, q.listIds));
  if (q.spaceIds?.length) conds.push(inArray(s.tasks.spaceId, q.spaceIds));
  if (q.folderIds?.length) conds.push(inArray(s.tasks.folderId, q.folderIds));
  if (q.statusIds?.length) conds.push(inArray(s.tasks.statusId, q.statusIds));
  if (q.parentId === null) conds.push(isNull(s.tasks.parentId));
  else if (q.parentId) conds.push(eq(s.tasks.parentId, q.parentId));
  if (q.search)
    conds.push(
      sql`(${s.tasks.name} ilike ${`%${q.search}%`} or ${s.tasks.customId} ilike ${`%${q.search}%`})`,
    );

  const rows = await db.query.tasks.findMany({
    where: and(...conds),
    orderBy: [asc(s.tasks.orderIndex), asc(s.tasks.createdAt)],
    with: {
      status: true,
      list: { columns: { id: true, name: true } },
      assignees: { with: { user: true } },
      watchers: true,
      tags: { with: { tag: true } },
      customFieldValues: true,
      checklists: { with: { items: true } },
      comments: { columns: { id: true } },
      timeEntries: { columns: { durationMs: true } },
      dependencies: { columns: { dependsOnId: true } },
      dependents: { columns: { taskId: true } },
    },
  });

  const ids = rows.map((r) => r.id);
  const subCounts = ids.length
    ? await db
        .select({
          parentId: s.tasks.parentId,
          total: sql<number>`count(*)::int`,
          done: sql<number>`count(${s.tasks.dateClosed})::int`,
        })
        .from(s.tasks)
        .where(and(inArray(s.tasks.parentId, ids), eq(s.tasks.archived, false)))
        .groupBy(s.tasks.parentId)
    : [];
  const subMap = new Map(subCounts.map((c) => [c.parentId, c]));
  const links = ids.length
    ? await db.select().from(s.taskLinks).where(inArray(s.taskLinks.taskId, ids))
    : [];
  const linkMap = new Map<string, string[]>();
  for (const l of links) linkMap.set(l.taskId, [...(linkMap.get(l.taskId) ?? []), l.linkedTaskId]);

  let out = rows.map((r) => hydrate(r, subMap.get(r.id), linkMap.get(r.id) ?? []));
  if (q.assigneeIds?.length)
    out = out.filter((t) => t.assignees.some((a) => q.assigneeIds!.includes(a.id)));
  if (!q.includeClosed) out = out.filter((t) => t.status?.type !== 'closed');
  return out;
}

/** Forma do registro retornado pelo query builder relacional antes da hidratação. */
interface RawTask extends TaskRow {
  status: typeof s.statuses.$inferSelect | null;
  list: { id: string; name: string } | null;
  assignees: { user: typeof s.users.$inferSelect }[];
  watchers: { userId: string }[];
  tags: { tag: typeof s.tags.$inferSelect }[];
  customFieldValues: { fieldId: string; value: unknown }[];
  checklists: { items: { resolved: boolean }[] }[];
  comments: { id: string }[];
  timeEntries: { durationMs: number | null }[];
  dependencies: { dependsOnId: string }[];
  dependents: { taskId: string }[];
}

function hydrate(
  r: RawTask,
  sub?: { total: number; done: number },
  linked: string[] = [],
): HydratedTask {
  const {
    assignees,
    watchers,
    tags,
    customFieldValues,
    checklists,
    comments,
    timeEntries,
    dependencies,
    dependents,
    ...rest
  } = r;
  const items = checklists.flatMap((c) => c.items);
  return {
    ...rest,
    assignees: assignees.map((a) => a.user),
    watchers: watchers.map((w) => w.userId),
    tags: tags.map((t) => t.tag),
    customFields: Object.fromEntries(customFieldValues.map((v) => [v.fieldId, v.value])),
    subtaskCount: sub?.total ?? 0,
    subtaskDone: sub?.done ?? 0,
    commentCount: comments.length,
    checklistTotal: items.length,
    checklistDone: items.filter((i) => i.resolved).length,
    timeSpentMs: timeEntries.reduce((acc, e) => acc + (e.durationMs ?? 0), 0),
    dependencies: {
      waitingOn: dependencies.map((d) => d.dependsOnId),
      blocking: dependents.map((d) => d.taskId),
    },
    linkedTasks: linked,
  };
}

export async function getTask(id: string): Promise<HydratedTask> {
  const db = await getDb();
  const byId = await db.query.tasks.findFirst({ where: eq(s.tasks.id, id), columns: { id: true } });
  let realId = byId?.id;
  if (!realId) {
    const byCustom = await db.query.tasks.findFirst({
      where: eq(s.tasks.customId, id.toUpperCase()),
      columns: { id: true },
    });
    realId = byCustom?.id;
  }
  if (!realId) throw notFound('Tarefa');
  const rows = await db.query.tasks.findMany({
    where: eq(s.tasks.id, realId),
    with: {
      status: true,
      list: { columns: { id: true, name: true } },
      assignees: { with: { user: true } },
      watchers: true,
      tags: { with: { tag: true } },
      customFieldValues: true,
      checklists: { with: { items: true } },
      comments: { columns: { id: true } },
      timeEntries: { columns: { durationMs: true } },
      dependencies: { columns: { dependsOnId: true } },
      dependents: { columns: { taskId: true } },
    },
  });
  const sub = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(${s.tasks.dateClosed})::int`,
    })
    .from(s.tasks)
    .where(and(eq(s.tasks.parentId, realId), eq(s.tasks.archived, false)));
  const links = await db.select().from(s.taskLinks).where(eq(s.taskLinks.taskId, realId));
  return hydrate(
    rows[0],
    sub[0],
    links.map((l) => l.linkedTaskId),
  );
}

export interface TaskInput {
  name?: string;
  description?: string;
  statusId?: string | null;
  status?: string; // nome do status (compatível com API externa)
  priority?: number | null;
  dueDate?: string | number | null;
  dueDateTime?: boolean;
  startDate?: string | number | null;
  timeEstimateMs?: number | null;
  points?: number | null;
  assignees?: string[] | { add?: string[]; rem?: string[] };
  watchers?: { add?: string[]; rem?: string[] };
  tags?: string[]; // nomes
  parentId?: string | null;
  listId?: string;
  orderIndex?: number;
  archived?: boolean;
  customFields?: Record<string, unknown>;
}

function toDate(v: string | number | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const dt = typeof v === 'number' ? new Date(v) : new Date(v);
  if (Number.isNaN(dt.getTime())) throw new HttpError(400, 'Data inválida');
  return dt;
}

async function resolveStatusId(
  db: Awaited<ReturnType<typeof getDb>>,
  listId: string,
  name?: string,
  id?: string | null,
) {
  const list = await db.query.lists.findFirst({ where: eq(s.lists.id, listId) });
  if (!list) throw notFound('Lista');
  const statuses = await listStatuses(list.id);
  if (id !== undefined) {
    if (id === null) return { statusId: null, statuses };
    const st = statuses.find((x) => x.id === id);
    if (!st) throw new HttpError(400, 'Status não pertence a esta lista');
    return { statusId: st.id, statuses };
  }
  if (name) {
    const st = statuses.find((x) => x.status.toLowerCase() === name.toLowerCase());
    if (!st) throw new HttpError(400, `Status "${name}" não existe nesta lista`);
    return { statusId: st.id, statuses };
  }
  return { statusId: undefined, statuses };
}

/** Statuses efetivos de uma lista (override da lista ou herdados do space). */
export async function listStatuses(listId: string) {
  const db = await getDb();
  const list = await db.query.lists.findFirst({ where: eq(s.lists.id, listId) });
  if (!list) throw notFound('Lista');
  if (list.overrideStatuses) {
    const own = await db.query.statuses.findMany({
      where: eq(s.statuses.listId, listId),
      orderBy: asc(s.statuses.orderIndex),
    });
    if (own.length) return own;
  }
  return db.query.statuses.findMany({
    where: and(eq(s.statuses.spaceId, list.spaceId), isNull(s.statuses.listId)),
    orderBy: asc(s.statuses.orderIndex),
  });
}

export async function createTask(
  listId: string,
  input: TaskInput,
  actorId: string,
): Promise<HydratedTask> {
  const db = await getDb();
  const list = await db.query.lists.findFirst({ where: eq(s.lists.id, listId) });
  if (!list) throw notFound('Lista');
  const space = await db.query.spaces.findFirst({ where: eq(s.spaces.id, list.spaceId) });
  if (!space) throw notFound('Space');
  const { statusId, statuses } = await resolveStatusId(db, listId, input.status, input.statusId);
  const finalStatus = statusId ?? statuses[0]?.id ?? null;
  const [ws] = await db
    .update(s.workspaces)
    .set({ taskCounter: sql`${s.workspaces.taskCounter} + 1` })
    .where(eq(s.workspaces.id, space.workspaceId))
    .returning();
  const [maxRow] = await db
    .select({ m: sql<number>`coalesce(max(${s.tasks.orderIndex}), 0)` })
    .from(s.tasks)
    .where(eq(s.tasks.listId, listId));
  const id = newId();
  await db.insert(s.tasks).values({
    id,
    customId: `${ws.taskPrefix}-${ws.taskCounter}`,
    workspaceId: space.workspaceId,
    spaceId: space.id,
    folderId: list.folderId,
    listId,
    parentId: input.parentId ?? null,
    name: (input.name ?? '').trim() || 'Nova tarefa',
    description: input.description ?? '',
    statusId: finalStatus,
    priority: input.priority ?? null,
    orderIndex: input.orderIndex ?? Number(maxRow.m) + 1,
    dueDate: toDate(input.dueDate) ?? null,
    dueDateTime: input.dueDateTime ?? false,
    startDate: toDate(input.startDate) ?? null,
    timeEstimateMs: input.timeEstimateMs ?? null,
    points: input.points ?? null,
    createdBy: actorId,
  });
  const assignees = Array.isArray(input.assignees) ? input.assignees : (input.assignees?.add ?? []);
  if (assignees.length)
    await db.insert(s.taskAssignees).values(assignees.map((userId) => ({ taskId: id, userId })));
  await db
    .insert(s.taskWatchers)
    .values([{ taskId: id, userId: actorId }])
    .onConflictDoNothing();
  if (input.tags?.length) await setTags(id, space.id, input.tags);
  if (input.customFields) await setCustomFields(id, input.customFields);
  await db.insert(s.activities).values({
    id: newId(),
    workspaceId: space.workspaceId,
    taskId: id,
    userId: actorId,
    type: 'created',
  });
  for (const userId of assignees.filter((u) => u !== actorId)) {
    await notify(
      space.workspaceId,
      userId,
      actorId,
      id,
      'assigned',
      `atribuiu você a ${input.name}`,
    );
  }
  return getTask(id);
}

export async function updateTask(
  id: string,
  input: TaskInput,
  actorId: string,
): Promise<HydratedTask> {
  const db = await getDb();
  const before = await getTask(id);
  const patch: Partial<typeof s.tasks.$inferInsert> = { updatedAt: new Date() };
  const acts: (typeof s.activities.$inferInsert)[] = [];
  const act = (type: string, field: string, b: unknown, a: unknown) =>
    acts.push({
      id: newId(),
      workspaceId: before.workspaceId,
      taskId: before.id,
      userId: actorId,
      type,
      field,
      before: b,
      after: a,
    });

  if (input.listId && input.listId !== before.listId) {
    const list = await db.query.lists.findFirst({ where: eq(s.lists.id, input.listId) });
    if (!list) throw notFound('Lista');
    patch.listId = list.id;
    patch.folderId = list.folderId;
    patch.spaceId = list.spaceId;
    // Ao mover de lista, mapeia o status pelo nome ou cai no primeiro.
    const sts = await listStatuses(list.id);
    const same = sts.find((x) => x.status === before.status?.status);
    patch.statusId = same?.id ?? sts[0]?.id ?? null;
    act('moved', 'list', before.list?.name, list.name);
  }
  if (input.name !== undefined && input.name !== before.name) {
    patch.name = input.name.trim() || before.name;
    act('renamed', 'name', before.name, patch.name);
  }
  if (input.description !== undefined && input.description !== before.description) {
    patch.description = input.description;
    act('description', 'description', null, null);
  }
  if (input.statusId !== undefined || input.status !== undefined) {
    const { statusId } = await resolveStatusId(
      db,
      patch.listId ?? before.listId,
      input.status,
      input.statusId,
    );
    if (statusId !== undefined && statusId !== before.statusId) {
      patch.statusId = statusId;
      const st = statusId
        ? await db.query.statuses.findFirst({ where: eq(s.statuses.id, statusId) })
        : null;
      const closing = st?.type === 'closed';
      patch.dateClosed = closing ? new Date() : null;
      patch.dateDone = st?.type === 'done' || closing ? new Date() : null;
      act('status', 'status', before.status?.status ?? null, st?.status ?? null);
    }
  }
  if (input.priority !== undefined && input.priority !== before.priority) {
    patch.priority = input.priority;
    act('priority', 'priority', before.priority, input.priority);
  }
  const due = toDate(input.dueDate);
  if (due !== undefined && due?.getTime() !== before.dueDate?.getTime()) {
    patch.dueDate = due;
    act('due_date', 'due_date', before.dueDate, due);
  }
  if (input.dueDateTime !== undefined) patch.dueDateTime = input.dueDateTime;
  const start = toDate(input.startDate);
  if (start !== undefined && start?.getTime() !== before.startDate?.getTime()) {
    patch.startDate = start;
    act('start_date', 'start_date', before.startDate, start);
  }
  if (input.timeEstimateMs !== undefined) patch.timeEstimateMs = input.timeEstimateMs;
  if (input.points !== undefined) patch.points = input.points;
  if (input.parentId !== undefined) patch.parentId = input.parentId;
  if (input.orderIndex !== undefined) patch.orderIndex = input.orderIndex;
  if (input.archived !== undefined) patch.archived = input.archived;

  await db.update(s.tasks).set(patch).where(eq(s.tasks.id, before.id));

  if (input.assignees !== undefined) {
    const current = new Set(before.assignees.map((a) => a.id));
    let add: string[] = [];
    let rem: string[] = [];
    if (Array.isArray(input.assignees)) {
      const wanted = input.assignees;
      add = wanted.filter((u) => !current.has(u));
      rem = [...current].filter((u) => !wanted.includes(u));
    } else {
      add = (input.assignees.add ?? []).filter((u) => !current.has(u));
      rem = (input.assignees.rem ?? []).filter((u) => current.has(u));
    }
    if (add.length)
      await db
        .insert(s.taskAssignees)
        .values(add.map((userId) => ({ taskId: before.id, userId })))
        .onConflictDoNothing();
    if (rem.length)
      await db
        .delete(s.taskAssignees)
        .where(and(eq(s.taskAssignees.taskId, before.id), inArray(s.taskAssignees.userId, rem)));
    for (const u of add) {
      const user = await db.query.users.findFirst({ where: eq(s.users.id, u) });
      act('assignee', 'assignees', null, user?.username ?? u);
      if (u !== actorId)
        await notify(
          before.workspaceId,
          u,
          actorId,
          before.id,
          'assigned',
          `atribuiu você a ${before.name}`,
        );
    }
    for (const u of rem) {
      const user = await db.query.users.findFirst({ where: eq(s.users.id, u) });
      act('assignee', 'assignees', user?.username ?? u, null);
    }
  }
  if (input.watchers) {
    if (input.watchers.add?.length)
      await db
        .insert(s.taskWatchers)
        .values(input.watchers.add.map((userId) => ({ taskId: before.id, userId })))
        .onConflictDoNothing();
    if (input.watchers.rem?.length)
      await db
        .delete(s.taskWatchers)
        .where(
          and(
            eq(s.taskWatchers.taskId, before.id),
            inArray(s.taskWatchers.userId, input.watchers.rem),
          ),
        );
  }
  if (input.tags !== undefined) {
    await setTags(before.id, patch.spaceId ?? before.spaceId, input.tags);
    act(
      'tags',
      'tags',
      before.tags.map((t) => t.name),
      input.tags,
    );
  }
  if (input.customFields) {
    await setCustomFields(before.id, input.customFields);
    for (const [k, v] of Object.entries(input.customFields))
      act('custom_field', k, before.customFields[k] ?? null, v);
  }
  if (acts.length) await db.insert(s.activities).values(acts);

  // Notifica watchers sobre mudança de status.
  if (patch.statusId !== undefined && patch.statusId !== before.statusId) {
    const st = patch.statusId
      ? await db.query.statuses.findFirst({ where: eq(s.statuses.id, patch.statusId) })
      : null;
    for (const w of before.watchers.filter((u) => u !== actorId)) {
      await notify(
        before.workspaceId,
        w,
        actorId,
        before.id,
        'status',
        `alterou o status de ${before.name} para ${st?.status ?? 'sem status'}`,
      );
    }
  }
  return getTask(before.id);
}

export async function deleteTask(id: string) {
  const db = await getDb();
  const t = await getTask(id);
  // Subtarefas vão junto.
  const subs = await db.select({ id: s.tasks.id }).from(s.tasks).where(eq(s.tasks.parentId, t.id));
  for (const sub of subs) await deleteTask(sub.id);
  await db.delete(s.tasks).where(eq(s.tasks.id, t.id));
}

async function setTags(taskId: string, spaceId: string, names: string[]) {
  const db = await getDb();
  await db.delete(s.taskTags).where(eq(s.taskTags.taskId, taskId));
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    let tag = await db.query.tags.findFirst({
      where: and(eq(s.tags.spaceId, spaceId), eq(s.tags.name, name)),
    });
    if (!tag) {
      const palette = ['#7b68ee', '#1090e0', '#e04f8a', '#2ea44f', '#f0a30a', '#d33', '#0ab4a8'];
      [tag] = await db
        .insert(s.tags)
        .values({ id: newId(), spaceId, name, bg: palette[name.length % palette.length] })
        .returning();
    }
    ids.push(tag!.id);
  }
  if (ids.length)
    await db
      .insert(s.taskTags)
      .values([...new Set(ids)].map((tagId) => ({ taskId, tagId })))
      .onConflictDoNothing();
}

async function setCustomFields(taskId: string, values: Record<string, unknown>) {
  const db = await getDb();
  for (const [fieldId, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') {
      await db
        .delete(s.taskCustomFieldValues)
        .where(
          and(
            eq(s.taskCustomFieldValues.taskId, taskId),
            eq(s.taskCustomFieldValues.fieldId, fieldId),
          ),
        );
      continue;
    }
    await db
      .insert(s.taskCustomFieldValues)
      .values({ taskId, fieldId, value })
      .onConflictDoUpdate({
        target: [s.taskCustomFieldValues.taskId, s.taskCustomFieldValues.fieldId],
        set: { value },
      });
  }
}

export async function notify(
  workspaceId: string,
  userId: string,
  actorId: string | null,
  taskId: string | null,
  type: string,
  text: string,
  commentId?: string,
) {
  const db = await getDb();
  const actor = actorId ? await db.query.users.findFirst({ where: eq(s.users.id, actorId) }) : null;
  await db.insert(s.notifications).values({
    id: newId(),
    workspaceId,
    userId,
    actorId,
    taskId,
    commentId,
    type,
    text: actor ? `${actor.username} ${text}` : text,
  });
}

export async function reorderTasks(
  moves: { id: string; orderIndex: number; statusId?: string; listId?: string }[],
  actorId: string,
) {
  for (const m of moves) {
    await updateTask(
      m.id,
      { orderIndex: m.orderIndex, statusId: m.statusId, listId: m.listId },
      actorId,
    );
  }
}

export const taskOrder = { asc, desc };
