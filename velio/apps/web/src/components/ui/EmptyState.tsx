import type { ReactNode } from 'react';
import { Button } from './Button';
import s from './ui.module.css';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={[s.empty, compact ? s.emptyCompact : ''].join(' ')}>
      <div className={s.emptyIcon} aria-hidden>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <rect x="4" y="5" width="16" height="14" rx="3" />
          <path d="M8 10h8M8 14h5" strokeLinecap="round" />
        </svg>
      </div>
      <p className={s.emptyTitle}>{title}</p>
      {description ? <p className={s.emptyBody}>{description}</p> : null}
      {action ? <div className={s.emptyAction}>{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}

/** Erro de rede/servidor com botão de tentar de novo. */
export function ErrorState({
  title = 'Não foi possível carregar',
  message,
  onRetry,
  retrying,
  compact,
}: ErrorStateProps) {
  return (
    <div className={[s.empty, compact ? s.emptyCompact : ''].join(' ')} role="alert">
      <div className={[s.emptyIcon, s.emptyIconDanger].join(' ')} aria-hidden>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8v4.5M12 15.5v.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className={s.emptyTitle}>{title}</p>
      <p className={s.emptyBody}>{message}</p>
      {onRetry ? (
        <div className={s.emptyAction}>
          <Button variant="secondary" onClick={onRetry} loading={retrying}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function InlineAlert({
  tone = 'danger',
  children,
  action,
}: {
  tone?: 'danger' | 'warning' | 'info' | 'success';
  children: ReactNode;
  action?: ReactNode;
}) {
  const cls = { danger: s.alertDanger, warning: s.alertWarning, info: s.alertInfo, success: s.alertSuccess }[
    tone
  ];
  return (
    <div className={[s.alert, cls].join(' ')} role={tone === 'danger' ? 'alert' : 'status'}>
      <span>{children}</span>
      {action}
    </div>
  );
}
