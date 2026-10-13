import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, schema as s } from '@/db/client';
import { newId } from '@/lib/ids';
import { notFound } from './http';

const DEFAULT_STATUSES = [
  { status: 'a fazer', color: '#87909e', type: 'open' as const },
  { status: 'em andamento', color: '#1090e0', type: 'custom' as const },
  { status: 'concluído', color: '#2ea44f', type: 'closed' as const },
];

const DEFAULT_VIEWS: { type: s.ViewType; name: string }[] = [
  { type: 'list', name: 'Lista' },
  { type: 'board', name: 'Quadro' },
  { type: 'calendar', name: 'Calendário' },
  { type: 'gantt', name: 'Gantt' },
];

export async function getWorkspaces(userId: string) {
  const db = await getDb();
  const rows = await db.query.workspaceMembers.findMany({
    where: eq(s.workspaceMembers.userId, userId),
    with: { workspace: { with: { members: { with: { user: true } } } } },
  });
  return rows.map((r) => ({
    ...r.workspace,
    role: r.role,
    members: r.workspace.members.map((m) => ({ ...m.user, role: m.role })),
  }));
}

export async function getWorkspace(id: string) {
  const db = await getDb();
  const ws = await db.query.workspaces.findFirst({
    where: eq(s.workspaces.id, id),
    with: { members: { with: { user: true } } },
  });
  if (!ws) throw notFound('Workspace');
  return { ...ws, members: ws.members.map((m) => ({ ...m.user, role: m.role })) };
}

/** Árvore completa para a barra lateral, em uma chamada. */
export async function getHierarchy(workspaceId: string, userId: string) {
  const db = await getDb();
  const [spaces, folders, lists, statuses, views, favs, docs, dashboards] = await Promise.all([
    db.query.spaces.findMany({
      where: and(eq(s.spaces.workspaceId, workspaceId), eq(s.spaces.archived, false)),
      orderBy: asc(s.spaces.position),
    }),
    db.query.folders.findMany({ orderBy: asc(s.folders.position) }),
    db.query.lists.findMany({ where: eq(s.lists.archived, false), orderBy: asc(s.lists.position) }),
    db.query.statuses.findMany({ orderBy: asc(s.statuses.orderIndex) }),
    db.query.views.findMany({
      where: eq(s.views.workspaceId, workspaceId),
      orderBy: asc(s.views.position),
    }),
    db.query.favorites.findMany({
      where: and(eq(s.favorites.userId, userId), eq(s.favorites.workspaceId, workspaceId)),
      orderBy: asc(s.favorites.position),
    }),
    db.query.docs.findMany({
      where: and(eq(s.docs.workspaceId, workspaceId), eq(s.docs.archived, false)),
    }),
    db.query.dashboards.findMany({ where: eq(s.dashboards.workspaceId, workspaceId) }),
  ]);
  const counts = await db
    .select({ listId: s.tasks.listId, n: sql<number>`count(*)::int` })
    .from(s.tasks)
    .innerJoin(s.statuses, eq(s.tasks.statusId, s.statuses.id))
    .where(
      and(
        eq(s.tasks.workspaceId, workspaceId),
        eq(s.tasks.archived, false),
        isNull(s.tasks.parentId),
        sql`${s.statuses.type} <> 'closed'`,
      ),
    )
    .groupBy(s.tasks.listId);
  const countMap = new Map(counts.map((c) => [c.listId, c.n]));
  const spaceIds = new Set(spaces.map((x) => x.id));
  const viewsFor = (parentType: string, parentId: string) =>
    views.filter((v) => v.parentType === parentType && v.parentId === parentId);
  const listNode = (l: (typeof lists)[number]) => ({
    ...l,
    taskCount: countMap.get(l.id) ?? 0,
    views: viewsFor('list', l.id),
    statuses: l.overrideStatuses
      ? statuses.filter((st) => st.listId === l.id)
      : statuses.filter((st) => st.spaceId === l.spaceId && !st.listId),
  });
  return {
    spaces: spaces.map((sp) => ({
      ...sp,
      statuses: statuses.filter((st) => st.spaceId === sp.id && !st.listId),
      views: viewsFor('space', sp.id),
      folders: folders
        .filter((f) => f.spaceId === sp.id && !f.archived)
        .map((f) => ({
          ...f,
          views: viewsFor('folder', f.id),
          lists: lists.filter((l) => l.folderId === f.id).map(listNode),
        })),
      lists: lists.filter((l) => l.spaceId === sp.id && !l.folderId).map(listNode),
    })),
    workspaceViews: viewsFor('workspace', workspaceId),
    favorites: favs.filter((f) => f.itemType !== 'space' || spaceIds.has(f.itemId)),
    docs,
    dashboards,
  };
}

