/** Comentários, checklists, dependências, links, anexos, tempo, atividade, notificações, lembretes. */
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { getDb, schema as s } from '@/db/client';
import { newId } from '@/lib/ids';
import { HttpError, notFound } from './http';
import { getTask, notify } from './tasks';

// ---------------------------------------------------------------- Comentários

export async function getComments(where: { taskId?: string; listId?: string; docPageId?: string }) {
  const db = await getDb();
  const cond = where.taskId
    ? eq(s.comments.taskId, where.taskId)
    : where.listId
      ? eq(s.comments.listId, where.listId)
      : eq(s.comments.docPageId, where.docPageId!);
  return db.query.comments.findMany({
    where: cond,
    orderBy: asc(s.comments.createdAt),
    with: { user: true, assignee: true },
  });
}

export async function createComment(
  target: { taskId?: string; listId?: string; docPageId?: string },
  input: { text: string; parentId?: string; assigneeId?: string | null; notifyAll?: boolean },
  actorId: string,
) {
  const db = await getDb();
  let workspaceId: string | undefined;
  let task: Awaited<ReturnType<typeof getTask>> | null = null;
  if (target.taskId) {
    task = await getTask(target.taskId);
    workspaceId = task.workspaceId;
  } else if (target.listId) {
    const l = await db.query.lists.findFirst({
      where: eq(s.lists.id, target.listId),
      with: { space: true },
    });
    if (!l) throw notFound('Lista');
    workspaceId = l.space.workspaceId;
  } else if (target.docPageId) {
    const p = await db.query.docPages.findFirst({
      where: eq(s.docPages.id, target.docPageId),
      with: { doc: true },
    });
    if (!p) throw notFound('Página');
    workspaceId = p.doc.workspaceId;
  }
  if (!workspaceId) throw new HttpError(400, 'Alvo do comentário inválido');
  const id = newId();
  await db.insert(s.comments).values({
    id,
    workspaceId,
    taskId: task?.id ?? null,
    listId: target.listId ?? null,
    docPageId: target.docPageId ?? null,
    parentId: input.parentId ?? null,
    userId: actorId,
    text: input.text,
    assigneeId: input.assigneeId ?? null,
  });
  if (task) {
    await db.insert(s.activities).values({
      id: newId(),
      workspaceId,
      taskId: task.id,
      userId: actorId,
      type: 'comment',
      after: input.text.slice(0, 200),
    });
    await db
      .insert(s.taskWatchers)
      .values({ taskId: task.id, userId: actorId })
      .onConflictDoNothing();
    // Menções: @Nome Sobrenome
    const members = await db.query.workspaceMembers.findMany({
      where: eq(s.workspaceMembers.workspaceId, workspaceId),
      with: { user: true },
    });
    const mentioned = members
      .filter((m) => input.text.includes(`@${m.user.username}`))
      .map((m) => m.userId);
    const targets = new Set<string>([
      ...mentioned,
      ...(input.assigneeId ? [input.assigneeId] : []),
      ...(input.notifyAll ? task.watchers : []),
    ]);
    targets.delete(actorId);
    for (const u of targets) {
      const kind = mentioned.includes(u)
        ? 'mention'
        : input.assigneeId === u
          ? 'comment_assigned'
          : 'comment';
      const verb =
        kind === 'mention'
          ? `mencionou você em ${task.name}`
          : kind === 'comment_assigned'
            ? `atribuiu um comentário a você em ${task.name}`
            : `comentou em ${task.name}`;
      await notify(workspaceId, u, actorId, task.id, kind, verb, id);
    }
  }
  return db.query.comments.findFirst({
    where: eq(s.comments.id, id),
    with: { user: true, assignee: true },
  });
}

