'use client';

import {
  type MatchingWeights,
  type ServiceCategory,
  UpsertMatchingConfigInput,
  type WaveConfig,
} from '@velio/contracts';
import { useMemo, useState } from 'react';
import type { z } from 'zod';
import s from '@/components/admin/admin.module.css';
import { FormDrawer } from '@/components/admin/FormDrawer';
import {
  BoolPill,
  Button,
  Card,
  type Column,
  DataTable,
  Field,
  InlineAlert,
  Input,
  PageHeader,
  Select,
  Switch,
  useToast,
} from '@/components/ui';
import {
  type FieldErrors,
  toInt,
  toNum,
  useAdminList,
  useAdminRemove,
  useAdminUpsert,
  validate,
} from '@/lib/admin';
import { errorMessage } from '@/lib/errors';

type MatchingConfig = z.infer<typeof UpsertMatchingConfigInput> & { id: string };

const WEIGHT_META: Array<{ key: keyof MatchingWeights; label: string; color: string; desc: string }> = [
  {
    key: 'proximity',
    label: 'Proximidade',
    color: 'var(--color-primary)',
    desc: 'Distância até o endereço, relativa ao raio da onda.',
  },
  {
    key: 'qualification',
    label: 'Qualificação',
    color: 'var(--color-info)',
    desc: 'Nível declarado e verificado para a categoria.',
  },
  {
    key: 'reputation',
    label: 'Reputação',
    color: 'var(--color-success)',
    desc: 'Média bayesiana das avaliações.',
  },
  {
    key: 'availability',
    label: 'Disponibilidade',
    color: 'var(--color-accent)',
    desc: 'Online agora ou livre na janela.',
  },
  {
    key: 'compatibility',
    label: 'Compatibilidade',
    color: 'var(--color-warning)',
    desc: 'Já atendeu o cliente, tempo desde a última ordem, resposta.',
  },
  {
    key: 'acceptanceRate',
    label: 'Taxa de aceite',
    color: 'var(--color-danger)',
    desc: 'Ofertas aceitas sobre recebidas.',
  },
  {
    key: 'cancellationPenalty',
    label: 'Cancelamentos',
    color: 'var(--color-text-muted)',
    desc: 'Penaliza quem cancela depois de aceitar.',
  },
];

const DEFAULT_WEIGHTS: MatchingWeights = {
  proximity: 0.3,
  qualification: 0.15,
  reputation: 0.2,
  availability: 0.15,
  compatibility: 0.1,
  acceptanceRate: 0.1,
  cancellationPenalty: 0.1,
};

const DEFAULT_WAVES: WaveConfig = {
  waves: [
    { radiusKm: 5, offerCount: 3, timeoutSeconds: 90 },
    { radiusKm: 10, offerCount: 5, timeoutSeconds: 120 },
    { radiusKm: 20, offerCount: 8, timeoutSeconds: 180 },
  ],
  escalateToOps: true,
  minScore: 0.2,
};

let waveSeq = 0;
const waveUid = () => `w${++waveSeq}`;

interface WaveDraft {
  uid: string;
  radiusKm: string;
  offerCount: string;
  timeoutSeconds: string;
}

interface Draft {
  id?: string;
  categoryId: string;
  weights: MatchingWeights;
  waves: WaveDraft[];
  escalateToOps: boolean;
  minScore: string;
  active: boolean;
}

function toDraft(c: MatchingConfig | null): Draft {
  const waves = c?.waves ?? DEFAULT_WAVES;
  return {
    id: c?.id,
    categoryId: c?.categoryId ?? '',
    weights: { ...(c?.weights ?? DEFAULT_WEIGHTS) },
    waves: waves.waves.map((w) => ({
      uid: waveUid(),
      radiusKm: String(w.radiusKm),
      offerCount: String(w.offerCount),
      timeoutSeconds: String(w.timeoutSeconds),
    })),
    escalateToOps: waves.escalateToOps,
    minScore: String(waves.minScore),
    active: c?.active ?? true,
  };
}

