'use client';

import { HomeSectionKind, UpsertHomeSectionInput } from '@velio/contracts';
import { useState } from 'react';
import type { z } from 'zod';
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
  useAdminList,
  useAdminRemove,
  useAdminUpsert,
  validate,
} from '@/lib/admin';
import { errorMessage } from '@/lib/errors';

type HomeSection = z.infer<typeof UpsertHomeSectionInput>;

const KIND_LABELS: Record<string, string> = {
  hero: 'Destaque',
  search: 'Busca',
  categories: 'Categorias',
  quick_services: 'Serviços rápidos',
  scheduled: 'Agendados',
  subscriptions: 'Assinaturas',
  concierge: 'Concierge',
  active_orders: 'Pedidos ativos',
  recommendations: 'Recomendações',
  banner: 'Banner',
};

interface Draft {
  isNew: boolean;
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  sortOrder: string;
  active: boolean;
  hoursOfDay: number[];
  useHours: boolean;
  requiresEquipmentDue: boolean;
  requiresActiveOrder: boolean;
  requiresSubscription: boolean;
  config: string;
}

function toDraft(h: HomeSection | null, nextOrder: number): Draft {
  return {
    isNew: !h,
    id: h?.id ?? '',
    kind: h?.kind ?? 'quick_services',
    title: h?.title ?? '',
    subtitle: h?.subtitle ?? '',
    sortOrder: String(h?.sortOrder ?? nextOrder),
    active: h?.active ?? true,
    hoursOfDay: h?.rules.hoursOfDay ?? [],
    useHours: Boolean(h?.rules.hoursOfDay && h.rules.hoursOfDay.length > 0),
    requiresEquipmentDue: h?.rules.requiresEquipmentDue ?? false,
    requiresActiveOrder: h?.rules.requiresActiveOrder ?? false,
    requiresSubscription: h?.rules.requiresSubscription ?? false,
    config: JSON.stringify(h?.config ?? {}, null, 2),
  };
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function AdminHomePage() {
  const toast = useToast();
  const list = useAdminList<HomeSection>('home-sections');
  const upsert = useAdminUpsert<HomeSection>('home-sections');
  const remove = useAdminRemove('home-sections');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const rows = (list.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  function open(h: HomeSection | null) {
    setDraft(toDraft(h, rows.length ? (rows[rows.length - 1]?.sortOrder ?? 0) + 10 : 0));
    setErrors({});
    setFormError(null);
  }

  function move(h: HomeSection, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === h.id);
    const other = rows[idx + dir];
    if (!other) return;
    const a = { ...h, sortOrder: other.sortOrder };
    const b = { ...other, sortOrder: h.sortOrder };
    if (a.sortOrder === b.sortOrder) {
      a.sortOrder = b.sortOrder + dir;
    }
    upsert.mutate(a, {
      onSuccess: () => upsert.mutate(b, { onError: (err) => toast.error(errorMessage(err)) }),
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  function submit() {
    if (!draft) return;
    let config: unknown = {};
    try {
      config = draft.config.trim() ? JSON.parse(draft.config) : {};
    } catch {
      setErrors({ config: 'JSON inválido.' });
      return;
    }
    const result = validate(UpsertHomeSectionInput, {
      id: draft.id.trim(),
      kind: draft.kind,
      title: emptyToNull(draft.title),
      subtitle: emptyToNull(draft.subtitle),
      sortOrder: toInt(draft.sortOrder),
      active: draft.active,
      rules: {
        hoursOfDay: draft.useHours ? draft.hoursOfDay : undefined,
        requiresEquipmentDue: draft.requiresEquipmentDue || undefined,
        requiresActiveOrder: draft.requiresActiveOrder || undefined,
        requiresSubscription: draft.requiresSubscription || undefined,
      },
      config,
    });
    if (!result.ok) {
      setErrors(
        result.errors.id
          ? { ...result.errors, id: 'Minúsculas, números, hífen ou sublinhado.' }
          : result.errors,
      );
      return;
    }
    setErrors({});
    upsert.mutate(result.data, {
      onSuccess: () => {
        toast.success(draft.isNew ? 'Seção criada.' : 'Seção atualizada.');
        setDraft(null);
      },
      onError: (err) => setFormError(errorMessage(err)),
    });
  }

  const columns: Column<HomeSection>[] = [
    {
      key: 'order',
      header: 'Ordem',
      width: 120,
      render: (h) => {
        const idx = rows.findIndex((r) => r.id === h.id);
        return (
          <span className="row" style={{ gap: 4 }}>
            <button
              type="button"
              className={s.iconBtn}
              disabled={idx <= 0 || upsert.isPending}
              onClick={(e) => {
                e.stopPropagation();
                move(h, -1);
              }}
              aria-label={`Subir ${h.title ?? h.id}`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M6 15l6-6 6 6" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={s.iconBtn}
              disabled={idx >= rows.length - 1 || upsert.isPending}
              onClick={(e) => {
                e.stopPropagation();
                move(h, 1);
              }}
              aria-label={`Descer ${h.title ?? h.id}`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" />
              </svg>
            </button>
            <span className="mono small muted">{h.sortOrder}</span>
          </span>
        );
      },
    },
    { key: 'id', header: 'ID', render: (h) => <span className="mono">{h.id}</span> },
    { key: 'kind', header: 'Tipo', render: (h) => <Pill tone="info">{KIND_LABELS[h.kind] ?? h.kind}</Pill> },
    {
      key: 'title',
      header: 'Título',
      wrap: true,
      render: (h) => h.title ?? <span className="muted">—</span>,
    },
    {
      key: 'rules',
      header: 'Regras',
      wrap: true,
      render: (h) => {
        const r = h.rules;
        const chips: string[] = [];
        if (r.hoursOfDay?.length) chips.push(`Horas: ${r.hoursOfDay.join(', ')}`);
        if (r.requiresEquipmentDue) chips.push('Equipamento vencendo');
        if (r.requiresActiveOrder) chips.push('Pedido ativo');
        if (r.requiresSubscription) chips.push('Assinante');
        return chips.length ? (
          <span className={s.rulesRow}>
            {chips.map((c) => (
              <Pill key={c}>{c}</Pill>
            ))}
          </span>
        ) : (
          <span className="muted">Sempre</span>
        );
      },
    },
    { key: 'active', header: 'Status', render: (h) => <BoolPill value={h.active} /> },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Home do app"
        description="Seções, ordem e regras de exibição contextual da home do cliente."
        actions={
          <Button variant="primary" onClick={() => open(null)}>
            Nova seção
          </Button>
        }
      />
      <DataTable
        caption="Seções da home"
        columns={columns}
        rows={list.data ? rows : undefined}
        rowKey={(h) => h.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Home vazia"
        emptyDescription="Adicione seções para montar a home do cliente."
        emptyAction={<Button onClick={() => open(null)}>Nova seção</Button>}
        onRowClick={(h) => open(h)}
      />
      <FormDrawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.isNew ? 'Nova seção' : 'Editar seção'}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
        onDelete={
          draft && !draft.isNew
            ? () => {
                if (!window.confirm('Remover esta seção da home?')) return;
                remove.mutate(draft.id, {
                  onSuccess: () => {
                    toast.success('Seção removida.');
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
                label="ID"
                htmlFor="id"
                required
                error={errors.id}
                hint="Identificador estável, ex.: quick_services_morning."
              >
                <Input
                  id="id"
                  className="mono"
                  value={draft.id}
                  disabled={!draft.isNew}
                  invalid={Boolean(errors.id)}
                  onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                />
              </Field>
              <Field label="Tipo" htmlFor="kind" required error={errors.kind}>
                <Select
                  id="kind"
                  value={draft.kind}
                  options={HomeSectionKind.options.map((k) => ({ value: k, label: KIND_LABELS[k] ?? k }))}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                />
              </Field>
              <Field label="Título" htmlFor="title" error={errors.title}>
                <Input
                  id="title"
                  maxLength={60}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </Field>
              <Field label="Subtítulo" htmlFor="subtitle" error={errors.subtitle}>
                <Input
                  id="subtitle"
                  maxLength={120}
                  value={draft.subtitle}
                  onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                />
              </Field>
              <Field label="Ordem" htmlFor="sortOrder" required error={errors.sortOrder}>
                <Input
                  id="sortOrder"
                  type="number"
                  className="mono"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
                />
              </Field>
            </div>
            <div className={s.group}>
              <span className={s.groupTitle}>Regras de exibição</span>
              <Switch
                label="Restringir por hora do dia"
                checked={draft.useHours}
                onChange={(e) => setDraft({ ...draft, useHours: e.target.checked })}
              />
              {draft.useHours ? (
                <fieldset className={s.hourGrid} style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="sr-only">Horas em que a seção aparece</legend>
                  {HOURS.map((h) => {
                    const on = draft.hoursOfDay.includes(h);
                    return (
                      <button
                        key={h}
                        type="button"
                        className={[s.hour, on ? s.hourOn : ''].join(' ')}
                        aria-pressed={on}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            hoursOfDay: on
                              ? draft.hoursOfDay.filter((x) => x !== h)
                              : [...draft.hoursOfDay, h].sort((a, b) => a - b),
                          })
                        }
                      >
                        {h}h
                      </button>
                    );
                  })}
                </fieldset>
              ) : null}
              <Switch
                label="Só com equipamento vencendo"
                description="Cliente tem manutenção prevista."
                checked={draft.requiresEquipmentDue}
                onChange={(e) => setDraft({ ...draft, requiresEquipmentDue: e.target.checked })}
              />
              <Switch
                label="Só com pedido ativo"
                checked={draft.requiresActiveOrder}
                onChange={(e) => setDraft({ ...draft, requiresActiveOrder: e.target.checked })}
              />
              <Switch
                label="Só para assinantes"
                checked={draft.requiresSubscription}
                onChange={(e) => setDraft({ ...draft, requiresSubscription: e.target.checked })}
              />
            </div>
            <div className={s.group}>
              <Field
                label="Configuração (JSON)"
                htmlFor="config"
                error={errors.config}
                hint="Parâmetros livres da seção, ex.: lista de slugs em destaque."
              >
                <Textarea
                  id="config"
                  rows={5}
                  className="mono"
                  value={draft.config}
                  invalid={Boolean(errors.config)}
                  onChange={(e) => setDraft({ ...draft, config: e.target.value })}
                />
              </Field>
              <Switch
                label="Seção ativa"
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
