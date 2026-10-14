'use client';

import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  MessageSquare,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Topbar } from '@/components/shell/topbar';
import { useWorkspace } from '@/components/shell/workspace-context';
import { AssigneePicker, DatePicker, PriorityPicker } from '@/components/task/pickers';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { PriorityFlag, StatusDot } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { inputClass } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { cx, dueClass, fmtAgo, fmtDate, fmtDuration } from '@/lib/format';
import { useHome, useInvalidate, useUpdateTask } from '@/lib/hooks';
import type { Task } from '@/lib/types';

export default function HomePage() {
  const { wsId, me, members, openTask } = useWorkspace();
  const home = useHome(wsId);
  const update = useUpdateTask();
  const inv = useInvalidate();
  const [reminder, setReminder] = useState('');
  const d = home.data;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const Row = ({ t }: { t: Task }) => (
    <div className="flex h-9 items-center gap-2 border-b border-line px-2 text-[13px] last:border-b-0 row-hover">
      <StatusDot status={t.status} />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left hover:text-brand-600"
        onClick={() => openTask(t.id)}
      >
        {t.name}
      </button>
      <span className="hidden text-[11px] muted md:inline">{t.list?.name}</span>
      <span onClick={(e) => e.stopPropagation()}>
        <AssigneePicker
          value={t.assignees}
          members={members}
          onChange={(ids) => update.mutate({ id: t.id, patch: { assignees: ids } })}
        >
          <AvatarStack users={t.assignees} size={20} max={2} />
        </AssigneePicker>
      </span>
      <span onClick={(e) => e.stopPropagation()}>
        <PriorityPicker
          value={t.priority}
          onChange={(p) => update.mutate({ id: t.id, patch: { priority: p } })}
        >
          <PriorityFlag priority={t.priority} />
        </PriorityPicker>
      </span>
      <span className="w-16 text-right" onClick={(e) => e.stopPropagation()}>
        <DatePicker
          value={t.dueDate}
          onChange={(dt) => update.mutate({ id: t.id, patch: { dueDate: dt } })}
        >
          <span className={cx('text-[12px]', dueClass(t.dueDate))}>
            {t.dueDate ? fmtDate(t.dueDate) : '—'}
          </span>
        </DatePicker>
      </span>
    </div>
  );
  const Section = ({
    title,
    tasks,
    icon,
    tone,
  }: {
    title: string;
    tasks: Task[];
    icon: React.ReactNode;
    tone?: string;
  }) => (
    <div className="rounded-lg border border-line">
      <div
        className={cx(
          'flex items-center gap-2 border-b border-line px-3 py-2 text-[12px] font-semibold',
          tone,
        )}
      >
        {icon} {title}{' '}
        <span className="rounded bg-ink-100 px-1.5 text-[10px] text-ink-600">{tasks.length}</span>
      </div>
      {tasks.length ? (
        tasks.slice(0, 12).map((t) => <Row key={t.id} t={t} />)
      ) : (
        <div className="px-3 py-3 text-[12px] muted">Nada por aqui.</div>
      )}
      {tasks.length > 12 && (
        <Link
          href={`/w/${wsId}/mytasks`}
          className="block px-3 py-2 text-[12px] text-brand-600 hover:underline"
        >
          Ver todas ({tasks.length})
        </Link>
      )}
    </div>
  );

  return (
    <>
      <Topbar crumbs={[{ label: 'Início' }]} />
      <div className="min-h-0 flex-1 overflow-auto bg-muted-page">
        <div className="mx-auto max-w-[1200px] px-5 py-5">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-semibold">
                {greet}, {me?.username.split(' ')[0]}
              </h1>
              <p className="text-[13px] muted">Aqui está o que precisa da sua atenção hoje.</p>
            </div>
            <div className="flex gap-2">
              <Stat label="Minhas tarefas" value={d?.totals.mine ?? 0} />
              <Stat
                label="Atrasadas"
                value={d?.totals.overdue ?? 0}
                tone={d?.totals.overdue ? 'text-red-600' : undefined}
              />
              <Stat label="Hoje" value={d?.totals.today ?? 0} tone="text-amber-600" />
              <Stat label="Horas (7 dias)" value={fmtDuration(d?.timeThisWeekMs ?? 0)} />
            </div>
          </div>
          {!d ? (
            <div className="text-[13px] muted">Carregando...</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                {d.overdue.length > 0 && (
                  <Section
                    title="Atrasadas"
                    tasks={d.overdue}
                    icon={<AlertTriangle size={14} className="text-red-500" />}
                    tone="text-red-700"
                  />
                )}
                <Section
                  title="Hoje"
                  tasks={d.today}
                  icon={<CalendarDays size={14} className="text-amber-500" />}
                />
                <Section
                  title="Próximos 7 dias"
                  tasks={d.upcoming}
                  icon={<CalendarDays size={14} className="text-brand-500" />}
                />
                <Section
                  title="Sem prazo"
                  tasks={d.noDate}
                  icon={<Clock size={14} className="muted" />}
                />
                {d.later.length > 0 && (
                  <Section
                    title="Mais tarde"
                    tasks={d.later}
                    icon={<CalendarDays size={14} className="muted" />}
                  />
                )}
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-line bg-page">
                  <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12px] font-semibold">
                    <MessageSquare size={14} className="text-amber-500" /> Comentários atribuídos a
                    mim{' '}
                    <span className="rounded bg-ink-100 px-1.5 text-[10px] text-ink-600">
                      {d.assignedComments.length}
                    </span>
                  </div>
                  {d.assignedComments.length === 0 && (
                    <div className="px-3 py-3 text-[12px] muted">Nenhum comentário pendente.</div>
                  )}
                  {d.assignedComments.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full border-b border-line px-3 py-2 text-left last:border-b-0 row-hover"
                      onClick={() => c.task && openTask(c.task.id)}
                    >
                      <div className="flex items-center gap-2 text-[11px] muted">
                        <Avatar user={c.user} size={16} /> {c.user?.username} ·{' '}
                        {fmtAgo(c.createdAt)}
                      </div>
                      <div className="truncate text-[12.5px]">{c.text}</div>
                      <div className="truncate text-[11px] text-brand-600">{c.task?.name}</div>
                    </button>
                  ))}
                </div>
                <div className="rounded-lg border border-line bg-page">
                  <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12px] font-semibold">
                    <Bell size={14} className="text-brand-500" /> Lembretes
                  </div>
                  {d.reminders.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12.5px] last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        className="accent-brand-500"
                        onChange={async () => {
                          await api.put(`reminder/${r.id}`, { completed: true });
                          inv.qc.invalidateQueries({ queryKey: ['home'] });
                        }}
                      />
                      <span className="flex-1 truncate">{r.name}</span>
                      {r.dueDate && (
                        <span className={cx('text-[11px]', dueClass(r.dueDate))}>
                          {fmtDate(r.dueDate)}
                        </span>
                      )}
                    </div>
                  ))}
                  <form
                    className="flex gap-1 p-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!reminder.trim()) return;
                      await api.post(`team/${wsId}/reminder`, { name: reminder.trim() });
                      setReminder('');
                      inv.qc.invalidateQueries({ queryKey: ['home'] });
                    }}
                  >
                    <input
                      className={inputClass}
                      placeholder="Novo lembrete"
                      value={reminder}
                      onChange={(e) => setReminder(e.target.value)}
                    />
                    <Button
                      type="submit"
                      size="md"
                      icon={<Plus size={14} />}
                      aria-label="Adicionar"
                    />
                  </form>
                </div>
                <div className="rounded-lg border border-line bg-page">
                  <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12px] font-semibold">
                    <CheckCircle2 size={14} className="text-emerald-500" /> Concluídas recentemente
                  </div>
                  {d.recentDone.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="flex w-full items-center gap-2 border-b border-line px-3 py-1.5 text-left text-[12.5px] last:border-b-0 row-hover"
                      onClick={() => openTask(t.id)}
                    >
                      <StatusDot status={t.status} />{' '}
                      <span className="flex-1 truncate line-through muted">{t.name}</span>
                      <span className="text-[11px] muted">
                        {t.dateClosed && fmtAgo(t.dateClosed)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="rounded-lg border border-line bg-page">
                  <div className="border-b border-line px-3 py-2 text-[12px] font-semibold">
                    Atividade recente
                  </div>
                  {d.activity.slice(0, 10).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="flex w-full items-start gap-2 border-b border-line px-3 py-1.5 text-left text-[12px] last:border-b-0 row-hover"
                      onClick={() => a.task && openTask(a.task.id)}
                    >
                      <Avatar user={a.user} size={18} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{a.user?.username?.split(' ')[0]}</span>{' '}
                        <span className="muted">
                          {a.type === 'created'
                            ? 'criou'
                            : a.type === 'status'
                              ? `→ ${String(a.after ?? '')}`
                              : a.type === 'comment'
                                ? 'comentou em'
                                : a.type}
                        </span>{' '}
                        <span className="truncate">{a.task?.name}</span>
                      </span>
                      <span className="shrink-0 text-[11px] muted">{fmtAgo(a.createdAt)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-page px-3 py-2 text-center">
      <div className={cx('text-[18px] font-semibold leading-tight', tone)}>{value}</div>
      <div className="text-[11px] muted">{label}</div>
    </div>
  );
}
