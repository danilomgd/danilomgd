'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EvidenceKind,
  type Message,
  ORDER_STATUS_LABELS,
  type OrderEvent,
  type ServiceOrderDetail,
  WORKFLOW_KIND_LABELS,
} from '@velio/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AssignDrawer } from '@/components/ops/AssignDrawer';
import { CancelByPlatformDialog, ResolveDisputeDialog } from '@/components/ops/OrderActionDialogs';
import { OrderTimeline } from '@/components/ops/OrderTimeline';
import s from '@/components/ops/ops.module.css';
import {
  Button,
  Card,
  EmptyState,
  EnumPill,
  ErrorState,
  Pill,
  Skeleton,
  SkeletonRows,
  StatusPill,
  Tabs,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { fmtDateTime, fmtTime, formatBRL, shortId } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';

type TabKey = 'timeline' | 'payments' | 'quotes' | 'evidence' | 'chat' | 'tasks';

const EVIDENCE_LABELS: Record<string, string> = {
  BEFORE: 'Antes',
  AFTER: 'Depois',
  PICKUP: 'Coleta',
  DELIVERY: 'Entrega',
  CHECKLIST: 'Checklist',
  ODOMETER: 'Odômetro',
  SIGNATURE: 'Assinatura',
  CUSTODY: 'Custódia',
  OTHER: 'Outro',
};

interface EvidenceView {
  id: string;
  kind: string;
  url: string;
  createdAt: string;
}

/** Evidências chegam na linha do tempo como eventos com payload {kind, url}. */
function evidenceFromEvents(events: OrderEvent[]): EvidenceView[] {
  const out: EvidenceView[] = [];
  for (const ev of events) {
    const p = ev.payload;
    const candidates: Array<Record<string, unknown>> = [];
    if (typeof p.url === 'string') candidates.push(p);
    if (p.evidence && typeof p.evidence === 'object') candidates.push(p.evidence as Record<string, unknown>);
    if (Array.isArray(p.evidence))
      for (const e of p.evidence)
        if (e && typeof e === 'object') candidates.push(e as Record<string, unknown>);
    for (const c of candidates) {
      const url = typeof c.url === 'string' ? c.url : typeof c.photoUrl === 'string' ? c.photoUrl : null;
      if (!url) continue;
      const kindRaw = typeof c.kind === 'string' ? c.kind : 'OTHER';
      const kind = EvidenceKind.safeParse(kindRaw).success ? kindRaw : 'OTHER';
      out.push({ id: `${ev.id}-${out.length}`, kind, url, createdAt: ev.createdAt });
    }
  }
  return out;
}

/** Chaves estáveis e únicas para itens sem id (descrição + quantidade + preço, com sufixo em repetições). */
function itemKeys<T extends { description: string; quantity: number; unitPriceCents: number }>(
  items: T[],
): Array<[T, string]> {
  const seen = new Map<string, number>();
  return items.map((it) => {
    const base = `${it.description}|${it.quantity}|${it.unitPriceCents}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return [it, n > 1 ? `${base}#${n}` : base];
  });
}

function Money({ cents }: { cents: number | null | undefined }) {
  return <span className="mono">{cents === null || cents === undefined ? '—' : formatBRL(cents)}</span>;
}

export default function OpsOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('timeline');
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  useRealtime({
    'order.updated': (p) => {
      if (p.orderId === id) void qc.invalidateQueries({ queryKey: ['ops', 'order', id] });
    },
    'order.event': (p) => {
      if (p.orderId === id) void qc.invalidateQueries({ queryKey: ['ops', 'order', id] });
    },
    'message.created': (p) => {
      if (p.orderId === id) void qc.invalidateQueries({ queryKey: ['ops', 'order', id, 'messages'] });
    },
    'payment.updated': (p) => {
      if (p.orderId === id) void qc.invalidateQueries({ queryKey: ['ops', 'order', id, 'payments'] });
    },
  });

  const orderQ = useQuery({
    queryKey: ['ops', 'order', id],
    queryFn: () => api.ops.order(id),
    refetchInterval: 30_000,
  });
  const paymentsQ = useQuery({
    queryKey: ['ops', 'order', id, 'payments'],
    queryFn: () => api.orders.payments(id),
    enabled: tab === 'payments',
  });
  const messagesQ = useQuery({
    queryKey: ['ops', 'order', id, 'messages'],
    queryFn: () => api.orders.messages(id),
    enabled: tab === 'chat',
  });
  const disputesQ = useQuery({
    queryKey: ['ops', 'disputes'],
    queryFn: () => api.ops.disputes(),
    enabled: orderQ.data?.status === 'DISPUTED',
  });

  const order: ServiceOrderDetail | undefined = orderQ.data;
  const evidence = useMemo(() => (order ? evidenceFromEvents(order.events) : []), [order]);
  const openDispute = useMemo(
    () =>
      disputesQ.data?.find((d) => d.orderId === id && (d.status === 'OPEN' || d.status === 'UNDER_REVIEW')) ??
      null,
    [disputesQ.data, id],
  );

  if (orderQ.isLoading) {
    return (
      <div className="page">
        <Skeleton width={240} height={28} />
        <div style={{ height: 16 }} />
        <SkeletonRows rows={5} height={56} />
      </div>
    );
  }
  if (orderQ.isError || !order) {
    return (
      <div className="page">
        <ErrorState
          title="Pedido indisponível"
          message={errorMessage(orderQ.error, 'Pedido não encontrado.')}
          onRetry={() => orderQ.refetch()}
          retrying={orderQ.isFetching}
        />
      </div>
    );
  }

  const canAssign = order.allowedActions.includes('operator.assign') || order.status === 'NO_PROVIDER_FOUND';
  const canCancel = order.allowedActions.includes('operator.cancel');
  const canResolve = order.allowedActions.includes('operator.resolve_dispute') || order.status === 'DISPUTED';

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'timeline', label: 'Linha do tempo', count: order.events.length },
    { key: 'payments', label: 'Pagamentos' },
    { key: 'quotes', label: 'Orçamentos', count: order.quotes.length },
    { key: 'evidence', label: 'Evidências', count: evidence.length },
    { key: 'tasks', label: 'Tarefas', count: order.tasks.length },
    { key: 'chat', label: 'Chat' },
  ];

  return (
    <div className="page">
      <header
        className="row-between wrap"
        style={{ marginBottom: 'var(--space-6)', alignItems: 'flex-start' }}
      >
        <div className="stack-sm">
          <nav className="caption" aria-label="Navegação estrutural">
            <Link href="/ops/orders">Pedidos</Link> / #{shortId(order.id)}
          </nav>
          <div className="row wrap">
            <h1>{order.serviceName}</h1>
            <StatusPill status={order.status} />
          </div>
          <p className="muted small">
            {WORKFLOW_KIND_LABELS[order.workflowKind]} · criado em {fmtDateTime(order.createdAt)} · atualizado{' '}
            {fmtTime(order.updatedAt)}
          </p>
          <p className="small">{ORDER_STATUS_LABELS[order.status]?.customer}</p>
        </div>
        <div className="row wrap">
          {canResolve ? (
            <Button variant="secondary" onClick={() => setDisputeOpen(true)}>
              Resolver disputa
            </Button>
          ) : null}
          {canCancel ? (
            <Button variant="destructiveSoft" onClick={() => setCancelOpen(true)}>
              Cancelar pela plataforma
            </Button>
          ) : null}
          {canAssign ? (
            <Button variant="primary" onClick={() => setAssignOpen(true)}>
              Atribuir manualmente
            </Button>
          ) : null}
        </div>
      </header>

      <div className={s.detailGrid}>
        <div className="stack">
          <Tabs ariaLabel="Seções do pedido" items={tabs} value={tab} onChange={setTab} />
          {tab === 'timeline' ? (
            <Card>
              <OrderTimeline events={order.events} currentStatus={order.status} />
            </Card>
          ) : null}
          {tab === 'payments' ? (
            <Card title="Pagamentos" subtitle="Intenções de pagamento vinculadas ao pedido.">
              {paymentsQ.isLoading ? (
                <SkeletonRows rows={2} />
              ) : paymentsQ.isError ? (
                <ErrorState
                  compact
                  message={errorMessage(paymentsQ.error)}
                  onRetry={() => paymentsQ.refetch()}
                />
              ) : (paymentsQ.data ?? []).length === 0 ? (
                <EmptyState
                  compact
                  title="Sem pagamentos"
                  description="Nenhuma cobrança criada para este pedido."
                />
              ) : (
                <div className="stack-sm">
                  {(paymentsQ.data ?? []).map((p) => (
                    <div
                      key={p.id}
                      className="row-between"
                      style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}
                    >
                      <div>
                        <div className="row">
                          <EnumPill value={p.kind} />
                          <span className="small muted">
                            {p.methodKind} · {p.gateway}
                          </span>
                        </div>
                        <div className="caption">{fmtDateTime(p.createdAt)}</div>
                        {p.failureMessage ? (
                          <div className="small" style={{ color: 'var(--color-danger)' }}>
                            {p.failureMessage}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Money cents={p.amountCents} />
                        <div>
                          <EnumPill value={p.status} />
                        </div>
                        {p.refundedCents > 0 ? (
                          <div className="caption">Reembolsado: {formatBRL(p.refundedCents)}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : null}
          {tab === 'quotes' ? (
            <Card title="Orçamentos">
              {order.quotes.length === 0 ? (
                <EmptyState compact title="Sem orçamentos" />
              ) : (
                <div className="stack">
                  {order.quotes.map((qt) => (
                    <div
                      key={qt.id}
                      className="stack-sm"
                      style={{ paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}
                    >
                      <div className="row-between">
                        <div className="row">
                          <EnumPill value={qt.kind} />
                          <EnumPill value={qt.status} />
                        </div>
                        <strong>
                          <Money cents={qt.amountCents} />
                        </strong>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
                        {itemKeys(qt.items).map(([it, key]) => (
                          <li key={`${qt.id}-${key}`}>
                            {it.quantity} × {it.description} —{' '}
                            <Money cents={it.unitPriceCents * it.quantity} />
                          </li>
                        ))}
                      </ul>
                      {qt.notes ? <p className="small muted">{qt.notes}</p> : null}
                      <p className="caption">
                        Criado {fmtDateTime(qt.createdAt)}
                        {qt.expiresAt ? ` · expira ${fmtDateTime(qt.expiresAt)}` : ''}
                        {qt.decidedAt ? ` · decidido ${fmtDateTime(qt.decidedAt)}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : null}
          {tab === 'evidence' ? (
            <Card title="Evidências" subtitle="Fotos e registros enviados pelo profissional.">
              {evidence.length === 0 ? (
                <EmptyState
                  compact
                  title="Sem evidências"
                  description="Nenhuma foto ou registro anexado ainda."
                />
              ) : (
                <div className={s.thumbs}>
                  {evidence.map((e) => (
                    <a key={e.id} href={e.url} target="_blank" rel="noreferrer">
                      {/* biome-ignore lint/performance/noImgElement: miniaturas de URLs externas assinadas */}
                      <img
                        src={e.url}
                        alt={`Evidência: ${EVIDENCE_LABELS[e.kind] ?? e.kind}`}
                        className={s.thumb}
                        loading="lazy"
                      />
                      <div className={s.thumbLabel}>
                        {EVIDENCE_LABELS[e.kind] ?? e.kind} · {fmtTime(e.createdAt)}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          ) : null}
          {tab === 'tasks' ? (
            <Card title="Tarefas" subtitle="Subetapas de pedidos logísticos e de concierge.">
              {order.tasks.length === 0 ? (
                <EmptyState compact title="Sem tarefas" />
              ) : (
                <ol style={{ margin: 0, paddingLeft: 18 }} className="stack-sm">
                  {order.tasks
                    .slice()
                    .sort((a, b) => a.seq - b.seq)
                    .map((t) => (
                      <li key={t.id} className="row-between">
                        <span>
                          {t.title} <span className="caption">{t.kind}</span>
                          {t.childOrderId ? (
                            <>
                              {' '}
                              · <Link href={`/ops/orders/${t.childOrderId}`}>pedido filho</Link>
                            </>
                          ) : null}
                        </span>
                        <EnumPill value={t.status} />
                      </li>
                    ))}
                </ol>
              )}
            </Card>
          ) : null}
          {tab === 'chat' ? (
            <Card title="Chat" subtitle="Somente leitura. Mensagens entre cliente e profissional.">
              {messagesQ.isLoading ? (
                <SkeletonRows rows={3} height={36} />
              ) : messagesQ.isError ? (
                <ErrorState
                  compact
                  message={errorMessage(messagesQ.error)}
                  onRetry={() => messagesQ.refetch()}
                />
              ) : (messagesQ.data ?? []).length === 0 ? (
                <EmptyState compact title="Sem mensagens" />
              ) : (
                <div className={s.chat}>
                  {(messagesQ.data ?? []).map((m: Message) => {
                    const cls =
                      m.senderType === 'customer'
                        ? s.msgCustomer
                        : m.senderType === 'provider'
                          ? s.msgProvider
                          : s.msgSystem;
                    return (
                      <div key={m.id} className={[s.msg, cls].join(' ')}>
                        {m.body ? <div>{m.body}</div> : null}
                        {m.mediaUrl ? (
                          <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="small">
                            Anexo
                          </a>
                        ) : null}
                        <div className={s.msgMeta}>
                          {m.senderType === 'customer'
                            ? 'Cliente'
                            : m.senderType === 'provider'
                              ? 'Profissional'
                              : m.senderType === 'operator'
                                ? 'Operação'
                                : 'Sistema'}{' '}
                          · {fmtTime(m.createdAt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ) : null}
        </div>

        <div className="stack">
          <Card title="Resumo">
            <dl className="kv">
              <dt>Código</dt>
              <dd className="mono">{order.id}</dd>
              <dt>Categoria</dt>
              <dd>{order.categorySlug}</dd>
              <dt>Agendado</dt>
              <dd>
                {order.scheduledFor
                  ? `${fmtDateTime(order.scheduledFor)} (janela ${order.windowMinutes ?? 60} min)`
                  : 'Imediato'}
              </dd>
              <dt>Previsão</dt>
              <dd>{fmtDateTime(order.etaAt)}</dd>
              <dt>Endereço</dt>
              <dd>
                {order.address?.summary ?? '—'}
                {order.address?.instructions ? (
                  <div className="caption">{order.address.instructions}</div>
                ) : null}
              </dd>
              {order.destination ? (
                <>
                  <dt>Destino</dt>
                  <dd>{order.destination.summary}</dd>
                </>
              ) : null}
              <dt>Observações</dt>
              <dd>{order.notes ?? '—'}</dd>
              {order.parentOrderId ? (
                <>
                  <dt>Pedido pai</dt>
                  <dd>
                    <Link href={`/ops/orders/${order.parentOrderId}`}>#{shortId(order.parentOrderId)}</Link>
                  </dd>
                </>
              ) : null}
              {order.cancelReason ? (
                <>
                  <dt>Cancelamento</dt>
                  <dd>{order.cancelReason}</dd>
                </>
              ) : null}
            </dl>
          </Card>

          <Card title="Valores">
            <dl className="kv">
              <dt>Preço</dt>
              <dd>
                <Money cents={order.priceCents} />
              </dd>
              <dt>Adicionais</dt>
              <dd>
                <Money cents={order.additionalApprovedCents} />
              </dd>
              <dt>Desconto</dt>
              <dd>
                <Money cents={order.discountCents} />
              </dd>
              <dt>Total</dt>
              <dd>
                <strong>
                  <Money cents={order.totalCents} />
                </strong>
              </dd>
              <dt>Comissão</dt>
              <dd>
                <Money cents={order.platformFeeCents} />
              </dd>
              <dt>Repasse</dt>
              <dd>
                <Money cents={order.providerPayoutCents} />
              </dd>
            </dl>
          </Card>

          <Card title="Cliente">
            <dl className="kv">
              <dt>ID</dt>
              <dd className="mono">{order.customerId}</dd>
              <dt>Contato</dt>
              <dd className="muted">Telefone protegido. Use o chat mascarado.</dd>
            </dl>
          </Card>

          <Card title="Profissional">
            {order.provider ? (
              <dl className="kv">
                <dt>Nome</dt>
                <dd>
                  {order.provider.displayName}{' '}
                  {order.provider.verified ? <Pill tone="success">Verificado</Pill> : null}
                </dd>
                <dt>Nota</dt>
                <dd>
                  {order.provider.ratingAvg !== null ? order.provider.ratingAvg.toFixed(1) : 'Sem nota'} (
                  {order.provider.ratingCount})
                </dd>
                <dt>Serviços</dt>
                <dd>{order.provider.completedCount} concluídos</dd>
                <dt>Especialidades</dt>
                <dd>{order.provider.specialties.join(', ') || '—'}</dd>
              </dl>
            ) : (
              <p className="muted small">Nenhum profissional atribuído.</p>
            )}
          </Card>

          {order.allowedActions.length > 0 ? (
            <Card title="Transições permitidas" subtitle="Para o ator atual, segundo o workflow.">
              <div className="row wrap">
                {order.allowedActions.map((a) => (
                  <Pill key={a}>{a}</Pill>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <AssignDrawer orderId={order.id} open={assignOpen} onClose={() => setAssignOpen(false)} />
      <CancelByPlatformDialog orderId={order.id} open={cancelOpen} onClose={() => setCancelOpen(false)} />
      <ResolveDisputeDialog
        disputeId={openDispute?.id ?? null}
        maxRefundCents={order.totalCents}
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
      />
    </div>
  );
}
