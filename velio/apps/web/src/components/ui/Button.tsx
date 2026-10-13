'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import s from './ui.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link' | 'destructive' | 'destructiveSoft';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  block = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    s.btn,
    s[variant],
    size === 'sm' ? s.btnSm : size === 'lg' ? s.btnLg : '',
    block ? s.btnBlock : '',
    loading ? s.btnLoading : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className={s.spinner} aria-hidden /> : null}
      {icon ? <span aria-hidden>{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={[s.spinner, className ?? ''].join(' ')} aria-label="Carregando" />;
}
