'use client';

import { useState } from 'react';
import { z } from 'zod';
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
  useToast,
} from '@/components/ui';
import {
  emptyToNull,
  type FieldErrors,
  isoToLocalInput,
  localInputToIso,
  toInt,
  useAdminList,
  useAdminRemove,
  useAdminUpsert,
  validate,
} from '@/lib/admin';
import { errorMessage } from '@/lib/errors';
import { fmtDateTime } from '@/lib/format';

/**
 * Banner da home. `contracts` ainda não define um DTO para banners (recurso `banners` do admin);
 * este schema espelha o mínimo acordado em 10_SCREEN_INVENTORY (A-10): imagem, destino, vigência.
 */
const UpsertBannerInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2).max(80),
  imageUrl: z.string().url(),
  targetUrl: z.string().max(300).optional().nullable(),
  sortOrder: z.number().int().default(0),
  validFrom: z.string().datetime({ offset: true }).nullable().optional(),
  validUntil: z.string().datetime({ offset: true }).nullable().optional(),
  active: z.boolean().default(true),
});
type Banner = z.infer<typeof UpsertBannerInput> & { id: string };

interface Draft {
  id?: string;
  title: string;
  imageUrl: string;
  targetUrl: string;
  sortOrder: string;
  validFrom: string;
  validUntil: string;
  active: boolean;
}

function toDraft(b: Banner | null): Draft {
  return {
    id: b?.id,
    title: b?.title ?? '',
    imageUrl: b?.imageUrl ?? '',
    targetUrl: b?.targetUrl ?? '',
    sortOrder: String(b?.sortOrder ?? 0),
    validFrom: isoToLocalInput(b?.validFrom),
    validUntil: isoToLocalInput(b?.validUntil),
    active: b?.active ?? true,
  };
}

export default function AdminBannersPage() {
  const toast = useToast();
  const list = useAdminList<Banner>('banners');
  const upsert = useAdminUpsert<Banner>('banners');
  const remove = useAdminRemove('banners');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function open(b: Banner | null) {
    setDraft(toDraft(b));
    setErrors({});
    setFormError(null);
  }

  function submit() {
    if (!draft) return;
    const result = validate(UpsertBannerInput, {
      id: draft.id,
      title: draft.title.trim(),
      imageUrl: draft.imageUrl.trim(),
      targetUrl: emptyToNull(draft.targetUrl),
      sortOrder: toInt(draft.sortOrder),
      validFrom: localInputToIso(draft.validFrom),
      validUntil: localInputToIso(draft.validUntil),
      active: draft.active,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    upsert.mutate(result.data, {
      onSuccess: () => {
        toast.success(draft.id ? 'Banner atualizado.' : 'Banner criado.');
        setDraft(null);
      },
      onError: (err) => setFormError(errorMessage(err)),
    });
  }

  const columns: Column<Banner>[] = [
    {
      key: 'image',
      header: '',
      width: 72,
      render: (b) => (
        // biome-ignore lint/performance/noImgElement: pré-visualização de URL externa
        <img
          src={b.imageUrl}
          alt=""
          width={56}
          height={32}
          style={{
            objectFit: 'cover',
            borderRadius: 6,
            display: 'block',
            background: 'var(--color-surface-alt)',
          }}
        />
      ),
    },
    { key: 'title', header: 'Título', render: (b) => <strong>{b.title}</strong> },
    {
      key: 'target',
      header: 'Destino',
      wrap: true,
      render: (b) =>
        b.targetUrl ? <span className="mono small">{b.targetUrl}</span> : <span className="muted">—</span>,
    },
    {
      key: 'validity',
      header: 'Vigência',
      wrap: true,
      render: (b) =>
        b.validFrom || b.validUntil
          ? `${b.validFrom ? fmtDateTime(b.validFrom) : 'agora'} → ${b.validUntil ? fmtDateTime(b.validUntil) : 'sem fim'}`
          : 'Sem prazo',
    },
    { key: 'order', header: 'Ordem', align: 'right', render: (b) => b.sortOrder },
    { key: 'active', header: 'Status', render: (b) => <BoolPill value={b.active} /> },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Banners"
        description="Imagens promocionais da home com destino e vigência."
        actions={
          <Button variant="primary" onClick={() => open(null)}>
            Novo banner
          </Button>
        }
      />
      <DataTable
        caption="Banners"
        columns={columns}
        rows={list.data}
        rowKey={(b) => b.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Nenhum banner"
        emptyAction={<Button onClick={() => open(null)}>Novo banner</Button>}
        onRowClick={(b) => open(b)}
      />
      <FormDrawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar banner' : 'Novo banner'}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
        onDelete={
          draft?.id
            ? () => {
                if (!window.confirm('Excluir este banner?')) return;
                remove.mutate(draft.id ?? '', {
                  onSuccess: () => {
                    toast.success('Banner excluído.');
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
              <Field label="Título" htmlFor="title" required error={errors.title} className={s.span2}>
                <Input
                  id="title"
                  value={draft.title}
                  invalid={Boolean(errors.title)}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </Field>
              <Field
                label="Imagem (URL)"
                htmlFor="imageUrl"
                required
                error={errors.imageUrl}
                className={s.span2}
                hint="Proporção recomendada 3:1."
              >
                <Input
                  id="imageUrl"
                  type="url"
                  value={draft.imageUrl}
                  invalid={Boolean(errors.imageUrl)}
                  onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
                />
              </Field>
              {draft.imageUrl ? (
                <div className={s.span2}>
                  {/* biome-ignore lint/performance/noImgElement: pré-visualização de URL externa */}
                  <img
                    src={draft.imageUrl}
                    alt="Pré-visualização do banner"
                    style={{
                      width: '100%',
                      aspectRatio: '3 / 1',
                      objectFit: 'cover',
                      borderRadius: 12,
                      background: 'var(--color-surface-alt)',
                    }}
                  />
                </div>
              ) : null}
              <Field
                label="Destino"
                htmlFor="targetUrl"
                error={errors.targetUrl}
                className={s.span2}
                hint="Rota do app (ex.: /services/limpeza) ou URL externa."
              >
                <Input
                  id="targetUrl"
                  value={draft.targetUrl}
                  onChange={(e) => setDraft({ ...draft, targetUrl: e.target.value })}
                />
              </Field>
              <Field label="Válido de" htmlFor="validFrom" error={errors.validFrom}>
                <Input
                  id="validFrom"
                  type="datetime-local"
                  value={draft.validFrom}
                  onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })}
                />
              </Field>
              <Field label="Válido até" htmlFor="validUntil" error={errors.validUntil}>
                <Input
                  id="validUntil"
                  type="datetime-local"
                  value={draft.validUntil}
                  onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
                />
              </Field>
              <Field label="Ordem" htmlFor="sortOrder" error={errors.sortOrder}>
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
              <Switch
                label="Banner ativo"
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
