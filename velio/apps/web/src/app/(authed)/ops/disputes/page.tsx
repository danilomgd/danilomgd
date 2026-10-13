'use client';

import { useQuery } from '@tanstack/react-query';
import type { Dispute } from '@velio/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { ResolveDisputeDialog } from '@/components/ops/OrderActionDialogs';
import { Button, type Column, DataTable, EnumPill, PageHeader, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { fmtDateTime, formatBRL, shortId } from '@/lib/format';

const REASONS: Record<string, string> = {
  NOT_DONE: 'Serviço não realizado',
  POOR_QUALITY: 'Qualidade insuficiente',
  DAMAGE: 'Dano',
  OVERCHARGE: 'Cobrança indevida',
  OTHER: 'Outro',
};

type Filter = 'open' | 'resolved';

export default function OpsDisputesPage() {
  const [filter, setFilter] = useState<Filter>('open');
  const [resolving, setResolving] = useState<Dispute | null>(null);
  const q = useQuery({
    queryKey: ['ops', 'disputes'],
    queryFn: () => api.ops.disputes(),
    refetchInterval: 30_000,
  });

  const all = q.data ?? [];
  const open = all.filter((d) => d.status === 'OPEN' || d.status === 'UNDER_REVIEW');
  const resolved = all.filter((d) => !(d.status === 'OPEN' || d.status === 'UNDER_REVIEW'));
  const rows = filter === 'open' ? open : resolved;

  const columns: Column<Dispute>[] = [
    { key: 'id', header: 'Disputa', render: (d) => <span className="mono">#{shortId(d.id)}</span> },
    {
      key: 'order',
      header: 'Pedido',
      render: (d) => <Link href={`/ops/orders/${d.orderId}`}>#{shortId(d.orderId)}</Link>,
    },
    { key: 'reason', header: 'Motivo', render: (d) => REASONS[d.reason] ?? d.reason },
    { key: 'description', header: 'Descrição', wrap: true, render: (d) => d.description },
    { key: 'status', header: 'Status', render: (d) => <EnumPill value={d.status} /> },
    {
      key: 'resolution',
      header: 'Resolução',
      render: (d) =>
        d.resolution ? (
          <span className="small">
            Reembolso {formatBRL(d.resolution.refundCents)} · repasse{' '}
            {formatBRL(d.resolution.providerPayoutCents)}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: 'created', header: 'Aberta em', render: (d) => fmtDateTime(d.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) =>
        d.status === 'OPEN' || d.status === 'UNDER_REVIEW' ? (
          <Button size="sm" variant="primary" onClick={() => setResolving(d)}>
            Resolver
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Disputas"
        description="Contestações abertas após a conclusão. O repasse fica congelado até a decisão."
      />
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Tabs
          ariaLabel="Filtro de disputas"
          variant="pills"
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'open', label: 'Abertas', count: q.data ? open.length : undefined },
            { key: 'resolved', label: 'Resolvidas', count: q.data ? resolved.length : undefined },
          ]}
        />
      </div>
      <DataTable
        caption="Disputas"
        columns={columns}
        rows={q.data ? rows : undefined}
        rowKey={(d) => d.id}
        loading={q.isLoading || q.isFetching}
        error={q.error}
        errorMessage={errorMessage(q.error)}
        onRetry={() => q.refetch()}
        emptyTitle={filter === 'open' ? 'Nenhuma disputa aberta' : 'Nenhuma disputa resolvida'}
      />
      <ResolveDisputeDialog
        key={resolving?.id ?? 'none'}
        disputeId={resolving?.id ?? null}
        open={Boolean(resolving)}
        onClose={() => setResolving(null)}
      />
    </div>
  );
}
