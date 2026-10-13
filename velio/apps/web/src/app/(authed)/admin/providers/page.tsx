'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApproveProviderInput,
  PROVIDER_AVAILABILITY_LABELS,
  type ProviderMe,
  type ServiceCategory,
} from '@velio/contracts';
import { useState } from 'react';
import s from '@/components/admin/admin.module.css';
import {
  Button,
  type Column,
  DataTable,
  Dialog,
  Drawer,
  EnumPill,
  Field,
  PageHeader,
  Pill,
  Tabs,
  Textarea,
  useToast,
} from '@/components/ui';
import { useAdminList } from '@/lib/admin';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { fmtPct, fmtRating, formatBRL } from '@/lib/format';

type Decision = 'APPROVE' | 'REJECT' | 'SUSPEND' | 'BLOCK';
type Filter = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'BLOCKED' | 'ALL';

const DECISION_LABELS: Record<Decision, string> = {
  APPROVE: 'Aprovar',
  REJECT: 'Recusar',
  SUSPEND: 'Suspender',
  BLOCK: 'Bloquear',
};

const DOC_LABELS: Record<string, string> = {
  ID_FRONT: 'Documento (frente)',
  ID_BACK: 'Documento (verso)',
  SELFIE: 'Selfie',
  PROOF_OF_ADDRESS: 'Comprovante de endereço',
  CERTIFICATE: 'Certificado',
  CNPJ_CARD: 'Cartão CNPJ',
  DRIVER_LICENSE: 'CNH',
};

