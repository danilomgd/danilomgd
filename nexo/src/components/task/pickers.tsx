'use client';

import { Calendar, Check, Flag, Plus, Tag as TagIcon, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { api } from '@/lib/api';
import {
  cx,
  fmtDate,
  fmtDuration,
  parseDuration,
  toInputDate,
  toInputDateTime,
} from '@/lib/format';
import { useInvalidate } from '@/lib/hooks';
import { PRIORITIES, type Status, type Tag, type User } from '@/lib/types';
import { Avatar, AvatarStack } from '../ui/avatar';
import { PriorityFlag, StatusDot, TagChip } from '../ui/badges';
import { inputClass } from '../ui/modal';
import { MenuItem, MenuLabel, MenuSeparator, Popover } from '../ui/popover';

export function StatusPicker({
  value,
  statuses,
  onChange,
  children,
  className,
}: {
  value: Status | null | undefined;
  statuses: Status[];
  onChange: (id: string) => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Popover
      triggerClassName={className}
      trigger={
        children ?? (
          <span
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ background: value?.color ?? '#c4c9d2' }}
          >
            {value?.status ?? 'sem status'}
          </span>
        )
      }
    >
      {(close) => (
        <div className="w-52">
          <MenuLabel>Status</MenuLabel>
          {statuses.map((st) => (
            <MenuItem
              key={st.id}
              active={st.id === value?.id}
              icon={<StatusDot status={st} />}
              onClick={() => {
                onChange(st.id);
                close();
              }}
            >
              <span className="uppercase text-[12px] font-medium">{st.status}</span>
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function PriorityPicker({
  value,
  onChange,
  children,
  className,
}: {
  value: number | null;
  onChange: (p: number | null) => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Popover
      triggerClassName={className}
      trigger={children ?? <PriorityFlag priority={value} withLabel />}
    >
      {(close) => (
        <div className="w-44">
          {Object.entries(PRIORITIES).map(([k, v]) => (
            <MenuItem
              key={k}
              active={value === Number(k)}
              icon={<Flag size={13} style={{ color: v.color }} fill={v.color} />}
              onClick={() => {
                onChange(Number(k));
                close();
              }}
            >
              {v.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={<X size={13} />}
            onClick={() => {
              onChange(null);
              close();
            }}
          >
            Limpar
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}

export function AssigneePicker({
  value,
  members,
  onChange,
  children,
  className,
  single,
}: {
  value: User[];
  members: User[];
  onChange: (ids: string[]) => void;
  children?: ReactNode;
  className?: string;
  single?: boolean;
}) {
  const [q, setQ] = useState('');
  const ids = value.map((u) => u.id);
  const filtered = members.filter((m) => m.username.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover triggerClassName={className} trigger={children ?? <AvatarStack users={value} />}>
      {(close) => (
        <div className="w-60">
          <input
            autoFocus
            className={`${inputClass} mb-1`}
            placeholder="Buscar membro"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {filtered.map((m) => {
            const on = ids.includes(m.id);
            return (
              <MenuItem
                key={m.id}
                active={on}
                icon={<Avatar user={m} size={20} />}
                onClick={() => {
                  onChange(
                    single
                      ? on
                        ? []
                        : [m.id]
                      : on
                        ? ids.filter((x) => x !== m.id)
                        : [...ids, m.id],
                  );
                  if (single) close();
                }}
              >
                <span className="flex items-center justify-between">
                  {m.username}
                  {on && <Check size={13} />}
                </span>
              </MenuItem>
            );
          })}
          {ids.length > 0 && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<X size={13} />}
                onClick={() => {
                  onChange([]);
                  close();
                }}
              >
                Remover todos
              </MenuItem>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

export function DatePicker({
  value,
  onChange,
  children,
  className,
  label = 'Data',
  withTime,
  allowTime,
}: {
  value: string | null;
  onChange: (iso: string | null, withTime?: boolean) => void;
  children?: ReactNode;
  className?: string;
  label?: string;
  withTime?: boolean;
  allowTime?: boolean;
}) {
  const [time, setTime] = useState(!!withTime);
  const quick = (days: number | null) => {
    if (days === null) return onChange(null);
    const d = new Date();
    d.setHours(17, 0, 0, 0);
    d.setDate(d.getDate() + days);
    onChange(d.toISOString(), false);
  };
  return (
    <Popover
      triggerClassName={className}
      trigger={
        children ?? (
          <span className={cx('inline-flex items-center gap-1 text-[12px]', !value && 'muted')}>
            <Calendar size={13} /> {value ? fmtDate(value, withTime) : label}
          </span>
        )
      }
    >
      {(close) => (
        <div className="w-64 p-1">
          <div className="mb-2 grid grid-cols-2 gap-1">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-left text-[12px] hover:bg-muted-page"
              onClick={() => {
                quick(0);
                close();
              }}
            >
              Hoje
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-left text-[12px] hover:bg-muted-page"
              onClick={() => {
                quick(1);
                close();
              }}
            >
              Amanhã
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-left text-[12px] hover:bg-muted-page"
              onClick={() => {
                quick(7);
                close();
              }}
            >
              Em 1 semana
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-left text-[12px] hover:bg-muted-page"
              onClick={() => {
                quick(30);
                close();
              }}
            >
              Em 1 mês
            </button>
          </div>
          {allowTime && (
            <label className="mb-1 flex items-center gap-2 px-1 text-[12px]">
              <input type="checkbox" checked={time} onChange={(e) => setTime(e.target.checked)} />{' '}
              Incluir horário
            </label>
          )}
          <input
            type={time ? 'datetime-local' : 'date'}
            className={inputClass}
            value={time ? toInputDateTime(value) : toInputDate(value)}
            onChange={(e) => {
              if (!e.target.value) return onChange(null);
              const d = new Date(time ? e.target.value : `${e.target.value}T17:00:00`);
              onChange(d.toISOString(), time);
            }}
          />
          {value && (
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-1 rounded-md px-2 py-1 text-[12px] text-red-600 hover:bg-muted-page"
              onClick={() => {
                onChange(null);
                close();
              }}
            >
              <X size={12} /> Remover data
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

export function TagPicker({
  value,
  spaceId,
  onChange,
  children,
  className,
}: {
  value: Tag[];
  spaceId: string;
  onChange: (names: string[]) => void;
  children?: ReactNode;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState<Tag[] | null>(null);
  const inv = useInvalidate();
  const load = async () => {
    const r = await api.get<{ tags: Tag[] }>(`space/${spaceId}/tag`);
    setAll(r.tags);
  };
  const names = value.map((t) => t.name);
  const filtered = (all ?? []).filter((t) => t.name.includes(q.toLowerCase()));
  const exists = (all ?? []).some((t) => t.name === q.trim().toLowerCase());
  return (
    <Popover
      triggerClassName={className}
      onOpenChange={(o) => o && load()}
      trigger={
        children ?? (
          <span className="inline-flex flex-wrap items-center gap-1">
            {value.length ? (
              value.map((t) => <TagChip key={t.id} tag={t} small />)
            ) : (
              <span className="inline-flex items-center gap-1 text-[12px] muted">
                <TagIcon size={13} /> Tags
              </span>
            )}
          </span>
        )
      }
    >
      {(close) => (
        <div className="w-60">
          <input
            autoFocus
            className={`${inputClass} mb-1`}
            placeholder="Buscar ou criar tag"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && q.trim()) {
                e.preventDefault();
                const name = q.trim().toLowerCase();
                if (!exists) {
                  await api.post(`space/${spaceId}/tag`, { name });
                  inv.hierarchy();
                }
                onChange(names.includes(name) ? names : [...names, name]);
                setQ('');
                load();
              }
            }}
          />
          <div className="max-h-56 overflow-auto">
            {filtered.map((t) => {
              const on = names.includes(t.name);
              return (
                <MenuItem
                  key={t.id}
                  active={on}
                  onClick={() =>
                    onChange(on ? names.filter((n) => n !== t.name) : [...names, t.name])
                  }
                >
                  <span className="flex items-center justify-between">
                    <TagChip tag={t} small />
                    {on && <Check size={13} />}
                  </span>
                </MenuItem>
              );
            })}
            {q.trim() && !exists && (
              <MenuItem
                icon={<Plus size={13} />}
                onClick={async () => {
                  const name = q.trim().toLowerCase();
                  await api.post(`space/${spaceId}/tag`, { name });
                  onChange([...names, name]);
                  setQ('');
                  load();
                  inv.hierarchy();
                }}
              >
                Criar tag "{q.trim().toLowerCase()}"
              </MenuItem>
            )}
            {all && all.length === 0 && !q && (
              <div className="px-2 py-2 text-[12px] muted">
                Nenhuma tag neste Space. Digite para criar.
              </div>
            )}
          </div>
          {value.length > 0 && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<X size={13} />}
                onClick={() => {
                  onChange([]);
                  close();
                }}
              >
                Remover todas
              </MenuItem>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

export function EstimatePicker({
  value,
  onChange,
  children,
  className,
}: {
  value: number | null;
  onChange: (ms: number | null) => void;
  children?: ReactNode;
  className?: string;
}) {
  const [text, setText] = useState(value ? fmtDuration(value) : '');
  return (
    <Popover
      triggerClassName={className}
      trigger={
        children ?? (
          <span className={cx('text-[12px]', !value && 'muted')}>
            {value ? fmtDuration(value) : 'Estimativa'}
          </span>
        )
      }
    >
      {(close) => (
        <div className="w-56 p-1">
          <div className="mb-1 text-[11px] muted">Ex.: 2h 30m, 45m, 1d (8h)</div>
          <input
            autoFocus
            className={inputClass}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onChange(parseDuration(text));
                close();
              }
            }}
          />
          <div className="mt-1 flex gap-1">
            {['30m', '1h', '2h', '4h', '1d'].map((p) => (
              <button
                key={p}
                type="button"
                className="rounded-md surface px-2 py-0.5 text-[11px] hover:bg-muted-page"
                onClick={() => {
                  onChange(parseDuration(p));
                  close();
                }}
              >
                {p}
              </button>
            ))}
          </div>
          {value && (
            <button
              type="button"
              className="mt-1 text-[12px] text-red-600"
              onClick={() => {
                onChange(null);
                close();
              }}
            >
              Remover
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}
