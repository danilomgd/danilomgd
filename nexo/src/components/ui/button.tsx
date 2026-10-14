import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'xs' | 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
  secondary: 'surface hover:bg-muted-page text-ink',
  ghost: 'hover:bg-muted-page text-ink',
  subtle: 'muted hover:bg-muted-page hover:text-ink',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};
const sizes: Record<Size, string> = {
  xs: 'h-6 px-1.5 text-xs gap-1 rounded',
  sm: 'h-7 px-2 text-xs gap-1.5 rounded-md',
  md: 'h-8 px-3 text-sm gap-2 rounded-md',
};

export function Button({
  variant = 'secondary',
  size = 'sm',
  className,
  children,
  icon,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  className,
  children,
  label,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-7 w-7 items-center justify-center rounded-md muted transition-colors hover:bg-muted-page hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
