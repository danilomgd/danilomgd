/**
 * Modelo de dados do NEXO.
 *
 * Hierarquia: Workspace → Space → Folder (opcional) → List → Task → Subtask.
 * Cada nível pode ter Views, Docs e Custom Fields. O modelo segue as formas
 * expostas pela API pública de ferramentas de gestão de trabalho (team/space/
 * folder/list/task/status/custom_field/comment/time_entry/goal/view), de modo
 * que integrações já escritas para esse formato migrem com pouco esforço.
 */
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------- Identidade

export const users = pgTable('users', {
  id: id(),
  username: text('username').notNull(),
  email: text('email').notNull().unique(),
  color: text('color').notNull().default('#7b68ee'),
  initials: text('initials').notNull(),
  avatarUrl: text('avatar_url'),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  createdAt: createdAt(),
});

export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#7b68ee'),
  avatarUrl: text('avatar_url'),
  // Prefixo para IDs legíveis de tarefa (ex.: NX-123).
  taskPrefix: text('task_prefix').notNull().default('NX'),
  taskCounter: integer('task_counter').notNull().default(0),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member', 'guest'] })
      .notNull()
      .default('member'),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

// ---------------------------------------------------------------- Hierarquia

export const spaces = pgTable(
  'spaces',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#7b68ee'),
    icon: text('icon'),
    private: boolean('private').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    position: real('position').notNull().default(0),
    // Recursos ativáveis por Space (ClickApps).
    features: jsonb('features').$type<SpaceFeatures>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index('spaces_workspace_idx').on(t.workspaceId)],
);

export interface SpaceFeatures {
  dueDates?: boolean;
  startDates?: boolean;
  timeTracking?: boolean;
  timeEstimates?: boolean;
  tags?: boolean;
  priorities?: boolean;
  customFields?: boolean;
  dependencies?: boolean;
  checklists?: boolean;
  sprints?: boolean;
  points?: boolean;
  multipleAssignees?: boolean;
}

