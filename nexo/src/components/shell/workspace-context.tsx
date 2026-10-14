'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { Hierarchy, ListNode, SpaceNode, User, Workspace } from '@/lib/types';

export interface WorkspaceCtx {
  wsId: string;
  workspace: Workspace | null;
  me: User | null;
  members: User[];
  hierarchy: Hierarchy | null;
  openTask: (id: string | null) => void;
  taskId: string | null;
  openSearch: () => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceCtx;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace fora do WorkspaceProvider');
  return v;
}

/** Localiza uma lista e seu space/pasta na hierarquia carregada. */
export function findList(
  h: Hierarchy | null,
  listId: string,
): { list: ListNode; space: SpaceNode; folder: SpaceNode['folders'][number] | null } | null {
  if (!h) return null;
  for (const space of h.spaces) {
    for (const list of space.lists) if (list.id === listId) return { list, space, folder: null };
    for (const folder of space.folders)
      for (const list of folder.lists) if (list.id === listId) return { list, space, folder };
  }
  return null;
}

export function allLists(h: Hierarchy | null): ListNode[] {
  if (!h) return [];
  return h.spaces.flatMap((s) => [...s.lists, ...s.folders.flatMap((f) => f.lists)]);
}
