'use client';

import type { SelectHTMLAttributes } from 'react';
import s from './ui.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

export function Select({ options, placeholder, invalid, className, ...rest }: SelectProps) {
  const cls = [s.control, invalid ? s.controlError : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={s.selectWrap}>
      <select className={cls} aria-invalid={invalid || undefined} {...rest}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
