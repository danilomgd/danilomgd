'use client';

import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Topbar } from '@/components/shell/topbar';
import { allLists, useWorkspace } from '@/components/shell/workspace-context';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { inputClass } from '@/components/ui/modal';
import { MenuItem, Popover } from '@/components/ui/popover';
import { api } from '@/lib/api';
import { cx, fmtDuration, parseDuration } from '@/lib/format';
import { useInvalidate } from '@/lib/hooks';
import type { TimeEntry } from '@/lib/types';

export default function TimesheetPage() {
  const { wsId, members, me, openTask, hierarchy } = useWorkspace();
  const inv = useInvalidate();
  const [cursor, setCursor] = useState(new Date());
  const [user, setUser] = useState<string | 'all'>(me?.id ?? 'all');
  const start = startOfWeek(cursor, { weekStartsOn: 1 });
  const end = endOfWeek(cursor, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });
  const q = useQuery({
    queryKey: ['time', wsId, `week:${start.toISOString()}`],
    queryFn: () =>
      api.get<{ data: TimeEntry[] }>(
        `team/${wsId}/time_entries?start_date=${start.toISOString()}&end_date=${addDays(end, 1).toISOString()}`,
      ),
    select: (d) => d.data,
  });
  const entries = (q.data ?? []).filter((e) => user === 'all' || e.userId === user);
  const refresh = () => inv.qc.invalidateQueries({ queryKey: ['time'] });
  const total = entries.reduce((a, e) => a + (e.durationMs ?? 0), 0);
  const billable = entries.filter((e) => e.billable).reduce((a, e) => a + (e.durationMs ?? 0), 0);
  const byTask = new Map<
    string,
    { name: string; id: string | null; days: number[]; total: number }
  >();
  for (const e of entries) {
    const key = e.taskId ?? 'none';
    const cur = byTask.get(key) ?? {
      name: e.task?.name ?? 'Sem tarefa',
      id: e.taskId,
      days: days.map(() => 0),
      total: 0,
    };
    const di = days.findIndex((d) => isSameDay(d, new Date(e.start)));
    if (di >= 0) cur.days[di] += e.durationMs ?? 0;
    cur.total += e.durationMs ?? 0;
    byTask.set(key, cur);
  }
  const dayTotals = days.map((_, i) => [...byTask.values()].reduce((a, r) => a + r.days[i], 0));
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    taskId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    duration: '1h',
    description: '',
    billable: false,
  });
  const lists = allLists(hierarchy);
  const tasksQ = useQuery({
    queryKey: ['tasks', `${wsId}?all`],
    queryFn: () =>
      api.get<{ tasks: { id: string; name: string; customId: string }[] }>(
        `team/${wsId}/task?include_closed=true`,
      ),
    enabled: adding,
  });

  return (
    <>
      <Topbar crumbs={[{ label: 'Controle de tempo' }]} />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1100px] px-5 py-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-semibold">Controle de tempo</h1>
            <div className="ml-4 flex items-center gap-1">
              <Button
                size="sm"
                icon={<ChevronLeft size={14} />}
                onClick={() => setCursor(subWeeks(cursor, 1))}
                aria-label="Semana anterior"
              />
              <Button size="sm" onClick={() => setCursor(new Date())}>
                Esta semana
              </Button>
              <Button
                size="sm"
                icon={<ChevronRight size={14} />}
                onClick={() => setCursor(addWeeks(cursor, 1))}
                aria-label="Próxima semana"
              />
              <span className="ml-2 text-[13px] font-medium">
                {format(start, 'd MMM', { locale: ptBR })} –{' '}
                {format(end, 'd MMM yyyy', { locale: ptBR })}
              </span>
            </div>
            <Popover
              trigger={
                <span className="inline-flex h-7 items-center gap-1 rounded-md surface px-2 text-[12px]">
                  {user === 'all' ? (
                    'Todos os membros'
                  ) : (
                    <>
                      <Avatar user={members.find((m) => m.id === user)} size={16} />{' '}
                      {members.find((m) => m.id === user)?.username}
                    </>
                  )}
                </span>
              }
            >
              {(close) => (
                <>
                  <MenuItem
                    onClick={() => {
                      setUser('all');
                      close();
                    }}
                  >
                    Todos
                  </MenuItem>
                  {members.map((m) => (
                    <MenuItem
                      key={m.id}
                      icon={<Avatar user={m} size={16} />}
                      onClick={() => {
                        setUser(m.id);
                        close();
                      }}
                    >
                      {m.username}
                    </MenuItem>
                  ))}
                </>
              )}
            </Popover>
            <div className="ml-auto flex gap-2 text-[12px]">
              <span className="rounded-md surface px-2 py-1">
                Total: <b>{fmtDuration(total)}</b>
              </span>
              <span className="rounded-md surface px-2 py-1">
                Faturável: <b className="text-emerald-700">{fmtDuration(billable)}</b>
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setAdding(true)}
            >
              Registrar tempo
            </Button>
          </div>
          {adding && (
            <form
              className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-brand-300 bg-page p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ms = parseDuration(form.duration);
                if (!ms) return;
                const startAt = new Date(`${form.date}T09:00:00`);
                await api.post(`team/${wsId}/time_entries`, {
                  taskId: form.taskId || null,
                  start: startAt.toISOString(),
                  durationMs: ms,
                  description: form.description,
                  billable: form.billable,
                });
                setAdding(false);
                refresh();
                inv.tasks(form.taskId || undefined);
              }}
            >
              <label className="text-[11px] muted">
                Tarefa
                <select
                  className={`${inputClass} w-72`}
                  value={form.taskId}
                  onChange={(e) => setForm({ ...form, taskId: e.target.value })}
                >
                  <option value="">Sem tarefa</option>
                  {tasksQ.data?.tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.customId} · {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] muted">
                Data
                <input
                  type="date"
                  className={inputClass}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
              <label className="text-[11px] muted">
                Duração
                <input
                  className={`${inputClass} w-24`}
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                />
              </label>
              <label className="text-[11px] muted">
                Descrição
                <input
                  className={`${inputClass} w-56`}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label className="flex h-8 items-center gap-1 text-[12px]">
                <input
                  type="checkbox"
                  checked={form.billable}
                  onChange={(e) => setForm({ ...form, billable: e.target.checked })}
                />{' '}
                Faturável
              </label>
              <Button type="submit" variant="primary">
                Salvar
              </Button>
              <Button type="button" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
            </form>
          )}
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-muted-page text-[11px] font-semibold uppercase muted">
                  <th className="border-b border-line px-3 py-2 text-left">Tarefa</th>
                  {days.map((d) => (
                    <th
                      key={d.toISOString()}
                      className={cx(
                        'border-b border-l border-line px-2 py-2 text-center',
                        isSameDay(d, new Date()) && 'text-brand-700',
                      )}
                    >
                      {format(d, 'EEE d', { locale: ptBR })}
                    </th>
                  ))}
                  <th className="border-b border-l border-line px-2 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...byTask.values()].map((r) => (
                  <tr key={r.id ?? 'none'} className="row-hover">
                    <td className="border-b border-line px-3 py-1.5">
                      <button
                        type="button"
                        className="truncate text-left hover:text-brand-600"
                        onClick={() => r.id && openTask(r.id)}
                      >
                        {r.name}
                      </button>
                    </td>
                    {r.days.map((ms, i) => (
                      <td
                        key={i}
                        className="border-b border-l border-line px-2 py-1.5 text-center tabular-nums"
                      >
                        {ms ? fmtDuration(ms) : <span className="muted">–</span>}
                      </td>
                    ))}
                    <td className="border-b border-l border-line px-2 py-1.5 text-right font-semibold tabular-nums">
                      {fmtDuration(r.total)}
                    </td>
                  </tr>
                ))}
                {byTask.size === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center muted">
                      Nenhum registro nesta semana.
                    </td>
                  </tr>
                )}
                <tr className="bg-muted-page font-semibold">
                  <td className="px-3 py-1.5">Total</td>
                  {dayTotals.map((ms, i) => (
                    <td
                      key={i}
                      className="border-l border-line px-2 py-1.5 text-center tabular-nums"
                    >
                      {ms ? fmtDuration(ms) : '–'}
                    </td>
                  ))}
                  <td className="border-l border-line px-2 py-1.5 text-right tabular-nums">
                    {fmtDuration(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <h2 className="mt-6 mb-2 text-[13px] font-semibold">Registros</h2>
          <div className="divide-y divide-[var(--border)] rounded-lg border border-line">
            {entries.map((e) => (
              <div key={e.id} className="group flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
                <Avatar user={e.user ?? null} size={20} />
                <span className="w-28 shrink-0 whitespace-nowrap muted">
                  {format(new Date(e.start), 'EEE d MMM', { locale: ptBR })}
                </span>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:text-brand-600"
                  onClick={() => e.task && openTask(e.task.id)}
                >
                  {e.task?.name ?? <span className="muted">Sem tarefa</span>}
                  {e.description && <span className="muted"> — {e.description}</span>}
                </button>
                {e.billable && (
                  <span className="rounded bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-700">
                    faturável
                  </span>
                )}
                <span className="w-16 text-right font-medium tabular-nums">
                  {e.end ? fmtDuration(e.durationMs) : 'ativo'}
                </span>
                <button
                  type="button"
                  className="opacity-0 muted hover:text-red-600 group-hover:opacity-100"
                  onClick={async () => {
                    await api.del(`team/${wsId}/time_entries/${e.id}`);
                    refresh();
                  }}
                  aria-label="Excluir"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <span className="hidden">{lists.length}</span>
        </div>
      </div>
    </>
  );
}
