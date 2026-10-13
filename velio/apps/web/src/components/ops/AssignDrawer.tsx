'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ManualAssignInput } from '@velio/contracts';
import { useState } from 'react';
import {
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  Meter,
  Pill,
  SkeletonRows,
  Textarea,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { fmtKm, fmtRating } from '@/lib/format';
import s from './ops.module.css';

interface Candidate {
  providerId: string;
  displayName: string;
  score: number;
  distanceKm: number | null;
  ratingAvg: number | null;
  ratingCount: number | null;
  availability: string | null;
  eligible: boolean;
  ineligibleReason: string | null;
  breakdown: Record<string, number>;
}

const BREAKDOWN_LABELS: Record<string, string> = {
  proximity: 'Proximidade',
  qualification: 'Qualificação',
  reputation: 'Reputação',
  availability: 'Disponibilidade',
  compatibility: 'Compatibilidade',
  acceptanceRate: 'Taxa de aceite',
  cancellationPenalty: 'Cancelamentos',
};

function num(v: unknown): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Normaliza o candidato devolvido pela API (shape aberto) para a tela. */
function toCandidate(raw: Record<string, unknown>): Candidate | null {
  const providerId = str(raw.providerId) ?? str(raw.id);
  if (!providerId) return null;
  const provider = (raw.provider as Record<string, unknown> | undefined) ?? {};
  const breakdownRaw = (raw.breakdown as Record<string, unknown> | undefined) ?? {};
  const breakdown: Record<string, number> = {};
  for (const [k, v] of Object.entries(breakdownRaw)) {
    const n = num(v);
    if (n !== null) breakdown[k] = n;
  }
  return {
    providerId,
    displayName:
      str(raw.displayName) ??
      str(raw.name) ??
      str(provider.displayName) ??
      `Profissional ${providerId.slice(-4)}`,
    score: num(raw.score) ?? 0,
    distanceKm: num(raw.distanceKm),
    ratingAvg: num(raw.ratingAvg) ?? num(provider.ratingAvg),
    ratingCount: num(raw.ratingCount) ?? num(provider.ratingCount),
    availability: str(raw.availability) ?? str(provider.availability),
    eligible: typeof raw.eligible === 'boolean' ? raw.eligible : true,
    ineligibleReason: str(raw.ineligibleReason),
    breakdown,
  };
}

export function AssignDrawer({
  orderId,
  open,
  onClose,
}: {
  orderId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [includeIneligible, setIncludeIneligible] = useState(false);

  const q = useQuery({
    queryKey: ['ops', 'candidates', orderId],
    queryFn: async () =>
      (await api.ops.candidates(orderId)).map(toCandidate).filter((c): c is Candidate => c !== null),
    enabled: open,
  });

  const assign = useMutation({
    mutationFn: (input: { providerId: string; note?: string }) =>
      api.ops.assign(orderId, ManualAssignInput.parse(input)),
    onSuccess: () => {
      toast.success('Profissional atribuído.');
      void qc.invalidateQueries({ queryKey: ['ops'] });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const candidates = (q.data ?? [])
    .filter((c) => includeIneligible || c.eligible)
    .sort((a, b) => b.score - a.score);
  const chosen = candidates.find((c) => c.providerId === selected) ?? null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Atribuir manualmente"
      description="Ranking calculado pelo motor de matching. Escolha um profissional e confirme."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!chosen}
            loading={assign.isPending}
            onClick={() =>
              chosen && assign.mutate({ providerId: chosen.providerId, note: note.trim() || undefined })
            }
          >
            {chosen ? `Atribuir a ${chosen.displayName}` : 'Atribuir'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="row-between">
          <span className="small muted">{candidates.length} candidatos</span>
          <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeIneligible}
              onChange={(e) => setIncludeIneligible(e.target.checked)}
            />
            Incluir excluídos
          </label>
        </div>
        {q.isLoading ? (
          <SkeletonRows rows={4} height={88} />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} compact />
        ) : candidates.length === 0 ? (
          <EmptyState
            compact
            title="Nenhum candidato"
            description="Nenhum profissional elegível agora. Tente incluir excluídos ou cancele pela plataforma."
          />
        ) : (
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">Candidatos</legend>
            {candidates.map((c) => {
              const active = c.providerId === selected;
              return (
                <label
                  key={c.providerId}
                  className={[
                    s.candidate,
                    active ? s.candidateActive : '',
                    c.eligible ? '' : s.candidateDisabled,
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="candidate"
                    value={c.providerId}
                    checked={active}
                    onChange={() => setSelected(c.providerId)}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span className="row wrap" style={{ gap: 8 }}>
                      <strong>{c.displayName}</strong>
                      {c.availability ? (
                        <Pill tone={c.availability === 'ONLINE' ? 'success' : 'warning'}>
                          {c.availability}
                        </Pill>
                      ) : null}
                      {!c.eligible ? <Pill tone="neutral">{c.ineligibleReason ?? 'Excluído'}</Pill> : null}
                    </span>
                    <span className="small muted" style={{ display: 'block', marginTop: 2 }}>
                      {fmtKm(c.distanceKm)} · nota {fmtRating(c.ratingAvg)}
                      {c.ratingCount !== null ? ` (${c.ratingCount})` : ''}
                    </span>
                    {Object.keys(c.breakdown).length > 0 ? (
                      <span className={s.breakdown}>
                        {Object.entries(c.breakdown).map(([k, v]) => (
                          <span key={k} className={s.breakdownItem}>
                            <span className="row-between">
                              <span>{BREAKDOWN_LABELS[k] ?? k}</span>
                              <span className="mono">{Math.round(v * 100)}</span>
                            </span>
                            <Meter
                              value={v}
                              label={`${BREAKDOWN_LABELS[k] ?? k}: ${Math.round(v * 100)} de 100`}
                            />
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className={s.score}>
                    {Math.round(c.score * 100)}
                    <span className="caption" style={{ display: 'block', fontWeight: 400 }}>
                      score
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <Field label="Nota para o histórico" htmlFor="assign-note" hint="Opcional. Até 300 caracteres.">
          <Textarea
            id="assign-note"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </Field>
      </div>
    </Drawer>
  );
}
