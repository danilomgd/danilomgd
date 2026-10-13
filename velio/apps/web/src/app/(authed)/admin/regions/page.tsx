'use client';

import { UpsertRegionInput } from '@velio/contracts';
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
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { type FieldErrors, toNum, useAdminList, useAdminRemove, useAdminUpsert, validate } from '@/lib/admin';
import { errorMessage } from '@/lib/errors';

type Region = z.infer<typeof UpsertRegionInput> & { id: string };

interface Draft {
  id?: string;
  name: string;
  city: string;
  state: string;
  minLat: string;
  minLng: string;
  maxLat: string;
  maxLng: string;
  active: boolean;
  neighborhoods: string;
}

function toDraft(r: Region | null): Draft {
  return {
    id: r?.id,
    name: r?.name ?? '',
    city: r?.city ?? '',
    state: r?.state ?? '',
    minLat: r ? String(r.bbox.minLat) : '',
    minLng: r ? String(r.bbox.minLng) : '',
    maxLat: r ? String(r.bbox.maxLat) : '',
    maxLng: r ? String(r.bbox.maxLng) : '',
    active: r?.active ?? true,
    neighborhoods: (r?.neighborhoods ?? []).join('\n'),
  };
}

export default function AdminRegionsPage() {
  const toast = useToast();
  const list = useAdminList<Region>('regions');
  const upsert = useAdminUpsert<Region>('regions');
  const remove = useAdminRemove('regions');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function open(r: Region | null) {
    setDraft(toDraft(r));
    setErrors({});
    setFormError(null);
  }

  function submit() {
    if (!draft) return;
    const result = validate(UpsertRegionInput, {
      id: draft.id,
      name: draft.name.trim(),
      city: draft.city.trim(),
      state: draft.state.trim().toUpperCase(),
      bbox: {
        minLat: toNum(draft.minLat),
        minLng: toNum(draft.minLng),
        maxLat: toNum(draft.maxLat),
        maxLng: toNum(draft.maxLng),
      },
      active: draft.active,
      neighborhoods: draft.neighborhoods
        .split(/\n|,/)
        .map((n) => n.trim())
        .filter(Boolean),
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (
      result.data.bbox.minLat >= result.data.bbox.maxLat ||
      result.data.bbox.minLng >= result.data.bbox.maxLng
    ) {
      setErrors({ 'bbox.maxLat': 'Os limites máximos precisam ser maiores que os mínimos.' });
      return;
    }
    setErrors({});
    upsert.mutate(result.data, {
      onSuccess: () => {
        toast.success(draft.id ? 'Região atualizada.' : 'Região criada.');
        setDraft(null);
      },
      onError: (err) => setFormError(errorMessage(err)),
    });
  }

  const columns: Column<Region>[] = [
    { key: 'name', header: 'Região', render: (r) => <strong>{r.name}</strong> },
    { key: 'city', header: 'Cidade', render: (r) => `${r.city} / ${r.state}` },
    {
      key: 'bbox',
      header: 'Área (bbox)',
      render: (r) => (
        <span className="mono small">
          {r.bbox.minLat.toFixed(3)}, {r.bbox.minLng.toFixed(3)} → {r.bbox.maxLat.toFixed(3)},{' '}
          {r.bbox.maxLng.toFixed(3)}
        </span>
      ),
    },
    { key: 'n', header: 'Bairros', align: 'right', render: (r) => r.neighborhoods.length },
    { key: 'active', header: 'Status', render: (r) => <BoolPill value={r.active} /> },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Regiões"
        description="Áreas de atendimento. No MVP a área é um retângulo (bbox); polígonos entram na V1."
        actions={
          <Button variant="primary" onClick={() => open(null)}>
            Nova região
          </Button>
        }
      />
      <DataTable
        caption="Regiões"
        columns={columns}
        rows={list.data}
        rowKey={(r) => r.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Nenhuma região"
        emptyDescription="Sem região ativa, nenhum pedido pode ser aceito."
        emptyAction={<Button onClick={() => open(null)}>Nova região</Button>}
        onRowClick={(r) => open(r)}
      />
      <FormDrawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar região' : 'Nova região'}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
        onDelete={
          draft?.id
            ? () => {
                if (!window.confirm('Excluir esta região? Regras de preço vinculadas perdem a referência.'))
                  return;
                remove.mutate(draft.id ?? '', {
                  onSuccess: () => {
                    toast.success('Região excluída.');
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
              <Field label="Nome" htmlFor="name" required error={errors.name} className={s.span2}>
                <Input
                  id="name"
                  value={draft.name}
                  invalid={Boolean(errors.name)}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Cidade" htmlFor="city" required error={errors.city}>
                <Input
                  id="city"
                  value={draft.city}
                  invalid={Boolean(errors.city)}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                />
              </Field>
              <Field label="UF" htmlFor="state" required error={errors.state} hint="Duas letras, ex.: SP.">
                <Input
                  id="state"
                  maxLength={2}
                  value={draft.state}
                  invalid={Boolean(errors.state)}
                  onChange={(e) => setDraft({ ...draft, state: e.target.value.toUpperCase() })}
                />
              </Field>
            </div>
            <div className={s.group}>
              <span className={s.groupTitle}>Limites geográficos</span>
              <div className={s.formGrid}>
                <Field label="Latitude mínima" htmlFor="minLat" required error={errors['bbox.minLat']}>
                  <Input
                    id="minLat"
                    className="mono"
                    inputMode="decimal"
                    value={draft.minLat}
                    onChange={(e) => setDraft({ ...draft, minLat: e.target.value })}
                  />
                </Field>
                <Field label="Longitude mínima" htmlFor="minLng" required error={errors['bbox.minLng']}>
                  <Input
                    id="minLng"
                    className="mono"
                    inputMode="decimal"
                    value={draft.minLng}
                    onChange={(e) => setDraft({ ...draft, minLng: e.target.value })}
                  />
                </Field>
                <Field label="Latitude máxima" htmlFor="maxLat" required error={errors['bbox.maxLat']}>
                  <Input
                    id="maxLat"
                    className="mono"
                    inputMode="decimal"
                    value={draft.maxLat}
                    onChange={(e) => setDraft({ ...draft, maxLat: e.target.value })}
                  />
                </Field>
                <Field label="Longitude máxima" htmlFor="maxLng" required error={errors['bbox.maxLng']}>
                  <Input
                    id="maxLng"
                    className="mono"
                    inputMode="decimal"
                    value={draft.maxLng}
                    onChange={(e) => setDraft({ ...draft, maxLng: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <div className={s.group}>
              <span className={s.groupTitle}>Bairros</span>
              <Field
                label="Lista de bairros"
                htmlFor="neighborhoods"
                hint="Um por linha ou separados por vírgula."
              >
                <Textarea
                  id="neighborhoods"
                  rows={4}
                  value={draft.neighborhoods}
                  onChange={(e) => setDraft({ ...draft, neighborhoods: e.target.value })}
                />
              </Field>
              <Switch
                label="Região ativa"
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
