'use client';

import { type Service, UpsertPriceRuleInput, type UpsertRegionInput } from '@velio/contracts';
import { useState } from 'react';
import type { z } from 'zod';
import s from '@/components/admin/admin.module.css';
import { FormDrawer } from '@/components/admin/FormDrawer';
import { MoneyInput } from '@/components/admin/MoneyInput';
import {
  BoolPill,
  Button,
  type Column,
  DataTable,
  Field,
  Input,
  PageHeader,
  Select,
  Switch,
  useToast,
} from '@/components/ui';
import { type FieldErrors, toInt, useAdminList, useAdminRemove, useAdminUpsert, validate } from '@/lib/admin';
import { errorMessage } from '@/lib/errors';
import { formatBRL } from '@/lib/format';

type PriceRule = z.infer<typeof UpsertPriceRuleInput> & { id: string };
type Region = z.infer<typeof UpsertRegionInput> & { id: string };

interface Draft {
  id?: string;
  serviceId: string;
  regionId: string;
  basePriceCents: number | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  hourlyRateCents: number | null;
  surgePct: string;
  active: boolean;
}

function toDraft(r: PriceRule | null): Draft {
  return {
    id: r?.id,
    serviceId: r?.serviceId ?? '',
    regionId: r?.regionId ?? '',
    basePriceCents: r?.basePriceCents ?? null,
    priceMinCents: r?.priceMinCents ?? null,
    priceMaxCents: r?.priceMaxCents ?? null,
    hourlyRateCents: r?.hourlyRateCents ?? null,
    surgePct: String(((r?.surgeMultiplierBps ?? 10000) / 100).toFixed(0)),
    active: r?.active ?? true,
  };
}

const money = (c: number | null | undefined) => (c === null || c === undefined ? '—' : formatBRL(c));

