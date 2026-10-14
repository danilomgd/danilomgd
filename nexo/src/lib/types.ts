/** Tipos compartilhados pelo frontend (espelham o retorno da API). */
import type {
  CustomFieldType,
  CustomFieldTypeConfig,
  SpaceFeatures,
  ViewFilter,
  ViewSettings,
  ViewType,
  WidgetConfig,
  WidgetType,
} from '@/db/schema';

export type {
  CustomFieldType,
  CustomFieldTypeConfig,
  SpaceFeatures,
  ViewFilter,
  ViewSettings,
  ViewType,
  WidgetConfig,
  WidgetType,
};

export interface User {
  id: string;
  username: string;
  email: string;
  color: string;
  initials: string;
  avatarUrl: string | null;
  role?: string;
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  taskPrefix: string;
  role?: string;
  members: User[];
}

export interface Status {
  id: string;
  spaceId: string;
  listId: string | null;
  status: string;
  color: string;
  type: 'open' | 'custom' | 'done' | 'closed';
  orderIndex: number;
}

export interface Tag {
  id: string;
  spaceId: string;
  name: string;
  fg: string;
  bg: string;
}

export interface View {
  id: string;
  workspaceId: string;
  parentType: 'workspace' | 'space' | 'folder' | 'list';
  parentId: string;
  name: string;
  type: ViewType;
  settings: ViewSettings;
  position: number;
  pinned: boolean;
  protected: boolean;
}

export interface ListNode {
  id: string;
  spaceId: string;
  folderId: string | null;
  name: string;
  content: string | null;
  color: string | null;
  position: number;
  priority: number | null;
  assigneeId: string | null;
  dueDate: string | null;
  startDate: string | null;
  overrideStatuses: boolean;
  archived: boolean;
  taskCount: number;
  views: View[];
  statuses: Status[];
}

export interface FolderNode {
  id: string;
  spaceId: string;
  name: string;
  hidden: boolean;
  position: number;
  views: View[];
  lists: ListNode[];
}

export interface SpaceNode {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  icon: string | null;
  private: boolean;
  position: number;
  features: SpaceFeatures;
  statuses: Status[];
  views: View[];
  folders: FolderNode[];
  lists: ListNode[];
}

export interface Favorite {
  itemType: 'space' | 'folder' | 'list' | 'view' | 'doc' | 'dashboard' | 'task';
  itemId: string;
  position: number;
}

export interface Hierarchy {
  spaces: SpaceNode[];
  workspaceViews: View[];
  favorites: Favorite[];
  docs: {
    id: string;
    name: string;
    icon: string | null;
    parentType: string;
    parentId: string | null;
  }[];
  dashboards: { id: string; name: string }[];
}

export interface CustomField {
  id: string;
  workspaceId: string;
  parentType: string;
  parentId: string;
  name: string;
  type: CustomFieldType;
  typeConfig: CustomFieldTypeConfig;
  required: boolean;
  position: number;
}

export interface Task {
  id: string;
  customId: string;
  workspaceId: string;
  spaceId: string;
  folderId: string | null;
  listId: string;
  parentId: string | null;
  name: string;
  description: string;
  statusId: string | null;
  priority: number | null;
  orderIndex: number;
  dueDate: string | null;
  dueDateTime: boolean;
  startDate: string | null;
  timeEstimateMs: number | null;
  points: number | null;
  archived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  dateClosed: string | null;
  dateDone: string | null;
  status: Status | null;
  list: { id: string; name: string } | null;
  assignees: User[];
  watchers: string[];
  tags: Tag[];
  customFields: Record<string, unknown>;
  subtaskCount: number;
  subtaskDone: number;
  commentCount: number;
  checklistTotal: number;
  checklistDone: number;
  timeSpentMs: number;
  dependencies: { waitingOn: string[]; blocking: string[] };
  linkedTasks: string[];
}

export interface Comment {
  id: string;
  taskId: string | null;
  parentId: string | null;
  userId: string | null;
  text: string;
  resolved: boolean;
  assigneeId: string | null;
  reactions: Record<string, string[]>;
  createdAt: string;
  user: User | null;
  assignee: User | null;
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  parentId: string | null;
  name: string;
  resolved: boolean;
  assigneeId: string | null;
  orderIndex: number;
  assignee: User | null;
}

export interface Checklist {
  id: string;
  taskId: string;
  name: string;
  orderIndex: number;
  items: ChecklistItem[];
}

export interface TimeEntry {
  id: string;
  taskId: string | null;
  userId: string;
  description: string;
  start: string;
  end: string | null;
  durationMs: number | null;
  billable: boolean;
  user?: User;
  task?: { id: string; name: string; customId: string; listId?: string } | null;
}

export interface Activity {
  id: string;
  taskId: string | null;
  type: string;
  field: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  user: User | null;
  task?: { id: string; name: string; customId: string } | null;
}

export interface Notification {
  id: string;
  type: string;
  text: string;
  read: boolean;
  createdAt: string;
  actor: User | null;
  task: { id: string; name: string; customId: string; listId: string } | null;
  commentId: string | null;
}

export interface Reminder {
  id: string;
  name: string;
  dueDate: string | null;
  completed: boolean;
  taskId: string | null;
}

export interface DocPage {
  id: string;
  docId: string;
  parentPageId: string | null;
  name: string;
  subtitle: string | null;
  content: string;
  position: number;
  updatedAt: string;
}

export interface Doc {
  id: string;
  workspaceId: string;
  parentType: string;
  parentId: string | null;
  name: string;
  icon: string | null;
  createdBy: string | null;
  updatedAt: string;
  creator: User | null;
  pages: DocPage[];
}

export interface KeyResult {
  id: string;
  goalId: string;
  name: string;
  type: 'number' | 'currency' | 'boolean' | 'percentage' | 'task';
  stepsStart: number;
  stepsEnd: number;
  stepsCurrent: number;
  unit: string | null;
  taskIds: string[];
  completed: boolean;
  percent: number;
  tasks?: { id: string; name: string; customId: string; status: Status | null }[];
}

export interface Goal {
  id: string;
  folderName: string | null;
  name: string;
  description: string;
  color: string;
  ownerId: string | null;
  dueDate: string | null;
  owner: User | null;
  keyResults: KeyResult[];
  percent: number;
}

export interface Widget {
  id: string;
  dashboardId: string;
  type: WidgetType;
  title: string;
  config: WidgetConfig;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Dashboard {
  id: string;
  name: string;
  widgets: Widget[];
}

export interface Home {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  later: Task[];
  noDate: Task[];
  recentDone: (Task & { status: Status | null })[];
  activity: Activity[];
  reminders: Reminder[];
  assignedComments: (Comment & { task: { id: string; name: string; customId: string } | null })[];
  unread: number;
  timeThisWeekMs: number;
  totals: { mine: number; overdue: number; today: number };
}

export const PRIORITIES: Record<number, { label: string; color: string }> = {
  1: { label: 'Urgente', color: '#d33' },
  2: { label: 'Alta', color: '#f0a30a' },
  3: { label: 'Normal', color: '#1090e0' },
  4: { label: 'Baixa', color: '#87909e' },
};