export async function updateComment(
  id: string,
  input: Partial<{
    text: string;
    resolved: boolean;
    assigneeId: string | null;
    reaction: { emoji: string; userId: string };
  }>,
) {
  const db = await getDb();
  const c = await db.query.comments.findFirst({ where: eq(s.comments.id, id) });
  if (!c) throw notFound('Comentário');
  const patch: Partial<typeof s.comments.$inferInsert> = { updatedAt: new Date() };
  if (input.text !== undefined) patch.text = input.text;
  if (input.resolved !== undefined) patch.resolved = input.resolved;
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
  if (input.reaction) {
    const r = { ...c.reactions };
    const list = new Set(r[input.reaction.emoji] ?? []);
    if (list.has(input.reaction.userId)) list.delete(input.reaction.userId);
    else list.add(input.reaction.userId);
    if (list.size) r[input.reaction.emoji] = [...list];
    else delete r[input.reaction.emoji];
    patch.reactions = r;
  }
  await db.update(s.comments).set(patch).where(eq(s.comments.id, id));
  return db.query.comments.findFirst({
    where: eq(s.comments.id, id),
    with: { user: true, assignee: true },
  });
}

export async function deleteComment(id: string) {
  const db = await getDb();
  await db.delete(s.comments).where(eq(s.comments.id, id));
}

// ---------------------------------------------------------------- Checklists

export async function getChecklists(taskId: string) {
  const db = await getDb();
  return db.query.checklists.findMany({
    where: eq(s.checklists.taskId, taskId),
    orderBy: asc(s.checklists.orderIndex),
    with: { items: { orderBy: asc(s.checklistItems.orderIndex), with: { assignee: true } } },
  });
}

export async function createChecklist(taskId: string, name: string) {
  const db = await getDb();
  const t = await getTask(taskId);
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${s.checklists.orderIndex}),0)` })
    .from(s.checklists)
    .where(eq(s.checklists.taskId, t.id));
  await db
    .insert(s.checklists)
    .values({ id: newId(), taskId: t.id, name, orderIndex: Number(max.m) + 1 });
  return getChecklists(t.id);
}

export async function updateChecklist(
  id: string,
  input: Partial<{ name: string; orderIndex: number }>,
) {
  const db = await getDb();
  const [c] = await db.update(s.checklists).set(input).where(eq(s.checklists.id, id)).returning();
  if (!c) throw notFound('Checklist');
  return getChecklists(c.taskId);
}

export async function deleteChecklist(id: string) {
  const db = await getDb();
  const c = await db.query.checklists.findFirst({ where: eq(s.checklists.id, id) });
  if (!c) throw notFound('Checklist');
  await db.delete(s.checklists).where(eq(s.checklists.id, id));
  return getChecklists(c.taskId);
}

export async function createChecklistItem(
  checklistId: string,
  input: { name: string; assigneeId?: string | null; parentId?: string | null },
) {
  const db = await getDb();
  const c = await db.query.checklists.findFirst({ where: eq(s.checklists.id, checklistId) });
  if (!c) throw notFound('Checklist');
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${s.checklistItems.orderIndex}),0)` })
    .from(s.checklistItems)
    .where(eq(s.checklistItems.checklistId, checklistId));
  await db.insert(s.checklistItems).values({
    id: newId(),
    checklistId,
    name: input.name,
    assigneeId: input.assigneeId ?? null,
    parentId: input.parentId ?? null,
    orderIndex: Number(max.m) + 1,
  });
  return getChecklists(c.taskId);
}

export async function updateChecklistItem(
  id: string,
  input: Partial<{
    name: string;
    resolved: boolean;
    assigneeId: string | null;
    orderIndex: number;
  }>,
) {
  const db = await getDb();
  const [it] = await db
    .update(s.checklistItems)
    .set(input)
    .where(eq(s.checklistItems.id, id))
    .returning();
  if (!it) throw notFound('Item');
  const c = await db.query.checklists.findFirst({ where: eq(s.checklists.id, it.checklistId) });
  return getChecklists(c!.taskId);
}

export async function deleteChecklistItem(id: string) {
  const db = await getDb();
  const it = await db.query.checklistItems.findFirst({ where: eq(s.checklistItems.id, id) });
  if (!it) throw notFound('Item');
  await db.delete(s.checklistItems).where(eq(s.checklistItems.id, id));
  const c = await db.query.checklists.findFirst({ where: eq(s.checklists.id, it.checklistId) });
  return getChecklists(c!.taskId);
}

// ---------------------------------------------------------------- Dependências e links