// ---------------------------------------------------------------- Spaces

export async function createSpace(
  workspaceId: string,
  input: {
    name: string;
    color?: string;
    icon?: string;
    private?: boolean;
    features?: s.SpaceFeatures;
  },
  userId: string,
) {
  const db = await getDb();
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${s.spaces.position}),0)` })
    .from(s.spaces)
    .where(eq(s.spaces.workspaceId, workspaceId));
  const id = newId();
  await db.insert(s.spaces).values({
    id,
    workspaceId,
    name: input.name,
    color: input.color ?? '#7b68ee',
    icon: input.icon,
    private: input.private ?? false,
    position: Number(max.m) + 1,
    features: input.features ?? {
      dueDates: true,
      startDates: true,
      timeTracking: true,
      timeEstimates: true,
      tags: true,
      priorities: true,
      customFields: true,
      dependencies: true,
      checklists: true,
      multipleAssignees: true,
    },
  });
  await db
    .insert(s.statuses)
    .values(DEFAULT_STATUSES.map((st, i) => ({ id: newId(), spaceId: id, orderIndex: i, ...st })));
  await db.insert(s.views).values(
    DEFAULT_VIEWS.map((v, i) => ({
      id: newId(),
      workspaceId,
      parentType: 'space' as const,
      parentId: id,
      name: v.name,
      type: v.type,
      position: i,
      protected: i === 0,
      createdBy: userId,
      settings: { groupBy: 'status' as const },
    })),
  );
  return getSpace(id);
}

export async function getSpace(id: string) {
  const db = await getDb();
  const sp = await db.query.spaces.findFirst({
    where: eq(s.spaces.id, id),
    with: { statuses: { orderBy: asc(s.statuses.orderIndex) }, tags: true },
  });
  if (!sp) throw notFound('Space');
  return { ...sp, statuses: sp.statuses.filter((st) => !st.listId) };
}

export async function updateSpace(
  id: string,
  input: Partial<{
    name: string;
    color: string;
    icon: string | null;
    private: boolean;
    archived: boolean;
    position: number;
    features: s.SpaceFeatures;
  }>,
) {
  const db = await getDb();
  await db.update(s.spaces).set(input).where(eq(s.spaces.id, id));
  return getSpace(id);
}

export async function deleteSpace(id: string) {
  const db = await getDb();
  await db.delete(s.spaces).where(eq(s.spaces.id, id));
}

// ---------------------------------------------------------------- Statuses

export async function setStatuses(
  spaceId: string,
  listId: string | null,
  input: {
    id?: string;
    status: string;
    color: string;
    type: 'open' | 'custom' | 'done' | 'closed';
  }[],
) {
  const db = await getDb();
  const where = listId
    ? eq(s.statuses.listId, listId)
    : and(eq(s.statuses.spaceId, spaceId), isNull(s.statuses.listId));
  const existing = await db.query.statuses.findMany({ where });
  const keep = new Set<string>();
  for (let i = 0; i < input.length; i++) {
    const st = input[i];
    if (st.id && existing.some((e) => e.id === st.id)) {
      await db
        .update(s.statuses)
        .set({ status: st.status, color: st.color, type: st.type, orderIndex: i })
        .where(eq(s.statuses.id, st.id));
      keep.add(st.id);
    } else {
      const id = newId();
      await db.insert(s.statuses).values({
        id,
        spaceId,
        listId,
        status: st.status,
        color: st.color,
        type: st.type,
        orderIndex: i,
      });
      keep.add(id);
    }
  }
  const removed = existing.filter((e) => !keep.has(e.id));
  if (removed.length) {
    // Tarefas com status removido vão para o primeiro status restante.
    const fallback = [...keep][0] ?? null;
    await db
      .update(s.tasks)
      .set({ statusId: fallback })
      .where(
        inArray(
          s.tasks.statusId,
          removed.map((r) => r.id),
        ),
      );
    await db.delete(s.statuses).where(
      inArray(
        s.statuses.id,
        removed.map((r) => r.id),
      ),
    );
  }
  if (listId)
    await db
      .update(s.lists)
      .set({ overrideStatuses: input.length > 0 })
      .where(eq(s.lists.id, listId));
  return db.query.statuses.findMany({ where, orderBy: asc(s.statuses.orderIndex) });
}

// ---------------------------------------------------------------- Folders

export async function createFolder(spaceId: string, input: { name: string }, userId: string) {
  const db = await getDb();
  const sp = await db.query.spaces.findFirst({ where: eq(s.spaces.id, spaceId) });
  if (!sp) throw notFound('Space');
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${s.folders.position}),0)` })
    .from(s.folders)
    .where(eq(s.folders.spaceId, spaceId));
  const id = newId();
  await db.insert(s.folders).values({ id, spaceId, name: input.name, position: Number(max.m) + 1 });
  await db.insert(s.views).values(
    DEFAULT_VIEWS.map((v, i) => ({
      id: newId(),
      workspaceId: sp.workspaceId,
      parentType: 'folder' as const,
      parentId: id,
      name: v.name,
      type: v.type,
      position: i,
      protected: i === 0,
      createdBy: userId,
      settings: { groupBy: 'status' as const },
    })),
  );
  return getFolder(id);
}