export const folders = pgTable(
  'folders',
  {
    id: id(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    hidden: boolean('hidden').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    position: real('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('folders_space_idx').on(t.spaceId)],
);

export const lists = pgTable(
  'lists',
  {
    id: id(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    folderId: text('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    content: text('content'),
    color: text('color'),
    position: real('position').notNull().default(0),
    priority: integer('priority'),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    startDate: timestamp('start_date', { withTimezone: true }),
    // Quando true, a lista usa seus próprios statuses em vez dos do Space.
    overrideStatuses: boolean('override_statuses').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('lists_space_idx').on(t.spaceId), index('lists_folder_idx').on(t.folderId)],
);

/** Status pertencem ao Space; uma List pode sobrescrever (listId preenchido). */
export const statuses = pgTable(
  'statuses',
  {
    id: id(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    listId: text('list_id').references(() => lists.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    color: text('color').notNull().default('#87909e'),
    type: text('type', { enum: ['open', 'custom', 'done', 'closed'] })
      .notNull()
      .default('custom'),
    orderIndex: integer('order_index').notNull().default(0),
  },
  (t) => [index('statuses_space_idx').on(t.spaceId), index('statuses_list_idx').on(t.listId)],
);

export type ViewType =
  | 'list'
  | 'board'
  | 'calendar'
  | 'gantt'
  | 'table'
  | 'timeline'
  | 'activity'
  | 'workload'
  | 'doc'
  | 'form';

export interface ViewSettings {
  groupBy?: 'status' | 'assignee' | 'priority' | 'due_date' | 'tag' | 'none' | `cf:${string}`;
  sortBy?: { field: string; direction: 'asc' | 'desc' }[];
  filters?: ViewFilter[];
  columns?: string[];
  showClosed?: boolean;
  showSubtasks?: 'collapsed' | 'expanded' | 'separate' | 'hidden';
  collapsedGroups?: string[];
}

export interface ViewFilter {
  field: string;
  op: 'eq' | 'neq' | 'in' | 'nin' | 'contains' | 'is_set' | 'not_set' | 'lt' | 'gt' | 'between';
  value?: unknown;
}

export const views = pgTable(
  'views',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    parentType: text('parent_type', { enum: ['workspace', 'space', 'folder', 'list'] }).notNull(),
    parentId: text('parent_id').notNull(),
    name: text('name').notNull(),
    type: text('type').$type<ViewType>().notNull(),
    settings: jsonb('settings').$type<ViewSettings>().notNull().default(sql`'{}'::jsonb`),
    position: real('position').notNull().default(0),
    pinned: boolean('pinned').notNull().default(false),
    protected: boolean('protected').notNull().default(false),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('views_parent_idx').on(t.parentType, t.parentId)],
);

// ---------------------------------------------------------------- Tarefas

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    customId: text('custom_id').notNull(), // ex.: NX-42
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    statusId: text('status_id').references(() => statuses.id, { onDelete: 'set null' }),
    // 1 = urgente, 2 = alta, 3 = normal, 4 = baixa, null = sem prioridade
    priority: integer('priority'),
    orderIndex: real('order_index').notNull().default(0),
    dueDate: timestamp('due_date', { withTimezone: true }),
    dueDateTime: boolean('due_date_time').notNull().default(false),
    startDate: timestamp('start_date', { withTimezone: true }),
    timeEstimateMs: integer('time_estimate_ms'),
    points: real('points'),
    archived: boolean('archived').notNull().default(false),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    dateClosed: timestamp('date_closed', { withTimezone: true }),
    dateDone: timestamp('date_done', { withTimezone: true }),
  },
  (t) => [
    index('tasks_list_idx').on(t.listId),
    index('tasks_parent_idx').on(t.parentId),
    index('tasks_workspace_idx').on(t.workspaceId),
    uniqueIndex('tasks_custom_id_idx').on(t.workspaceId, t.customId),
  ],
);

export const taskAssignees = pgTable(
  'task_assignees',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

export const taskWatchers = pgTable(
  'task_watchers',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

export const tags = pgTable(
  'tags',
  {
    id: id(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    fg: text('fg').notNull().default('#ffffff'),
    bg: text('bg').notNull().default('#7b68ee'),
  },
  (t) => [uniqueIndex('tags_space_name_idx').on(t.spaceId, t.name)],
);

export const taskTags = pgTable(
  'task_tags',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] })],
);

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'drop_down'
  | 'labels'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'rating'
  | 'progress'
  | 'users'
  | 'formula';

export interface CustomFieldTypeConfig {
  options?: { id: string; name: string; color?: string; orderIndex?: number }[];
  precision?: number;
  currencyType?: string;
  count?: number; // rating
  method?: 'manual' | 'automatic'; // progress
  formula?: string;
  placeholder?: string;
}

export const customFields = pgTable(
  'custom_fields',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    parentType: text('parent_type', { enum: ['workspace', 'space', 'folder', 'list'] }).notNull(),
    parentId: text('parent_id').notNull(),
    name: text('name').notNull(),
    type: text('type').$type<CustomFieldType>().notNull(),
    typeConfig: jsonb('type_config')
      .$type<CustomFieldTypeConfig>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    required: boolean('required').notNull().default(false),
    hideFromGuests: boolean('hide_from_guests').notNull().default(false),
    position: real('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('custom_fields_parent_idx').on(t.parentType, t.parentId)],
);

export const taskCustomFieldValues = pgTable(
  'task_custom_field_values',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    fieldId: text('field_id')
      .notNull()
      .references(() => customFields.id, { onDelete: 'cascade' }),
    value: jsonb('value').$type<unknown>(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.fieldId] })],
);

export const checklists = pgTable(
  'checklists',
  {
    id: id(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
  },
  (t) => [index('checklists_task_idx').on(t.taskId)],
);

export const checklistItems = pgTable(
  'checklist_items',
  {
    id: id(),
    checklistId: text('checklist_id')
      .notNull()
      .references(() => checklists.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    orderIndex: integer('order_index').notNull().default(0),
  },
  (t) => [index('checklist_items_checklist_idx').on(t.checklistId)],
);

export const comments = pgTable(
  'comments',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    listId: text('list_id').references(() => lists.id, { onDelete: 'cascade' }),
    docPageId: text('doc_page_id'),
    parentId: text('parent_id'),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    reactions: jsonb('reactions')
      .$type<Record<string, string[]>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('comments_task_idx').on(t.taskId), index('comments_parent_idx').on(t.parentId)],
);

export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    url: text('url').notNull(),
    mimeType: text('mime_type'),
    size: integer('size'),
    createdAt: createdAt(),
  },
  (t) => [index('attachments_task_idx').on(t.taskId)],
);

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    // `taskId` está esperando por `dependsOnId` (waiting_on). O inverso é "blocking".
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnId: text('depends_on_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.dependsOnId] })],
);