export async function addDependency(
  taskId: string,
  input: { dependsOn?: string; dependencyOf?: string },
  actorId: string,
) {
  const db = await getDb();
  const t = await getTask(taskId);
  if (input.dependsOn) {
    const other = await getTask(input.dependsOn);
    if (other.id === t.id) throw new HttpError(400, 'Uma tarefa não pode depender dela mesma');
    await db
      .insert(s.taskDependencies)
      .values({ taskId: t.id, dependsOnId: other.id })
      .onConflictDoNothing();
    await db.insert(s.activities).values({
      id: newId(),
      workspaceId: t.workspaceId,
      taskId: t.id,
      userId: actorId,
      type: 'dependency',
      field: 'waiting_on',
      after: other.customId,
    });
  }
  if (input.dependencyOf) {
    const other = await getTask(input.dependencyOf);
    if (other.id === t.id) throw new HttpError(400, 'Uma tarefa não pode depender dela mesma');
    await db
      .insert(s.taskDependencies)
      .values({ taskId: other.id, dependsOnId: t.id })
      .onConflictDoNothing();
    await db.insert(s.activities).values({
      id: newId(),
      workspaceId: t.workspaceId,
      taskId: t.id,
      userId: actorId,
      type: 'dependency',
      field: 'blocking',
      after: other.customId,
    });
  }
  return getTask(t.id);
}

export async function removeDependency(
  taskId: string,
  input: { dependsOn?: string; dependencyOf?: string },
) {
  const db = await getDb();
  const t = await getTask(taskId);
  if (input.dependsOn)
    await db
      .delete(s.taskDependencies)
      .where(
        and(
          eq(s.taskDependencies.taskId, t.id),
          eq(s.taskDependencies.dependsOnId, input.dependsOn),
        ),
      );
  if (input.dependencyOf)
    await db
      .delete(s.taskDependencies)
      .where(
        and(
          eq(s.taskDependencies.taskId, input.dependencyOf),
          eq(s.taskDependencies.dependsOnId, t.id),
        ),
      );
  return getTask(t.id);
}

export async function addLink(taskId: string, linkId: string) {
  const db = await getDb();
  const a = await getTask(taskId);
  const b = await getTask(linkId);
  await db
    .insert(s.taskLinks)
    .values([
      { taskId: a.id, linkedTaskId: b.id },
      { taskId: b.id, linkedTaskId: a.id },
    ])
    .onConflictDoNothing();
  return getTask(a.id);
}

export async function removeLink(taskId: string, linkId: string) {
  const db = await getDb();
  await db
    .delete(s.taskLinks)
    .where(and(eq(s.taskLinks.taskId, taskId), eq(s.taskLinks.linkedTaskId, linkId)));
  await db
    .delete(s.taskLinks)
    .where(and(eq(s.taskLinks.taskId, linkId), eq(s.taskLinks.linkedTaskId, taskId)));
  return getTask(taskId);
}

/** Resumo das tarefas relacionadas (dependências + links) para o painel da tarefa. */
export async function getRelated(taskId: string) {
  const db = await getDb();
  const t = await getTask(taskId);
  const ids = [...t.dependencies.waitingOn, ...t.dependencies.blocking, ...t.linkedTasks];
  if (!ids.length) return { waitingOn: [], blocking: [], linked: [] };
  const rows = await db.query.tasks.findMany({
    where: inArray(s.tasks.id, ids),
    with: { status: true, assignees: { with: { user: true } } },
  });
  const slim = (id: string) => {
    const r = rows.find((x) => x.id === id);
    return r
      ? {
          id: r.id,
          customId: r.customId,
          name: r.name,
          status: r.status,
          assignees: r.assignees.map((a) => a.user),
          dueDate: r.dueDate,
        }
      : null;
  };
  return {
    waitingOn: t.dependencies.waitingOn.map(slim).filter(Boolean),
    blocking: t.dependencies.blocking.map(slim).filter(Boolean),
    linked: t.linkedTasks.map(slim).filter(Boolean),
  };
}

// ---------------------------------------------------------------- Anexos

export async function getAttachments(taskId: string) {
  const db = await getDb();
  return db.query.attachments.findMany({
    where: eq(s.attachments.taskId, taskId),
    orderBy: desc(s.attachments.createdAt),
    with: { user: true },
  });
}

