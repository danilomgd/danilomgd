'use client';

import s from './ui.module.css';

export interface TabItem<K extends string = string> {
  key: K;
  label: string;
  count?: number;
}

export interface TabsProps<K extends string> {
  items: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  variant?: 'line' | 'pills';
  ariaLabel: string;
}

export function Tabs<K extends string>({
  items,
  value,
  onChange,
  variant = 'line',
  ariaLabel,
}: TabsProps<K>) {
  return (
    <div
      className={[s.tabs, variant === 'pills' ? s.tabsPills : ''].join(' ')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={[s.tab, active ? s.tabActive : ''].join(' ')}
            onClick={() => onChange(it.key)}
          >
            {it.label}
            {it.count !== undefined ? <span className={s.count}>{it.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
