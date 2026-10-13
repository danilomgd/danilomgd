'use client';

import type { ReactNode } from 'react';
import s from './ui.module.css';

export interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}

/** Rótulo visível + dica + erro, em volta de qualquer controle. */
export function Field({ label, htmlFor, required, hint, error, children, className }: FieldProps) {
  return (
    <div className={[s.field, className ?? ''].join(' ')}>
      <label className={s.label} htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className={s.required} aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <span className={s.error} id={`${htmlFor}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={s.hint} id={`${htmlFor}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
