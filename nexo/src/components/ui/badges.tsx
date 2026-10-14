import { Flag } from 'lucide-react';
import { cx } from '@/lib/format';
import { PRIORITIES, type Status, type Tag } from '@/lib/types';

export function StatusDot({
  status,
  size = 10,
}: {
  status: Status | null | undefined;
  size?: number;
}) {
  return (
    <span
      className="inline-block shrink-0 rounded-[3px]"
      style={{ width: size, height: size, background: status?.color ?? '#c4c9d2' }}
    />
  );
}

export function StatusPill({
  status,
  className,
}: {
  status: Status | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide text-white',
        className,
      )}
      style={{ background: status?.color ?? '#c4c9d2' }}
    >
      {status?.status ?? 'sem status'}
    </span>
  );
}

export function PriorityFlag({
  priority,
  withLabel = false,
  size = 14,
}: {
  priority: number | null | undefined;
  withLabel?: boolean;
  size?: number;
}) {
  const p = priority ? PRIORITIES[priority] : null;
  return (
    <span
      className={cx('inline-flex items-center gap-1', !p && 'muted')}
      title={p?.label ?? 'Sem prioridade'}
    >
      <Flag
        size={size}
        strokeWidth={2.2}
        style={{ color: p?.color ?? '#b5bcc2' }}
        fill={p ? p.color : 'none'}
      />
      {withLabel && <span className="text-xs">{p?.label ?? 'Sem prioridade'}</span>}
    </span>
  );
}

export function TagChip({
  tag,
  onRemove,
  small,
}: {
  tag: Tag;
  onRemove?: () => void;
  small?: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md font-medium',
        small ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs',
      )}
      style={{ background: `${tag.bg}22`, color: tag.bg }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="opacity-60 hover:opacity-100"
          aria-label={`Remover tag ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function Progress({
  value,
  color = '#7b68ee',
  height = 6,
  className,
}: {
  value: number;
  color?: string;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={cx('w-full overflow-hidden rounded-full bg-ink-100', className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </div>
  );
}

export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-line bg-muted-page px-1 font-mono text-[10px] muted">
      {children}
    </kbd>
  );
}
