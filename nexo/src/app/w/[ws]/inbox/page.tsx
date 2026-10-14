'use client';

import { AtSign, Bell, CheckCheck, Clock, MessageSquare, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Topbar } from '@/components/shell/topbar';
import { useWorkspace } from '@/components/shell/workspace-context';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cx, fmtAgo } from '@/lib/format';
import { useInvalidate, useNotifications } from '@/lib/hooks';

const ICONS: Record<string, React.ReactNode> = {
  mention: <AtSign size={14} className="text-brand-500" />,
  comment: <MessageSquare size={14} className="text-sky-500" />,
  comment_assigned: <MessageSquare size={14} className="text-amber-500" />,
  assigned: <UserPlus size={14} className="text-emerald-500" />,
  status: <CheckCheck size={14} className="text-violet-500" />,
  due_soon: <Clock size={14} className="text-amber-500" />,
  overdue: <Clock size={14} className="text-red-500" />,
};

export default function InboxPage() {
  const { wsId, openTask } = useWorkspace();
  const q = useNotifications(wsId);
  const inv = useInvalidate();
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  const all = q.data?.notifications ?? [];
  const items = tab === 'unread' ? all.filter((n) => !n.read) : all;
  const refresh = () => inv.qc.invalidateQueries({ queryKey: ['notifications'] });
  const mark = async (ids: string[] | 'all', read: boolean) => {
    await api.put(`team/${wsId}/notification`, { ids, read });
    refresh();
  };
  return (
    <>
      <Topbar crumbs={[{ label: 'Caixa de entrada' }]} />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[900px] px-5 py-5">
          <div className="mb-4 flex items-center gap-2">
            <h1 className="text-[20px] font-semibold">Caixa de entrada</h1>
            <div className="ml-4 flex rounded-md surface p-0.5 text-[12px]">
              <button
                type="button"
                className={cx('rounded px-2 py-0.5', tab === 'unread' && 'bg-ink-100 font-medium')}
                onClick={() => setTab('unread')}
              >
                Não lidas ({all.filter((n) => !n.read).length})
              </button>
              <button
                type="button"
                className={cx('rounded px-2 py-0.5', tab === 'all' && 'bg-ink-100 font-medium')}
                onClick={() => setTab('all')}
              >
                Todas
              </button>
            </div>
            <Button
              className="ml-auto"
              size="sm"
              icon={<CheckCheck size={13} />}
              onClick={() => mark('all', true)}
            >
              Marcar todas como lidas
            </Button>
          </div>
          <div className="divide-y divide-[var(--border)] rounded-lg border border-line">
            {items.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-[13px] muted">
                <Bell size={28} className="text-ink-300" />
                {tab === 'unread' ? 'Tudo lido. Nada pendente.' : 'Nenhuma notificação.'}
              </div>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={cx(
                  'flex items-start gap-3 px-3 py-2.5 row-hover',
                  !n.read && 'bg-brand-50/40',
                )}
              >
                <span className="mt-1 shrink-0">{ICONS[n.type] ?? <Bell size={14} />}</span>
                <Avatar user={n.actor} size={24} />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={async () => {
                    if (!n.read) await mark([n.id], true);
                    if (n.task) openTask(n.task.id);
                  }}
                >
                  <div className={cx('text-[13px]', !n.read && 'font-medium')}>{n.text}</div>
                  {n.task && (
                    <div className="truncate text-[11px] muted">
                      {n.task.customId} · {n.task.name}
                    </div>
                  )}
                </button>
                <span className="shrink-0 text-[11px] muted">{fmtAgo(n.createdAt)}</span>
                <button
                  type="button"
                  className="shrink-0 text-[11px] muted hover:text-ink"
                  onClick={() => mark([n.id], !n.read)}
                >
                  {n.read ? 'Marcar não lida' : 'Lida'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