export async function getFolder(id: string) {
  const db = await getDb();
  const f = await db.query.folders.findFirst({
    where: eq(s.folders.id, id),
    with: { lists: { orderBy: asc(s.lists.position) }, space: true },
  });
  if (!f) throw notFound('Pasta');
  return f;
}

export async function updateFolder(
  id: string,
  input: Partial<{ name: string; hidden: boolean; archived: boolean; position: number }>,
) {
  const db = await getDb();
  await db.update(s.folders).set(input).where(eq(s.folders.id, id));
  return getFolder(id);
}

export async function deleteFolder(id: string) {
  const db = await getDb();
  await db.delete(s.folders).where(eq(s.folders.id, id));
}

// ---------------------------------------------------------------- Lists

export async function createList(
  parent: { spaceId?: string; folderId?: string },
  input: {
    name: string;
    content?: string;
    color?: string;
    dueDate?: string | null;
    priority?: number | null;
    assigneeId?: string | null;
  },
  userId: string,
) {
  const db = await getDb();
  let spaceId = parent.spaceId;
  if (parent.folderId) {
    const f = await db.query.folders.findFirst({ where: eq(s.folders.id, parent.folderId) });
    if (!f) throw notFound('Pasta');
    spaceId = f.spaceId;
  }
  if (!spaceId) throw notFound('Space');
  const sp = await db.query.spaces.findFirst({ where: eq(s.spaces.id, spaceId) });
  if (!sp) throw notFound('Space');
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${s.lists.position}),0)` })
    .from(s.lists)
    .where(eq(s.lists.spaceId, spaceId));
  const id = newId();
  await db.insert(s.lists).values({
    id,
    spaceId,
    folderId: parent.folderId ?? null,
    name: input.name,
    content: input.content,
    color: input.color,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    priority: input.priority ?? null,
    assigneeId: input.assigneeId ?? null,
    position: Number(max.m) + 1,
  });
  const views = [...DEFAULT_VIEWS, { type: 'table' as const, name: 'Tabela' }];
  await db.insert(s.views).values(
    views.map((v, i) => ({
      id: newId(),
      workspaceId: sp.workspaceId,
      parentType: 'list' as const,
      parentId: id,
      name: v.name,
      type: v.type,
      position: i,
      protected: i === 0,
      createdBy: userId,
      settings: { groupBy: 'status' as const, showSubtasks: 'collapsed' as const },
    })),
  );
  return getList(id);
}

export async function getList(id: string) {
  const db = await getDb();
  const l = await db.query.lists.findFirst({
    where: eq(s.lists.id, id),
    with: { space: true, folder: true },
  });
  if (!l) throw notFound('Lista');
  const statuses = l.overrideStatuses
    ? await db.query.statuses.findMany({
        where: eq(s.statuses.listId, id),
        orderBy: asc(s.statuses.orderIndex),
      })
    : await db.query.statuses.findMany({
        where: and(eq(s.statuses.spaceId, l.spaceId), isNull(s.statuses.listId)),
        orderBy: asc(s.statuses.orderIndex),
      });
  const views = await db.query.views.findMany({
    where: and(eq(s.views.parentType, 'list'), eq(s.views.parentId, id)),
    orderBy: asc(s.views.position),
  });
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.tasks)
    .where(and(eq(s.tasks.listId, id), eq(s.tasks.archived, false)));
  return { ...l, statuses, views, taskCount: count.n };
}

export async function updateList(
  id: string,
  input: Partial<{
    name: string;
    content: string | null;
    color: string | null;
    dueDate: string | null;
    priority: number | null;
    assigneeId: string | null;
    archived: boolean;
    position: number;
    folderId: string | null;
  }>,
) {
  const db = await getDb();
  const { dueDate, ...rest } = input;
  await db
    .update(s.lists)
    .set({
      ...rest,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
    })
    .where(eq(s.lists.id, id));
  return getList(id);
}

export async function deleteList(id: string) {
  const db = await getDb();
  await db.delete(s.lists).where(eq(s.lists.id, id));
}

// ---------------------------------------------------------------- Tags

export async function getSpaceTags(spaceId: string) {
  const db = await getDb();
  return db.query.tags.findMany({ where: eq(s.tags.spaceId, spaceId), orderBy: asc(s.tags.name) });
}

export async function createTag(
  spaceId: string,
  input: { name: string; bg?: string; fg?: string },
) {
  const db = await getDb();
  const [tag] = await db
    .insert(s.tags)
    .values({
      id: newId(),
      spaceId,
      name: input.name.trim().toLowerCase(),
      bg: input.bg ?? '#7b68ee',
      fg: input.fg ?? '#fff',
    })
    .onConflictDoNothing()
    .returning();
  return (
    tag ??
    db.query.tags.findFirst({
      where: and(eq(s.tags.spaceId, spaceId), eq(s.tags.name, input.name.trim().toLowerCase())),
    })
  );
}

export async function updateTag(
  id: string,
  input: Partial<{ name: string; bg: string; fg: string }>,
) {
  const db = await getDb();
  const [tag] = await db.update(s.tags).set(input).where(eq(s.tags.id, id)).returning();
  if (!tag) throw notFound('Tag');
  return tag;
}

export async function deleteTag(id: string) {
  const db = await getDb();
  await db.delete(s.tags).where(eq(s.tags.id, id));
}

// ---------------------------------------------------------------- Views

export async function getViews(
  parentType: 'workspace' | 'space' | 'folder' | 'list',
  parentId: string,
) {
  const db = await getDb();
  return db.query.views.findMany({
    where: and(eq(s.views.parentType, parentType), eq(s.views.parentId, parentId)),
    orderBy: asc(s.views.position),
  });
}

export async function createView(
  workspaceId: string,
  parentType: 'workspace' | 'space' | 'folder' | 'list',
  parentId: string,
  input: { name: string; type: s.ViewType; settings?: s.ViewSettings },
  userId: string,
) {
  const db = await getDb();
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${s.views.position}),0)` })
    .from(s.views)
    .where(and(eq(s.views.parentType, parentType), eq(s.views.parentId, parentId)));
  const [v] = await db
    .insert(s.views)
    .values({
      id: newId(),
      workspaceId,
      parentType,
      parentId,
      name: input.name,
      type: input.type,
      settings: input.settings ?? { groupBy: 'status' },
      position: Number(max.m) + 1,
      createdBy: userId,
    })
    .returning();
  return v;
}