export async function createAttachment(
  taskId: string,
  input: { title: string; url: string; mimeType?: string; size?: number },
  actorId: string,
) {
  const db = await getDb();
  const t = await getTask(taskId);
  await db.insert(s.attachments).values({
    id: newId(),
    taskId: t.id,
    userId: actorId,
    title: input.title,
    url: input.url,
    mimeType: input.mimeType,
    size: input.size,
  });
  await db.insert(s.activities).values({
    id: newId(),
    workspaceId: t.workspaceId,
    taskId: t.id,
    userId: actorId,
    type: 'attachment',
    after: input.title,
  });
  return getAttachments(t.id);
}

export async function deleteAttachment(id: string) {
  const db = await getDb();
  const a = await db.query.attachments.findFirst({ where: eq(s.attachments.id, id) });
  if (!a) throw notFound('Anexo');
  await db.delete(s.attachments).where(eq(s.attachments.id, id));
  return getAttachments(a.taskId);
}

// ---------------------------------------------------------------- Tempo

export async function getTimeEntries(q: {
  workspaceId: string;
  taskId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
}) {
  const db = await getDb();
  const conds = [eq(s.timeEntries.workspaceId, q.workspaceId)];
  if (q.taskId) conds.push(eq(s.timeEntries.taskId, q.taskId));
  if (q.userId) conds.push(eq(s.timeEntries.userId, q.userId));
  if (q.from) conds.push(gte(s.timeEntries.start, q.from));
  if (q.to) conds.push(lte(s.timeEntries.start, q.to));
  return db.query.timeEntries.findMany({
    where: and(...conds),
    orderBy: desc(s.timeEntries.start),
    with: { user: true, task: { columns: { id: true, name: true, customId: true, listId: true } } },
  });
}

export async function createTimeEntry(
  workspaceId: string,
  input: {
    taskId?: string | null;
    description?: string;
    start: string | number;
    end?: string | number | null;
    durationMs?: number;
    billable?: boolean;
  },
  userId: string,
) {
  const db = await getDb();
  const start = new Date(input.start);
  const end = input.end
    ? new Date(input.end)
    : input.durationMs
      ? new Date(start.getTime() + input.durationMs)
      : null;
  const durationMs = end ? end.getTime() - start.getTime() : null;
  const [e] = await db
    .insert(s.timeEntries)
    .values({
      id: newId(),
      workspaceId,
      taskId: input.taskId ?? null,
      userId,
      description: input.description ?? '',
      start,
      end,
      durationMs,
      billable: input.billable ?? false,
    })
    .returning();
  return e;
}

export async function updateTimeEntry(
  id: string,
  input: Partial<{
    description: string;
    start: string;
    end: string | null;
    durationMs: number;
    billable: boolean;
    taskId: string | null;
  }>,
) {
  const db = await getDb();
  const e = await db.query.timeEntries.findFirst({ where: eq(s.timeEntries.id, id) });
  if (!e) throw notFound('Registro de tempo');
  const start = input.start ? new Date(input.start) : e.start;
  let end = input.end !== undefined ? (input.end ? new Date(input.end) : null) : e.end;
  if (input.durationMs !== undefined) end = new Date(start.getTime() + input.durationMs);
  const durationMs = end ? end.getTime() - start.getTime() : null;
  const [u] = await db
    .update(s.timeEntries)
    .set({
      description: input.description ?? e.description,
      start,
      end,
      durationMs,
      billable: input.billable ?? e.billable,
      taskId: input.taskId !== undefined ? input.taskId : e.taskId,
    })
    .where(eq(s.timeEntries.id, id))
    .returning();
  return u;
}

export async function deleteTimeEntry(id: string) {
  const db = await getDb();
  await db.delete(s.timeEntries).where(eq(s.timeEntries.id, id));
}

export async function getRunningTimer(workspaceId: string, userId: string) {
  const db = await getDb();
  return (
    (await db.query.timeEntries.findFirst({
      where: and(
        eq(s.timeEntries.workspaceId, workspaceId),
        eq(s.timeEntries.userId, userId),
        isNull(s.timeEntries.end),
      ),
      with: { task: { columns: { id: true, name: true, customId: true } } },
    })) ?? null
  );
}

