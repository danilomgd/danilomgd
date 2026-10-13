'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { ORDER_STATUS_LABELS, OrderStatus, type ServiceOrder, WORKFLOW_KIND_LABELS } from '@velio/contracts';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Button,
  type Column,
  DataTable,
  Input,
  PageHeader,
  Select,
  StatusPill,
  Switch,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { fmtAgo, fmtDateTime, formatBRL, shortId } from '@/lib/format';

const STATUS_OPTIONS = OrderStatus.options.map((st) => ({
  value: st,
  label: `${ORDER_STATUS_LABELS[st].label} (${st})`,
}));

export default function OpsOrdersPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [attention, setAttention] = useState(false);
  const [search, setSearch] = useState('');

  const q = useInfiniteQuery({
    queryKey: ['ops', 'orders', { status, attention }],
    queryFn: ({ pageParam }) =>
      api.ops.orders({
        status: status || undefined,
        attention: attention || undefined,
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });

  const rows = useMemo(() => {
    const all = q.data?.pages.flatMap((p) => p.items) ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (o) =>
        o.id.toLowerCase().includes(term) ||
        o.serviceName.toLowerCase().includes(term) ||
        (o.address?.summary ?? '').toLowerCase().includes(term) ||
        (o.provider?.displayName ?? '').toLowerCase().includes(term),
    );
  }, [q.data, search]);

  const columns: Column<ServiceOrder>[] = [
    { key: 'id', header: 'Pedido', render: (o) => <span className="mono">#{shortId(o.id)}</span>, width: 96 },
    {
      key: 'service',
      header: 'Serviço',
      wrap: true,
      render: (o) => (
        <div>
          <div>{o.serviceName}</div>
          <div className="caption">{WORKFLOW_KIND_LABELS[o.workflowKind]}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (o) => <StatusPill status={o.status} /> },
    {
      key: 'provider',
      header: 'Profissional',
      render: (o) => o.provider?.displayName ?? <span className="muted">—</span>,
    },
    { key: 'address', header: 'Endereço', wrap: true, render: (o) => o.address?.summary ?? '—' },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (o) => <span className="mono">{o.totalCents !== null ? formatBRL(o.totalCents) : '—'}</span>,
    },
    {
      key: 'updated',
      header: 'Atualizado',
      render: (o) => <span title={fmtDateTime(o.updatedAt)}>{fmtAgo(o.updatedAt)}</span>,
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Pedidos"
        description="Todos os pedidos da plataforma, com filtros por status e atenção."
      />
      <div className="row wrap" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ width: 280 }}>
          <label htmlFor="search" className="sr-only">
            Buscar
          </label>
          <Input
            id="search"
            type="search"
            placeholder="Buscar por código, serviço, endereço"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ width: 280 }}>
          <label htmlFor="status" className="sr-only">
            Status
          </label>
          <Select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="Todos os status"
            options={STATUS_OPTIONS}
          />
        </div>
        <Switch label="Só com atenção" checked={attention} onChange={(e) => setAttention(e.target.checked)} />
      </div>
      <DataTable
        caption="Lista de pedidos"
        columns={columns}
        rows={q.data ? rows : undefined}
        rowKey={(o) => o.id}
        loading={q.isLoading || q.isFetching}
        error={q.error}
        errorMessage={errorMessage(q.error)}
        onRetry={() => q.refetch()}
        emptyTitle="Nenhum pedido encontrado"
        emptyDescription="Ajuste os filtros ou aguarde novos pedidos."
        onRowClick={(o) => router.push(`/ops/orders/${o.id}`)}
        footer={
          <>
            <span>{rows.length} pedidos carregados</span>
            {q.hasNextPage ? (
              <Button size="sm" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
                Carregar mais
              </Button>
            ) : null}
          </>
        }
      />
    </div>
  );
}
