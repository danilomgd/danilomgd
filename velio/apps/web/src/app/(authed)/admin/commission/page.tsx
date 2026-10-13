'use client';

import { type ServiceCategory, UpsertCommissionRuleInput, type UpsertRegionInput } from '@velio/contracts';
import { useMemo, useState } from 'react';
import type { z } from 'zod';
import s from '@/components/admin/admin.module.css';
import { FormDrawer } from '@/components/admin/FormDrawer';
import { MoneyInput } from '@/components/admin/MoneyInput';
import {
  Button,
  Card,
  type Column,
  DataTable,
  Field,
  Input,
  PageHeader,
  Select,
  Switch,
  useToast,
} from '@/components/ui';
import {
  type FieldErrors,
  isoToLocalInput,
  localInputToIso,
  toNum,
  useAdminList,
  useAdminRemove,
  useAdminUpsert,
  validate,
} from '@/lib/admin';
import { errorMessage } from '@/lib/errors';
import { fmtBps, fmtDateTime, formatBRL } from '@/lib/format';

type CommissionRule = z.infer<typeof UpsertCommissionRuleInput> & { id: string };
type Region = z.infer<typeof UpsertRegionInput> & { id: string };

interface Draft {
  id?: string;
  categoryId: string;
  regionId: string;
  percent: string;
  fixedCents: number;
  minCents: number;
  maxCents: number | null;
  passPaymentFeeToProvider: boolean;
  activeFrom: string;
}

function toDraft(r: CommissionRule | null): Draft {
  return {
    id: r?.id,
    categoryId: r?.categoryId ?? '',
    regionId: r?.regionId ?? '',
    percent: r ? String(r.percentBps / 100) : '20',
    fixedCents: r?.fixedCents ?? 0,
    minCents: r?.minCents ?? 0,
    maxCents: r?.maxCents ?? null,
    passPaymentFeeToProvider: r?.passPaymentFeeToProvider ?? false,
    activeFrom: isoToLocalInput(r?.activeFrom),
  };
}

/** Comissão = max(min, min(max, round_half_up(final × bps/10000) + fixo)) (11 §5). */
function simulate(finalCents: number, d: Draft): number {
  const bps = Math.round((toNum(d.percent) ?? 0) * 100);
  let fee = Math.round((finalCents * bps) / 10000 + Number.EPSILON) + d.fixedCents;
  if (d.maxCents !== null) fee = Math.min(d.maxCents, fee);
  fee = Math.max(d.minCents, fee);
  return fee;
}

