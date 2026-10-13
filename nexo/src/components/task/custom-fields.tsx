'use client';

import { Check, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cx, fmtDate, fmtMoney, toInputDate } from '@/lib/format';
import type { CustomField, User } from '@/lib/types';
import { Avatar } from '../ui/avatar';
import { Progress } from '../ui/badges';
import { inputClass } from '../ui/modal';
import { MenuItem, Popover } from '../ui/popover';

export function fieldDisplay(field: CustomField, value: unknown, members: User[] = []): string {
  if (value === null || value === undefined || value === '') return '';
  switch (field.type) {
    case 'currency':
      return fmtMoney(Number(value), field.typeConfig.currencyType ?? 'BRL');
    case 'date':
      return fmtDate(String(value));
    case 'checkbox':
      return value ? 'Sim' : 'Não';
    case 'drop_down':
      return field.typeConfig.options?.find((o) => o.id === value)?.name ?? '';
    case 'labels':
      return (Array.isArray(value) ? value : [value])
        .map((v) => field.typeConfig.options?.find((o) => o.id === v)?.name ?? '')
        .filter(Boolean)
        .join(', ');
    case 'users':
      return (Array.isArray(value) ? value : [value])
        .map((v) => members.find((m) => m.id === v)?.username ?? '')
        .filter(Boolean)
        .join(', ');
    case 'progress':
    case 'rating':
    case 'number':
      return String(value);
    default:
      return String(value);
  }
}

