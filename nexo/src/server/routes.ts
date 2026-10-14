/**
 * Tabela de rotas da API (/api/v2/...). Caminhos seguem o formato da API
 * pública usual de gestão de trabalho: team/space/folder/list/task/...
 */
import { z } from 'zod';
import type { CustomFieldType, ViewType, WidgetType } from '@/db/schema';
import * as collab from './collab';
import * as h from './hierarchy';
import { HttpError, parseBody } from './http';
import * as m from './modules';
import { type Ctx, on } from './router';
import * as t from './tasks';

const parentTypes = ['workspace', 'space', 'folder', 'list'] as const;
const viewTypes: [ViewType, ...ViewType[]] = [
  'list',
  'board',
  'calendar',
  'gantt',
  'table',
  'timeline',
  'activity',
  'workload',
  'doc',
  'form',
];
const fieldTypes: [CustomFieldType, ...CustomFieldType[]] = [
  'text',
  'textarea',
  'number',
  'currency',
  'date',
  'drop_down',
  'labels',
  'checkbox',
  'url',
  'email',
  'phone',
  'rating',
  'progress',
  'users',
  'formula',
];
const widgetTypes: [WidgetType, ...WidgetType[]] = [
  'tasks_by_status',
  'tasks_by_assignee',
  'tasks_by_priority',
  'workload',
  'time_tracked',
  'overdue',
  'completed_over_time',
  'task_list',
  'text',
  'goal_progress',
  'number',
];

const dateish = z.union([z.string(), z.number()]).nullable().optional();
const taskInput = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  statusId: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.number().int().min(1).max(4).nullable().optional(),
  dueDate: dateish,
  dueDateTime: z.boolean().optional(),
  startDate: dateish,
  timeEstimateMs: z.number().nullable().optional(),
  points: z.number().nullable().optional(),
  assignees: z
    .union([
      z.array(z.string()),
      z.object({ add: z.array(z.string()).optional(), rem: z.array(z.string()).optional() }),
    ])
    .optional(),
  watchers: z
    .object({ add: z.array(z.string()).optional(), rem: z.array(z.string()).optional() })
    .optional(),
  tags: z.array(z.string()).optional(),
  parentId: z.string().nullable().optional(),
  listId: z.string().optional(),
  orderIndex: z.number().optional(),
  archived: z.boolean().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : undefined);
const bool = (v: string | null) => v === 'true' || v === '1';

function workspaceOfParent(c: Ctx): Promise<string> {
  return (async () => {
    const q = c.query.get('workspaceId');
    if (q) return q;
    const ws = await h.getWorkspaces(c.userId);
    if (!ws[0]) throw new HttpError(400, 'workspaceId obrigatório');
    return ws[0].id;
  })();
}

// ---- Workspace / membros / hierarquia
on('GET', 'team', async (c) => ({ teams: await h.getWorkspaces(c.userId) }));
on('GET', 'team/:teamId', async (c) => h.getWorkspace(c.params.teamId));
on('GET', 'team/:teamId/hierarchy', async (c) => h.getHierarchy(c.params.teamId, c.userId));
on('GET', 'team/:teamId/member', async (c) => ({ members: await h.getMembers(c.params.teamId) }));
on('POST', 'team/:teamId/member', async (c) => ({
  members: await h.inviteMember(
    c.params.teamId,
    await parseBody(
      c.req,
      z.object({
        email: z.string().email(),
        username: z.string().optional(),
        role: z.enum(['admin', 'member', 'guest']).optional(),
      }),
    ),
  ),
}));
on('PUT', 'team/:teamId/member/:userId', async (c) => ({
  members: await h.updateMember(
    c.params.teamId,
    c.params.userId,
    (await parseBody(c.req, z.object({ role: z.enum(['owner', 'admin', 'member', 'guest']) })))
      .role,
  ),
}));
on('DELETE', 'team/:teamId/member/:userId', async (c) =>
  h.removeMember(c.params.teamId, c.params.userId),
);
on('GET', 'team/:teamId/home', async (c) => m.getHome(c.params.teamId, c.userId));
on('GET', 'team/:teamId/search', async (c) => m.search(c.params.teamId, c.query.get('q') ?? ''));
on('GET', 'team/:teamId/activity', async (c) => ({
  activity: await collab.getWorkspaceActivity(c.params.teamId),
}));
on('POST', 'team/:teamId/favorite', async (c) => {
  const b = await parseBody(
    c.req,
    z.object({
      itemType: z.enum(['space', 'folder', 'list', 'view', 'doc', 'dashboard', 'task']),
      itemId: z.string(),
    }),
  );
  return h.toggleFavorite(c.params.teamId, c.userId, b.itemType, b.itemId);
});
on('GET', 'user', async (c) => {
  const ws = await h.getWorkspaces(c.userId);
  const me = ws.flatMap((w) => w.members).find((u) => u.id === c.userId);
  return { user: me ?? null, teams: ws };
});

