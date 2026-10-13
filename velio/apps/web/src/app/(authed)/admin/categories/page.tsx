'use client';

import { type ServiceCategory, UpsertCategoryInput } from '@velio/contracts';
import { useState } from 'react';
import s from '@/components/admin/admin.module.css';
import { FormDrawer } from '@/components/admin/FormDrawer';
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
  toNum,
  useAdminList,
  useAdminRemove,
  useAdminUpsert,
  validate,
} from '@/lib/admin';
import { errorMessage } from '@/lib/errors';

interface Draft {
  id?: string;
  parentId: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: string;
  active: boolean;
  config: {
    requiresStartPin: boolean;
    requiresBeforeAfterPhotos: boolean;
    requiresVehicle: boolean;
    requiresEquipment: boolean;
    requiresCustody: boolean;
    allowsAdditionalQuote: boolean;
    defaultServiceRadiusKm: string;
  };
}

function toDraft(c: ServiceCategory | null): Draft {
  return {
    id: c?.id,
    parentId: c?.parentId ?? '',
    slug: c?.slug ?? '',
    name: c?.name ?? '',
    description: c?.description ?? '',
    icon: c?.icon ?? 'sparkle',
    sortOrder: String(c?.sortOrder ?? 0),
    active: c?.active ?? true,
    config: {
      requiresStartPin: c?.config.requiresStartPin ?? false,
      requiresBeforeAfterPhotos: c?.config.requiresBeforeAfterPhotos ?? false,
      requiresVehicle: c?.config.requiresVehicle ?? false,
      requiresEquipment: c?.config.requiresEquipment ?? false,
      requiresCustody: c?.config.requiresCustody ?? false,
      allowsAdditionalQuote: c?.config.allowsAdditionalQuote ?? true,
      defaultServiceRadiusKm: String(c?.config.defaultServiceRadiusKm ?? 15),
    },
  };
}

const CONFIG_TOGGLES: Array<{
  key: keyof Omit<Draft['config'], 'defaultServiceRadiusKm'>;
  label: string;
  desc: string;
}> = [
  {
    key: 'requiresStartPin',
    label: 'Exige PIN de início',
    desc: 'O profissional só inicia com o PIN do cliente.',
  },
  {
    key: 'requiresBeforeAfterPhotos',
    label: 'Fotos antes e depois',
    desc: 'Evidências obrigatórias para concluir.',
  },
  { key: 'requiresVehicle', label: 'Exige veículo', desc: 'O pedido precisa de um veículo cadastrado.' },
  {
    key: 'requiresEquipment',
    label: 'Exige equipamento',
    desc: 'O pedido precisa de um equipamento cadastrado.',
  },
  { key: 'requiresCustody', label: 'Cadeia de custódia', desc: 'Leitura de QR em coleta e entrega.' },
  { key: 'allowsAdditionalQuote', label: 'Permite orçamento adicional', desc: 'Durante a execução.' },
];

