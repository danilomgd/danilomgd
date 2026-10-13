'use client';

import { type Coupon, type ServiceCategory, UpsertCouponInput } from '@velio/contracts';
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
  useToast,
} from '@/components/ui';
import {
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
import { fmtDateTime, formatBRL } from '@/lib/format';

interface Draft {
  isNew: boolean;
  code: string;
  kind: 'PERCENT' | 'FIXED';
  value: string;
  valueCents: number | null;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
  validFrom: string;
  validUntil: string;
  usageLimit: string;
  perUserLimit: string;
  categoryId: string;
  active: boolean;
}

function toDraft(c: Coupon | null): Draft {
  return {
    isNew: !c,
    code: c?.code ?? '',
    kind: c?.kind ?? 'PERCENT',
    value: c && c.kind === 'PERCENT' ? String(c.value) : '10',
    valueCents: c && c.kind === 'FIXED' ? c.value : null,
    minOrderCents: c?.minOrderCents ?? null,
    maxDiscountCents: c?.maxDiscountCents ?? null,
    validFrom: isoToLocalInput(c?.validFrom),
    validUntil: isoToLocalInput(c?.validUntil),
    usageLimit: c?.usageLimit != null ? String(c.usageLimit) : '',
    perUserLimit: c?.perUserLimit != null ? String(c.perUserLimit) : '',
    categoryId: c?.categoryId ?? '',
    active: c?.active ?? true,
  };
}

function discountLabel(c: Coupon): string {
  return c.kind === 'PERCENT' ? `${c.value}%` : formatBRL(c.value);
}

export default function AdminCouponsPage() {
  const toast = useToast();
  const list = useAdminList<Coupon>('coupons');
  const categories = useAdminList<ServiceCategory>('categories');
  const upsert = useAdminUpsert<Coupon>('coupons');
  const remove = useAdminRemove('coupons');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const cat = new Map((categories.data ?? []).map((x) => [x.id, x]));

  function open(c: Coupon | null) {
    setDraft(toDraft(c));
    setErrors({});
    setFormError(null);
  }

  function submit() {
    if (!draft) return;
    const result = validate(UpsertCouponInput, {
      code: draft.code.trim().toUpperCase(),
      kind: draft.kind,
      value: draft.kind === 'PERCENT' ? toInt(draft.value) : (draft.valueCents ?? undefined),
      minOrderCents: draft.minOrderCents,
      maxDiscountCents: draft.maxDiscountCents,
      validFrom: localInputToIso(draft.validFrom),
      validUntil: localInputToIso(draft.validUntil),
      usageLimit: toInt(draft.usageLimit) ?? null,
      perUserLimit: toInt(draft.perUserLimit) ?? null,
      categoryId: draft.categoryId || null,
      active: draft.active,
    });
    if (!result.ok) {
      setErrors(
        result.errors.code
          ? { ...result.errors, code: '4 a 20 caracteres, só letras maiúsculas e números.' }
          : result.errors,
      );
      return;
    }
    if (result.data.kind === 'PERCENT' && result.data.value > 100) {
      setErrors({ value: 'Percentual máximo é 100.' });
      return;
    }
    setErrors({});
    upsert.mutate(result.data, {
      onSuccess: () => {
        toast.success(draft.isNew ? 'Cupom criado.' : 'Cupom atualizado.');
        setDraft(null);
      },
      onError: (err) => setFormError(errorMessage(err)),
    });
  }

  const columns: Column<Coupon>[] = [
    { key: 'code', header: 'Código', render: (c) => <strong className="mono">{c.code}</strong> },
    {
      key: 'discount',
      header: 'Desconto',
      align: 'right',
      render: (c) => <span className="mono">{discountLabel(c)}</span>,
    },
    {
      key: 'min',
      header: 'Pedido mínimo',
      align: 'right',
      render: (c) => (
        <span className="mono">{c.minOrderCents != null ? formatBRL(c.minOrderCents) : '—'}</span>
      ),
    },
    {
      key: 'max',
      header: 'Teto',
      align: 'right',
      render: (c) => (
        <span className="mono">{c.maxDiscountCents != null ? formatBRL(c.maxDiscountCents) : '—'}</span>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      render: (c) =>
        c.categoryId ? (cat.get(c.categoryId)?.name ?? '—') : <span className="muted">Todas</span>,
    },
    {
      key: 'validity',
      header: 'Validade',
      wrap: true,
      render: (c) =>
        c.validFrom || c.validUntil
          ? `${c.validFrom ? fmtDateTime(c.validFrom) : 'agora'} → ${c.validUntil ? fmtDateTime(c.validUntil) : 'sem fim'}`
          : 'Sem prazo',
    },
    {
      key: 'limits',
      header: 'Limites',
      render: (c) => `${c.usageLimit ?? '∞'} total · ${c.perUserLimit ?? '∞'} por cliente`,
    },
    { key: 'active', header: 'Status', render: (c) => <BoolPill value={c.active} /> },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Cupons"
        description="Incentivos com regras de elegibilidade e limites de uso."
        actions={
          <Button variant="primary" onClick={() => open(null)}>
            Novo cupom
          </Button>
        }
      />
      <DataTable
        caption="Cupons"
        columns={columns}
        rows={list.data}
        rowKey={(c) => c.code}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Nenhum cupom"
        emptyAction={<Button onClick={() => open(null)}>Novo cupom</Button>}
        onRowClick={(c) => open(c)}
      />
      <FormDrawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.isNew ? 'Novo cupom' : `Editar cupom ${draft?.code ?? ''}`}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
        onDelete={
          draft && !draft.isNew
            ? () => {
                if (!window.confirm('Excluir este cupom? Resgates já feitos são mantidos.')) return;
                remove.mutate(draft.code, {
                  onSuccess: () => {
                    toast.success('Cupom excluído.');
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
                label="Código"
                htmlFor="code"
                required
                error={errors.code}
                hint="Maiúsculas e números, 4 a 20 caracteres."
              >
                <Input
                  id="code"
                  className="mono"
                  value={draft.code}
                  disabled={!draft.isNew}
                  invalid={Boolean(errors.code)}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="Tipo" htmlFor="kind" required>
                <Select
                  id="kind"
                  value={draft.kind}
                  options={[
                    { value: 'PERCENT', label: 'Percentual' },
                    { value: 'FIXED', label: 'Valor fixo' },
                  ]}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}
                />
              </Field>
              {draft.kind === 'PERCENT' ? (
                <Field label="Desconto" htmlFor="value" required error={errors.value}>
                  <Input
                    id="value"
                    type="number"
                    min={1}
                    max={100}
                    suffix="%"
                    className="mono"
                    value={draft.value}
                    invalid={Boolean(errors.value)}
                    onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  />
                </Field>
              ) : (
                <Field label="Desconto" htmlFor="valueCents" required error={errors.value}>
                  <MoneyInput
                    id="valueCents"
                    valueCents={draft.valueCents}
                    invalid={Boolean(errors.value)}
                    onChange={(c) => setDraft({ ...draft, valueCents: c })}
                  />
                </Field>
              )}
              <Field label="Teto do desconto" htmlFor="maxDiscount" error={errors.maxDiscountCents}>
                <MoneyInput
                  id="maxDiscount"
                  valueCents={draft.maxDiscountCents}
                  onChange={(c) => setDraft({ ...draft, maxDiscountCents: c })}
                />
              </Field>
              <Field label="Pedido mínimo" htmlFor="minOrder" error={errors.minOrderCents}>
                <MoneyInput
                  id="minOrder"
                  valueCents={draft.minOrderCents}
                  onChange={(c) => setDraft({ ...draft, minOrderCents: c })}
                />
              </Field>
              <Field label="Categoria" htmlFor="categoryId" hint="Vazio = vale para todas.">
                <Select
                  id="categoryId"
                  value={draft.categoryId}
                  placeholder="Todas"
                  options={(categories.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
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
              <Field label="Limite total de usos" htmlFor="usageLimit" error={errors.usageLimit}>
                <Input
                  id="usageLimit"
                  type="number"
                  min={1}
                  className="mono"
                  value={draft.usageLimit}
                  onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value })}
                />
              </Field>
              <Field label="Limite por cliente" htmlFor="perUserLimit" error={errors.perUserLimit}>
                <Input
                  id="perUserLimit"
                  type="number"
                  min={1}
                  className="mono"
                  value={draft.perUserLimit}
                  onChange={(e) => setDraft({ ...draft, perUserLimit: e.target.value })}
                />
              </Field>
            </div>
            <div className={s.group}>
              <Switch
                label="Cupom ativo"
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