export default function AdminMatchingPage() {
  const toast = useToast();
  const list = useAdminList<MatchingConfig>('matching-configs');
  const categories = useAdminList<ServiceCategory>('categories');
  const upsert = useAdminUpsert<MatchingConfig>('matching-configs');
  const remove = useAdminRemove('matching-configs');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const cat = new Map((categories.data ?? []).map((x) => [x.id, x]));
  const sum = useMemo(() => (draft ? Object.values(draft.weights).reduce((a, b) => a + b, 0) : 0), [draft]);

  function open(c: MatchingConfig | null) {
    setDraft(toDraft(c));
    setErrors({});
    setFormError(null);
  }

  function setWeight(key: keyof MatchingWeights, value: number) {
    if (!draft) return;
    setDraft({ ...draft, weights: { ...draft.weights, [key]: value } });
  }

  function normalize() {
    if (!draft || sum === 0) return;
    const w = { ...draft.weights };
    for (const k of Object.keys(w) as Array<keyof MatchingWeights>)
      w[k] = Math.round((w[k] / sum) * 100) / 100;
    setDraft({ ...draft, weights: w });
  }

  function submit() {
    if (!draft) return;
    const result = validate(UpsertMatchingConfigInput, {
      id: draft.id,
      categoryId: draft.categoryId || null,
      weights: draft.weights,
      waves: {
        waves: draft.waves.map((w) => ({
          radiusKm: toNum(w.radiusKm),
          offerCount: toInt(w.offerCount),
          timeoutSeconds: toInt(w.timeoutSeconds),
        })),
        escalateToOps: draft.escalateToOps,
        minScore: toNum(draft.minScore),
      },
      active: draft.active,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    upsert.mutate(result.data, {
      onSuccess: () => {
        toast.success('Configuração de matching salva.');
        setDraft(null);
      },
      onError: (err) => setFormError(errorMessage(err)),
    });
  }

  const columns: Column<MatchingConfig>[] = [
    {
      key: 'scope',
      header: 'Escopo',
      render: (c) => (c.categoryId ? (cat.get(c.categoryId)?.name ?? '—') : <strong>Padrão (todas)</strong>),
    },
    {
      key: 'weights',
      header: 'Pesos',
      wrap: true,
      render: (c) => (
        <span className="small mono">
          {WEIGHT_META.map((m) => `${m.label.slice(0, 4)} ${Math.round(c.weights[m.key] * 100)}`).join(' · ')}
        </span>
      ),
    },
    {
      key: 'waves',
      header: 'Ondas',
      render: (c) =>
        c.waves.waves.map((w) => `${w.radiusKm} km/${w.offerCount}/${w.timeoutSeconds}s`).join(' → '),
    },
    { key: 'escalate', header: 'Escala para ops', render: (c) => (c.waves.escalateToOps ? 'Sim' : 'Não') },
    {
      key: 'min',
      header: 'Score mínimo',
      align: 'right',
      render: (c) => <span className="mono">{c.waves.minScore.toFixed(2)}</span>,
    },
    { key: 'active', header: 'Status', render: (c) => <BoolPill value={c.active} /> },
  ];

  const sumOk = Math.abs(sum - 1) < 0.005;

  return (
    <div className="page">
      <PageHeader
        title="Matching"
        description="Pesos do score e ondas de oferta por categoria. Sem configuração específica, vale a padrão."
        actions={
          <Button variant="primary" onClick={() => open(null)}>
            Nova configuração
          </Button>
        }
      />
      <DataTable
        caption="Configurações de matching"
        columns={columns}
        rows={list.data}
        rowKey={(c) => c.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Nenhuma configuração"
        emptyDescription="O motor usa os pesos e ondas padrão do domínio."
        emptyAction={<Button onClick={() => open(null)}>Nova configuração</Button>}
        onRowClick={(c) => open(c)}
      />
      <FormDrawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar matching' : 'Nova configuração de matching'}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
        wide
        onDelete={
          draft?.id
            ? () => {
                if (!window.confirm('Excluir esta configuração? A categoria volta a usar a padrão.')) return;
                remove.mutate(draft.id ?? '', {
                  onSuccess: () => {
                    toast.success('Configuração excluída.');
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
            <Field label="Categoria" htmlFor="categoryId" hint="Vazio = configuração padrão para todas.">
              <Select
                id="categoryId"
                value={draft.categoryId}
                placeholder="Padrão (todas as categorias)"
                options={(categories.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
              />
            </Field>

            <div className={s.group}>
              <div className="row-between">
                <span className={s.groupTitle}>Pesos do score</span>
                <span
                  className={['small', 'mono', sumOk ? '' : 'muted'].join(' ')}
                  style={{ color: sumOk ? 'var(--color-success)' : 'var(--color-warning)' }}
                >
                  Soma: {Math.round(sum * 100)}%
                </span>
              </div>
              <div className={s.sum} aria-hidden>
                {WEIGHT_META.map((m) => (
                  <span
                    key={m.key}
                    className={s.sumSeg}
                    style={{
                      width: `${(draft.weights[m.key] / Math.max(sum, 1)) * 100}%`,
                      background: m.color,
                    }}
                  />
                ))}
              </div>
              {!sumOk ? (
                <InlineAlert
                  tone="warning"
                  action={
                    <Button size="sm" variant="ghost" onClick={normalize}>
                      Normalizar para 100%
                    </Button>
                  }
                >
                  O motor normaliza internamente, mas pesos que somam 100% ficam mais legíveis.
                </InlineAlert>
              ) : null}
              {WEIGHT_META.map((m) => {
                const id = `w-${m.key}`;
                const v = draft.weights[m.key];
                return (
                  <div key={m.key} className={s.sliderRow}>
                    <label htmlFor={id} title={m.desc}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: m.color,
                          marginRight: 8,
                          verticalAlign: 'middle',
                        }}
                        aria-hidden
                      />
                      {m.label}
                    </label>
                    <input
                      id={id}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(v * 100)}
                      onChange={(e) => setWeight(m.key, Number(e.target.value) / 100)}
                      aria-valuetext={`${Math.round(v * 100)}%`}
                      aria-describedby={`${id}-desc`}
                    />
                    <span className="mono small" style={{ textAlign: 'right' }}>
                      {Math.round(v * 100)}%
                    </span>
                    <span id={`${id}-desc`} className="sr-only">
                      {m.desc}
                    </span>
                  </div>
                );
              })}
              {errors.weights ? (
                <span className="small" style={{ color: 'var(--color-danger)' }}>
                  {errors.weights}
                </span>
              ) : null}
            </div>

            <div className={s.group}>
              <span className={s.groupTitle}>Ondas de oferta</span>
              <p className="caption">
                Cada onda amplia o raio, oferta a mais profissionais e espera o tempo definido antes da
                próxima.
              </p>
              {errors['waves.waves'] ? <InlineAlert>{errors['waves.waves']}</InlineAlert> : null}
              {draft.waves.map((w, i) => (
                <div key={w.uid} className={s.waveRow}>
                  <span className="mono small" style={{ paddingBottom: 12 }}>
                    {i + 1}
                  </span>
                  <Field
                    label="Raio (km)"
                    htmlFor={`wave-${i}-r`}
                    error={errors[`waves.waves.${i}.radiusKm`]}
                  >
                    <Input
                      id={`wave-${i}-r`}
                      type="number"
                      min={0.5}
                      step={0.5}
                      className="mono"
                      value={w.radiusKm}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          waves: draft.waves.map((x, xi) =>
                            xi === i ? { ...x, radiusKm: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Ofertas"
                    htmlFor={`wave-${i}-n`}
                    error={errors[`waves.waves.${i}.offerCount`]}
                  >
                    <Input
                      id={`wave-${i}-n`}
                      type="number"
                      min={1}
                      max={20}
                      className="mono"
                      value={w.offerCount}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          waves: draft.waves.map((x, xi) =>
                            xi === i ? { ...x, offerCount: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Tempo (s)"
                    htmlFor={`wave-${i}-t`}
                    error={errors[`waves.waves.${i}.timeoutSeconds`]}
                  >
                    <Input
                      id={`wave-${i}-t`}
                      type="number"
                      min={15}
                      max={900}
                      className="mono"
                      value={w.timeoutSeconds}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          waves: draft.waves.map((x, xi) =>
                            xi === i ? { ...x, timeoutSeconds: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className={s.iconBtn}
                    style={{ marginBottom: 4 }}
                    disabled={draft.waves.length <= 1}
                    onClick={() => setDraft({ ...draft, waves: draft.waves.filter((_, xi) => xi !== i) })}
                    aria-label={`Remover onda ${i + 1}`}
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
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
              <div className="row wrap">
                <Button
                  size="sm"
                  disabled={draft.waves.length >= 6}
                  onClick={() => {
                    const last = draft.waves[draft.waves.length - 1];
                    const r = (toNum(last?.radiusKm ?? '5') ?? 5) * 2;
                    setDraft({
                      ...draft,
                      waves: [
                        ...draft.waves,
                        {
                          uid: waveUid(),
                          radiusKm: String(r),
                          offerCount: String(Math.min(20, (toInt(last?.offerCount ?? '3') ?? 3) + 2)),
                          timeoutSeconds: last?.timeoutSeconds ?? '120',
                        },
                      ],
                    });
                  }}
                >
                  Adicionar onda
                </Button>
                <span className="caption">Máximo de 6 ondas.</span>
              </div>
              <div className={s.formGrid}>
                <Field
                  label="Score mínimo"
                  htmlFor="minScore"
                  error={errors['waves.minScore']}
                  hint="De 0 a 1. Candidatos abaixo não recebem oferta."
                >
                  <Input
                    id="minScore"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    className="mono"
                    value={draft.minScore}
                    onChange={(e) => setDraft({ ...draft, minScore: e.target.value })}
                  />
                </Field>
                <div style={{ alignSelf: 'end', paddingBottom: 8 }}>
                  <Switch
                    label="Escalar para a operação"
                    description="Depois da última onda, cai na fila Sem profissional."
                    checked={draft.escalateToOps}
                    onChange={(e) => setDraft({ ...draft, escalateToOps: e.target.checked })}
                  />
                </div>
              </div>
            </div>

            <div className={s.group}>
              <Switch
                label="Configuração ativa"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
            </div>
            <Card title="Como o score é calculado" subtitle="Resumo do motor (packages/domain/matching).">
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {WEIGHT_META.map((m) => (
                  <li key={m.key}>
                    <strong>{m.label}:</strong> {m.desc}
                  </li>
                ))}
              </ul>
            </Card>
          </>
        ) : null}
      </FormDrawer>
    </div>
  );
}