export async function updateView(
  id: string,
  input: Partial<{ name: string; settings: s.ViewSettings; pinned: boolean; position: number }>,
) {
  const db = await getDb();
  const [v] = await db.update(s.views).set(input).where(eq(s.views.id, id)).returning();
  if (!v) throw notFound('View');
  return v;
}

export async function deleteView(id: string) {
  const db = await getDb();
  await db.delete(s.views).where(eq(s.views.id, id));
}

// ---------------------------------------------------------------- Custom fields

/** Campos visíveis em uma lista: da própria lista, da pasta, do space e do workspace. */
export async function getFieldsForList(listId: string) {
  const db = await getDb();
  const l = await db.query.lists.findFirst({ where: eq(s.lists.id, listId) });
  if (!l) throw notFound('Lista');
  const sp = await db.query.spaces.findFirst({ where: eq(s.spaces.id, l.spaceId) });
  const conds = [
    and(eq(s.customFields.parentType, 'list'), eq(s.customFields.parentId, listId)),
    and(eq(s.customFields.parentType, 'space'), eq(s.customFields.parentId, l.spaceId)),
    and(eq(s.customFields.parentType, 'workspace'), eq(s.customFields.parentId, sp!.workspaceId)),
  ];
  if (l.folderId)
    conds.push(
      and(eq(s.customFields.parentType, 'folder'), eq(s.customFields.parentId, l.folderId)),
    );
  const rows = await db.query.customFields.findMany({ orderBy: asc(s.customFields.position) });
  return rows.filter(
    (f) =>
      (f.parentType === 'list' && f.parentId === listId) ||
      (f.parentType === 'folder' && f.parentId === l.folderId) ||
      (f.parentType === 'space' && f.parentId === l.spaceId) ||
      (f.parentType === 'workspace' && f.parentId === sp!.workspaceId),
  );
}

