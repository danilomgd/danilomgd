'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  Activity,
  Checklist,
  Comment,
  CustomField,
  Dashboard,
  Doc,
  Goal,
  Hierarchy,
  Home,
  Notification,
  Reminder,
  Status,
  Task,
  TimeEntry,
  User,
  Workspace,
} from './types';

export const keys = {
  me: ['me'] as const,
  hierarchy: (ws: string) => ['hierarchy', ws] as const,
  tasks: (scope: string) => ['tasks', scope] as const,
  task: (id: string) => ['task', id] as const,
  comments: (id: string) => ['comments', id] as const,
  checklists: (id: string) => ['checklists', id] as const,
  activity: (id: string) => ['activity', id] as const,
  related: (id: string) => ['related', id] as const,
  fields: (listId: string) => ['fields', listId] as const,
  statuses: (listId: string) => ['statuses', listId] as const,
  home: (ws: string) => ['home', ws] as const,
  notifications: (ws: string) => ['notifications', ws] as const,
  docs: (ws: string) => ['docs', ws] as const,
  doc: (id: string) => ['doc', id] as const,
  goals: (ws: string) => ['goals', ws] as const,
  dashboards: (ws: string) => ['dashboards', ws] as const,
  dashboard: (id: string) => ['dashboard', id] as const,
  time: (ws: string, scope: string) => ['time', ws, scope] as const,
  timer: (ws: string) => ['timer', ws] as const,
  reminders: (ws: string) => ['reminders', ws] as const,
  search: (ws: string, q: string) => ['search', ws, q] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api.get<{ user: User; teams: Workspace[] }>('user'),
    staleTime: 60_000,
  });
}

export function useHierarchy(ws: string) {
  return useQuery({
    queryKey: keys.hierarchy(ws),
    queryFn: () => api.get<Hierarchy>(`team/${ws}/hierarchy`),
    staleTime: 15_000,
  });
}

export function useHome(ws: string) {
  return useQuery({ queryKey: keys.home(ws), queryFn: () => api.get<Home>(`team/${ws}/home`) });
}

export function useNotifications(ws: string) {
  return useQuery({
    queryKey: keys.notifications(ws),
    queryFn: () => api.get<{ notifications: Notification[] }>(`team/${ws}/notification`),
    refetchInterval: 30_000,
  });
}

/** Tarefas de um escopo: lista, pasta, space ou workspace inteiro. */
export function useTasks(
  ws: string,
  scope: {
    listIds?: string[];
    folderIds?: string[];
    spaceIds?: string[];
    assignees?: string[];
    includeClosed?: boolean;
    q?: string;
  },
) {
  const params = new URLSearchParams();
  if (scope.listIds?.length) params.set('list_ids', scope.listIds.join(','));
  if (scope.folderIds?.length) params.set('folder_ids', scope.folderIds.join(','));
  if (scope.spaceIds?.length) params.set('space_ids', scope.spaceIds.join(','));
  if (scope.assignees?.length) params.set('assignees', scope.assignees.join(','));
  if (scope.includeClosed) params.set('include_closed', 'true');
  if (scope.q) params.set('q', scope.q);
  const qs = params.toString();
  return useQuery({
    queryKey: keys.tasks(`${ws}?${qs}`),
    queryFn: () => api.get<{ tasks: Task[] }>(`team/${ws}/task?${qs}`),
    select: (d) => d.tasks,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: keys.task(id ?? ''),
    queryFn: () => api.get<Task>(`task/${id}`),
    enabled: !!id,
  });
}

export function useFields(listId: string | undefined) {
  return useQuery({
    queryKey: keys.fields(listId ?? ''),
    queryFn: () => api.get<{ fields: CustomField[] }>(`list/${listId}/field`),
    enabled: !!listId,
    select: (d) => d.fields,
    staleTime: 30_000,
  });
}

export function useListStatuses(listId: string | undefined) {
  return useQuery({
    queryKey: keys.statuses(listId ?? ''),
    queryFn: () => api.get<{ statuses: Status[] }>(`list/${listId}/statuses`),
    enabled: !!listId,
    select: (d) => d.statuses,
    staleTime: 30_000,
  });
}

export function useComments(taskId: string | null) {
  return useQuery({
    queryKey: keys.comments(taskId ?? ''),
    queryFn: () => api.get<{ comments: Comment[] }>(`task/${taskId}/comment`),
    enabled: !!taskId,
    select: (d) => d.comments,
  });
}

export function useChecklists(taskId: string | null) {
  return useQuery({
    queryKey: keys.checklists(taskId ?? ''),
    queryFn: () => api.get<{ checklists: Checklist[] }>(`task/${taskId}/checklist`),
    enabled: !!taskId,
    select: (d) => d.checklists,
  });
}

export function useActivity(taskId: string | null) {
  return useQuery({
    queryKey: keys.activity(taskId ?? ''),
    queryFn: () => api.get<{ activity: Activity[] }>(`task/${taskId}/activity`),
    enabled: !!taskId,
    select: (d) => d.activity,
  });
}

