import type { HTMLAttributes, ReactNode } from 'react';
import s from './ui.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  flush?: boolean;
}

export function Card({ title, subtitle, actions, flush, className, children, ...rest }: CardProps) {
  return (
    <section className={[s.card, flush ? s.cardFlush : '', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {title || actions ? (
        <header className={s.cardHeader} style={flush ? { padding: 'var(--space-5) var(--space-5) 0' } : undefined}>
          <div>
            {title ? <h3 className={s.cardTitle}>{title}</h3> : null}
            {subtitle ? <p className={s.cardSubtitle}>{subtitle}</p> : null}
          </div>
          {actions ? <div className="row">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
