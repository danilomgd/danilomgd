import type { ReactNode } from 'react';
import s from './ui.module.css';

export interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'warn' | 'danger';
  compact?: boolean;
  onClick?: () => void;
}

export function Stat({ label, value, hint, tone = 'default', compact, onClick }: StatProps) {
  const cls = [
    s.stat,
    compact ? s.statCompact : '',
    tone === 'warn' ? s.statWarn : tone === 'danger' ? s.statDanger : '',
  ]
    .filter(Boolean)
    .join(' ');
  const inner = (
    <>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{value}</span>
      {hint ? <span className={s.statHint}>{hint}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} style={{ textAlign: 'left', cursor: 'pointer' }}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}