// ---- Spaces
on('GET', 'team/:teamId/space', async (c) => ({
  spaces: (await h.getHierarchy(c.params.teamId, c.userId)).spaces,
}));
on('POST', 'team/:teamId/space', async (c) =>
  h.createSpace(
    c.params.teamId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().min(1),
        color: z.string().optional(),
        icon: z.string().optional(),
        private: z.boolean().optional(),
        features: z.record(z.string(), z.boolean()).optional(),
      }),
    ),
    c.userId,
  ),
);
on('GET', 'space/:spaceId', async (c) => h.getSpace(c.params.spaceId));
on('PUT', 'space/:spaceId', async (c) =>
  h.updateSpace(
    c.params.spaceId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().min(1).optional(),
        color: z.string().optional(),
        icon: z.string().nullable().optional(),
        private: z.boolean().optional(),
        archived: z.boolean().optional(),
        position: z.number().optional(),
        features: z.record(z.string(), z.boolean()).optional(),
      }),
    ),
  ),
);
on('DELETE', 'space/:spaceId', async (c) => h.deleteSpace(c.params.spaceId));
on('PUT', 'space/:spaceId/status', async (c) => ({
  statuses: await h.setStatuses(
    c.params.spaceId,
    null,
    await parseBody(
      c.req,
      z.array(
        z.object({
          id: z.string().optional(),
          status: z.string().min(1),
          color: z.string(),
          type: z.enum(['open', 'custom', 'done', 'closed']),
        }),
      ),
    ),
  ),
}));
on('PUT', 'list/:listId/status', async (c) => {
  const l = await h.getList(c.params.listId);
  return {
    statuses: await h.setStatuses(
      l.spaceId,
      l.id,
      await parseBody(
        c.req,
        z.array(
          z.object({
            id: z.string().optional(),
            status: z.string().min(1),
            color: z.string(),
            type: z.enum(['open', 'custom', 'done', 'closed']),
          }),
        ),
      ),
    ),
  };
});
on('GET', 'space/:spaceId/tag', async (c) => ({ tags: await h.getSpaceTags(c.params.spaceId) }));
on('POST', 'space/:spaceId/tag', async (c) =>
  h.createTag(
    c.params.spaceId,
    await parseBody(
      c.req,
      z.object({ name: z.string().min(1), bg: z.string().optional(), fg: z.string().optional() }),
    ),
  ),
);
on('PUT', 'tag/:tagId', async (c) =>
  h.updateTag(
    c.params.tagId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().min(1).optional(),
        bg: z.string().optional(),
        fg: z.string().optional(),
      }),
    ),
  ),
);
on('DELETE', 'tag/:tagId', async (c) => h.deleteTag(c.params.tagId));

// ---- Folders
on('POST', 'space/:spaceId/folder', async (c) =>
  h.createFolder(
    c.params.spaceId,
    await parseBody(c.req, z.object({ name: z.string().min(1) })),
    c.userId,
  ),
);
on('GET', 'folder/:folderId', async (c) => h.getFolder(c.params.folderId));
on('PUT', 'folder/:folderId', async (c) =>
  h.updateFolder(
    c.params.folderId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().min(1).optional(),
        hidden: z.boolean().optional(),
        archived: z.boolean().optional(),
        position: z.number().optional(),
      }),
    ),
  ),
);
on('DELETE', 'folder/:folderId', async (c) => h.deleteFolder(c.params.folderId));

// ---- Lists
const listBody = z.object({
  name: z.string().min(1),
  content: z.string().optional(),
  color: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.number().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});
