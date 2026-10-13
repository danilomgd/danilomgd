'use client';

import {
  BarChart3,
  BookOpen,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  Globe,
  Home,
  Inbox,
  LayoutDashboard,
  List as ListIcon,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Star,
  Target,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import { useInvalidate } from '@/lib/hooks';
import type { FolderNode, ListNode, SpaceNode } from '@/lib/types';
import { Confirm } from '../ui/modal';
import { MenuItem, MenuSeparator, Popover } from '../ui/popover';
import { toast } from '../ui/toast';
import {
  CreateFolderDialog,
  CreateListDialog,
  CreateSpaceDialog,
  RenameDialog,
} from './create-dialogs';
import { useWorkspace } from './workspace-context';

function NavItem({
  href,
  icon,
  children,
  badge,
  active,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  badge?: ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors',
        active ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-100',
      )}
    >
      <span className="inline-flex w-4 justify-center muted">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {badge}
    </Link>
  );
}

function useExpanded(key: string, def = true) {
  const [open, setOpen] = useState(def);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`nexo-exp:${key}`);
      if (v !== null) setOpen(v === '1');
    } catch {}
  }, [key]);
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(`nexo-exp:${key}`, o ? '0' : '1');
      } catch {}
      return !o;
    });
  };
  return [open, toggle] as const;
}