/** Editor inline para um campo personalizado. `compact` é usado nas tabelas. */
export function FieldEditor({
  field,
  value,
  onChange,
  members = [],
  compact,
}: {
  field: CustomField;
  value: unknown;
  onChange: (v: unknown) => void;
  members?: User[];
  compact?: boolean;
}) {
  const cls = compact
    ? 'h-7 w-full bg-transparent px-1 text-[12px] outline-none focus:bg-muted-page rounded'
    : inputClass;
  switch (field.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return (
        <TextInput
          className={cls}
          value={(value as string) ?? ''}
          onCommit={(v) => onChange(v || null)}
          type={field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : 'text'}
          placeholder={compact ? '' : (field.typeConfig.placeholder ?? '—')}
        />
      );
    case 'textarea':
      return (
        <TextInput
          className={cls}
          value={(value as string) ?? ''}
          onCommit={(v) => onChange(v || null)}
          multiline={!compact}
        />
      );
    case 'number':
      return (
        <TextInput
          className={cls}
          type="number"
          value={value === null || value === undefined ? '' : String(value)}
          onCommit={(v) => onChange(v === '' ? null : Number(v))}
        />
      );
    case 'currency': {
      return (
        <TextInput
          className={cls}
          type="number"
          value={value === null || value === undefined ? '' : String(value)}
          onCommit={(v) => onChange(v === '' ? null : Number(v))}
          display={
            value !== null && value !== undefined && value !== ''
              ? fmtMoney(Number(value), field.typeConfig.currencyType ?? 'BRL')
              : ''
          }
        />
      );
    }
    case 'date':
      return (
        <input
          type="date"
          className={cls}
          value={toInputDate(value as string)}
          onChange={(e) =>
            onChange(e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null)
          }
        />
      );
    case 'checkbox':
      return (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={cx(
            'inline-flex h-5 w-5 items-center justify-center rounded border',
            value ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-300',
          )}
          aria-label={field.name}
        >
          {value ? <Check size={13} /> : null}
        </button>
      );
    case 'drop_down': {
      const opt = field.typeConfig.options?.find((o) => o.id === value);
      return (
        <Popover
          trigger={
            opt ? (
              <span
                className="inline-flex h-6 items-center rounded-md px-2 text-[12px] font-medium"
                style={{ background: `${opt.color ?? '#7b68ee'}22`, color: opt.color ?? '#5a46bd' }}
              >
                {opt.name}
              </span>
            ) : (
              <span className="text-[12px] muted">—</span>
            )
          }
        >
          {(close) => (
            <div className="w-48">
              {field.typeConfig.options?.map((o) => (
                <MenuItem
                  key={o.id}
                  active={o.id === value}
                  icon={
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: o.color ?? '#7b68ee' }}
                    />
                  }
                  onClick={() => {
                    onChange(o.id);
                    close();
                  }}
                >
                  {o.name}
                </MenuItem>
              ))}
              <MenuItem
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
    case 'labels': {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      const opts = field.typeConfig.options ?? [];
      return (
        <Popover
          trigger={
            vals.length ? (
              <span className="inline-flex flex-wrap gap-1">
                {vals.map((v) => {
                  const o = opts.find((x) => x.id === v);
                  return o ? (
                    <span
                      key={v}
                      className="inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium"
                      style={{
                        background: `${o.color ?? '#7b68ee'}22`,
                        color: o.color ?? '#5a46bd',
                      }}
                    >
                      {o.name}
                    </span>
                  ) : null;
                })}
              </span>
            ) : (
              <span className="text-[12px] muted">—</span>
            )
          }
        >
          <div className="w-48">
            {opts.map((o) => {
              const on = vals.includes(o.id);
              return (
                <MenuItem
                  key={o.id}
                  active={on}
                  icon={
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: o.color ?? '#7b68ee' }}
                    />
                  }
                  onClick={() => onChange(on ? vals.filter((x) => x !== o.id) : [...vals, o.id])}
                >
                  <span className="flex items-center justify-between">
                    {o.name}
                    {on && <Check size={12} />}
                  </span>
                </MenuItem>
              );
            })}
          </div>
        </Popover>
      );
    }
    case 'rating': {
      const n = field.typeConfig.count ?? 5;
      const v = Number(value ?? 0);
      return (
        <span className="inline-flex items-center gap-0.5">
          {Array.from({ length: n }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(v === i + 1 ? null : i + 1)}
              aria-label={`${i + 1}`}
            >
              <Star
                size={14}
                className={i < v ? 'text-amber-400' : 'text-ink-300'}
                fill={i < v ? 'currentColor' : 'none'}
              />
            </button>
          ))}
        </span>
      );
    }
    case 'progress': {
      const v = Number(value ?? 0);
      return (
        <span className="inline-flex w-full items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={v}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-24 accent-brand-500"
          />
          <Progress value={v} className="hidden flex-1 sm:block" />
          <span className="w-9 text-right text-[12px] tabular-nums">{v}%</span>
        </span>
      );
    }
    case 'users': {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      const sel = members.filter((m) => vals.includes(m.id));
      return (
        <Popover
          trigger={
            sel.length ? (
              <span className="inline-flex -space-x-1">
                {sel.map((m) => (
                  <Avatar key={m.id} user={m} size={20} />
                ))}
              </span>
            ) : (
              <span className="text-[12px] muted">—</span>
            )
          }
        >
          <div className="w-52">
            {members.map((m) => {
              const on = vals.includes(m.id);
              return (
                <MenuItem
                  key={m.id}
                  active={on}
                  icon={<Avatar user={m} size={18} />}
                  onClick={() => onChange(on ? vals.filter((x) => x !== m.id) : [...vals, m.id])}
                >
                  {m.username}
                </MenuItem>
              );
            })}
          </div>
        </Popover>
      );
    }
    case 'formula':
      return <span className="text-[12px] muted">{String(value ?? '—')}</span>;
  }
}

function TextInput({
  value,
  onCommit,
  className,
  type = 'text',
  multiline,
  placeholder,
  display,
}: {
  value: string;
  onCommit: (v: string) => void;
  className: string;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  display?: string;
}) {
  const [v, setV] = useState(value);
  const [focus, setFocus] = useState(false);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    setFocus(false);
    if (v !== value) onCommit(v);
  };
  if (multiline)
    return (
      <textarea
        className={`${className} h-auto py-1.5`}
        rows={2}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
      />
    );
  return (
    <input
      className={className}
      type={focus ? type : 'text'}
      value={focus || !display ? v : display}
      placeholder={placeholder}
      onFocus={() => setFocus(true)}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setV(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
