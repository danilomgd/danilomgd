'use client';

import {
  PricingModel,
  type Service,
  type ServiceCategory,
  UpsertServiceInput,
  WORKFLOW_KIND_LABELS,
  WorkflowKind,
} from '@velio/contracts';
import { useState } from 'react';
import s from '@/components/admin/admin.module.css';
import { FormDrawer } from '@/components/admin/FormDrawer';
import { MoneyInput } from '@/components/admin/MoneyInput';
import { type OptionDraft, ServiceOptionsEditor, uid } from '@/components/admin/ServiceOptionsEditor';
import {
  BoolPill,
  Button,
  type Column,
  DataTable,
  Field,
  Input,
  PageHeader,
  Pill,
  Select,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  emptyToNull,
  type FieldErrors,
  toInt,
  toNum,
  useAdminList,
  useAdminRemove,
  useAdminUpsert,
  validate,
} from '@/lib/admin';
import { errorMessage } from '@/lib/errors';
import { formatBRL } from '@/lib/format';

const PRICING_LABELS: Record<string, string> = {
  FIXED: 'Fixo',
  HOURLY: 'Por hora',
  QUOTE: 'Sob orçamento',
  RANGE: 'Faixa',
};

const WORKFLOW_DESC: Record<string, string> = {
  IMMEDIATE: 'O cliente pede agora e um profissional é acionado em ondas.',
  SCHEDULED: 'O cliente escolhe data e janela; lembretes 24 h e 1 h antes.',
  QUOTE: 'Um profissional analisa, envia orçamento e o cliente aprova antes de autorizar.',
  LOGISTICS: 'Leva e traz com cadeia de custódia em coleta e entrega.',
  LAUNDRY: 'Logística especializada com custódia obrigatória por item.',
  CONCIERGE: 'Pedido em linguagem natural vira plano com tarefas e ordens filhas.',
};

interface Draft {
  id?: string;
  categoryId: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  workflowKind: string;
  pricingModel: string;
  basePriceCents: number | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  hourlyRateCents: number | null;
  estimatedDurationMinutes: string;
  allowsImmediate: boolean;
  allowsScheduling: boolean;
  requiresAddress: boolean;
  requiresVehicle: boolean;
  requiresEquipment: boolean;
  options: OptionDraft[];
  imageUrl: string;
  active: boolean;
  sortOrder: string;
}

function toDraft(sv: Service | null, defaultCategory = ''): Draft {
  return {
    id: sv?.id,
    categoryId: sv?.categoryId ?? defaultCategory,
    slug: sv?.slug ?? '',
    name: sv?.name ?? '',
    shortDescription: sv?.shortDescription ?? '',
    description: sv?.description ?? '',
    workflowKind: sv?.workflowKind ?? 'IMMEDIATE',
    pricingModel: sv?.pricingModel ?? 'FIXED',
    basePriceCents: sv?.basePriceCents ?? null,
    priceMinCents: sv?.priceMinCents ?? null,
    priceMaxCents: sv?.priceMaxCents ?? null,
    hourlyRateCents: sv?.hourlyRateCents ?? null,
    estimatedDurationMinutes: sv?.estimatedDurationMinutes ? String(sv.estimatedDurationMinutes) : '',
    allowsImmediate: sv?.allowsImmediate ?? true,
    allowsScheduling: sv?.allowsScheduling ?? true,
    requiresAddress: sv?.requiresAddress ?? true,
    requiresVehicle: sv?.requiresVehicle ?? false,
    requiresEquipment: sv?.requiresEquipment ?? false,
    options: (sv?.options ?? []).map((o) => ({
      uid: uid(),
      key: o.key,
      label: o.label,
      type: o.type,
      required: o.required,
      choices: (o.choices ?? []).map((c) => ({
        uid: uid(),
        value: c.value,
        label: c.label,
        priceDeltaCents: c.priceDeltaCents,
      })),
      unitPriceCents: o.unitPriceCents ?? null,
      min: o.min !== undefined ? String(o.min) : '',
      max: o.max !== undefined ? String(o.max) : '',
    })),
    imageUrl: sv?.imageUrl ?? '',
    active: sv?.active ?? true,
    sortOrder: String(sv?.sortOrder ?? 0),
  };
}

