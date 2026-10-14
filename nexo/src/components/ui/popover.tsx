'use client';

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/lib/format';

interface Props {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  side?: 'bottom' | 'top' | 'right';
  className?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  disabled?: boolean;
}

/** Popover leve com portal; fecha ao clicar fora ou com Esc. */
export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className,
  triggerClassName,
  open: controlled,
  onOpenChange,
  disabled,
}: Props) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlled ?? uncontrolled;
  const setOpen = (o: boolean) => {
    if (controlled === undefined) setUncontrolled(o);
    onOpenChange?.(o);
  };
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      const p = panelRef.current;
      const pw = p?.offsetWidth ?? 240;
      const ph = p?.offsetHeight ?? 200;
      let top = side === 'top' ? r.top - ph - 6 : side === 'right' ? r.top : r.bottom + 6;
      let left = side === 'right' ? r.right + 6 : align === 'end' ? r.right - pw : r.left;
      if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
      if (left < 8) left = 8;
      if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
      setPos({ top, left });
    };
    place();
    const id = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, side, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={cx('inline-flex items-center text-left', triggerClassName)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        {trigger}
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            className={cx(
              'fixed z-[90] animate-fade-in rounded-lg surface p-1 shadow-pop',
              className,
            )}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, minWidth: 180 }}
            onClick={(e) => e.stopPropagation()}
          >
            {typeof children === 'function' ? children(() => setOpen(false)) : children}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  children,
  onClick,
  active,
  danger,
  icon,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted-page',
        active && 'bg-brand-50 text-brand-700',
        danger && 'text-red-600',
        className,
      )}
    >
      {icon && (
        <span className="inline-flex w-4 shrink-0 items-center justify-center muted">{icon}</span>
      )}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide muted">
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div className="my-1 border-t border-line" />;
}