export const taskLinks = pgTable(
  'task_links',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    linkedTaskId: text('linked_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.linkedTaskId] })],
);

export const timeEntries = pgTable(
  'time_entries',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    description: text('description').notNull().default(''),
    start: timestamp('start', { withTimezone: true }).notNull(),
    end: timestamp('end', { withTimezone: true }), // null = cronômetro rodando
    durationMs: integer('duration_ms'),
    billable: boolean('billable').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('time_entries_task_idx').on(t.taskId), index('time_entries_user_idx').on(t.userId)],
);

export const activities = pgTable(
  'activities',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(), // created, status, assignee, priority, due_date, comment, ...
    field: text('field'),
    before: jsonb('before').$type<unknown>(),
    after: jsonb('after').$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [index('activities_task_idx').on(t.taskId), index('activities_ws_idx').on(t.workspaceId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    commentId: text('comment_id'),
    type: text('type').notNull(), // assigned, mention, comment, status, due_soon, overdue
    text: text('text').notNull(),
    read: boolean('read').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.read)],
);

export const reminders = pgTable(
  'reminders',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    completed: boolean('completed').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('reminders_user_idx').on(t.userId)],
);

export const favorites = pgTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    itemType: text('item_type', {
      enum: ['space', 'folder', 'list', 'view', 'doc', 'dashboard', 'task'],
    }).notNull(),
    itemId: text('item_id').notNull(),
    position: real('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemType, t.itemId] })],
);

// ---------------------------------------------------------------- Docs

export const docs = pgTable(
  'docs',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    parentType: text('parent_type', { enum: ['workspace', 'space', 'folder', 'list', 'task'] })
      .notNull()
      .default('workspace'),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    icon: text('icon'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    archived: boolean('archived').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('docs_workspace_idx').on(t.workspaceId)],
);

export const docPages = pgTable(
  'doc_pages',
  {
    id: id(),
    docId: text('doc_id')
      .notNull()
      .references(() => docs.id, { onDelete: 'cascade' }),
    parentPageId: text('parent_page_id'),
    name: text('name').notNull(),
    subtitle: text('subtitle'),
    content: text('content').notNull().default(''), // markdown
    position: real('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('doc_pages_doc_idx').on(t.docId)],
);

// ---------------------------------------------------------------- Metas

export const goals = pgTable(
  'goals',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    folderName: text('folder_name'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    color: text('color').notNull().default('#7b68ee'),
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    archived: boolean('archived').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('goals_workspace_idx').on(t.workspaceId)],
);

export const keyResults = pgTable(
  'key_results',
  {
    id: id(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', { enum: ['number', 'currency', 'boolean', 'percentage', 'task'] })
      .notNull()
      .default('number'),
    stepsStart: real('steps_start').notNull().default(0),
    stepsEnd: real('steps_end').notNull().default(100),
    stepsCurrent: real('steps_current').notNull().default(0),
    unit: text('unit'),
    taskIds: jsonb('task_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    listIds: jsonb('list_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    completed: boolean('completed').notNull().default(false),
  },
  (t) => [index('key_results_goal_idx').on(t.goalId)],
);

// ---------------------------------------------------------------- Dashboards

export type WidgetType =
  | 'tasks_by_status'
  | 'tasks_by_assignee'
  | 'tasks_by_priority'
  | 'workload'
  | 'time_tracked'
  | 'overdue'
  | 'completed_over_time'
  | 'task_list'
  | 'text'
  | 'goal_progress'
  | 'number';

export interface WidgetConfig {
  listIds?: string[];
  spaceIds?: string[];
  text?: string;
  goalId?: string;
  filter?: 'all' | 'open' | 'closed' | 'mine' | 'overdue';
  metric?: 'count' | 'time';
  days?: number;
}

export const dashboards = pgTable(
  'dashboards',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('dashboards_workspace_idx').on(t.workspaceId)],
);

export const dashboardWidgets = pgTable(
  'dashboard_widgets',
  {
    id: id(),
    dashboardId: text('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    type: text('type').$type<WidgetType>().notNull(),
    title: text('title').notNull(),
    config: jsonb('config').$type<WidgetConfig>().notNull().default(sql`'{}'::jsonb`),
    x: integer('x').notNull().default(0),
    y: integer('y').notNull().default(0),
    w: integer('w').notNull().default(4),
    h: integer('h').notNull().default(2),
  },
  (t) => [index('dashboard_widgets_dashboard_idx').on(t.dashboardId)],
);

// ---------------------------------------------------------------- Relations

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  status: one(statuses, { fields: [tasks.statusId], references: [statuses.id] }),
  list: one(lists, { fields: [tasks.listId], references: [lists.id] }),
  creator: one(users, { fields: [tasks.createdBy], references: [users.id] }),
  assignees: many(taskAssignees),
  watchers: many(taskWatchers),
  tags: many(taskTags),
  customFieldValues: many(taskCustomFieldValues),
  checklists: many(checklists),
  comments: many(comments),
  attachments: many(attachments),
  timeEntries: many(timeEntries),
  dependencies: many(taskDependencies, { relationName: 'waiting' }),
  dependents: many(taskDependencies, { relationName: 'blocking' }),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAssignees.userId], references: [users.id] }),
}));

