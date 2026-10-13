'use client';

import { type Service, type SubscriptionPlan, UpsertPlanInput } from '@velio/contracts';
import { useState } from 'react';
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
  Textarea,
  useToast,
} from '@/components/ui';
import {
  emptyToNull,
  type FieldErrors,
  toInt,
  useAdminList,
  useAdminRemove,
  useAdminUpsert,
  validate,
} from '@/lib/admin';
import { errorMessage } from '@/lib/errors';
import { formatBRL } from '@/lib/format';

interface Draft {
  id?: string;
  slug: string;
  name: string;
  description: string;
  serviceId: string;
  intervalMonths: string;
  visitsPerCycle: string;
  priceCents: number | null;
  benefits: string;
  active: boolean;
}

function toDraft(p: SubscriptionPlan | null): Draft {
  return {
    id: p?.id,
    slug: p?.slug ?? '',
    name: p?.name ?? '',
    description: p?.description ?? '',
    serviceId: p?.serviceId ?? '',
    intervalMonths: String(p?.intervalMonths ?? 6),
    visitsPerCycle: String(p?.visitsPerCycle ?? 1),
    priceCents: p?.priceCents ?? null,
    benefits: (p?.benefits ?? []).join('\n'),
    active: p?.active ?? true,
  };
}

export default function AdminPlansPage() {
  const toast = useToast();
  const list = useAdminList<SubscriptionPlan>('plans');
  const services = useAdminList<Service>('services');
  const upsert = useAdminUpsert<SubscriptionPlan>('plans');
  const remove = useAdminRemove('plans');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const svc = new Map((services.data ?? []).map((x) => [x.id, x]));

  function open(p: SubscriptionPlan | null) {
    setDraft(toDraft(p));
    setErrors({});
    setFormError(null);
  }

  function submit() {
    if (!draft) return;
    const result = validate(UpsertPlanInput, {
      id: draft.id,
      slug: draft.slug.trim(),
      name: draft.name.trim(),
      description: emptyToNull(draft.description),
      serviceId: draft.serviceId,
      intervalMonths: toInt(draft.intervalMonths),
      visitsPerCycle: toInt(draft.visitsPerCycle),
      priceCents: draft.priceCents ?? undefined,
      benefits: draft.benefits
        .split('\n')
        .map((b) => b.trim())
        .filter(Boolean),
      active: draft.active,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    upsert.mutate(result.data, {
      onSuccess: () => {
        toast.success(draft.id ? 'Plano atualizado.' : 'Plano criado.');
        setDraft(null);
      },
      onError: (err) => setFormError(errorMessage(err)),
    });
  }

  const columns: Column<SubscriptionPlan>[] = [
    { key: 'name', header: 'Plano', render: (p) => <strong>{p.name}</strong> },
    {
      key: 'service',
      header: 'Serviço',
      render: (p) => svc.get(p.serviceId)?.name ?? <span className="muted">—</span>,
    },
    {
      key: 'cycle',
      header: 'Ciclo',
      render: (p) => `${p.visitsPerCycle} visita(s) a cada ${p.intervalMonths} mês(es)`,
    },
    {
      key: 'price',
      header: 'Preço',
      align: 'right',
      render: (p) => <span className="mono">{formatBRL(p.priceCents)}</span>,
    },
    { key: 'benefits', header: 'Benefícios', align: 'right', render: (p) => p.benefits.length },
    { key: 'active', header: 'Status', render: (p) => <BoolPill value={p.active} /> },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Planos"
        description="Assinaturas recorrentes que geram visitas agendadas automaticamente."
        actions={
          <Button variant="primary" onClick={() => open(null)}>
            Novo plano
          </Button>
        }
      />
      <DataTable
        caption="Planos"
        columns={columns}
        rows={list.data}
        rowKey={(p) => p.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Nenhum plano"
        emptyAction={<Button onClick={() => open(null)}>Novo plano</Button>}
        onRowClick={(p) => open(p)}
      />
      <FormDrawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar plano' : 'Novo plano'}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
        onDelete={
          draft?.id
            ? () => {
                if (!window.confirm('Excluir este plano? Assinaturas ativas precisam ser canceladas antes.'))
                  return;
                remove.mutate(draft.id ?? '', {
                  onSuccess: () => {
                    toast.success('Plano excluído.');
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
              <Field label="Nome" htmlFor="name" required error={errors.name}>
                <Input
                  id="name"
                  value={draft.name}
                  invalid={Boolean(errors.name)}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Slug" htmlFor="slug" required error={errors.slug}>
                <Input
                  id="slug"
                  className="mono"
                  value={draft.slug}
                  invalid={Boolean(errors.slug)}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                />
              </Field>
              <Field
                label="Serviço incluído"
                htmlFor="serviceId"
                required
                error={errors.serviceId}
                className={s.span2}
              >
                <Select
                  id="serviceId"
                  value={draft.serviceId}
                  placeholder="Escolha"
                  invalid={Boolean(errors.serviceId)}
                  options={(services.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                  onChange={(e) => setDraft({ ...draft, serviceId: e.target.value })}
                />
              </Field>
              <Field
                label="Intervalo (meses)"
                htmlFor="intervalMonths"
                required
                error={errors.intervalMonths}
              >
                <Input
                  id="intervalMonths"
                  type="number"
                  min={1}
                  className="mono"
                  value={draft.intervalMonths}
                  onChange={(e) => setDraft({ ...draft, intervalMonths: e.target.value })}
                />
              </Field>
              <Field
                label="Visitas por ciclo"
                htmlFor="visitsPerCycle"
                required
                error={errors.visitsPerCycle}
              >
                <Input
                  id="visitsPerCycle"
                  type="number"
                  min={1}
                  className="mono"
                  value={draft.visitsPerCycle}
                  onChange={(e) => setDraft({ ...draft, visitsPerCycle: e.target.value })}
                />
              </Field>
              <Field label="Preço por ciclo" htmlFor="price" required error={errors.priceCents}>
                <MoneyInput
                  id="price"
                  valueCents={draft.priceCents}
                  invalid={Boolean(errors.priceCents)}
                  onChange={(c) => setDraft({ ...draft, priceCents: c })}
                />
              </Field>
              <Field label="Descrição" htmlFor="description" error={errors.description} className={s.span2}>
                <Textarea
                  id="description"
                  rows={2}
                  maxLength={500}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </Field>
              <Field label="Benefícios" htmlFor="benefits" hint="Um por linha." className={s.span2}>
                <Textarea
                  id="benefits"
                  rows={4}
                  value={draft.benefits}
                  onChange={(e) => setDraft({ ...draft, benefits: e.target.value })}
                />
              </Field>
            </div>
            <div className={s.group}>
              <Switch
                label="Plano ativo"
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
