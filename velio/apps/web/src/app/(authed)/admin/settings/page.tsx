'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlatformSettings } from '@velio/contracts';
import { useEffect, useState } from 'react';
import s from '@/components/admin/admin.module.css';
import { MoneyInput } from '@/components/admin/MoneyInput';
import {
  Button,
  Card,
  ErrorState,
  Field,
  InlineAlert,
  Input,
  PageHeader,
  Select,
  SkeletonRows,
  useToast,
} from '@/components/ui';
import { type FieldErrors, toInt, toNum, validate } from '@/lib/admin';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

interface Draft {
  cancellation: {
    freeMinutesAfterAccept: string;
    lateFeeCents: number;
    enRouteFeePct: string;
    enRouteFeeMinCents: number;
  };
  offers: { defaultTimeoutSeconds: string };
  quotes: { additionalQuoteExpiresMinutes: string };
  payouts: { cadence: string; weekday: string };
  concierge: { humanReviewAboveCents: number; humanReviewAboveTasks: string; alwaysHumanForKinds: string };
  location: { maxAccuracyM: string; retentionDays: string };
  reviews: { windowDays: string };
}

function toDraft(raw: Record<string, unknown>): Draft {
  // Preenche defaults do schema para chaves ausentes.
  const parsed = PlatformSettings.safeParse({
    cancellation: {},
    offers: {},
    quotes: {},
    payouts: {},
    concierge: {},
    location: {},
    reviews: {},
    ...raw,
  });
  const v = parsed.success
    ? parsed.data
    : PlatformSettings.parse({
        cancellation: {},
        offers: {},
        quotes: {},
        payouts: {},
        concierge: {},
        location: {},
        reviews: {},
      });
  return {
    cancellation: {
      freeMinutesAfterAccept: String(v.cancellation.freeMinutesAfterAccept),
      lateFeeCents: v.cancellation.lateFeeCents,
      enRouteFeePct: String(v.cancellation.enRouteFeeBps / 100),
      enRouteFeeMinCents: v.cancellation.enRouteFeeMinCents,
    },
    offers: { defaultTimeoutSeconds: String(v.offers.defaultTimeoutSeconds) },
    quotes: { additionalQuoteExpiresMinutes: String(v.quotes.additionalQuoteExpiresMinutes) },
    payouts: { cadence: v.payouts.cadence, weekday: String(v.payouts.weekday) },
    concierge: {
      humanReviewAboveCents: v.concierge.humanReviewAboveCents,
      humanReviewAboveTasks: String(v.concierge.humanReviewAboveTasks),
      alwaysHumanForKinds: v.concierge.alwaysHumanForKinds.join(', '),
    },
    location: {
      maxAccuracyM: String(v.location.maxAccuracyM),
      retentionDays: String(v.location.retentionDays),
    },
    reviews: { windowDays: String(v.reviews.windowDays) },
  };
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function AdminSettingsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.admin.settings() });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.data && !dirty) setDraft(toDraft(q.data));
  }, [q.data, dirty]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.admin.updateSettings(body),
    onSuccess: () => {
      toast.success('Configurações salvas.');
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function patch<K extends keyof Draft>(section: K, values: Partial<Draft[K]>) {
    if (!draft) return;
    setDirty(true);
    setDraft({ ...draft, [section]: { ...draft[section], ...values } });
  }

  function submit() {
    if (!draft) return;
    const pct = toNum(draft.cancellation.enRouteFeePct);
    const result = validate(PlatformSettings, {
      cancellation: {
        freeMinutesAfterAccept: toInt(draft.cancellation.freeMinutesAfterAccept),
        lateFeeCents: draft.cancellation.lateFeeCents,
        enRouteFeeBps: pct === undefined ? undefined : Math.round(pct * 100),
        enRouteFeeMinCents: draft.cancellation.enRouteFeeMinCents,
      },
      offers: { defaultTimeoutSeconds: toInt(draft.offers.defaultTimeoutSeconds) },
      quotes: { additionalQuoteExpiresMinutes: toInt(draft.quotes.additionalQuoteExpiresMinutes) },
      payouts: { cadence: draft.payouts.cadence, weekday: toInt(draft.payouts.weekday) },
      concierge: {
        humanReviewAboveCents: draft.concierge.humanReviewAboveCents,
        humanReviewAboveTasks: toInt(draft.concierge.humanReviewAboveTasks),
        alwaysHumanForKinds: draft.concierge.alwaysHumanForKinds
          .split(',')
          .map((k) => k.trim().toUpperCase())
          .filter(Boolean),
      },
      location: {
        maxAccuracyM: toNum(draft.location.maxAccuracyM),
        retentionDays: toInt(draft.location.retentionDays),
      },
      reviews: { windowDays: toInt(draft.reviews.windowDays) },
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(result.data);
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Configurações"
        description="Parâmetros globais da plataforma (platform_settings). Mudanças valem imediatamente."
        actions={
          <Button variant="primary" onClick={submit} loading={save.isPending} disabled={!draft || !dirty}>
            Salvar alterações
          </Button>
        }
      />
      {q.isLoading || !draft ? (
        q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />
        ) : (
          <SkeletonRows rows={6} height={72} />
        )
      ) : (
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {Object.keys(errors).length ? (
            <InlineAlert>Alguns campos estão inválidos. Revise os destaques.</InlineAlert>
          ) : null}
          <Card title="Cancelamento" subtitle="Janelas e taxas cobradas do cliente (11 §4).">
            <div className={s.formGrid}>
              <Field
                label="Minutos grátis após o aceite"
                htmlFor="freeMin"
                error={errors['cancellation.freeMinutesAfterAccept']}
              >
                <Input
                  id="freeMin"
                  type="number"
                  min={0}
                  className="mono"
                  value={draft.cancellation.freeMinutesAfterAccept}
                  onChange={(e) => patch('cancellation', { freeMinutesAfterAccept: e.target.value })}
                />
              </Field>
              <Field
                label="Taxa fixa de cancelamento tardio"
                htmlFor="lateFee"
                error={errors['cancellation.lateFeeCents']}
              >
                <MoneyInput
                  id="lateFee"
                  valueCents={draft.cancellation.lateFeeCents}
                  onChange={(c) => patch('cancellation', { lateFeeCents: c ?? 0 })}
                />
              </Field>
              <Field
                label="Taxa de deslocamento"
                htmlFor="enRoutePct"
                error={errors['cancellation.enRouteFeeBps']}
                hint="Percentual do preço quando o profissional já está a caminho."
              >
                <Input
                  id="enRoutePct"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  suffix="%"
                  className="mono"
                  value={draft.cancellation.enRouteFeePct}
                  onChange={(e) => patch('cancellation', { enRouteFeePct: e.target.value })}
                />
              </Field>
              <Field
                label="Mínimo da taxa de deslocamento"
                htmlFor="enRouteMin"
                error={errors['cancellation.enRouteFeeMinCents']}
              >
                <MoneyInput
                  id="enRouteMin"
                  valueCents={draft.cancellation.enRouteFeeMinCents}
                  onChange={(c) => patch('cancellation', { enRouteFeeMinCents: c ?? 0 })}
                />
              </Field>
            </div>
          </Card>
          <Card title="Ofertas e orçamentos">
            <div className={s.formGrid}>
              <Field
                label="Tempo padrão da oferta (s)"
                htmlFor="offerTimeout"
                error={errors['offers.defaultTimeoutSeconds']}
              >
                <Input
                  id="offerTimeout"
                  type="number"
                  min={15}
                  className="mono"
                  value={draft.offers.defaultTimeoutSeconds}
                  onChange={(e) => patch('offers', { defaultTimeoutSeconds: e.target.value })}
                />
              </Field>
              <Field
                label="Validade do orçamento adicional (min)"
                htmlFor="quoteExp"
                error={errors['quotes.additionalQuoteExpiresMinutes']}
              >
                <Input
                  id="quoteExp"
                  type="number"
                  min={5}
                  className="mono"
                  value={draft.quotes.additionalQuoteExpiresMinutes}
                  onChange={(e) => patch('quotes', { additionalQuoteExpiresMinutes: e.target.value })}
                />
              </Field>
            </div>
          </Card>
          <Card title="Repasses">
            <div className={s.formGrid}>
              <Field label="Cadência" htmlFor="cadence" error={errors['payouts.cadence']}>
                <Select
                  id="cadence"
                  value={draft.payouts.cadence}
                  options={[
                    { value: 'WEEKLY', label: 'Semanal' },
                    { value: 'BIWEEKLY', label: 'Quinzenal' },
                    { value: 'MONTHLY', label: 'Mensal' },
                  ]}
                  onChange={(e) => patch('payouts', { cadence: e.target.value })}
                />
              </Field>
              <Field label="Dia da semana" htmlFor="weekday" error={errors['payouts.weekday']}>
                <Select
                  id="weekday"
                  value={draft.payouts.weekday}
                  options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))}
                  onChange={(e) => patch('payouts', { weekday: e.target.value })}
                />
              </Field>
            </div>
          </Card>
          <Card title="Concierge" subtitle="Quando o plano da IA exige revisão humana (ADR-014).">
            <div className={s.formGrid}>
              <Field
                label="Revisar acima de"
                htmlFor="humanAbove"
                error={errors['concierge.humanReviewAboveCents']}
              >
                <MoneyInput
                  id="humanAbove"
                  valueCents={draft.concierge.humanReviewAboveCents}
                  onChange={(c) => patch('concierge', { humanReviewAboveCents: c ?? 0 })}
                />
              </Field>
              <Field
                label="Revisar acima de (tarefas)"
                htmlFor="humanTasks"
                error={errors['concierge.humanReviewAboveTasks']}
              >
                <Input
                  id="humanTasks"
                  type="number"
                  min={1}
                  className="mono"
                  value={draft.concierge.humanReviewAboveTasks}
                  onChange={(e) => patch('concierge', { humanReviewAboveTasks: e.target.value })}
                />
              </Field>
              <Field
                label="Sempre humano para os tipos"
                htmlFor="humanKinds"
                error={errors['concierge.alwaysHumanForKinds']}
                hint="Separe por vírgula, ex.: PURCHASE, VEHICLE_RETURN."
                className={s.span2}
              >
                <Input
                  id="humanKinds"
                  className="mono"
                  value={draft.concierge.alwaysHumanForKinds}
                  onChange={(e) => patch('concierge', { alwaysHumanForKinds: e.target.value })}
                />
              </Field>
            </div>
          </Card>
          <Card title="Localização e avaliações">
            <div className={s.formGrid}>
              <Field
                label="Precisão máxima aceita (m)"
                htmlFor="maxAcc"
                error={errors['location.maxAccuracyM']}
              >
                <Input
                  id="maxAcc"
                  type="number"
                  min={1}
                  className="mono"
                  value={draft.location.maxAccuracyM}
                  onChange={(e) => patch('location', { maxAccuracyM: e.target.value })}
                />
              </Field>
              <Field
                label="Retenção de localização (dias)"
                htmlFor="retention"
                error={errors['location.retentionDays']}
                hint="LGPD: histórico apagado após o prazo."
              >
                <Input
                  id="retention"
                  type="number"
                  min={1}
                  className="mono"
                  value={draft.location.retentionDays}
                  onChange={(e) => patch('location', { retentionDays: e.target.value })}
                />
              </Field>
              <Field
                label="Janela para avaliar (dias)"
                htmlFor="reviewWindow"
                error={errors['reviews.windowDays']}
              >
                <Input
                  id="reviewWindow"
                  type="number"
                  min={1}
                  className="mono"
                  value={draft.reviews.windowDays}
                  onChange={(e) => patch('reviews', { windowDays: e.target.value })}
                />
              </Field>
            </div>
          </Card>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              disabled={!dirty}
              onClick={() => {
                if (q.data) setDraft(toDraft(q.data));
                setDirty(false);
                setErrors({});
              }}
            >
              Descartar
            </Button>
            <Button variant="primary" type="submit" loading={save.isPending} disabled={!dirty}>
              Salvar alterações
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
