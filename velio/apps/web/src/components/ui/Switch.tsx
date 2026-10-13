'use client';

import type { InputHTMLAttributes } from 'react';
import s from './ui.module.css';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

export function Switch({ label, description, className, ...rest }: SwitchProps) {
  return (
    <label className={[s.switch, className ?? ''].join(' ')}>
      <input type="checkbox" role="switch" aria-checked={rest.checked} {...rest} />
      <span className={s.track} aria-hidden />
      <span className={s.switchText}>
        <span>{label}</span>
        {description ? <span className={s.hint}>{description}</span> : null}
      </span>
    </label>
  );
}