export default function AdminPricingPage() {
  const toast = useToast();
  const list = useAdminList<PriceRule>('price-rules');
  const services = useAdminList<Service>('services');
  const regions = useAdminList<Region>('regions');
  const upsert = useAdminUpsert<PriceRule>('price-rules');
  const remove = useAdminRemove('price-rules');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const svc = new Map((services.data ?? []).map((x) => [x.id, x]));
  const reg = new Map((regions.data ?? []).map((x) => [x.id, x]));

  function open(r: PriceRule | null) {
    setDraft(toDraft(r));
    setErrors({});
    setFormError(null);
  }

  function submit() {
    if (!draft) return;
    const pct = toInt(draft.surgePct);
    const result = validate(UpsertPriceRuleInput, {
      id: draft.id,
      serviceId: draft.serviceId,
      regionId: draft.regionId || null,
      basePriceCents: draft.basePriceCents,
      priceMinCents: draft.priceMinCents,
      priceMaxCents: draft.priceMaxCents,
      hourlyRateCents: draft.hourlyRateCents,
      surgeMultiplierBps: pct === undefined ? 10000 : pct * 100,
      active: draft.active,
    });
    if (!result.ok) {
      setErrors(
        result.errors.surgeMultiplierBps
          ? { ...result.errors, surgeMultiplierBps: 'Entre 100% e 300%.' }
          : result.errors,
      );
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

  const columns: Column<PriceRule>[] = [
    {
      key: 'service',
      header: 'Serviço',
      wrap: true,
      render: (r) => <strong>{svc.get(r.serviceId)?.name ?? r.serviceId.slice(0, 8)}</strong>,
    },
    {
      key: 'region',
      header: 'Região',
      render: (r) => (r.regionId ? (reg.get(r.regionId)?.name ?? '—') : <span className="muted">Todas</span>),
    },
    {
      key: 'base',
      header: 'Base',
      align: 'right',
      render: (r) => <span className="mono">{money(r.basePriceCents)}</span>,
    },
    {
      key: 'range',
      header: 'Faixa',
      align: 'right',
      render: (r) => (
        <span className="mono">
          {r.priceMinCents != null || r.priceMaxCents != null
            ? `${money(r.priceMinCents)} – ${money(r.priceMaxCents)}`
            : '—'}
        </span>
      ),
    },
    {
      key: 'hourly',
      header: 'Hora',
      align: 'right',
      render: (r) => <span className="mono">{money(r.hourlyRateCents)}</span>,
    },
    {
      key: 'surge',
      header: 'Multiplicador',
      align: 'right',
      render: (r) => <span className="mono">{(r.surgeMultiplierBps / 10000).toFixed(2)}×</span>,
    },
    { key: 'active', header: 'Status', render: (r) => <BoolPill value={r.active} /> },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Preços"
        description="Regras por serviço e região. A regra mais específica vence o preço do serviço."
        actions={
          <Button variant="primary" onClick={() => open(null)}>
            Nova regra
          </Button>
        }
      />
      <DataTable
        caption="Regras de preço"
        columns={columns}
        rows={list.data}
        rowKey={(r) => r.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Nenhuma regra de preço"
        emptyDescription="Sem regras, vale o preço definido no serviço."
        emptyAction={<Button onClick={() => open(null)}>Nova regra</Button>}
        onRowClick={(r) => open(r)}
      />
      <FormDrawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar regra de preço' : 'Nova regra de preço'}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
        onDelete={
          draft?.id
            ? () => {
                if (!window.confirm('Excluir esta regra de preço?')) return;
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
              <Field
                label="Serviço"
                htmlFor="serviceId"
                required
                error={errors.serviceId}
                className={s.span2}
              >
                <Select
                  id="serviceId"
                  value={draft.serviceId}
                  placeholder="Escolha o serviço"
                  invalid={Boolean(errors.serviceId)}
                  options={(services.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                  onChange={(e) => setDraft({ ...draft, serviceId: e.target.value })}
                />
              </Field>
              <Field
                label="Região"
                htmlFor="regionId"
                error={errors.regionId}
                className={s.span2}
                hint="Vazio aplica a todas as regiões."
              >
                <Select
                  id="regionId"
                  value={draft.regionId}
                  placeholder="Todas as regiões"
                  options={(regions.data ?? []).map((x) => ({
                    value: x.id,
                    label: `${x.name} · ${x.city}/${x.state}`,
                  }))}
                  onChange={(e) => setDraft({ ...draft, regionId: e.target.value })}
                />
              </Field>
              <Field label="Preço base" htmlFor="base" error={errors.basePriceCents}>
                <MoneyInput
                  id="base"
                  valueCents={draft.basePriceCents}
                  onChange={(c) => setDraft({ ...draft, basePriceCents: c })}
                />
              </Field>
              <Field label="Valor por hora" htmlFor="hourly" error={errors.hourlyRateCents}>
                <MoneyInput
                  id="hourly"
                  valueCents={draft.hourlyRateCents}
                  onChange={(c) => setDraft({ ...draft, hourlyRateCents: c })}
                />
              </Field>
              <Field label="Preço mínimo" htmlFor="min" error={errors.priceMinCents}>
                <MoneyInput
                  id="min"
                  valueCents={draft.priceMinCents}
                  onChange={(c) => setDraft({ ...draft, priceMinCents: c })}
                />
              </Field>
              <Field label="Preço máximo" htmlFor="max" error={errors.priceMaxCents}>
                <MoneyInput
                  id="max"
                  valueCents={draft.priceMaxCents}
                  onChange={(c) => setDraft({ ...draft, priceMaxCents: c })}
                />
              </Field>
              <Field
                label="Multiplicador de demanda"
                htmlFor="surge"
                error={errors.surgeMultiplierBps}
                hint="100% = sem acréscimo; máximo 300%."
              >
                <Input
                  id="surge"
                  type="number"
                  min={100}
                  max={300}
                  step={5}
                  suffix="%"
                  className="mono"
                  value={draft.surgePct}
                  onChange={(e) => setDraft({ ...draft, surgePct: e.target.value })}
                />
              </Field>
            </div>
            <div className={s.group}>
              <Switch
                label="Regra ativa"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
            </div>
          </>
        ) : null}
      </FormDrawer>
    </div>
  );
}
