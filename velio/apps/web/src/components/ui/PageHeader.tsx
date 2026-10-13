import Link from 'next/link';
import type { ReactNode } from 'react';
import s from './ui.module.css';

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  titleExtra,
}: {
  title: string;
  description?: string;
  crumbs?: Crumb[];
  actions?: ReactNode;
  titleExtra?: ReactNode;
}) {
  return (
    <header className={s.pageHeader}>
      <div className={s.pageHeaderText}>
        {crumbs && crumbs.length > 0 ? (
          <nav className={s.breadcrumb} aria-label="Navegação estrutural">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="row" style={{ gap: 6 }}>
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 ? <span aria-hidden>/</span> : null}
              </span>
            ))}
          </nav>
        ) : null}
        <div className="row">
          <h1>{title}</h1>
          {titleExtra}
        </div>
        {description ? <p className={s.pageDesc}>{description}</p> : null}
      </div>
      {actions ? <div className={s.pageActions}>{actions}</div> : null}
    </header>
  );
}
