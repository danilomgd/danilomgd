'use client';

import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isToday,
  isWeekend,
  startOfDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMemo, useRef, useState } from 'react';
import { cx } from '@/lib/format';
import { useUpdateTask } from '@/lib/hooks';
import type { Task } from '@/lib/types';
import { useWorkspace } from '../shell/workspace-context';
import { StatusDot } from '../ui/badges';
import { Button } from '../ui/button';

const DAY_W = 32;
const ROW_H = 34;
const LEFT_W = 300;

/** Gantt: barras entre início e prazo, arraste para mover, bordas para redimensionar, setas de dependência. */
export function GanttView({ tasks }: { tasks: Task[] }) {
  const { openTask } = useWorkspace();
  const update = useUpdateTask();
  const [zoom, setZoom] = useState<'day' | 'week'>('day');
  const dayW = zoom === 'day' ? DAY_W : 12;
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const ids = new Set(tasks.map((t) => t.id));
    const roots = tasks.filter((t) => !t.parentId || !ids.has(t.parentId));
    const out: { t: Task; depth: number }[] = [];
    const walk = (t: Task, depth: number) => {
      out.push({ t, depth });
      for (const c of tasks.filter((x) => x.parentId === t.id)) walk(c, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    return out;
  }, [tasks]);

  const { start, days } = useMemo(() => {
    const dates = tasks.flatMap((t) =>
      [t.startDate, t.dueDate].filter(Boolean).map((d) => new Date(d as string)),
    );
    const min = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date();
    const max = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
    const s = startOfDay(addDays(min, -7));
    const e = startOfDay(addDays(max, 14));
    return { start: s, days: eachDayOfInterval({ start: s, end: e }) };
  }, [tasks]);

  const barOf = (t: Task) => {
    const end = t.dueDate ? startOfDay(new Date(t.dueDate)) : null;
    const st = t.startDate ? startOfDay(new Date(t.startDate)) : end ? addDays(end, -2) : null;
    if (!end && !st) return null;
    const s = st ?? addDays(end!, -2);
    const e = end ?? addDays(s, 2);
    const x = differenceInCalendarDays(s, start) * dayW;
    const w = Math.max(dayW, (differenceInCalendarDays(e, s) + 1) * dayW);
    return { x, w, s, e };
  };

  const drag = useRef<{
    id: string;
    mode: 'move' | 'start' | 'end';
    x0: number;
    bar: NonNullable<ReturnType<typeof barOf>>;
  } | null>(null);
  const [preview, setPreview] = useState<Record<string, { x: number; w: number }>>({});
  const onDown = (e: React.PointerEvent, t: Task, mode: 'move' | 'start' | 'end') => {
    const bar = barOf(t);
    if (!bar) return;
    drag.current = { id: t.id, mode, x0: e.clientX, bar };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dd = Math.round((e.clientX - d.x0) / dayW);
    let { x, w } = d.bar;
    if (d.mode === 'move') x += dd * dayW;
    if (d.mode === 'start') {
      x += dd * dayW;
      w -= dd * dayW;
    }
    if (d.mode === 'end') w += dd * dayW;
    if (w < dayW) w = dayW;
    setPreview((p) => ({ ...p, [d.id]: { x, w } }));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dd = Math.round((e.clientX - d.x0) / dayW);
    setPreview((p) => {
      const n = { ...p };
      delete n[d.id];
      return n;
    });
    if (dd === 0) return;
    let s = d.bar.s;
    let en = d.bar.e;
    if (d.mode === 'move') {
      s = addDays(s, dd);
      en = addDays(en, dd);
    }
    if (d.mode === 'start') s = addDays(s, dd);
    if (d.mode === 'end') en = addDays(en, dd);
    if (en < s) en = s;
    const due = new Date(en);
    due.setHours(17, 0, 0, 0);
    const st = new Date(s);
    st.setHours(9, 0, 0, 0);
    update.mutate({ id: d.id, patch: { startDate: st.toISOString(), dueDate: due.toISOString() } });
  };

  const rowIndex = new Map(rows.map((r, i) => [r.t.id, i]));
  const todayX = differenceInCalendarDays(new Date(), start) * dayW;
  const totalW = days.length * dayW;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="flex gap-0.5 rounded-md surface p-0.5 text-[12px]">
          <button
            type="button"
            className={cx('rounded px-2 py-0.5', zoom === 'day' && 'bg-ink-100 font-medium')}
            onClick={() => setZoom('day')}
          >
            Dias
          </button>
          <button
            type="button"
            className={cx('rounded px-2 py-0.5', zoom === 'week' && 'bg-ink-100 font-medium')}
            onClick={() => setZoom('week')}
          >
            Semanas
          </button>
        </div>
        <Button
          size="sm"
          onClick={() =>
            scrollRef.current?.scrollTo({ left: Math.max(0, todayX - 300), behavior: 'smooth' })
          }
        >
          Hoje
        </Button>
        <span className="text-[12px] muted">
          Arraste as barras para mover; arraste as bordas para alterar início e prazo.
        </span>
      </div>
      <div ref={scrollRef} className="relative flex-1 overflow-auto border-t border-line">
        <div className="flex" style={{ minWidth: LEFT_W + totalW }}>
          <div className="sticky left-0 z-20 shrink-0 bg-page" style={{ width: LEFT_W }}>
            <div className="h-10 border-r border-b border-line px-3 text-[11px] font-medium uppercase leading-10 muted">
              Tarefa
            </div>
            {rows.map(({ t, depth }) => (
              <div
                key={t.id}
                className="flex items-center gap-2 border-r border-b border-line px-3 text-[12px] row-hover"
                style={{ height: ROW_H, paddingLeft: 12 + depth * 16 }}
              >
                <StatusDot status={t.status} />
                <button
                  type="button"
                  className="truncate text-left hover:text-brand-600"
                  onClick={() => openTask(t.id)}
                >
                  {t.name}
                </button>
              </div>
            ))}
          </div>
          <div
            className="relative"
            style={{ width: totalW }}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <div className="sticky top-0 z-10 flex h-10 bg-page">
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  className={cx(
                    'shrink-0 border-r border-b border-line text-center text-[10px] muted',
                    isWeekend(d) && 'bg-muted-page',
                    isToday(d) && 'bg-brand-50 font-semibold text-brand-700',
                  )}
                  style={{ width: dayW }}
                >
                  {zoom === 'day' ? (
                    <>
                      <div className="pt-1 leading-3">{format(d, 'EEEEE', { locale: ptBR })}</div>
                      <div>{format(d, 'd')}</div>
                    </>
                  ) : d.getDay() === 1 ? (
                    <div className="whitespace-nowrap pt-3 pl-1 text-left">
                      {format(d, 'd MMM', { locale: ptBR })}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="absolute inset-0 top-10 flex">
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  className={cx(
                    'shrink-0 border-r border-line/60',
                    isWeekend(d) && 'bg-muted-page/60',
                  )}
                  style={{ width: dayW }}
                />
              ))}
            </div>
            <div
              className="absolute top-10 bottom-0 w-px bg-brand-500"
              style={{ left: todayX + dayW / 2 }}
            />
            <svg
              className="pointer-events-none absolute top-10 left-0"
              width={totalW}
              height={rows.length * ROW_H}
            >
              {rows.map(({ t }) =>
                t.dependencies.waitingOn.map((depId) => {
                  const dep = tasks.find((x) => x.id === depId);
                  const a = dep ? barOf(dep) : null;
                  const b = barOf(t);
                  const ai = rowIndex.get(depId);
                  const bi = rowIndex.get(t.id);
                  if (!a || !b || ai === undefined || bi === undefined) return null;
                  const x1 = a.x + a.w;
                  const y1 = ai * ROW_H + ROW_H / 2;
                  const x2 = b.x;
                  const y2 = bi * ROW_H + ROW_H / 2;
                  const mid = x1 + 8;
                  return (
                    <path
                      key={`${depId}-${t.id}`}
                      d={`M${x1},${y1} H${mid} V${y2} H${x2 - 4}`}
                      fill="none"
                      stroke="#9aa3b2"
                      strokeWidth={1.5}
                      markerEnd="url(#arrow)"
                    />
                  );
                }),
              )}
              <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill="#9aa3b2" />
                </marker>
              </defs>
            </svg>
            {rows.map(({ t }) => {
              const bar = barOf(t);
              const pv = preview[t.id];
              const x = pv?.x ?? bar?.x;
              const w = pv?.w ?? bar?.w;
              const closed = t.status?.type === 'closed';
              return (
                <div
                  key={t.id}
                  className="relative border-b border-line/60"
                  style={{ height: ROW_H }}
                >
                  {bar && x !== undefined && w !== undefined ? (
                    <div
                      className={cx(
                        'absolute top-[7px] flex h-5 cursor-grab select-none items-center rounded text-[10px] font-medium text-white',
                        closed && 'opacity-60',
                      )}
                      style={{ left: x, width: w, background: t.status?.color ?? '#7b68ee' }}
                      onPointerDown={(e) => onDown(e, t, 'move')}
                      onDoubleClick={() => openTask(t.id)}
                      title={`${t.name}`}
                    >
                      <span
                        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onDown(e, t, 'start');
                        }}
                      />
                      <span className="truncate px-2">{t.name}</span>
                      <span
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onDown(e, t, 'end');
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="absolute top-[9px] rounded border border-dashed border-line px-2 text-[10px] muted hover:text-ink"
                      style={{ left: todayX + 4 }}
                      onClick={() => {
                        const due = new Date();
                        due.setHours(17, 0, 0, 0);
                        update.mutate({
                          id: t.id,
                          patch: {
                            startDate: new Date().toISOString(),
                            dueDate: addDays(due, 2).toISOString(),
                          },
                        });
                      }}
                    >
                      + definir datas
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