export const taskWatchersRelations = relations(taskWatchers, ({ one }) => ({
  task: one(tasks, { fields: [taskWatchers.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskWatchers.userId], references: [users.id] }),
}));

export const taskTagsRelations = relations(taskTags, ({ one }) => ({
  task: one(tasks, { fields: [taskTags.taskId], references: [tasks.id] }),
  tag: one(tags, { fields: [taskTags.tagId], references: [tags.id] }),
}));

export const taskCustomFieldValuesRelations = relations(taskCustomFieldValues, ({ one }) => ({
  task: one(tasks, { fields: [taskCustomFieldValues.taskId], references: [tasks.id] }),
  field: one(customFields, {
    fields: [taskCustomFieldValues.fieldId],
    references: [customFields.id],
  }),
}));

export const checklistsRelations = relations(checklists, ({ one, many }) => ({
  task: one(tasks, { fields: [checklists.taskId], references: [tasks.id] }),
  items: many(checklistItems),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one }) => ({
  checklist: one(checklists, { fields: [checklistItems.checklistId], references: [checklists.id] }),
  assignee: one(users, { fields: [checklistItems.assigneeId], references: [users.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  assignee: one(users, { fields: [comments.assigneeId], references: [users.id] }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  task: one(tasks, { fields: [attachments.taskId], references: [tasks.id] }),
  user: one(users, { fields: [attachments.userId], references: [users.id] }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  task: one(tasks, { fields: [timeEntries.taskId], references: [tasks.id] }),
  user: one(users, { fields: [timeEntries.userId], references: [users.id] }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: 'waiting',
  }),
  dependsOn: one(tasks, {
    fields: [taskDependencies.dependsOnId],
    references: [tasks.id],
    relationName: 'blocking',
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  user: one(users, { fields: [activities.userId], references: [users.id] }),
  task: one(tasks, { fields: [activities.taskId], references: [tasks.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  actor: one(users, { fields: [notifications.actorId], references: [users.id] }),
  task: one(tasks, { fields: [notifications.taskId], references: [tasks.id] }),
}));

export const listsRelations = relations(lists, ({ one, many }) => ({
  space: one(spaces, { fields: [lists.spaceId], references: [spaces.id] }),
  folder: one(folders, { fields: [lists.folderId], references: [folders.id] }),
  tasks: many(tasks),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  space: one(spaces, { fields: [folders.spaceId], references: [spaces.id] }),
  lists: many(lists),
}));

export const spacesRelations = relations(spaces, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [spaces.workspaceId], references: [workspaces.id] }),
  folders: many(folders),
  lists: many(lists),
  statuses: many(statuses),
  tags: many(tags),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  spaces: many(spaces),
  members: many(workspaceMembers),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

export const docsRelations = relations(docs, ({ many, one }) => ({
  pages: many(docPages),
  creator: one(users, { fields: [docs.createdBy], references: [users.id] }),
}));

export const docPagesRelations = relations(docPages, ({ one }) => ({
  doc: one(docs, { fields: [docPages.docId], references: [docs.id] }),
}));

export const goalsRelations = relations(goals, ({ many, one }) => ({
  keyResults: many(keyResults),
  owner: one(users, { fields: [goals.ownerId], references: [users.id] }),
}));

export const keyResultsRelations = relations(keyResults, ({ one }) => ({
  goal: one(goals, { fields: [keyResults.goalId], references: [goals.id] }),
}));

export const dashboardsRelations = relations(dashboards, ({ many }) => ({
  widgets: many(dashboardWidgets),
}));

export const dashboardWidgetsRelations = relations(dashboardWidgets, ({ one }) => ({
  dashboard: one(dashboards, {
    fields: [dashboardWidgets.dashboardId],
    references: [dashboards.id],
  }),
}));

export const statusesRelations = relations(statuses, ({ one }) => ({
  space: one(spaces, { fields: [statuses.spaceId], references: [spaces.id] }),
  list: one(lists, { fields: [statuses.listId], references: [lists.id] }),
}));

export const tagsRelations = relations(tags, ({ one }) => ({
  space: one(spaces, { fields: [tags.spaceId], references: [spaces.id] }),
}));