on('POST', 'space/:spaceId/list', async (c) =>
  h.createList({ spaceId: c.params.spaceId }, await parseBody(c.req, listBody), c.userId),
);
on('POST', 'folder/:folderId/list', async (c) =>
  h.createList({ folderId: c.params.folderId }, await parseBody(c.req, listBody), c.userId),
);
on('GET', 'list/:listId', async (c) => h.getList(c.params.listId));
on('PUT', 'list/:listId', async (c) =>
  h.updateList(
    c.params.listId,
    await parseBody(
      c.req,
      listBody.partial().extend({
        archived: z.boolean().optional(),
        position: z.number().optional(),
        folderId: z.string().nullable().optional(),
        content: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
      }),
    ),
  ),
);
on('DELETE', 'list/:listId', async (c) => h.deleteList(c.params.listId));
on('GET', 'list/:listId/statuses', async (c) => ({
  statuses: await t.listStatuses(c.params.listId),
}));

// ---- Views
for (const pt of parentTypes) {
  const seg = pt === 'workspace' ? 'team/:id/view' : `${pt}/:id/view`;
  on('GET', seg, async (c) => ({ views: await h.getViews(pt, c.params.id) }));
  on('POST', seg, async (c) => {
    const b = await parseBody(
      c.req,
      z.object({
        name: z.string().min(1),
        type: z.enum(viewTypes),
        settings: z.record(z.string(), z.unknown()).optional(),
      }),
    );
    const wsId = pt === 'workspace' ? c.params.id : await workspaceOfParent(c);
    return h.createView(wsId, pt, c.params.id, b as never, c.userId);
  });
}
on('GET', 'view/:viewId', async (c) => {
  const db = await (await import('@/db/client')).getDb();
  const { eq } = await import('drizzle-orm');
  const { views } = await import('@/db/schema');
  const v = await db.query.views.findFirst({ where: eq(views.id, c.params.viewId) });
  if (!v) throw new HttpError(404, 'View não encontrada');
  return v;
});
on('PUT', 'view/:viewId', async (c) =>
  h.updateView(
    c.params.viewId,
    (await parseBody(
      c.req,
      z.object({
        name: z.string().optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
        pinned: z.boolean().optional(),
        position: z.number().optional(),
      }),
    )) as never,
  ),
);
on('DELETE', 'view/:viewId', async (c) => h.deleteView(c.params.viewId));

// ---- Custom fields
on('GET', 'list/:listId/field', async (c) => ({
  fields: await h.getFieldsForList(c.params.listId),
}));
for (const pt of parentTypes) {
  const seg = pt === 'workspace' ? 'team/:id/field' : `${pt}/:id/field`;
  if (pt !== 'list') on('GET', seg, async (c) => ({ fields: await h.getFields(pt, c.params.id) }));
  on('POST', seg, async (c) => {
    const b = await parseBody(
      c.req,
      z.object({
        name: z.string().min(1),
        type: z.enum(fieldTypes),
        typeConfig: z.record(z.string(), z.unknown()).optional(),
        required: z.boolean().optional(),
      }),
    );
    const wsId = pt === 'workspace' ? c.params.id : await workspaceOfParent(c);
    return h.createField(wsId, pt, c.params.id, b as never);
  });
}
on('PUT', 'field/:fieldId', async (c) =>
  h.updateField(
    c.params.fieldId,
    (await parseBody(
      c.req,
      z.object({
        name: z.string().optional(),
        typeConfig: z.record(z.string(), z.unknown()).optional(),
        required: z.boolean().optional(),
        position: z.number().optional(),
      }),
    )) as never,
  ),
);
on('DELETE', 'field/:fieldId', async (c) => h.deleteField(c.params.fieldId));
on('POST', 'task/:taskId/field/:fieldId', async (c) => {
  const b = await parseBody(c.req, z.object({ value: z.unknown() }));
  return t.updateTask(c.params.taskId, { customFields: { [c.params.fieldId]: b.value } }, c.userId);
});
on('DELETE', 'task/:taskId/field/:fieldId', async (c) =>
  t.updateTask(c.params.taskId, { customFields: { [c.params.fieldId]: null } }, c.userId),
);

