'use client';

import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import s from './ui.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  prefix?: string;
  suffix?: string;
}

export function Input({ invalid, prefix, suffix, className, style, ...rest }: InputProps) {
  const cls = [s.control, invalid ? s.controlError : '', className ?? ''].filter(Boolean).join(' ');
  if (!prefix && !suffix) return <input className={cls} aria-invalid={invalid || undefined} style={style} {...rest} />;
  return (
    <div style={{ position: 'relative' }}>
      {prefix ? (
        <span className={s.affix} style={{ left: 12 }}>
          {prefix}
        </span>
      ) : null}
      <input
        className={cls}
        aria-invalid={invalid || undefined}
        style={{ paddingLeft: prefix ? 36 : undefined, paddingRight: suffix ? 40 : undefined, ...style }}
        {...rest}
      />
      {suffix ? (
        <span className={s.affix} style={{ right: 12 }}>
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  const cls = [s.control, invalid ? s.controlError : '', className ?? ''].filter(Boolean).join(' ');
  return <textarea className={cls} aria-invalid={invalid || undefined} {...rest} />;
}