function priceSummary(sv: Service): string {
  switch (sv.pricingModel) {
    case 'FIXED':
      return sv.basePriceCents !== null ? formatBRL(sv.basePriceCents) : '—';
    case 'HOURLY':
      return sv.hourlyRateCents !== null ? `${formatBRL(sv.hourlyRateCents)}/h` : '—';
    case 'RANGE':
      return sv.priceMinCents !== null && sv.priceMaxCents !== null
        ? `${formatBRL(sv.priceMinCents)} a ${formatBRL(sv.priceMaxCents)}`
        : '—';
    default:
      return 'Sob orçamento';
  }
}

export default function AdminServicesPage() {
  const toast = useToast();
  const list = useAdminList<Service>('services');
  const categories = useAdminList<ServiceCategory>('categories');
  const upsert = useAdminUpsert<Service>('services');
  const remove = useAdminRemove('services');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const catById = new Map((categories.data ?? []).map((c) => [c.id, c]));
  const rows = (list.data ?? [])
    .filter((sv) => !categoryFilter || sv.categoryId === categoryFilter)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  function open(sv: Service | null) {
    setDraft(toDraft(sv, categoryFilter));
    setErrors({});
    setFormError(null);
  }

  function submit() {
    if (!draft) return;
    const result = validate(UpsertServiceInput, {
      id: draft.id,
      categoryId: draft.categoryId,
      slug: draft.slug.trim(),
      name: draft.name.trim(),
      shortDescription: emptyToNull(draft.shortDescription),
      description: emptyToNull(draft.description),
      workflowKind: draft.workflowKind,
      pricingModel: draft.pricingModel,
      basePriceCents: draft.basePriceCents,
      priceMinCents: draft.priceMinCents,
      priceMaxCents: draft.priceMaxCents,
      hourlyRateCents: draft.hourlyRateCents,
      estimatedDurationMinutes: toInt(draft.estimatedDurationMinutes) ?? null,
      allowsImmediate: draft.allowsImmediate,
      allowsScheduling: draft.allowsScheduling,
      requiresAddress: draft.requiresAddress,
      requiresVehicle: draft.requiresVehicle,
      requiresEquipment: draft.requiresEquipment,
      options: draft.options.map((o) => ({
        key: o.key.trim(),
        label: o.label.trim(),
        type: o.type,
        required: o.required,
        choices: o.type === 'select' ? o.choices.map(({ uid: _uid, ...c }) => c) : undefined,
        unitPriceCents: o.type === 'number' ? (o.unitPriceCents ?? undefined) : undefined,
        min: o.type === 'number' ? toNum(o.min) : undefined,
        max: o.type === 'number' ? toNum(o.max) : undefined,
      })),
      imageUrl: emptyToNull(draft.imageUrl),
      active: draft.active,
      sortOrder: toInt(draft.sortOrder),
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    upsert.mutate(result.data, {
      onSuccess: () => {
        toast.success(draft.id ? 'Serviço atualizado.' : 'Serviço criado.');
        setDraft(null);
      },
      onError: (err) => setFormError(errorMessage(err)),
    });
  }

  const columns: Column<Service>[] = [
    { key: 'name', header: 'Serviço', wrap: true, render: (sv) => <strong>{sv.name}</strong> },
    {
      key: 'category',
      header: 'Categoria',
      render: (sv) => catById.get(sv.categoryId)?.name ?? <span className="muted">—</span>,
    },
    {
      key: 'workflow',
      header: 'Fluxo',
      render: (sv) => <Pill tone="info">{WORKFLOW_KIND_LABELS[sv.workflowKind]}</Pill>,
    },
    { key: 'pricing', header: 'Preço', render: (sv) => <span className="mono">{priceSummary(sv)}</span> },
    { key: 'model', header: 'Modelo', render: (sv) => PRICING_LABELS[sv.pricingModel] ?? sv.pricingModel },
    {
      key: 'duration',
      header: 'Duração',
      align: 'right',
      render: (sv) => (sv.estimatedDurationMinutes ? `${sv.estimatedDurationMinutes} min` : '—'),
    },
    { key: 'options', header: 'Opções', align: 'right', render: (sv) => sv.options.length },
    { key: 'active', header: 'Status', render: (sv) => <BoolPill value={sv.active} /> },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Serviços"
        description="Itens contratáveis. Fluxo, modelo de preço, exigências e opções."
        actions={
          <>
            <div style={{ width: 240 }}>
              <label htmlFor="cat-filter" className="sr-only">
                Filtrar por categoria
              </label>
              <Select
                id="cat-filter"
                value={categoryFilter}
                placeholder="Todas as categorias"
                options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                onChange={(e) => setCategoryFilter(e.target.value)}
              />
            </div>
            <Button variant="primary" onClick={() => open(null)}>
              Novo serviço
            </Button>
          </>
        }
      />
      <DataTable
        caption="Serviços"
        columns={columns}
        rows={list.data ? rows : undefined}
        rowKey={(sv) => sv.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Nenhum serviço"
        emptyDescription="Crie um serviço dentro de uma categoria."
        emptyAction={<Button onClick={() => open(null)}>Novo serviço</Button>}
        onRowClick={(sv) => open(sv)}
      />
      <FormDrawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar serviço' : 'Novo serviço'}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
        wide
        onDelete={
          draft?.id
            ? () => {
                if (!window.confirm('Excluir este serviço? Pedidos antigos continuam referenciando o nome.'))
                  return;
                remove.mutate(draft.id ?? '', {
                  onSuccess: () => {
                    toast.success('Serviço excluído.');
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
              <Field label="Categoria" htmlFor="categoryId" required error={errors.categoryId}>
                <Select
                  id="categoryId"
                  value={draft.categoryId}
                  placeholder="Escolha"
                  invalid={Boolean(errors.categoryId)}
                  options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                />
              </Field>
              <Field label="Ordem" htmlFor="sortOrder" error={errors.sortOrder}>
                <Input
                  id="sortOrder"
                  type="number"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
                />
              </Field>
              <Field
                label="Descrição curta"
                htmlFor="shortDescription"
                error={errors.shortDescription}
                className={s.span2}
                hint="Até 140 caracteres; aparece no cartão."
              >
                <Input
                  id="shortDescription"
                  maxLength={140}
                  value={draft.shortDescription}
                  onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })}
                />
              </Field>
              <Field
                label="Descrição completa"
                htmlFor="description"
                error={errors.description}
                className={s.span2}
              >
                <Textarea
                  id="description"
                  rows={3}
                  maxLength={2000}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </Field>
              <Field
                label="Imagem de capa (URL)"
                htmlFor="imageUrl"
                error={errors.imageUrl}
                className={s.span2}
              >
                <Input
                  id="imageUrl"
                  type="url"
                  value={draft.imageUrl}
                  invalid={Boolean(errors.imageUrl)}
                  onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
                />
              </Field>
            </div>

            <div className={s.group}>
              <span className={s.groupTitle}>Fluxo</span>
              <Field
                label="Tipo de workflow"
                htmlFor="workflowKind"
                required
                error={errors.workflowKind}
                hint={WORKFLOW_DESC[draft.workflowKind]}
              >
                <Select
                  id="workflowKind"
                  value={draft.workflowKind}
                  options={WorkflowKind.options.map((k) => ({ value: k, label: WORKFLOW_KIND_LABELS[k] }))}
                  onChange={(e) => setDraft({ ...draft, workflowKind: e.target.value })}
                />
              </Field>
              <div className={s.formGrid}>
                <Switch
                  label="Permite imediato"
                  checked={draft.allowsImmediate}
                  onChange={(e) => setDraft({ ...draft, allowsImmediate: e.target.checked })}
                />
                <Switch
                  label="Permite agendamento"
                  checked={draft.allowsScheduling}
                  onChange={(e) => setDraft({ ...draft, allowsScheduling: e.target.checked })}
                />
                <Switch
                  label="Exige endereço"
                  checked={draft.requiresAddress}
                  onChange={(e) => setDraft({ ...draft, requiresAddress: e.target.checked })}
                />
                <Switch
                  label="Exige veículo"
                  checked={draft.requiresVehicle}
                  onChange={(e) => setDraft({ ...draft, requiresVehicle: e.target.checked })}
                />
                <Switch
                  label="Exige equipamento"
                  checked={draft.requiresEquipment}
                  onChange={(e) => setDraft({ ...draft, requiresEquipment: e.target.checked })}
                />
              </div>
              <Field
                label="Duração estimada (min)"
                htmlFor="duration"
                error={errors.estimatedDurationMinutes}
              >
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  value={draft.estimatedDurationMinutes}
                  onChange={(e) => setDraft({ ...draft, estimatedDurationMinutes: e.target.value })}
                />
              </Field>
            </div>

            <div className={s.group}>
              <span className={s.groupTitle}>Preço</span>
              <Field label="Modelo de preço" htmlFor="pricingModel" required error={errors.pricingModel}>
                <Select
                  id="pricingModel"
                  value={draft.pricingModel}
                  options={PricingModel.options.map((p) => ({ value: p, label: PRICING_LABELS[p] ?? p }))}
                  onChange={(e) => setDraft({ ...draft, pricingModel: e.target.value })}
                />
              </Field>
              <div className={s.formGrid}>
                {draft.pricingModel === 'FIXED' ? (
                  <Field label="Preço base" htmlFor="basePrice" error={errors.basePriceCents}>
                    <MoneyInput
                      id="basePrice"
                      valueCents={draft.basePriceCents}
                      onChange={(c) => setDraft({ ...draft, basePriceCents: c })}
                    />
                  </Field>
                ) : null}
                {draft.pricingModel === 'HOURLY' ? (
                  <Field label="Valor por hora" htmlFor="hourly" error={errors.hourlyRateCents}>
                    <MoneyInput
                      id="hourly"
                      valueCents={draft.hourlyRateCents}
                      onChange={(c) => setDraft({ ...draft, hourlyRateCents: c })}
                    />
                  </Field>
                ) : null}
                {draft.pricingModel === 'RANGE' || draft.pricingModel === 'QUOTE' ? (
                  <>
                    <Field label="Preço mínimo" htmlFor="priceMin" error={errors.priceMinCents}>
                      <MoneyInput
                        id="priceMin"
                        valueCents={draft.priceMinCents}
                        onChange={(c) => setDraft({ ...draft, priceMinCents: c })}
                      />
                    </Field>
                    <Field label="Preço máximo" htmlFor="priceMax" error={errors.priceMaxCents}>
                      <MoneyInput
                        id="priceMax"
                        valueCents={draft.priceMaxCents}
                        onChange={(c) => setDraft({ ...draft, priceMaxCents: c })}
                      />
                    </Field>
                  </>
                ) : null}
              </div>
              <p className="caption">Regras por região sobrescrevem estes valores em Preços.</p>
            </div>

            <div className={s.group}>
              <span className={s.groupTitle}>Opções do serviço</span>
              <ServiceOptionsEditor
                options={draft.options}
                onChange={(options) => setDraft({ ...draft, options })}
                errors={errors}
              />
            </div>

            <div className={s.group}>
              <span className={s.groupTitle}>Publicação</span>
              <Switch
                label="Serviço ativo"
                description="Visível na home e na busca em até 60 s."
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