export async function getFields(
  parentType: 'workspace' | 'space' | 'folder' | 'list',
  parentId: string,
) {
  const db = await getDb();
  return db.query.customFields.findMany({
    where: and(eq(s.customFields.parentType, parentType), eq(s.customFields.parentId, parentId)),
    orderBy: asc(s.customFields.position),
  });
}

export async function createField(
  workspaceId: string,
  parentType: 'workspace' | 'space' | 'folder' | 'list',
  parentId: string,
  input: {
    name: string;
    type: s.CustomFieldType;
    typeConfig?: s.CustomFieldTypeConfig;
    required?: boolean;
  },
) {
  const db = await getDb();
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${s.customFields.position}),0)` })
    .from(s.customFields)
    .where(and(eq(s.customFields.parentType, parentType), eq(s.customFields.parentId, parentId)));
  const typeConfig = { ...(input.typeConfig ?? {}) };
  if (typeConfig.options)
    typeConfig.options = typeConfig.options.map((o, i) => ({
      ...o,
      id: o.id || newId(),
      orderIndex: i,
    }));
  const [f] = await db
    .insert(s.customFields)
    .values({
      id: newId(),
      workspaceId,
      parentType,
      parentId,
      name: input.name,
      type: input.type,
      typeConfig,
      required: input.required ?? false,
      position: Number(max.m) + 1,
    })
    .returning();
  return f;
}

export async function updateField(
  id: string,
  input: Partial<{
    name: string;
    typeConfig: s.CustomFieldTypeConfig;
    required: boolean;
    position: number;
  }>,
) {
  const db = await getDb();
  if (input.typeConfig?.options)
    input.typeConfig.options = input.typeConfig.options.map((o, i) => ({
      ...o,
      id: o.id || newId(),
      orderIndex: i,
    }));
  const [f] = await db
    .update(s.customFields)
    .set(input)
    .where(eq(s.customFields.id, id))
    .returning();
  if (!f) throw notFound('Campo');
  return f;
}

export async function deleteField(id: string) {
  const db = await getDb();
  await db.delete(s.customFields).where(eq(s.customFields.id, id));
}

// ---------------------------------------------------------------- Favoritos

export async function toggleFavorite(
  workspaceId: string,
  userId: string,
  itemType: (typeof s.favorites.$inferInsert)['itemType'],
  itemId: string,
) {
  const db = await getDb();
  const existing = await db.query.favorites.findFirst({
    where: and(
      eq(s.favorites.userId, userId),
      eq(s.favorites.itemType, itemType),
      eq(s.favorites.itemId, itemId),
    ),
  });
  if (existing) {
    await db
      .delete(s.favorites)
      .where(
        and(
          eq(s.favorites.userId, userId),
          eq(s.favorites.itemType, itemType),
          eq(s.favorites.itemId, itemId),
        ),
      );
    return { favorited: false };
  }
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${s.favorites.position}),0)` })
    .from(s.favorites)
    .where(eq(s.favorites.userId, userId));
  await db
    .insert(s.favorites)
    .values({ workspaceId, userId, itemType, itemId, position: Number(max.m) + 1 });
  return { favorited: true };
}