export default function AdminProvidersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('PENDING');
  const list = useAdminList<ProviderMe>('providers', filter === 'ALL' ? undefined : { status: filter });
  const categories = useAdminList<ServiceCategory>('categories');
  const [selected, setSelected] = useState<ProviderMe | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();

  const cat = new Map((categories.data ?? []).map((x) => [x.id, x]));

  const decide = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { decision: Decision; reason?: string } }) =>
      api.admin.approveProvider(id, body),
    onSuccess: (updated) => {
      toast.success('Decisão registrada.');
      void qc.invalidateQueries({ queryKey: ['admin', 'providers'] });
      setDecision(null);
      setReason('');
      setSelected(updated ?? null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function submitDecision() {
    if (!selected || !decision) return;
    const needsReason = decision !== 'APPROVE';
    if (needsReason && reason.trim().length < 3) {
      setReasonError('Informe o motivo. Ele é enviado ao profissional.');
      return;
    }
    const parsed = ApproveProviderInput.safeParse({ decision, reason: reason.trim() || undefined });
    if (!parsed.success) {
      setReasonError('Motivo com até 500 caracteres.');
      return;
    }
    setReasonError(undefined);
    decide.mutate({ id: selected.id, body: parsed.data });
  }

  const columns: Column<ProviderMe>[] = [
    { key: 'name', header: 'Profissional', render: (p) => <strong>{p.displayName}</strong> },
    { key: 'status', header: 'Status', render: (p) => <EnumPill value={p.status} /> },
    { key: 'availability', header: 'Disponibilidade', render: (p) => <EnumPill value={p.availability} /> },
    {
      key: 'docs',
      header: 'Documentos',
      render: (p) => {
        const verified = p.documents.filter((d) => d.status === 'VERIFIED').length;
        const rejected = p.documents.filter((d) => d.status === 'REJECTED').length;
        return (
          <span className="small">
            {verified}/{p.documents.length} verificados{rejected ? ` · ${rejected} recusados` : ''}
          </span>
        );
      },
    },
    {
      key: 'categories',
      header: 'Categorias',
      wrap: true,
      render: (p) => p.categoryIds.map((id) => cat.get(id)?.name ?? id.slice(0, 6)).join(', ') || '—',
    },
    {
      key: 'rating',
      header: 'Nota',
      align: 'right',
      render: (p) => `${fmtRating(p.ratingAvg)} (${p.ratingCount})`,
    },
    { key: 'completed', header: 'Concluídos', align: 'right', render: (p) => p.completedCount },
    {
      key: 'acceptance',
      header: 'Aceite',
      align: 'right',
      render: (p) => fmtPct(p.acceptanceRate !== null ? p.acceptanceRate * 100 : null, 0),
    },
  ];

  const availableDecisions: Decision[] = selected
    ? selected.status === 'PENDING'
      ? ['APPROVE', 'REJECT']
      : selected.status === 'APPROVED'
        ? ['SUSPEND', 'BLOCK']
        : selected.status === 'SUSPENDED'
          ? ['APPROVE', 'BLOCK']
          : ['APPROVE']
    : [];

  return (
    <div className="page">
      <PageHeader
        title="Profissionais"
        description="Aprovação de cadastro, documentos e status na plataforma."
      />
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Tabs
          ariaLabel="Filtro por status"
          variant="pills"
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'PENDING', label: 'Pendentes' },
            { key: 'APPROVED', label: 'Aprovados' },
            { key: 'SUSPENDED', label: 'Suspensos' },
            { key: 'BLOCKED', label: 'Bloqueados' },
            { key: 'ALL', label: 'Todos' },
          ]}
        />
      </div>
      <DataTable
        caption="Profissionais"
        columns={columns}
        rows={list.data}
        rowKey={(p) => p.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle={filter === 'PENDING' ? 'Fila de aprovação vazia' : 'Nenhum profissional'}
        onRowClick={(p) => setSelected(p)}
      />

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.displayName ?? ''}
        description={
          selected
            ? `Status: ${selected.status} · ${PROVIDER_AVAILABILITY_LABELS[selected.availability]}`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Fechar
            </Button>
            {availableDecisions.map((d) => (
              <Button
                key={d}
                variant={d === 'APPROVE' ? 'primary' : d === 'BLOCK' ? 'destructive' : 'destructiveSoft'}
                onClick={() => setDecision(d)}
              >
                {DECISION_LABELS[d]}
              </Button>
            ))}
          </>
        }
      >
        {selected ? (
          <div className="stack">
            <dl className="kv">
              <dt>ID</dt>
              <dd className="mono">{selected.id}</dd>
              <dt>Usuário</dt>
              <dd className="mono">{selected.userId}</dd>
              <dt>Raio</dt>
              <dd>{selected.serviceRadiusKm} km</dd>
              <dt>Categorias</dt>
              <dd>{selected.categoryIds.map((id) => cat.get(id)?.name ?? id).join(', ') || '—'}</dd>
              <dt>Nota</dt>
              <dd>
                {fmtRating(selected.ratingAvg)} ({selected.ratingCount} avaliações)
              </dd>
              <dt>Concluídos</dt>
              <dd>{selected.completedCount}</dd>
              <dt>Taxa de aceite</dt>
              <dd>{fmtPct(selected.acceptanceRate !== null ? selected.acceptanceRate * 100 : null, 0)}</dd>
              <dt>Cancelamentos</dt>
              <dd>
                {fmtPct(selected.cancellationRate !== null ? selected.cancellationRate * 100 : null, 0)}
              </dd>
              <dt>Resposta média</dt>
              <dd>
                {selected.avgResponseSeconds !== null ? `${Math.round(selected.avgResponseSeconds)} s` : '—'}
              </dd>
              <dt>Saldo</dt>
              <dd className="mono">{formatBRL(selected.walletBalanceCents)}</dd>
            </dl>
            <div className={s.group}>
              <span className={s.groupTitle}>Documentos</span>
              {selected.documents.length === 0 ? (
                <p className="small muted">Nenhum documento enviado.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="stack-sm">
                  {selected.documents.map((d) => (
                    <li key={d.kind} className="row-between">
                      <span>{DOC_LABELS[d.kind] ?? d.kind}</span>
                      <span className="row">
                        {d.rejectedReason ? <span className="caption">{d.rejectedReason}</span> : null}
                        <EnumPill value={d.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="caption">
                Arquivos ficam em storage privado; a visualização por URL assinada é feita pelo app do
                prestador.
              </p>
            </div>
          </div>
        ) : null}
      </Drawer>

      <Dialog
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={decision ? `${DECISION_LABELS[decision]} ${selected?.displayName ?? ''}` : ''}
        description={
          decision === 'APPROVE'
            ? 'O profissional passa a receber ofertas nas categorias cadastradas.'
            : decision === 'REJECT'
              ? 'O cadastro é recusado e o motivo é enviado ao profissional.'
              : decision === 'SUSPEND'
                ? 'Suspensão temporária: não recebe ofertas até nova decisão.'
                : 'Bloqueio definitivo. Pedidos em andamento são tratados pela operação.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Voltar
            </Button>
            <Button
              variant={decision === 'APPROVE' ? 'primary' : 'destructive'}
              onClick={submitDecision}
              loading={decide.isPending}
            >
              {decision ? DECISION_LABELS[decision] : ''}
            </Button>
          </>
        }
      >
        <Field
          label="Motivo"
          htmlFor="decision-reason"
          required={decision !== 'APPROVE'}
          error={reasonError}
          hint={decision === 'APPROVE' ? 'Opcional.' : undefined}
        >
          <Textarea
            id="decision-reason"
            value={reason}
            maxLength={500}
            invalid={Boolean(reasonError)}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {selected ? (
          <div className="row wrap" style={{ marginTop: 12 }}>
            <Pill>
              {selected.documents.filter((d) => d.status === 'VERIFIED').length} documentos verificados
            </Pill>
            {selected.documents.filter((d) => d.status !== 'VERIFIED').length ? (
              <Pill tone="warning">
                {selected.documents.filter((d) => d.status !== 'VERIFIED').length} pendentes ou recusados
              </Pill>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