export async function startTimer(
  workspaceId: string,
  userId: string,
  input: { taskId?: string | null; description?: string; billable?: boolean },
) {
  const db = await getDb();
  await stopTimer(workspaceId, userId);
  const [e] = await db
    .insert(s.timeEntries)
    .values({
      id: newId(),
      workspaceId,
      taskId: input.taskId ?? null,
      userId,
      description: input.description ?? '',
      start: new Date(),
      billable: input.billable ?? false,
    })
    .returning();
  return e;
}

export async function stopTimer(workspaceId: string, userId: string) {
  const db = await getDb();
  const running = await getRunningTimer(workspaceId, userId);
  if (!running) return null;
  const end = new Date();
  const [e] = await db
    .update(s.timeEntries)
    .set({ end, durationMs: end.getTime() - running.start.getTime() })
    .where(eq(s.timeEntries.id, running.id))
    .returning();
  return e;
}

// ---------------------------------------------------------------- Atividade

export async function getActivity(taskId: string) {
  const db = await getDb();
  return db.query.activities.findMany({
    where: eq(s.activities.taskId, taskId),
    orderBy: desc(s.activities.createdAt),
    with: { user: true },
    limit: 200,
  });
}

export async function getWorkspaceActivity(workspaceId: string, limit = 50) {
  const db = await getDb();
  return db.query.activities.findMany({
    where: eq(s.activities.workspaceId, workspaceId),
    orderBy: desc(s.activities.createdAt),
    with: { user: true, task: { columns: { id: true, name: true, customId: true } } },
    limit,
  });
}

// ---------------------------------------------------------------- Notificações

export async function getNotifications(workspaceId: string, userId: string, onlyUnread = false) {
  const db = await getDb();
  const conds = [eq(s.notifications.workspaceId, workspaceId), eq(s.notifications.userId, userId)];
  if (onlyUnread) conds.push(eq(s.notifications.read, false));
  return db.query.notifications.findMany({
    where: and(...conds),
    orderBy: desc(s.notifications.createdAt),
    with: {
      actor: true,
      task: { columns: { id: true, name: true, customId: true, listId: true } },
    },
    limit: 200,
  });
}

export async function markNotifications(
  workspaceId: string,
  userId: string,
  ids: string[] | 'all',
  read: boolean,
) {
  const db = await getDb();
  if (ids === 'all')
    await db
      .update(s.notifications)
      .set({ read })
      .where(and(eq(s.notifications.workspaceId, workspaceId), eq(s.notifications.userId, userId)));
  else if (ids.length)
    await db
      .update(s.notifications)
      .set({ read })
      .where(and(eq(s.notifications.userId, userId), inArray(s.notifications.id, ids)));
  return getNotifications(workspaceId, userId);
}

// ---------------------------------------------------------------- Lembretes

export async function getReminders(workspaceId: string, userId: string) {
  const db = await getDb();
  return db.query.reminders.findMany({
    where: and(eq(s.reminders.workspaceId, workspaceId), eq(s.reminders.userId, userId)),
    orderBy: asc(s.reminders.dueDate),
  });
}

export async function createReminder(
  workspaceId: string,
  userId: string,
  input: { name: string; dueDate?: string | null; taskId?: string | null },
) {
  const db = await getDb();
  const [r] = await db
    .insert(s.reminders)
    .values({
      id: newId(),
      workspaceId,
      userId,
      name: input.name,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      taskId: input.taskId ?? null,
    })
    .returning();
  return r;
}

export async function updateReminder(
  id: string,
  input: Partial<{ name: string; dueDate: string | null; completed: boolean }>,
) {
  const db = await getDb();
  const [r] = await db
    .update(s.reminders)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.completed !== undefined ? { completed: input.completed } : {}),
      ...(input.dueDate !== undefined
        ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
        : {}),
    })
    .where(eq(s.reminders.id, id))
    .returning();
  if (!r) throw notFound('Lembrete');
  return r;
}

export async function deleteReminder(id: string) {
  const db = await getDb();
  await db.delete(s.reminders).where(eq(s.reminders.id, id));
}