// ---------------------------------------------------------------- Membros

export async function getMembers(workspaceId: string) {
  const db = await getDb();
  const rows = await db.query.workspaceMembers.findMany({
    where: eq(s.workspaceMembers.workspaceId, workspaceId),
    with: { user: true },
  });
  return rows.map((m) => ({ ...m.user, role: m.role, joinedAt: m.joinedAt }));
}

export async function inviteMember(
  workspaceId: string,
  input: { email: string; username?: string; role?: 'admin' | 'member' | 'guest' },
) {
  const db = await getDb();
  let user = await db.query.users.findFirst({
    where: eq(s.users.email, input.email.toLowerCase()),
  });
  if (!user) {
    const name = input.username ?? input.email.split('@')[0];
    const initials = name
      .split(/[\s.]+/)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2);
    const palette = ['#7b68ee', '#1090e0', '#e04f8a', '#2ea44f', '#f0a30a', '#0ab4a8'];
    [user] = await db
      .insert(s.users)
      .values({
        id: newId(),
        email: input.email.toLowerCase(),
        username: name,
        initials: initials || 'U',
        color: palette[name.length % palette.length],
      })
      .returning();
  }
  await db
    .insert(s.workspaceMembers)
    .values({ workspaceId, userId: user!.id, role: input.role ?? 'member' })
    .onConflictDoNothing();
  return getMembers(workspaceId);
}

export async function updateMember(
  workspaceId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member' | 'guest',
) {
  const db = await getDb();
  await db
    .update(s.workspaceMembers)
    .set({ role })
    .where(
      and(eq(s.workspaceMembers.workspaceId, workspaceId), eq(s.workspaceMembers.userId, userId)),
    );
  return getMembers(workspaceId);
}

export async function removeMember(workspaceId: string, userId: string) {
  const db = await getDb();
  await db
    .delete(s.workspaceMembers)
    .where(
      and(eq(s.workspaceMembers.workspaceId, workspaceId), eq(s.workspaceMembers.userId, userId)),
    );
}
