'use client';

import type { ReactNode } from 'react';
import { EmptyState, ErrorState } from './EmptyState';
import { SkeletonRows } from './Skeleton';
import s from './DataTable.module.css';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  wrap?: boolean;
  width?: number | string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  errorMessage?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  footer?: ReactNode;
  caption: string;
}

/** Tabela densa (44 px por linha) com estados de carregando, vazio e erro embutidos. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  errorMessage,
  onRetry,
  emptyTitle = 'Nada por aqui',
  emptyDescription,
  emptyAction,
  onRowClick,
  footer,
  caption,
}: DataTableProps<T>) {
  if (loading && !rows) {
    return (
      <div className={s.wrap} style={{ padding: 'var(--space-4)' }}>
        <SkeletonRows rows={6} />
      </div>
    );
  }
  if (error && !rows) {
    return (
      <div className={s.wrap}>
        <ErrorState message={errorMessage ?? 'Falha ao carregar a lista.'} onRetry={onRetry} retrying={loading} />
      </div>
    );
  }
  if (rows && rows.length === 0) {
    return (
      <div className={s.wrap}>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }
  return (
    <div className={s.wrap}>
      <div className={s.scroll}>
        <table className={[s.table, onRowClick ? s.clickable : ''].join(' ')}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={c.align === 'right' ? s.right : undefined}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => {
              const k = rowKey(row);
              return (
                <tr
                  key={k}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' && e.currentTarget === e.target) onRowClick(row);
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={[c.align === 'right' ? s.right : '', c.wrap ? s.wrapCell : ''].join(' ')}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer ? <div className={s.footer}>{footer}</div> : null}
    </div>
  );
}
