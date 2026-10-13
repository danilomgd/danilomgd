'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDER_STATUS_LABELS, type OrderStatus, type ServiceOrder } from '@velio/contracts';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import s from '@/components/ops/ops.module.css';
import { EmptyState, ErrorState, Select, Skeleton, StatusPill, Tabs, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { fmtDuration, fmtNumber, minutesSince, shortId } from '@/lib/format';
import { groupQueues, humanizeKey, QUEUES, type QueueKey } from '@/lib/ops';
import { useRealtime } from '@/lib/realtime';

const OpsMap = dynamic(() => import('@/components/ops/OpsMap'), {
  ssr: false,
  loading: () => (
    <div className={s.mapPlaceholder}>
      <Skeleton width="60%" height={12} />
    </div>
  ),
});

type MapData = Awaited<ReturnType<typeof api.ops.map>>;

function formatSla(key: string, value: unknown): string {
  if (typeof value === 'number') {
    if (/seconds/i.test(key)) return fmtDuration(value);
    if (/pct|rate/i.test(key)) return `${fmtNumber(value, 1)}%`;
    return fmtNumber(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  return '—';
}

export default function OpsOverviewPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [queue, setQueue] = useState<QueueKey>('no_provider');
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);

  const rtStatus = useRealtime({
    'order.updated': () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'map'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'slas'] });
    },
    'ops.order_needs_attention': (p) => {
      toast.toast(`Pedido #${shortId(p.orderId)} precisa de atenção: ${p.reason}`, 'warning');
      void qc.invalidateQueries({ queryKey: ['ops', 'map'] });
    },
    'provider.location': (p) => {
      qc.setQueryData<MapData>(['ops', 'map'], (prev) => {
        if (!prev) return prev;
        const order = prev.orders.find((o) => o.id === p.orderId);
        if (!order?.providerId) return prev;
        return {
          ...prev,
          providers: prev.providers.map((pr) =>
            pr.id === order.providerId ? { ...pr, lat: p.lat, lng: p.lng } : pr,
          ),
        };
      });
    },
  });
  const live = rtStatus === 'live';

  const mapQ = useQuery({
    queryKey: ['ops', 'map'],
    queryFn: () => api.ops.map(),
    refetchInterval: live ? 60_000 : 15_000,
  });
  const slaQ = useQuery({
    queryKey: ['ops', 'slas'],
    queryFn: () => api.ops.slas(),
    refetchInterval: live ? 60_000 : 15_000,
  });

  const orders = mapQ.data?.orders ?? [];
  const providers = mapQ.data?.providers ?? [];

  const statuses = useMemo(() => Array.from(new Set(orders.map((o) => o.status))).sort(), [orders]);
  const categories = useMemo(() => Array.from(new Set(orders.map((o) => o.categorySlug))).sort(), [orders]);

  const filtered = useMemo(
    () =>
      orders.filter(
        (o) =>
          (!statusFilter || o.status === statusFilter) &&
          (!categoryFilter || o.categorySlug === categoryFilter),
      ),
    [orders, statusFilter, categoryFilter],
  );

  const queues = useMemo(() => groupQueues(orders), [orders]);
  const onlineCount = providers.filter((p) => p.availability === 'ONLINE').length;
  const slaEntries = Object.entries(slaQ.data ?? {})
    .filter(([, v]) => typeof v !== 'object')
    .slice(0, 6);

  return (
    <div className={s.layout}>
      <section className={s.mapArea} aria-label="Mapa operacional">
        <div className={s.mapCanvas}>
          {mapQ.isError && !mapQ.data ? (
            <div className={s.mapPlaceholder}>
              <ErrorState
                message={errorMessage(mapQ.error)}
                onRetry={() => mapQ.refetch()}
                retrying={mapQ.isFetching}
              />
            </div>
          ) : (
            <OpsMap orders={filtered} providers={providers} focusOrderId={focusOrderId} />
          )}
        </div>
        <div className={s.toolbar}>
          <div className={s.toolCard}>
            <label htmlFor="f-status" className="sr-only">
              Filtrar por status
            </label>
            <Select
              id="f-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder="Todos os status"
              options={statuses.map((st) => ({
                value: st,
                label: ORDER_STATUS_LABELS[st as OrderStatus]?.label ?? st,
              }))}
            />
            <label htmlFor="f-cat" className="sr-only">
              Filtrar por categoria
            </label>
            <Select
              id="f-cat"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="Todas as categorias"
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <span className={[s.live, live ? s.liveOn : ''].join(' ')} role="status">
            <span className={s.liveDot} aria-hidden />
            {live ? 'Ao vivo' : rtStatus === 'connecting' ? 'Conectando' : 'Atualizando a cada 15 s'}
          </span>
        </div>
        <section className={s.legend} aria-label="Legenda do mapa">
          <span className={s.legendItem}>
            <span className={s.legendDot} style={{ background: 'var(--color-success)' }} /> Profissional
            online
          </span>
          <span className={s.legendItem}>
            <span className={s.legendDot} style={{ background: 'var(--color-warning)' }} /> Ocupado
          </span>
          <span className={s.legendItem}>
            <span className={s.legendDot} style={{ background: 'var(--color-primary)' }} /> Pedido em curso
          </span>
          <span className={s.legendItem}>
            <span className={s.legendDot} style={{ background: 'var(--color-info)' }} /> Procurando
          </span>
          <span className={s.legendItem}>
            <span className={s.legendDot} style={{ background: 'var(--color-danger)' }} /> Disputa
          </span>
        </section>
        <div className={s.kpis}>
          <div className={s.kpi}>
            Ativos <strong>{mapQ.data ? orders.length : '—'}</strong>
          </div>
          <div className={s.kpi}>
            Online <strong>{mapQ.data ? onlineCount : '—'}</strong>
          </div>
        </div>
      </section>

      <aside className={s.panel} aria-label="Filas de atenção">
        <div className={s.panelHead}>
          <h2 style={{ fontSize: 16, marginBottom: 'var(--space-3)' }}>Indicadores do turno</h2>
        </div>
        <div className={s.slaGrid}>
          {slaQ.isLoading ? (
            <>
              <Skeleton height={48} radius="var(--radius-md)" />
              <Skeleton height={48} radius="var(--radius-md)" />
            </>
          ) : slaQ.isError ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <ErrorState compact message={errorMessage(slaQ.error)} onRetry={() => slaQ.refetch()} />
            </div>
          ) : slaEntries.length === 0 ? (
            <p className="caption" style={{ gridColumn: '1 / -1' }}>
              Sem indicadores para o período.
            </p>
          ) : (
            slaEntries.map(([k, v]) => (
              <div key={k} className={s.slaTile}>
                <span>{humanizeKey(k)}</span>
                <strong>{formatSla(k, v)}</strong>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: '0 var(--space-3)' }}>
          <Tabs
            ariaLabel="Filas"
            variant="pills"
            value={queue}
            onChange={setQueue}
            items={QUEUES.map((q) => ({ key: q.key, label: q.label, count: queues[q.key].length }))}
          />
        </div>
        <div className={s.panelBody}>
          <p className="caption" style={{ padding: '0 var(--space-3) var(--space-2)' }}>
            {QUEUES.find((q) => q.key === queue)?.description}
          </p>
          {mapQ.isLoading ? (
            <div className="stack-sm" style={{ padding: 'var(--space-2)' }}>
              <Skeleton height={64} radius="var(--radius-md)" />
              <Skeleton height={64} radius="var(--radius-md)" />
              <Skeleton height={64} radius="var(--radius-md)" />
            </div>
          ) : mapQ.isError && !mapQ.data ? null : queues[queue].length === 0 ? (
            <EmptyState compact title="Fila vazia" description="Nenhum pedido precisa de ação aqui agora." />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="stack-sm">
              {queues[queue].map((o: ServiceOrder) => {
                const waiting = minutesSince(o.updatedAt);
                return (
                  <li
                    key={o.id}
                    className={[s.queueItem, focusOrderId === o.id ? s.queueItemActive : ''].join(' ')}
                  >
                    <button
                      type="button"
                      className={s.queueFocus}
                      onClick={() => setFocusOrderId(o.id)}
                      aria-pressed={focusOrderId === o.id}
                      aria-label={`Localizar pedido ${shortId(o.id)} no mapa`}
                    >
                      <span className={s.queueTitle}>
                        <span className="truncate">{o.serviceName}</span>
                        <span className="mono muted">#{shortId(o.id)}</span>
                      </span>
                      <StatusPill status={o.status} />
                      <span className={s.queueMeta}>
                        <span className="truncate">{o.address?.summary ?? 'Sem endereço'}</span>
                        <span>{waiting !== null ? `${waiting} min esperando` : ''}</span>
                      </span>
                    </button>
                    <Link href={`/ops/orders/${o.id}`} className="small">
                      Abrir pedido
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