export default function AdminCommissionPage() {
  const toast = useToast();
  const list = useAdminList<CommissionRule>('commission-rules');
  const categories = useAdminList<ServiceCategory>('categories');
  const regions = useAdminList<Region>('regions');
  const upsert = useAdminUpsert<CommissionRule>('commission-rules');
  const remove = useAdminRemove('commission-rules');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [simValue, setSimValue] = useState<number | null>(15000);

  const cat = new Map((categories.data ?? []).map((x) => [x.id, x]));
  const reg = new Map((regions.data ?? []).map((x) => [x.id, x]));

  const sim = useMemo(
    () => (draft && simValue !== null ? simulate(simValue, draft) : null),
    [draft, simValue],
  );

  function open(r: CommissionRule | null) {
    setDraft(toDraft(r));
    setErrors({});
    setFormError(null);
  }

  function submit() {
    if (!draft) return;
    const pct = toNum(draft.percent);
    const result = validate(UpsertCommissionRuleInput, {
      id: draft.id,
      categoryId: draft.categoryId || null,
      regionId: draft.regionId || null,
      percentBps: pct === undefined ? undefined : Math.round(pct * 100),
      fixedCents: draft.fixedCents,
      minCents: draft.minCents,
      maxCents: draft.maxCents,
      passPaymentFeeToProvider: draft.passPaymentFeeToProvider,
      activeFrom: localInputToIso(draft.activeFrom) ?? undefined,
    });
    if (!result.ok) {
      setErrors(
        result.errors.percentBps ? { ...result.errors, percentBps: 'Entre 0% e 100%.' } : result.errors,
      );
      return;
    }
    if (result.data.maxCents != null && result.data.maxCents < result.data.minCents) {
      setErrors({ maxCents: 'O máximo não pode ser menor que o mínimo.' });
      return;
    }
    setErrors({});
    upsert.mutate(result.data, {
      onSuccess: () => {
        toast.success(draft.id ? 'Regra atualizada.' : 'Regra criada.');
        setDraft(null);
      },
      onError: (err) => setFormError(errorMessage(err)),
    });
  }

  const columns: Column<CommissionRule>[] = [
    {
      key: 'scope',
      header: 'Escopo',
      render: (r) => (r.categoryId ? (cat.get(r.categoryId)?.name ?? '—') : <strong>Global</strong>),
    },
    {
      key: 'region',
      header: 'Região',
      render: (r) => (r.regionId ? (reg.get(r.regionId)?.name ?? '—') : <span className="muted">Todas</span>),
    },
    {
      key: 'pct',
      header: 'Percentual',
      align: 'right',
      render: (r) => <span className="mono">{fmtBps(r.percentBps)}</span>,
    },
    {
      key: 'fixed',
      header: 'Fixo',
      align: 'right',
      render: (r) => <span className="mono">{formatBRL(r.fixedCents)}</span>,
    },
    {
      key: 'min',
      header: 'Mínimo',
      align: 'right',
      render: (r) => <span className="mono">{formatBRL(r.minCents)}</span>,
    },
    {
      key: 'max',
      header: 'Máximo',
      align: 'right',
      render: (r) => <span className="mono">{r.maxCents != null ? formatBRL(r.maxCents) : '—'}</span>,
    },
    {
      key: 'fee',
      header: 'Taxa de pagamento',
      render: (r) => (r.passPaymentFeeToProvider ? 'Repassada ao profissional' : 'Absorvida'),
    },
    {
      key: 'from',
      header: 'Vigência',
      render: (r) => (r.activeFrom ? fmtDateTime(r.activeFrom) : 'Imediata'),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Comissão"
        description="Take rate por categoria e região. A regra mais específica vence: categoria + região, depois categoria, depois global."
        actions={
          <Button variant="primary" onClick={() => open(null)}>
            Nova regra
          </Button>
        }
      />
      <DataTable
        caption="Regras de comissão"
        columns={columns}
        rows={list.data}
        rowKey={(r) => r.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Nenhuma regra de comissão"
        emptyDescription="Crie ao menos uma regra global para a plataforma reter comissão."
        emptyAction={<Button onClick={() => open(null)}>Nova regra</Button>}
        onRowClick={(r) => open(r)}
      />
      <FormDrawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar regra de comissão' : 'Nova regra de comissão'}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
        onDelete={
          draft?.id
            ? () => {
                if (!window.confirm('Excluir esta regra de comissão?')) return;
                remove.mutate(draft.id ?? '', {
                  onSuccess: () => {
                    toast.success('Regra excluída.');
                    setDraft(null);
                  },
                  onError: (err) => setFormError(errorMessage(err)),
                });
              }
            : undefined
        }
        deleting={remove.isPending}
      >
        {draft ? (
          <>
            <div className={s.formGrid}>
              <Field label="Categoria" htmlFor="categoryId" hint="Vazio = regra global.">
                <Select
                  id="categoryId"
                  value={draft.categoryId}
                  placeholder="Global"
                  options={(categories.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                />
              </Field>
              <Field label="Região" htmlFor="regionId">
                <Select
                  id="regionId"
                  value={draft.regionId}
                  placeholder="Todas"
                  options={(regions.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                  onChange={(e) => setDraft({ ...draft, regionId: e.target.value })}
                />
              </Field>
              <Field label="Percentual" htmlFor="percent" required error={errors.percentBps}>
                <Input
                  id="percent"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  suffix="%"
                  className="mono"
                  value={draft.percent}
                  onChange={(e) => setDraft({ ...draft, percent: e.target.value })}
                />
              </Field>
              <Field label="Valor fixo" htmlFor="fixed" error={errors.fixedCents}>
                <MoneyInput
                  id="fixed"
                  valueCents={draft.fixedCents}
                  onChange={(c) => setDraft({ ...draft, fixedCents: c ?? 0 })}
                />
              </Field>
              <Field label="Mínimo" htmlFor="min" error={errors.minCents}>
                <MoneyInput
                  id="min"
                  valueCents={draft.minCents}
                  onChange={(c) => setDraft({ ...draft, minCents: c ?? 0 })}
                />
              </Field>
              <Field label="Máximo" htmlFor="max" error={errors.maxCents} hint="Vazio = sem teto.">
                <MoneyInput
                  id="max"
                  valueCents={draft.maxCents}
                  onChange={(c) => setDraft({ ...draft, maxCents: c })}
                />
              </Field>
              <Field label="Vigente a partir de" htmlFor="activeFrom" error={errors.activeFrom}>
                <Input
                  id="activeFrom"
                  type="datetime-local"
                  value={draft.activeFrom}
                  onChange={(e) => setDraft({ ...draft, activeFrom: e.target.value })}
                />
              </Field>
            </div>
            <div className={s.group}>
              <Switch
                label="Repassar taxa de pagamento ao profissional"
                description="Desconta a taxa do gateway do repasse."
                checked={draft.passPaymentFeeToProvider}
                onChange={(e) => setDraft({ ...draft, passPaymentFeeToProvider: e.target.checked })}
              />
            </div>
            <div className={s.group}>
              <span className={s.groupTitle}>Simulador</span>
              <Card>
                <div className="row wrap" style={{ alignItems: 'flex-end' }}>
                  <Field label="Valor final do pedido" htmlFor="sim">
                    <MoneyInput id="sim" valueCents={simValue} onChange={setSimValue} />
                  </Field>
                  <dl className="kv grow" style={{ gridTemplateColumns: 'auto 1fr' }}>
                    <dt>Comissão</dt>
                    <dd className="mono">{sim !== null ? formatBRL(sim) : '—'}</dd>
                    <dt>Repasse</dt>
                    <dd className="mono">
                      {sim !== null && simValue !== null ? formatBRL(Math.max(0, simValue - sim)) : '—'}
                    </dd>
                  </dl>
                </div>
              </Card>
            </div>
          </>
        ) : null}
      </FormDrawer>
    </div>
  );
}