export default function AdminCategoriesPage() {
  const toast = useToast();
  const list = useAdminList<ServiceCategory>('categories');
  const upsert = useAdminUpsert<ServiceCategory>('categories');
  const remove = useAdminRemove('categories');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const rows = (list.data ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const byId = new Map(rows.map((c) => [c.id, c]));

  function open(c: ServiceCategory | null) {
    setDraft(toDraft(c));
    setErrors({});
    setFormError(null);
  }

  function submit() {
    if (!draft) return;
    const result = validate(UpsertCategoryInput, {
      id: draft.id,
      parentId: draft.parentId || null,
      slug: draft.slug.trim(),
      name: draft.name.trim(),
      description: emptyToNull(draft.description),
      icon: draft.icon.trim(),
      sortOrder: toInt(draft.sortOrder),
      active: draft.active,
      config: { ...draft.config, defaultServiceRadiusKm: toNum(draft.config.defaultServiceRadiusKm) },
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    upsert.mutate(result.data, {
      onSuccess: () => {
        toast.success(draft.id ? 'Categoria atualizada.' : 'Categoria criada.');
        setDraft(null);
      },
      onError: (err) => setFormError(errorMessage(err)),
    });
  }

  const columns: Column<ServiceCategory>[] = [
    { key: 'name', header: 'Nome', render: (c) => <strong>{c.name}</strong> },
    { key: 'slug', header: 'Slug', render: (c) => <span className="mono">{c.slug}</span> },
    {
      key: 'parent',
      header: 'Pai',
      render: (c) => (c.parentId ? (byId.get(c.parentId)?.name ?? '—') : <span className="muted">—</span>),
    },
    { key: 'icon', header: 'Ícone', render: (c) => <span className="mono">{c.icon}</span> },
    {
      key: 'rules',
      header: 'Regras',
      wrap: true,
      render: (c) => {
        const on = CONFIG_TOGGLES.filter((t) => t.key !== 'allowsAdditionalQuote' && c.config[t.key]).map(
          (t) => t.label,
        );
        return on.length ? <span className="small">{on.join(' · ')}</span> : <span className="muted">—</span>;
      },
    },
    { key: 'order', header: 'Ordem', align: 'right', render: (c) => c.sortOrder },
    { key: 'active', header: 'Status', render: (c) => <BoolPill value={c.active} /> },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Categorias"
        description="Árvore do catálogo. A configuração altera guards e exigências do workflow."
        actions={
          <Button variant="primary" onClick={() => open(null)}>
            Nova categoria
          </Button>
        }
      />
      <DataTable
        caption="Categorias"
        columns={columns}
        rows={list.data ? rows : undefined}
        rowKey={(c) => c.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Nenhuma categoria"
        emptyDescription="Crie a primeira categoria para montar o catálogo."
        emptyAction={<Button onClick={() => open(null)}>Nova categoria</Button>}
        onRowClick={(c) => open(c)}
      />
      <FormDrawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar categoria' : 'Nova categoria'}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
        onDelete={
          draft?.id
            ? () => {
                if (!window.confirm('Excluir esta categoria? Serviços vinculados ficam sem categoria.'))
                  return;
                remove.mutate(draft.id ?? '', {
                  onSuccess: () => {
                    toast.success('Categoria excluída.');
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
              <Field
                label="Slug"
                htmlFor="slug"
                required
                error={errors.slug}
                hint="Minúsculas, números e hífen."
              >
                <Input
                  id="slug"
                  className="mono"
                  value={draft.slug}
                  invalid={Boolean(errors.slug)}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                />
              </Field>
              <Field label="Descrição" htmlFor="description" error={errors.description} className={s.span2}>
                <Textarea
                  id="description"
                  rows={2}
                  maxLength={300}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </Field>
              <Field
                label="Ícone"
                htmlFor="icon"
                required
                error={errors.icon}
                hint="Nome do conjunto Trilho Icons (ex.: droplet, bolt, car)."
              >
                <Input
                  id="icon"
                  className="mono"
                  value={draft.icon}
                  invalid={Boolean(errors.icon)}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                />
              </Field>
              <Field label="Categoria pai" htmlFor="parentId" error={errors.parentId}>
                <Select
                  id="parentId"
                  value={draft.parentId}
                  placeholder="Nenhuma (raiz)"
                  options={rows.filter((c) => c.id !== draft.id).map((c) => ({ value: c.id, label: c.name }))}
                  onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}
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
                label="Raio padrão (km)"
                htmlFor="radius"
                error={errors['config.defaultServiceRadiusKm']}
              >
                <Input
                  id="radius"
                  type="number"
                  min={1}
                  step={0.5}
                  value={draft.config.defaultServiceRadiusKm}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      config: { ...draft.config, defaultServiceRadiusKm: e.target.value },
                    })
                  }
                />
              </Field>
            </div>
            <div className={s.group}>
              <span className={s.groupTitle}>Regras do workflow</span>
              {CONFIG_TOGGLES.map((t) => (
                <Switch
                  key={t.key}
                  label={t.label}
                  description={t.desc}
                  checked={draft.config[t.key]}
                  onChange={(e) =>
                    setDraft({ ...draft, config: { ...draft.config, [t.key]: e.target.checked } })
                  }
                />
              ))}
            </div>
            <div className={s.group}>
              <span className={s.groupTitle}>Publicação</span>
              <Switch
                label="Categoria ativa"
                description="Inativa some da home e da busca."
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