export function Sidebar() {
  const { wsId, workspace, hierarchy, openSearch } = useWorkspace();
  const pathname = usePathname();
  const base = `/w/${wsId}`;
  const is = (p: string) => pathname === `${base}${p}` || pathname.startsWith(`${base}${p}/`);
  const [createSpace, setCreateSpace] = useState(false);
  const [favOpen, toggleFav] = useExpanded('favorites');
  const [spacesOpen, toggleSpaces] = useExpanded('spaces');
  const unread = 0;

  const favItems = (hierarchy?.favorites ?? [])
    .map((f) => {
      if (f.itemType === 'list') {
        for (const sp of hierarchy!.spaces) {
          const l = [...sp.lists, ...sp.folders.flatMap((x) => x.lists)].find(
            (x) => x.id === f.itemId,
          );
          if (l)
            return {
              key: `${f.itemType}:${f.itemId}`,
              href: `${base}/l/${l.id}`,
              name: l.name,
              icon: <ListIcon size={14} />,
              color: sp.color,
            };
        }
      }
      if (f.itemType === 'space') {
        const sp = hierarchy!.spaces.find((x) => x.id === f.itemId);
        if (sp)
          return {
            key: `${f.itemType}:${f.itemId}`,
            href: `${base}/s/${sp.id}`,
            name: sp.name,
            icon: <SpaceIcon space={sp} size={16} />,
            color: sp.color,
          };
      }
      if (f.itemType === 'folder') {
        for (const sp of hierarchy!.spaces) {
          const fd = sp.folders.find((x) => x.id === f.itemId);
          if (fd)
            return {
              key: `${f.itemType}:${f.itemId}`,
              href: `${base}/f/${fd.id}`,
              name: fd.name,
              icon: <Folder size={14} />,
            };
        }
      }
      if (f.itemType === 'doc') {
        const d = hierarchy!.docs.find((x) => x.id === f.itemId);
        if (d)
          return {
            key: `${f.itemType}:${f.itemId}`,
            href: `${base}/docs/${d.id}`,
            name: d.name,
            icon: <BookOpen size={14} />,
          };
      }
      if (f.itemType === 'dashboard') {
        const d = hierarchy!.dashboards.find((x) => x.id === f.itemId);
        if (d)
          return {
            key: `${f.itemType}:${f.itemId}`,
            href: `${base}/dashboards/${d.id}`,
            name: d.name,
            icon: <LayoutDashboard size={14} />,
          };
      }
      return null;
    })
    .filter(Boolean) as {
    key: string;
    href: string;
    name: string;
    icon: ReactNode;
    color?: string;
  }[];

  return (
    <aside className="flex h-full w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex h-12 items-center gap-2 border-b border-line px-3">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold text-white"
          style={{ background: workspace?.color ?? '#7b68ee' }}
        >
          {workspace?.name?.[0] ?? 'N'}
        </span>
        <span className="flex-1 truncate text-[13px] font-semibold">
          {workspace?.name ?? 'NEXO'}
        </span>
        <button
          type="button"
          onClick={openSearch}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md muted hover:bg-ink-100 hover:text-ink"
          title="Buscar (Ctrl+K)"
        >
          <Search size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <nav className="space-y-0.5">
          <NavItem href={`${base}/home`} icon={<Home size={15} />} active={is('/home')}>
            Início
          </NavItem>
          <NavItem
            href={`${base}/inbox`}
            icon={<Inbox size={15} />}
            active={is('/inbox')}
            badge={
              unread ? (
                <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-white">
                  {unread}
                </span>
              ) : undefined
            }
          >
            Caixa de entrada
          </NavItem>
          <NavItem
            href={`${base}/mytasks`}
            icon={<CheckSquare size={15} />}
            active={is('/mytasks')}
          >
            Minhas tarefas
          </NavItem>
          <NavItem
            href={`${base}/everything`}
            icon={<Globe size={15} />}
            active={is('/everything')}
          >
            Tudo
          </NavItem>
          <NavItem href={`${base}/docs`} icon={<BookOpen size={15} />} active={is('/docs')}>
            Docs
          </NavItem>
          <NavItem
            href={`${base}/dashboards`}
            icon={<LayoutDashboard size={15} />}
            active={is('/dashboards')}
          >
            Dashboards
          </NavItem>
          <NavItem href={`${base}/goals`} icon={<Target size={15} />} active={is('/goals')}>
            Metas
          </NavItem>
          <NavItem href={`${base}/timesheet`} icon={<Clock size={15} />} active={is('/timesheet')}>
            Controle de tempo
          </NavItem>
        </nav>

        {favItems.length > 0 && (
          <section className="mt-4">
            <button
              type="button"
              onClick={toggleFav}
              className="flex h-7 w-full items-center gap-1 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide muted hover:bg-ink-100"
            >
              {favOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Favoritos
            </button>
            {favOpen && (
              <div className="mt-0.5 space-y-0.5">
                {favItems.map((f) => (
                  <Link
                    key={f.key}
                    href={f.href}
                    className={cx(
                      'flex h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-ink-100',
                      pathname === f.href && 'bg-brand-50 text-brand-700',
                    )}
                  >
                    <span
                      className="inline-flex w-4 justify-center muted"
                      style={{ color: f.color }}
                    >
                      {f.icon}
                    </span>
                    <span className="truncate">{f.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="mt-4">
          <div className="flex h-7 items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide muted hover:bg-ink-100">
            <button type="button" onClick={toggleSpaces} className="flex flex-1 items-center gap-1">
              {spacesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Spaces
            </button>
            <button
              type="button"
              onClick={() => setCreateSpace(true)}
              className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-ink-200"
              title="Novo Space"
            >
              <Plus size={13} />
            </button>
          </div>
          {spacesOpen && (
            <div className="mt-0.5 space-y-0.5">
              <Link
                href={`${base}/everything`}
                className={cx(
                  'flex h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-ink-100',
                  is('/everything') && 'bg-brand-50 text-brand-700',
                )}
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-ink-200 text-[10px] font-bold text-ink-700">
                  T
                </span>
                <span>Tudo</span>
              </Link>
              {hierarchy?.spaces.map((sp) => (
                <SpaceTree key={sp.id} space={sp} base={base} pathname={pathname} />
              ))}
              {hierarchy && hierarchy.spaces.length === 0 && (
                <button
                  type="button"
                  onClick={() => setCreateSpace(true)}
                  className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] muted hover:bg-ink-100"
                >
                  <Plus size={14} /> Criar Space
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="border-t border-line p-2">
        <NavItem href={`${base}/settings`} icon={<Settings size={15} />} active={is('/settings')}>
          Configurações
        </NavItem>
      </div>
      <CreateSpaceDialog open={createSpace} onClose={() => setCreateSpace(false)} />
    </aside>
  );
}

export function SpaceIcon({
  space,
  size = 18,
}: {
  space: Pick<SpaceNode, 'name' | 'color' | 'private'>;
  size?: number;
}) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded font-bold text-white"
      style={{ width: size, height: size, background: space.color, fontSize: size * 0.55 }}
    >
      {space.name[0]?.toUpperCase()}
      {space.private && (
        <Lock
          size={8}
          className="absolute -right-1 -bottom-1 rounded-full bg-white p-[1px] text-ink-600"
        />
      )}
    </span>
  );
}

function SpaceTree({
  space,
  base,
  pathname,
}: {
  space: SpaceNode;
  base: string;
  pathname: string;
}) {
  const [open, toggle] = useExpanded(`space:${space.id}`, false);
  const router = useRouter();
  const inv = useInvalidate();
  const { wsId, hierarchy } = useWorkspace();
  const [dlg, setDlg] = useState<'folder' | 'list' | 'rename' | 'delete' | null>(null);
  const href = `${base}/s/${space.id}`;
  const active = pathname === href;
  const isFav = hierarchy?.favorites.some((f) => f.itemType === 'space' && f.itemId === space.id);
  const fav = async () => {
    await api.post(`team/${wsId}/favorite`, { itemType: 'space', itemId: space.id });
    inv.hierarchy();
  };
  return (
    <div>
      <div
        className={cx(
          'group flex h-7 items-center gap-1.5 rounded-md pr-1 pl-1 hover:bg-ink-100',
          active && 'bg-brand-50',
        )}
      >
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-5 w-4 items-center justify-center muted"
          aria-label={open ? 'Recolher' : 'Expandir'}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <Link
          href={href}
          className={cx(
            'flex flex-1 items-center gap-2 truncate text-[13px] font-medium',
            active && 'text-brand-700',
          )}
        >
          <SpaceIcon space={space} />
          <span className="truncate">{space.name}</span>
        </Link>
        <Popover
          align="end"
          triggerClassName="opacity-0 group-hover:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-ink-200 muted"
          trigger={<MoreHorizontal size={14} />}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Pencil size={13} />}
                onClick={() => {
                  close();
                  setDlg('rename');
                }}
              >
                Renomear
              </MenuItem>
              <MenuItem
                icon={<Star size={13} />}
                onClick={() => {
                  close();
                  fav();
                }}
              >
                {isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              </MenuItem>
              <MenuItem
                icon={<Settings size={13} />}
                onClick={() => {
                  close();
                  router.push(`${base}/settings/spaces?space=${space.id}`);
                }}
              >
                Configurações do Space
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Folder size={13} />}
                onClick={() => {
                  close();
                  setDlg('folder');
                }}
              >
                Nova pasta
              </MenuItem>
              <MenuItem
                icon={<ListIcon size={13} />}
                onClick={() => {
                  close();
                  setDlg('list');
                }}
              >
                Nova lista
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Trash2 size={13} />}
                danger
                onClick={() => {
                  close();
                  setDlg('delete');
                }}
              >
                Excluir Space
              </MenuItem>
            </>
          )}
        </Popover>
        <button
          type="button"
          onClick={() => setDlg('list')}
          className="inline-flex h-5 w-5 items-center justify-center rounded opacity-0 hover:bg-ink-200 group-hover:opacity-100 muted"
          title="Nova lista"
        >
          <Plus size={13} />
        </button>
      </div>
      {open && (
        <div className="ml-3 border-l border-line pl-1">
          {space.folders.map((f) => (
            <FolderTree key={f.id} folder={f} space={space} base={base} pathname={pathname} />
          ))}
          {space.lists.map((l) => (
            <ListRow key={l.id} list={l} space={space} base={base} pathname={pathname} />
          ))}
          {space.folders.length === 0 && space.lists.length === 0 && (
            <button
              type="button"
              onClick={() => setDlg('list')}
              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[12px] muted hover:bg-ink-100"
            >
              <Plus size={13} /> Criar lista
            </button>
          )}
        </div>
      )}
      <CreateFolderDialog open={dlg === 'folder'} onClose={() => setDlg(null)} spaceId={space.id} />
      <CreateListDialog open={dlg === 'list'} onClose={() => setDlg(null)} spaceId={space.id} />
      {dlg === 'rename' && (
        <RenameDialog
          open
          onClose={() => setDlg(null)}
          title="Renomear Space"
          initial={space.name}
          onSave={async (name) => {
            await api.put(`space/${space.id}`, { name });
            inv.hierarchy();
          }}
        />
      )}
      <Confirm
        open={dlg === 'delete'}
        onClose={() => setDlg(null)}
        title={`Excluir "${space.name}"?`}
        text="Todas as pastas, listas e tarefas deste Space serão excluídas."
        onConfirm={async () => {
          await api.del(`space/${space.id}`);
          inv.hierarchy();
          toast('Space excluído');
          router.push(`${base}/home`);
        }}
      />
    </div>
  );
}

function FolderTree({
  folder,
  space,
  base,
  pathname,
}: {
  folder: FolderNode;
  space: SpaceNode;
  base: string;
  pathname: string;
}) {
  const [open, toggle] = useExpanded(`folder:${folder.id}`, true);
  const router = useRouter();
  const inv = useInvalidate();
  const { wsId } = useWorkspace();
  const [dlg, setDlg] = useState<'list' | 'rename' | 'delete' | null>(null);
  const href = `${base}/f/${folder.id}`;
  const active = pathname === href;
  return (
    <div>
      <div
        className={cx(
          'group flex h-7 items-center gap-1 rounded-md pr-1 pl-1 hover:bg-ink-100',
          active && 'bg-brand-50',
        )}
      >
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-5 w-4 items-center justify-center muted"
          aria-label={open ? 'Recolher' : 'Expandir'}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <Link
          href={href}
          className={cx(
            'flex flex-1 items-center gap-2 truncate text-[13px]',
            active && 'font-medium text-brand-700',
          )}
        >
          <Folder size={14} className="muted" />
          <span className="truncate">{folder.name}</span>
        </Link>
        <Popover
          align="end"
          triggerClassName="opacity-0 group-hover:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-ink-200 muted"
          trigger={<MoreHorizontal size={14} />}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Pencil size={13} />}
                onClick={() => {
                  close();
                  setDlg('rename');
                }}
              >
                Renomear
              </MenuItem>
              <MenuItem
                icon={<Star size={13} />}
                onClick={async () => {
                  close();
                  await api.post(`team/${wsId}/favorite`, {
                    itemType: 'folder',
                    itemId: folder.id,
                  });
                  inv.hierarchy();
                }}
              >
                Favoritar
              </MenuItem>
              <MenuItem
                icon={<ListIcon size={13} />}
                onClick={() => {
                  close();
                  setDlg('list');
                }}
              >
                Nova lista
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Trash2 size={13} />}
                danger
                onClick={() => {
                  close();
                  setDlg('delete');
                }}
              >
                Excluir pasta
              </MenuItem>
            </>
          )}
        </Popover>
        <button
          type="button"
          onClick={() => setDlg('list')}
          className="inline-flex h-5 w-5 items-center justify-center rounded opacity-0 hover:bg-ink-200 group-hover:opacity-100 muted"
          title="Nova lista"
        >
          <Plus size={13} />
        </button>
      </div>
      {open && (
        <div className="ml-3 border-l border-line pl-1">
          {folder.lists.map((l) => (
            <ListRow key={l.id} list={l} space={space} base={base} pathname={pathname} />
          ))}
        </div>
      )}
      <CreateListDialog open={dlg === 'list'} onClose={() => setDlg(null)} folderId={folder.id} />
      {dlg === 'rename' && (
        <RenameDialog
          open
          onClose={() => setDlg(null)}
          title="Renomear pasta"
          initial={folder.name}
          onSave={async (name) => {
            await api.put(`folder/${folder.id}`, { name });
            inv.hierarchy();
          }}
        />
      )}
      <Confirm
        open={dlg === 'delete'}
        onClose={() => setDlg(null)}
        title={`Excluir "${folder.name}"?`}
        text="Listas e tarefas desta pasta serão excluídas."
        onConfirm={async () => {
          await api.del(`folder/${folder.id}`);
          inv.hierarchy();
          router.push(`${base}/s/${space.id}`);
        }}
      />
    </div>
  );
}

function ListRow({
  list,
  space,
  base,
  pathname,
}: {
  list: ListNode;
  space: SpaceNode;
  base: string;
  pathname: string;
}) {
  const router = useRouter();
  const inv = useInvalidate();
  const { wsId, hierarchy } = useWorkspace();
  const [dlg, setDlg] = useState<'rename' | 'delete' | null>(null);
  const href = `${base}/l/${list.id}`;
  const active = pathname === href;
  const isFav = hierarchy?.favorites.some((f) => f.itemType === 'list' && f.itemId === list.id);
  return (
    <div
      className={cx(
        'group flex h-7 items-center gap-1 rounded-md pr-1 pl-5 hover:bg-ink-100',
        active && 'bg-brand-50',
      )}
    >
      <Link
        href={href}
        className={cx(
          'flex flex-1 items-center gap-2 truncate text-[13px]',
          active && 'font-medium text-brand-700',
        )}
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: list.color ?? space.color }}
        />
        <span className="truncate">{list.name}</span>
      </Link>
      <span className="text-[11px] muted group-hover:hidden">{list.taskCount || ''}</span>
      <Popover
        align="end"
        triggerClassName="hidden group-hover:inline-flex h-5 w-5 items-center justify-center rounded hover:bg-ink-200 muted"
        trigger={<MoreHorizontal size={14} />}
      >
        {(close) => (
          <>
            <MenuItem
              icon={<Pencil size={13} />}
              onClick={() => {
                close();
                setDlg('rename');
              }}
            >
              Renomear
            </MenuItem>
            <MenuItem
              icon={<Star size={13} />}
              onClick={async () => {
                close();
                await api.post(`team/${wsId}/favorite`, { itemType: 'list', itemId: list.id });
                inv.hierarchy();
              }}
            >
              {isFav ? 'Remover dos favoritos' : 'Favoritar'}
            </MenuItem>
            <MenuItem
              icon={<BarChart3 size={13} />}
              onClick={() => {
                close();
                router.push(`${href}?view=board`);
              }}
            >
              Abrir como quadro
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 size={13} />}
              danger
              onClick={() => {
                close();
                setDlg('delete');
              }}
            >
              Excluir lista
            </MenuItem>
          </>
        )}
      </Popover>
      {dlg === 'rename' && (
        <RenameDialog
          open
          onClose={() => setDlg(null)}
          title="Renomear lista"
          initial={list.name}
          onSave={async (name) => {
            await api.put(`list/${list.id}`, { name });
            inv.hierarchy();
          }}
        />
      )}
      <Confirm
        open={dlg === 'delete'}
        onClose={() => setDlg(null)}
        title={`Excluir "${list.name}"?`}
        text="Todas as tarefas desta lista serão excluídas."
        onConfirm={async () => {
          await api.del(`list/${list.id}`);
          inv.hierarchy();
          router.push(`${base}/s/${space.id}`);
        }}
      />
    </div>
  );
}