// ---- Tasks
on('GET', 'list/:listId/task', async (c) => ({
  tasks: await t.queryTasks({
    listIds: [c.params.listId],
    includeClosed: bool(c.query.get('include_closed')),
    includeSubtasks: true,
    assigneeIds: list(c.query.get('assignees')),
    statusIds: list(c.query.get('statuses')),
    search: c.query.get('q') ?? undefined,
  }),
}));
on('POST', 'list/:listId/task', async (c) =>
  t.createTask(c.params.listId, await parseBody(c.req, taskInput), c.userId),
);
on('GET', 'team/:teamId/task', async (c) => ({
  tasks: await t.queryTasks({
    workspaceId: c.params.teamId,
    listIds: list(c.query.get('list_ids')),
    spaceIds: list(c.query.get('space_ids')),
    folderIds: list(c.query.get('folder_ids')),
    assigneeIds: list(c.query.get('assignees')),
    statusIds: list(c.query.get('statuses')),
    includeClosed: bool(c.query.get('include_closed')),
    includeSubtasks: true,
    parentId: c.query.get('subtasks') === 'false' ? null : undefined,
    search: c.query.get('q') ?? undefined,
  }),
}));
on('GET', 'task/:taskId', async (c) => t.getTask(c.params.taskId));
on('PUT', 'task/:taskId', async (c) =>
  t.updateTask(c.params.taskId, await parseBody(c.req, taskInput), c.userId),
);
on('DELETE', 'task/:taskId', async (c) => t.deleteTask(c.params.taskId));
on('POST', 'task/bulk', async (c) => {
  const b = await parseBody(c.req, z.object({ ids: z.array(z.string()).min(1), patch: taskInput }));
  const out = [];
  for (const id of b.ids) out.push(await t.updateTask(id, b.patch, c.userId));
  return { tasks: out };
});
on('POST', 'task/reorder', async (c) => {
  const b = await parseBody(
    c.req,
    z.object({
      moves: z.array(
        z.object({
          id: z.string(),
          orderIndex: z.number(),
          statusId: z.string().optional(),
          listId: z.string().optional(),
        }),
      ),
    }),
  );
  await t.reorderTasks(b.moves, c.userId);
  return { ok: true };
});
on('GET', 'task/:taskId/subtask', async (c) => ({
  tasks: await t.queryTasks({
    parentId: (await t.getTask(c.params.taskId)).id,
    includeClosed: true,
  }),
}));
on('GET', 'task/:taskId/activity', async (c) => ({
  activity: await collab.getActivity((await t.getTask(c.params.taskId)).id),
}));
on('GET', 'task/:taskId/related', async (c) => collab.getRelated(c.params.taskId));
on('POST', 'task/:taskId/dependency', async (c) =>
  collab.addDependency(
    c.params.taskId,
    await parseBody(
      c.req,
      z.object({ dependsOn: z.string().optional(), dependencyOf: z.string().optional() }),
    ),
    c.userId,
  ),
);
on('DELETE', 'task/:taskId/dependency', async (c) =>
  collab.removeDependency(c.params.taskId, {
    dependsOn: c.query.get('depends_on') ?? undefined,
    dependencyOf: c.query.get('dependency_of') ?? undefined,
  }),
);
on('POST', 'task/:taskId/link/:linkId', async (c) =>
  collab.addLink(c.params.taskId, c.params.linkId),
);
on('DELETE', 'task/:taskId/link/:linkId', async (c) =>
  collab.removeLink(c.params.taskId, c.params.linkId),
);

