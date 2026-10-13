'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo } from 'react';
import { type Column, DataTable, EnumPill, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { fmtDateTime, shortId } from '@/lib/format';
import { humanizeKey } from '@/lib/ops';

type Incident = Record<string, unknown>;

const PREFERRED = [
  'id',
  'kind',
  'type',
  'severity',
  'status',
  'orderId',
  'providerId',
  'message',
  'description',
  'reason',
  'createdAt',
  'resolvedAt',
];
const HIDDEN = new Set(['payload', 'metadata', 'updatedAt']);

function str(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export default function OpsIncidentsPage() {
  const q = useQuery({
    queryKey: ['ops', 'incidents'],
    queryFn: () => api.ops.incidents(),
    refetchInterval: 30_000,
  });

  const columns = useMemo<Column<Incident>[]>(() => {
    const rows = q.data ?? [];
    const keys = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) if (!HIDDEN.has(k)) keys.add(k);
    const ordered = [
      ...PREFERRED.filter((k) => keys.has(k)),
      ...[...keys].filter((k) => !PREFERRED.includes(k)),
    ].slice(0, 9);
    return ordered.map((k) => ({
      key: k,
      header: humanizeKey(k),
      wrap: k === 'message' || k === 'description' || k === 'reason',
      render: (r) => {
        const v = r[k];
        if (k === 'id' && typeof v === 'string') return <span className="mono">#{shortId(v)}</span>;
        if (k === 'orderId' && typeof v === 'string')
          return <Link href={`/ops/orders/${v}`}>#{shortId(v)}</Link>;
        if (/At$/.test(k) && typeof v === 'string') return fmtDateTime(v);
        if ((k === 'severity' || k === 'status' || k === 'kind' || k === 'type') && typeof v === 'string')
          return <EnumPill value={v} />;
        return str(v);
      },
    }));
  }, [q.data]);

  return (
    <div className="page">
      <PageHeader
        title="Incidentes"
        description="Ocorrências registradas pela operação e pelos alertas automáticos."
      />
      <DataTable
        caption="Incidentes"
        columns={columns}
        rows={q.data}
        rowKey={(r) => str(r.id)}
        loading={q.isLoading || q.isFetching}
        error={q.error}
        errorMessage={errorMessage(q.error)}
        onRetry={() => q.refetch()}
        emptyTitle="Sem incidentes"
        emptyDescription="Nenhuma ocorrência aberta no momento."
      />
    </div>
  );
}
