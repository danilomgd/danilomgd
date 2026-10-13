'use client';

import { Bell, ChevronRight, Clock, Moon, Plus, Search, Square, Sun } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fmtDuration } from '@/lib/format';
import { useInvalidate, useNotifications, useTimer } from '@/lib/hooks';
import { Avatar } from '../ui/avatar';
import { Kbd } from '../ui/badges';
import { Button } from '../ui/button';
import { MenuItem, MenuLabel, MenuSeparator, Popover } from '../ui/popover';
import { QuickCreateTask } from './quick-create';
import { useWorkspace } from './workspace-context';

export interface Crumb {
  label: ReactNode;
  href?: string;
}

export function Topbar({ crumbs = [], actions }: { crumbs?: Crumb[]; actions?: ReactNode }) {
  const { wsId, me, workspace, openSearch } = useWorkspace();
  const notif = useNotifications(wsId);
  const unread = notif.data?.notifications.filter((n) => !n.read).length ?? 0;
  const [create, setCreate] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem('nexo-theme', next);
    } catch {}
  };
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-page px-3">
      <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="shrink-0 muted" />}
            {c.href ? (
              <Link
                href={c.href}
                className="truncate rounded px-1 py-0.5 muted hover:bg-muted-page hover:text-ink"
              >
                {c.label}
              </Link>
            ) : (
              <span className="truncate px-1 font-semibold">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-1.5">
        {actions}
        <button
          type="button"
          onClick={openSearch}
          className="hidden h-8 items-center gap-2 rounded-md surface px-2.5 text-[12px] muted hover:bg-muted-page md:flex"
          style={{ minWidth: 200 }}
        >
          <Search size={14} /> <span className="flex-1 text-left">Buscar...</span> <Kbd>Ctrl K</Kbd>
        </button>
        <TimerChip />
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setCreate(true)}
        >
          Nova tarefa
        </Button>
        <Link
          href={`/w/${wsId}/inbox`}
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md muted hover:bg-muted-page hover:text-ink"
          title="Notificações"
        >
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] rounded-full bg-brand-500 px-1 text-center text-[10px] font-semibold text-white">
              {unread}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md muted hover:bg-muted-page hover:text-ink"
          title="Alternar tema"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <Popover align="end" trigger={<Avatar user={me} size={28} />}>
          {(close) => (
            <div className="w-56">
              <MenuLabel>{me?.username}</MenuLabel>
              <div className="px-2 pb-2 text-[12px] muted">{me?.email}</div>
              <MenuSeparator />
              <MenuLabel>Workspace</MenuLabel>
              <div className="px-2 pb-1 text-[13px]">{workspace?.name}</div>
              <MenuSeparator />
              <MenuItem
                onClick={() => {
                  close();
                  window.location.href = `/w/${wsId}/settings`;
                }}
              >
                Configurações
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  window.location.href = `/w/${wsId}/settings/members`;
                }}
              >
                Membros
              </MenuItem>
            </div>
          )}
        </Popover>
      </div>
      <QuickCreateTask open={create} onClose={() => setCreate(false)} />
    </header>
  );
}

function TimerChip() {
  const { wsId, openTask } = useWorkspace();
  const timer = useTimer(wsId);
  const inv = useInvalidate();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timer.data) return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [timer.data]);
  if (!timer.data) return null;
  const elapsed = Date.now() - new Date(timer.data.start).getTime();
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-[12px] text-emerald-800">
      <Clock size={13} className="animate-pulse" />
      <button
        type="button"
        className="max-w-[140px] truncate hover:underline"
        onClick={() => timer.data?.task && openTask(timer.data.task.id)}
      >
        {timer.data.task?.name ?? timer.data.description ?? 'Cronômetro'}
      </button>
      <span className="font-mono font-semibold tabular-nums">{fmtDuration(elapsed)}</span>
      <button
        type="button"
        title="Parar"
        className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-white hover:bg-emerald-700"
        onClick={async () => {
          await api.post(`team/${wsId}/time_entries/stop`);
          inv.qc.invalidateQueries({ queryKey: ['timer'] });
          inv.qc.invalidateQueries({ queryKey: ['time'] });
          inv.tasks(timer.data?.task?.id);
        }}
      >
        <Square size={10} fill="currentColor" />
      </button>
    </div>
  );
}