// ---- Comentários
on('GET', 'task/:taskId/comment', async (c) => ({
  comments: await collab.getComments({ taskId: (await t.getTask(c.params.taskId)).id }),
}));
on('POST', 'task/:taskId/comment', async (c) =>
  collab.createComment(
    { taskId: (await t.getTask(c.params.taskId)).id },
    await parseBody(
      c.req,
      z.object({
        text: z.string().min(1),
        parentId: z.string().optional(),
        assigneeId: z.string().nullable().optional(),
        notifyAll: z.boolean().optional(),
      }),
    ),
    c.userId,
  ),
);
on('GET', 'list/:listId/comment', async (c) => ({
  comments: await collab.getComments({ listId: c.params.listId }),
}));
on('POST', 'list/:listId/comment', async (c) =>
  collab.createComment(
    { listId: c.params.listId },
    await parseBody(c.req, z.object({ text: z.string().min(1), parentId: z.string().optional() })),
    c.userId,
  ),
);
on('GET', 'page/:pageId/comment', async (c) => ({
  comments: await collab.getComments({ docPageId: c.params.pageId }),
}));
on('POST', 'page/:pageId/comment', async (c) =>
  collab.createComment(
    { docPageId: c.params.pageId },
    await parseBody(c.req, z.object({ text: z.string().min(1), parentId: z.string().optional() })),
    c.userId,
  ),
);
on('PUT', 'comment/:commentId', async (c) =>
  collab.updateComment(
    c.params.commentId,
    await parseBody(
      c.req,
      z.object({
        text: z.string().optional(),
        resolved: z.boolean().optional(),
        assigneeId: z.string().nullable().optional(),
        reaction: z.object({ emoji: z.string(), userId: z.string() }).optional(),
      }),
    ),
  ),
);
on('DELETE', 'comment/:commentId', async (c) => collab.deleteComment(c.params.commentId));

// ---- Checklists
on('GET', 'task/:taskId/checklist', async (c) => ({
  checklists: await collab.getChecklists((await t.getTask(c.params.taskId)).id),
}));
on('POST', 'task/:taskId/checklist', async (c) => ({
  checklists: await collab.createChecklist(
    c.params.taskId,
    (await parseBody(c.req, z.object({ name: z.string().min(1) }))).name,
  ),
}));
on('PUT', 'checklist/:checklistId', async (c) => ({
  checklists: await collab.updateChecklist(
    c.params.checklistId,
    await parseBody(
      c.req,
      z.object({ name: z.string().optional(), orderIndex: z.number().optional() }),
    ),
  ),
}));
on('DELETE', 'checklist/:checklistId', async (c) => ({
  checklists: await collab.deleteChecklist(c.params.checklistId),
}));
on('POST', 'checklist/:checklistId/checklist_item', async (c) => ({
  checklists: await collab.createChecklistItem(
    c.params.checklistId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().min(1),
        assigneeId: z.string().nullable().optional(),
        parentId: z.string().nullable().optional(),
      }),
    ),
  ),
}));
on('PUT', 'checklist_item/:itemId', async (c) => ({
  checklists: await collab.updateChecklistItem(
    c.params.itemId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().optional(),
        resolved: z.boolean().optional(),
        assigneeId: z.string().nullable().optional(),
        orderIndex: z.number().optional(),
      }),
    ),
  ),
}));
on('DELETE', 'checklist_item/:itemId', async (c) => ({
  checklists: await collab.deleteChecklistItem(c.params.itemId),
}));

// ---- Anexos (por URL; upload binário fica para a camada de storage)
on('GET', 'task/:taskId/attachment', async (c) => ({
  attachments: await collab.getAttachments((await t.getTask(c.params.taskId)).id),
}));
on('POST', 'task/:taskId/attachment', async (c) => ({
  attachments: await collab.createAttachment(
    c.params.taskId,
    await parseBody(
      c.req,
      z.object({
        title: z.string().min(1),
        url: z.string().min(1),
        mimeType: z.string().optional(),
        size: z.number().optional(),
      }),
    ),
    c.userId,
  ),
}));
on('DELETE', 'attachment/:attachmentId', async (c) => ({
  attachments: await collab.deleteAttachment(c.params.attachmentId),
}));

