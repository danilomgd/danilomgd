'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
  WORKFLOW_KIND_LABELS,
  type WorkflowKind,
} from '@velio/contracts';
import { useMemo, useState } from 'react';
import s from '@/components/admin/admin.module.css';
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pill,
  SkeletonRows,
  StatusPill,
  Tabs,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

interface Transition {
  from: string[];
  to: string;
  action: string;
  allowedActors: string[];
  guards: string[];
  effects: string[];
  describe: string | null;
}
interface Workflow {
  kind: string;
  version: number;
  initial: string;
  states: Record<
    string,
    { terminal?: boolean; slaSeconds?: number; providerBusy?: boolean; liveLocation?: boolean }
  >;
  transitions: Transition[];
}

const ACTOR_LABELS: Record<string, string> = {
  customer: 'Cliente',
  provider: 'Profissional',
  operator: 'Operação',
  system: 'Sistema',
};

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return typeof v === 'string' ? [v] : [];
}

/** Normaliza a definição devolvida pela API (shape aberto) para a tela. */
function toWorkflow(raw: Record<string, unknown>): Workflow | null {
  const kind = typeof raw.kind === 'string' ? raw.kind : null;
  if (!kind) return null;
  const transitions = Array.isArray(raw.transitions) ? raw.transitions : [];
  return {
    kind,
    version: typeof raw.version === 'number' ? raw.version : 1,
    initial: typeof raw.initial === 'string' ? raw.initial : '',
    states: (raw.states as Workflow['states'] | undefined) ?? {},
    transitions: transitions
      .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object')
      .map((t) => ({
        from: arr(t.from),
        to: typeof t.to === 'string' ? t.to : '',
        action: typeof t.action === 'string' ? t.action : '',
        allowedActors: arr(t.allowedActors),
        guards: arr(t.guards),
        effects: arr(t.effects),
        describe: typeof t.describe === 'string' ? t.describe : null,
      })),
  };
}

function fmtSla(sec: number): string {
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${Math.round(sec / 3600)} h`;
}

export default function AdminWorkflowsPage() {
  const q = useQuery({
    queryKey: ['admin', 'workflows'],
    queryFn: async () =>
      (await api.admin.workflows()).map(toWorkflow).filter((w): w is Workflow => w !== null),
  });
  const [kind, setKind] = useState<string | null>(null);

  const workflows = q.data ?? [];
  const active = useMemo(
    () => workflows.find((w) => w.kind === (kind ?? workflows[0]?.kind)) ?? workflows[0],
    [workflows, kind],
  );

  return (
    <div className="page">
      <PageHeader
        title="Workflows"
        description="Definições declarativas da máquina de estados (packages/domain). Somente leitura nesta versão."
      />
      {q.isLoading ? (
        <SkeletonRows rows={6} height={48} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : workflows.length === 0 || !active ? (
        <EmptyState title="Nenhuma definição" description="A API não devolveu workflows." />
      ) : (
        <div className="stack">
          <Tabs
            ariaLabel="Workflows"
            value={active.kind}
            onChange={setKind}
            items={workflows.map((w) => ({
              key: w.kind,
              label: WORKFLOW_KIND_LABELS[w.kind as WorkflowKind] ?? w.kind,
              count: w.transitions.length,
            }))}
          />
          <div
            className="grid-2"
            style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', alignItems: 'start' }}
          >
            <Card
              title="Transições"
              subtitle={`${WORKFLOW_KIND_LABELS[active.kind as WorkflowKind] ?? active.kind} · versão ${active.version} · estado inicial ${ORDER_STATUS_LABELS[active.initial as OrderStatus]?.label ?? active.initial}`}
              flush
            >
              <div style={{ overflowX: 'auto' }}>
                <table className={s.transitionTable}>
                  <caption className="sr-only">Transições do workflow {active.kind}</caption>
                  <thead>
                    <tr>
                      <th scope="col">De</th>
                      <th scope="col">Para</th>
                      <th scope="col">Ação</th>
                      <th scope="col">Atores</th>
                      <th scope="col">Guards</th>
                      <th scope="col">Efeitos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.transitions.map((t) => (
                      <tr key={`${t.action}|${t.from.join(',')}|${t.to}`}>
                        <td>
                          <div className={s.stateChips}>
                            {t.from.map((f) => (
                              <StatusPill key={f} status={f} />
                            ))}
                          </div>
                        </td>
                        <td>
                          <StatusPill status={t.to} />
                        </td>
                        <td>
                          <code>{t.action}</code>
                          {t.describe ? <div className="caption">{t.describe}</div> : null}
                        </td>
                        <td>{t.allowedActors.map((a) => ACTOR_LABELS[a] ?? a).join(', ')}</td>
                        <td>
                          <div className={s.stateChips}>
                            {t.guards.length ? (
                              t.guards.map((g) => <Pill key={g}>{g}</Pill>)
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className={s.stateChips}>
                            {t.effects.length ? (
                              t.effects.map((e) => (
                                <Pill key={e} tone="info">
                                  {e}
                                </Pill>
                              ))
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Estados" subtitle="SLA e sinalizadores por estado.">
              {Object.keys(active.states).length === 0 ? (
                <p className="small muted">Sem metadados de estado.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="stack-sm">
                  {Object.entries(active.states).map(([st, meta]) => (
                    <li key={st} className="row-between" style={{ alignItems: 'flex-start' }}>
                      <StatusPill status={st} />
                      <span className="caption" style={{ textAlign: 'right' }}>
                        {[
                          meta.terminal ? 'terminal' : null,
                          meta.slaSeconds ? `SLA ${fmtSla(meta.slaSeconds)}` : null,
                          meta.providerBusy ? 'profissional ocupado' : null,
                          meta.liveLocation ? 'localização ao vivo' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
