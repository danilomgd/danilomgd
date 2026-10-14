'use client';

import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/lib/format';
import { IconButton } from './button';

export function Modal({
  open,
  onClose,
  children,
  title,
  width = 520,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  width?: number | string;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cx(
          'animate-fade-in max-h-[88vh] w-full overflow-auto rounded-xl surface shadow-pop',
          className,
        )}
        style={{ maxWidth: width }}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="text-sm font-semibold">{title}</div>
            <IconButton label="Fechar" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium muted">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] muted">{hint}</div>}
    </label>
  );
}

export const inputClass =
  'h-8 w-full rounded-md surface px-2.5 text-[13px] outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100';
export const textareaClass =
  'w-full rounded-md surface px-2.5 py-2 text-[13px] outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  text,
  confirmLabel = 'Excluir',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  text?: string;
  confirmLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      <div className="p-4">
        {text && <p className="mb-4 text-[13px] muted">{text}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="h-8 rounded-md surface px-3 text-sm hover:bg-muted-page"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="h-8 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