// ---- Tempo
on('GET', 'team/:teamId/time_entries', async (c) => ({
  data: await collab.getTimeEntries({
    workspaceId: c.params.teamId,
    taskId: c.query.get('task_id') ?? undefined,
    userId: c.query.get('assignee') ?? undefined,
    from: c.query.get('start_date')
      ? new Date(Number(c.query.get('start_date')) || String(c.query.get('start_date')))
      : undefined,
    to: c.query.get('end_date')
      ? new Date(Number(c.query.get('end_date')) || String(c.query.get('end_date')))
      : undefined,
  }),
}));
on('POST', 'team/:teamId/time_entries', async (c) => ({
  data: await collab.createTimeEntry(
    c.params.teamId,
    await parseBody(
      c.req,
      z.object({
        taskId: z.string().nullable().optional(),
        description: z.string().optional(),
        start: z.union([z.string(), z.number()]),
        end: z.union([z.string(), z.number()]).nullable().optional(),
        durationMs: z.number().optional(),
        billable: z.boolean().optional(),
      }),
    ),
    c.userId,
  ),
}));
on('GET', 'team/:teamId/time_entries/current', async (c) => ({
  data: await collab.getRunningTimer(c.params.teamId, c.userId),
}));
on('POST', 'team/:teamId/time_entries/start', async (c) => ({
  data: await collab.startTimer(
    c.params.teamId,
    c.userId,
    await parseBody(
      c.req,
      z.object({
        taskId: z.string().nullable().optional(),
        description: z.string().optional(),
        billable: z.boolean().optional(),
      }),
    ),
  ),
}));
on('POST', 'team/:teamId/time_entries/stop', async (c) => ({
  data: await collab.stopTimer(c.params.teamId, c.userId),
}));
on('PUT', 'team/:teamId/time_entries/:entryId', async (c) => ({
  data: await collab.updateTimeEntry(
    c.params.entryId,
    await parseBody(
      c.req,
      z.object({
        description: z.string().optional(),
        start: z.string().optional(),
        end: z.string().nullable().optional(),
        durationMs: z.number().optional(),
        billable: z.boolean().optional(),
        taskId: z.string().nullable().optional(),
      }),
    ),
  ),
}));
on('DELETE', 'team/:teamId/time_entries/:entryId', async (c) =>
  collab.deleteTimeEntry(c.params.entryId),
);

// ---- Notificações e lembretes
on('GET', 'team/:teamId/notification', async (c) => ({
  notifications: await collab.getNotifications(
    c.params.teamId,
    c.userId,
    bool(c.query.get('unread')),
  ),
}));
on('PUT', 'team/:teamId/notification', async (c) => {
  const b = await parseBody(
    c.req,
    z.object({ ids: z.union([z.array(z.string()), z.literal('all')]), read: z.boolean() }),
  );
  return {
    notifications: await collab.markNotifications(c.params.teamId, c.userId, b.ids, b.read),
  };
});
on('GET', 'team/:teamId/reminder', async (c) => ({
  reminders: await collab.getReminders(c.params.teamId, c.userId),
}));
on('POST', 'team/:teamId/reminder', async (c) =>
  collab.createReminder(
    c.params.teamId,
    c.userId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().min(1),
        dueDate: z.string().nullable().optional(),
        taskId: z.string().nullable().optional(),
      }),
    ),
  ),
);
on('PUT', 'reminder/:reminderId', async (c) =>
  collab.updateReminder(
    c.params.reminderId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().optional(),
        dueDate: z.string().nullable().optional(),
        completed: z.boolean().optional(),
      }),
    ),
  ),
);
on('DELETE', 'reminder/:reminderId', async (c) => collab.deleteReminder(c.params.reminderId));

// ---- Docs
on('GET', 'team/:teamId/doc', async (c) => ({ docs: await m.getDocs(c.params.teamId) }));
on('POST', 'team/:teamId/doc', async (c) =>
  m.createDoc(
    c.params.teamId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().min(1),
        parentType: z.enum(['workspace', 'space', 'folder', 'list', 'task']).optional(),
        parentId: z.string().nullable().optional(),
        icon: z.string().optional(),
      }),
    ),
    c.userId,
  ),
);
on('GET', 'doc/:docId', async (c) => m.getDoc(c.params.docId));
on('PUT', 'doc/:docId', async (c) =>
  m.updateDoc(
    c.params.docId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().optional(),
        icon: z.string().nullable().optional(),
        archived: z.boolean().optional(),
        parentType: z.enum(['workspace', 'space', 'folder', 'list', 'task']).optional(),
        parentId: z.string().nullable().optional(),
      }),
    ),
  ),
);
on('DELETE', 'doc/:docId', async (c) => m.deleteDoc(c.params.docId));
on('POST', 'doc/:docId/page', async (c) =>
  m.createPage(
    c.params.docId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().min(1),
        content: z.string().optional(),
        parentPageId: z.string().nullable().optional(),
        subtitle: z.string().optional(),
      }),
    ),
  ),
);
on('PUT', 'page/:pageId', async (c) =>
  m.updatePage(
    c.params.pageId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().optional(),
        subtitle: z.string().nullable().optional(),
        content: z.string().optional(),
        parentPageId: z.string().nullable().optional(),
        position: z.number().optional(),
      }),
    ),
  ),
);
on('DELETE', 'page/:pageId', async (c) => m.deletePage(c.params.pageId));

