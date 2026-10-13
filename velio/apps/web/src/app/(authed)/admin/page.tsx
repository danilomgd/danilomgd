'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import s from '@/components/admin/admin.module.css';
import { ErrorState, Field, Input, PageHeader, SkeletonTiles, Stat, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { fmtDate, fmtDuration, fmtNumber, fmtPct, fmtRating, formatBRL } from '@/lib/format';

type Preset = '7d' | '30d' | '90d' | 'custom';

function presetRange(p: Preset): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  const days = p === '7d' ? 7 : p === '90d' ? 90 : 30;
  from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function AdminDashboardPage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const range = useMemo(() => {
    if (preset !== 'custom') return presetRange(preset);
    const from = customFrom ? new Date(customFrom).toISOString() : presetRange('30d').from;
    const to = customTo ? new Date(`${customTo}T23:59:59`).toISOString() : new Date().toISOString();
    return { from, to };
  }, [preset, customFrom, customTo]);

  const q = useQuery({
    queryKey: ['admin', 'dashboard', range],
    queryFn: () => api.admin.dashboard(range),
  });
  const d = q.data;

  return (
    <div className="page">
      <PageHeader
        title="Visão geral"
        description={
          d ? `Período: ${fmtDate(d.periodStart)} a ${fmtDate(d.periodEnd)}` : 'Saúde do negócio no período.'
        }
        actions={
          <div className={s.period}>
            <Tabs
              ariaLabel="Período"
              variant="pills"
              value={preset}
              onChange={setPreset}
              items={[
                { key: '7d', label: '7 dias' },
                { key: '30d', label: '30 dias' },
                { key: '90d', label: '90 dias' },
                { key: 'custom', label: 'Personalizado' },
              ]}
            />
            {preset === 'custom' ? (
              <>
                <Field label="De" htmlFor="from">
                  <Input
                    id="from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </Field>
                <Field label="Até" htmlFor="to">
                  <Input id="to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </Field>
              </>
            ) : null}
          </div>
        }
      />
      {q.isLoading ? (
        <SkeletonTiles count={8} />
      ) : q.isError || !d ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : (
        <div className="stack" style={{ gap: 'var(--space-6)' }}>
          <section className="grid-tiles" aria-label="Receita">
            <Stat label="GMV" value={formatBRL(d.gmvCents)} hint="Volume bruto transacionado" />
            <Stat
              label="Receita da plataforma"
              value={formatBRL(d.platformRevenueCents)}
              hint="Comissões capturadas"
            />
            <Stat label="Take rate" value={fmtPct(d.takeRatePct)} />
            <Stat
              label="Ticket médio"
              value={d.avgTicketCents !== null ? formatBRL(d.avgTicketCents) : '—'}
            />
          </section>
          <section className="grid-tiles" aria-label="Pedidos">
            <Stat
              label="Pedidos"
              value={fmtNumber(d.orders)}
              hint={`${fmtNumber(d.completedOrders)} concluídos`}
            />
            <Stat
              label="Cancelamentos"
              value={fmtNumber(d.cancelledOrders)}
              hint={d.orders ? fmtPct((d.cancelledOrders / d.orders) * 100) : undefined}
              tone={d.orders && d.cancelledOrders / d.orders > 0.15 ? 'warn' : 'default'}
            />
            <Stat
              label="Sem profissional"
              value={fmtPct(d.noProviderRatePct)}
              tone={(d.noProviderRatePct ?? 0) > 5 ? 'danger' : 'default'}
              hint="Pedidos que esgotaram as ondas"
            />
            <Stat label="Taxa de recompra" value={fmtPct(d.repeatRatePct)} />
          </section>
          <section className="grid-tiles" aria-label="Operação">
            <Stat
              label="Tempo de matching"
              value={fmtDuration(d.avgMatchingSeconds)}
              hint="Média até o aceite"
            />
            <Stat
              label="Tempo até chegada"
              value={fmtDuration(d.avgArrivalSeconds)}
              hint="Média do aceite à chegada"
            />
            <Stat label="Nota média" value={fmtRating(d.avgRating)} hint="Avaliações do período" />
            <Stat
              label="Profissionais ativos"
              value={fmtNumber(d.activeProviders)}
              hint={`${fmtNumber(d.newCustomers)} novos clientes`}
            />
          </section>
        </div>
      )}
    </div>
  );
}