export function useRelated(taskId: string | null) {
  type Slim = {
    id: string;
    customId: string;
    name: string;
    status: Status | null;
    assignees: User[];
    dueDate: string | null;
  };
  return useQuery({
    queryKey: keys.related(taskId ?? ''),
    queryFn: () =>
      api.get<{ waitingOn: Slim[]; blocking: Slim[]; linked: Slim[] }>(`task/${taskId}/related`),
    enabled: !!taskId,
  });
}

export function useTaskTime(ws: string, taskId: string | null) {
  return useQuery({
    queryKey: keys.time(ws, taskId ?? ''),
    queryFn: () => api.get<{ data: TimeEntry[] }>(`team/${ws}/time_entries?task_id=${taskId}`),
    enabled: !!taskId,
    select: (d) => d.data,
  });
}

export function useTimer(ws: string) {
  return useQuery({
    queryKey: keys.timer(ws),
    queryFn: () => api.get<{ data: TimeEntry | null }>(`team/${ws}/time_entries/current`),
    select: (d) => d.data,
    refetchInterval: 60_000,
  });
}

export function useDocs(ws: string) {
  return useQuery({
    queryKey: keys.docs(ws),
    queryFn: () => api.get<{ docs: Doc[] }>(`team/${ws}/doc`),
    select: (d) => d.docs,
  });
}

export function useDoc(id: string) {
  return useQuery({ queryKey: keys.doc(id), queryFn: () => api.get<Doc>(`doc/${id}`) });
}

export function useGoals(ws: string) {
  return useQuery({
    queryKey: keys.goals(ws),
    queryFn: () => api.get<{ goals: Goal[] }>(`team/${ws}/goal`),
    select: (d) => d.goals,
  });
}

export function useDashboards(ws: string) {
  return useQuery({
    queryKey: keys.dashboards(ws),
    queryFn: () => api.get<{ dashboards: Dashboard[] }>(`team/${ws}/dashboard`),
    select: (d) => d.dashboards,
  });
}

export function useDashboard(id: string) {
  return useQuery({
    queryKey: keys.dashboard(id),
    queryFn: () =>
      api.get<{ dashboard: Dashboard; data: Record<string, unknown> }>(`dashboard/${id}`),
  });
}

export function useReminders(ws: string) {
  return useQuery({
    queryKey: keys.reminders(ws),
    queryFn: () => api.get<{ reminders: Reminder[] }>(`team/${ws}/reminder`),
    select: (d) => d.reminders,
  });
}

/** Invalidação ampla após mutações de tarefa. */
export function useInvalidate() {
  const qc = useQueryClient();
  return {
    tasks: (taskId?: string) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['home'] });
      qc.invalidateQueries({ queryKey: ['hierarchy'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      if (taskId) {
        qc.invalidateQueries({ queryKey: keys.task(taskId) });
        qc.invalidateQueries({ queryKey: keys.activity(taskId) });
        qc.invalidateQueries({ queryKey: keys.related(taskId) });
      }
    },
    hierarchy: () => qc.invalidateQueries({ queryKey: ['hierarchy'] }),
    all: () => qc.invalidateQueries(),
    qc,
  };
}

/** Atualização de tarefa com otimismo no cache da própria tarefa e das listas. */
export function useUpdateTask() {
  const qc = useQueryClient();
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.put<Task>(`task/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const optimistic = (t: Task): Task => {
        if (t.id !== id) return t;
        const next = { ...t };
        if (typeof patch.name === 'string') next.name = patch.name;
        if ('priority' in patch) next.priority = patch.priority as number | null;
        if ('dueDate' in patch)
          next.dueDate = patch.dueDate ? new Date(patch.dueDate as string).toISOString() : null;
        if ('startDate' in patch)
          next.startDate = patch.startDate
            ? new Date(patch.startDate as string).toISOString()
            : null;
        if ('orderIndex' in patch) next.orderIndex = patch.orderIndex as number;
        if ('statusId' in patch && patch.statusId !== next.statusId)
          next.statusId = patch.statusId as string | null;
        if ('description' in patch) next.description = patch.description as string;
        return next;
      };
      qc.setQueriesData<{ tasks: Task[] }>({ queryKey: ['tasks'] }, (old) =>
        old ? { tasks: old.tasks.map(optimistic) } : old,
      );
      qc.setQueryData<Task>(keys.task(id), (old) => (old ? optimistic(old) : old));
    },
    onSuccess: (task) => {
      qc.setQueryData(keys.task(task.id), task);
      qc.setQueriesData<{ tasks: Task[] }>({ queryKey: ['tasks'] }, (old) =>
        old ? { tasks: old.tasks.map((t) => (t.id === task.id ? task : t)) } : old,
      );
      inv.tasks(task.id);
    },
    onError: () => inv.tasks(),
  });
}

export function useCreateTask() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ listId, input }: { listId: string; input: Record<string, unknown> }) =>
      api.post<Task>(`list/${listId}/task`, input),
    onSuccess: () => inv.tasks(),
  });
}

export function useDeleteTask() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del(`task/${id}`),
    onSuccess: () => inv.tasks(),
  });
}