// ---- Metas
on('GET', 'team/:teamId/goal', async (c) => ({ goals: await m.getGoals(c.params.teamId) }));
on('POST', 'team/:teamId/goal', async (c) =>
  m.createGoal(
    c.params.teamId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        color: z.string().optional(),
        dueDate: z.string().nullable().optional(),
        ownerId: z.string().nullable().optional(),
        folderName: z.string().nullable().optional(),
      }),
    ),
    c.userId,
  ),
);
on('GET', 'goal/:goalId', async (c) => m.getGoal(c.params.goalId));
on('PUT', 'goal/:goalId', async (c) =>
  m.updateGoal(
    c.params.goalId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
        dueDate: z.string().nullable().optional(),
        ownerId: z.string().nullable().optional(),
        archived: z.boolean().optional(),
        folderName: z.string().nullable().optional(),
      }),
    ),
  ),
);
on('DELETE', 'goal/:goalId', async (c) => m.deleteGoal(c.params.goalId));
on('POST', 'goal/:goalId/key_result', async (c) =>
  m.createKeyResult(
    c.params.goalId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().min(1),
        type: z.enum(['number', 'currency', 'boolean', 'percentage', 'task']).optional(),
        stepsStart: z.number().optional(),
        stepsEnd: z.number().optional(),
        stepsCurrent: z.number().optional(),
        unit: z.string().optional(),
        taskIds: z.array(z.string()).optional(),
      }),
    ),
  ),
);
on('PUT', 'key_result/:krId', async (c) =>
  m.updateKeyResult(
    c.params.krId,
    await parseBody(
      c.req,
      z.object({
        name: z.string().optional(),
        stepsCurrent: z.number().optional(),
        stepsEnd: z.number().optional(),
        stepsStart: z.number().optional(),
        completed: z.boolean().optional(),
        unit: z.string().nullable().optional(),
        taskIds: z.array(z.string()).optional(),
      }),
    ),
  ),
);
on('DELETE', 'key_result/:krId', async (c) => m.deleteKeyResult(c.params.krId));

// ---- Dashboards
on('GET', 'team/:teamId/dashboard', async (c) => ({
  dashboards: await m.getDashboards(c.params.teamId),
}));
on('POST', 'team/:teamId/dashboard', async (c) =>
  m.createDashboard(
    c.params.teamId,
    await parseBody(c.req, z.object({ name: z.string().min(1) })),
    c.userId,
  ),
);
on('GET', 'dashboard/:dashboardId', async (c) =>
  m.getDashboardData(c.params.dashboardId, c.userId),
);
on('PUT', 'dashboard/:dashboardId', async (c) =>
  m.updateDashboard(
    c.params.dashboardId,
    await parseBody(c.req, z.object({ name: z.string().min(1) })),
  ),
);
on('DELETE', 'dashboard/:dashboardId', async (c) => m.deleteDashboard(c.params.dashboardId));
on('POST', 'dashboard/:dashboardId/widget', async (c) =>
  m.createWidget(
    c.params.dashboardId,
    (await parseBody(
      c.req,
      z.object({
        type: z.enum(widgetTypes),
        title: z.string().min(1),
        config: z.record(z.string(), z.unknown()).optional(),
        w: z.number().optional(),
        h: z.number().optional(),
      }),
    )) as never,
  ),
);
on('PUT', 'widget/:widgetId', async (c) =>
  m.updateWidget(
    c.params.widgetId,
    (await parseBody(
      c.req,
      z.object({
        title: z.string().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
        type: z.enum(widgetTypes).optional(),
      }),
    )) as never,
  ),
);
on('DELETE', 'widget/:widgetId', async (c) => m.deleteWidget(c.params.widgetId));

export const registered = true;
