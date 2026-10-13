'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import s from './Overlay.module.css';

function useEscapeAndFocus(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(
      'input:not([type=hidden]), select, textarea, button:not([data-close]), [href]',
    );
    (first ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [open, onClose, ref]);
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={s.close} onClick={onClick} aria-label="Fechar" data-close>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Painel lateral à direita (formulários de criação/edição e ações de ordem). */
export function Drawer({ open, onClose, title, description, children, footer, wide }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEscapeAndFocus(open, onClose, ref);
  if (!open) return null;
  return (
    <>
      <div className={s.backdrop} onClick={onClose} aria-hidden />
      <div
        ref={ref}
        className={[s.drawer, wide ? s.drawerWide : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
      >
        <div className={s.head}>
          <div>
            <h2 className={s.title} id={`${id}-title`}>
              {title}
            </h2>
            {description ? <p className={s.desc}>{description}</p> : null}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className={s.body}>{children}</div>
        {footer ? <div className={s.foot}>{footer}</div> : null}
      </div>
    </>
  );
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/** Modal centrado para decisões curtas (cancelar, resolver disputa). */
export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEscapeAndFocus(open, onClose, ref);
  if (!open) return null;
  return (
    <>
      <div className={s.backdrop} onClick={onClose} aria-hidden />
      <div className={s.dialog}>
        <div
          ref={ref}
          className={s.dialogBox}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-title`}
          tabIndex={-1}
        >
          <div className={s.head}>
            <div>
              <h2 className={s.title} id={`${id}-title`}>
                {title}
              </h2>
              {description ? <p className={s.desc}>{description}</p> : null}
            </div>
            <CloseButton onClick={onClose} />
          </div>
          {children ? <div className={s.body}>{children}</div> : null}
          {footer ? <div className={s.foot}>{footer}</div> : null}
        </div>
      </div>
    </>
  );
}
