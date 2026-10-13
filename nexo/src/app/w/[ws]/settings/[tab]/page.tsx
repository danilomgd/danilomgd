'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Code2,
  GripVertical,
  Plus,
  Tag as TagIcon,
  Trash2,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { ColorPicker } from '@/components/shell/create-dialogs';
import { Topbar } from '@/components/shell/topbar';
import { useWorkspace } from '@/components/shell/workspace-context';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { Confirm, Field, inputClass, Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import { useInvalidate } from '@/lib/hooks';
import type { CustomField, CustomFieldType, SpaceFeatures, Status, Tag, User } from '@/lib/types';

const TABS = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'members', label: 'Membros' },
  { id: 'spaces', label: 'Spaces e statuses' },
  { id: 'fields', label: 'Campos personalizados' },
  { id: 'tags', label: 'Tags' },
  { id: 'api', label: 'API e integrações' },
];

export default function SettingsPage({ params }: { params: Promise<{ ws: string; tab: string }> }) {
  const { tab } = use(params);
  const { wsId } = useWorkspace();
  return (
    <>
      <Topbar
        crumbs={[
          { label: 'Configurações' },
          { label: TABS.find((t) => t.id === tab)?.label ?? tab },
        ]}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 border-r border-line bg-sidebar p-2">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/w/${wsId}/settings/${t.id}`}
              className={cx(
                'flex h-8 items-center rounded-md px-2 text-[13px] hover:bg-ink-100',
                tab === t.id && 'bg-brand-50 font-medium text-brand-700',
              )}
            >
              {t.label}
            </Link>
          ))}
        </aside>
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-[900px] px-6 py-5">
            {tab === 'workspace' && <WorkspaceTab />}
            {tab === 'members' && <MembersTab />}
            {tab === 'spaces' && <SpacesTab />}
            {tab === 'fields' && <FieldsTab />}
            {tab === 'tags' && <TagsTab />}
            {tab === 'api' && <ApiTab />}
          </div>
        </div>
      </div>
    </>
  );
}

function H({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-[18px] font-semibold">{children}</h1>
      {sub && <p className="text-[12px] muted">{sub}</p>}
    </div>
  );
}

function WorkspaceTab() {
  const { workspace } = useWorkspace();
  return (
    <div>
      <H sub="Identidade do workspace e prefixo dos IDs de tarefa.">Workspace</H>
      <div className="space-y-4 rounded-lg border border-line p-4">
        <Field label="Nome">
          <input className={inputClass} defaultValue={workspace?.name ?? ''} readOnly />
        </Field>
        <Field label="Prefixo das tarefas" hint="Ex.: NX gera NX-1, NX-2...">
          <input
            className={`${inputClass} w-32`}
            defaultValue={workspace?.taskPrefix ?? 'NX'}
            readOnly
          />
        </Field>
        <Field
          label="Banco de dados"
          hint="Sem DATABASE_URL o sistema usa PGlite (Postgres embutido em .data/). Defina DATABASE_URL para usar Postgres/Supabase."
        >
          <input className={inputClass} value="PGlite local (padrão) ou DATABASE_URL" readOnly />
        </Field>
      </div>
    </div>
  );
}

function MembersTab() {
  const { wsId, me } = useWorkspace();
  const q = useQuery({
    queryKey: ['members', wsId],
    queryFn: () => api.get<{ members: (User & { role: string })[] }>(`team/${wsId}/member`),
  });
  const inv = useInvalidate();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'guest'>('member');
  const refresh = () => {
    inv.qc.invalidateQueries({ queryKey: ['members', wsId] });
    inv.qc.invalidateQueries({ queryKey: ['me'] });
  };
  return (
    <div>
      <H sub="Convide pessoas e defina papéis. Convidados só veem o que for compartilhado.">
        Membros
      </H>
      <form
        className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-line p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email.includes('@')) return;
          await api.post(`team/${wsId}/member`, { email, username: name || undefined, role });
          setEmail('');
          setName('');
          refresh();
          toast('Membro adicionado', 'success');
        }}
      >
        <Field label="E-mail">
          <input
            className={`${inputClass} w-60`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@empresa.com"
          />
        </Field>
        <Field label="Nome">
          <input
            className={`${inputClass} w-48`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Papel">
          <select
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="admin">Admin</option>
            <option value="member">Membro</option>
            <option value="guest">Convidado</option>
          </select>
        </Field>
        <Button type="submit" variant="primary" icon={<Plus size={14} />}>
          Convidar
        </Button>
      </form>
      <div className="divide-y divide-[var(--border)] rounded-lg border border-line">
        {q.data?.members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
            <Avatar user={m} size={28} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {m.username} {m.id === me?.id && <span className="text-[11px] muted">(você)</span>}
              </div>
              <div className="text-[12px] muted">{m.email}</div>
            </div>
            <select
              className="h-7 rounded-md surface px-1 text-[12px]"
              value={m.role}
              disabled={m.role === 'owner'}
              onChange={async (e) => {
                await api.put(`team/${wsId}/member/${m.id}`, { role: e.target.value });
                refresh();
              }}
            >
              <option value="owner">Proprietário</option>
              <option value="admin">Admin</option>
              <option value="member">Membro</option>
              <option value="guest">Convidado</option>
            </select>
            {m.role !== 'owner' && (
              <IconButton
                label="Remover"
                onClick={async () => {
                  await api.del(`team/${wsId}/member/${m.id}`);
                  refresh();
                }}
              >
                <Trash2 size={14} />
              </IconButton>
            )}
          </div>
        ))}
      </div>
      <span className="hidden">
        <Users size={1} />
      </span>
    </div>
  );
}

const FEATURES: { key: keyof SpaceFeatures; label: string }[] = [
  { key: 'dueDates', label: 'Prazos' },
  { key: 'startDates', label: 'Datas de início' },
  { key: 'timeTracking', label: 'Controle de tempo' },
  { key: 'timeEstimates', label: 'Estimativas' },
  { key: 'tags', label: 'Tags' },
  { key: 'priorities', label: 'Prioridades' },
  { key: 'customFields', label: 'Campos personalizados' },
  { key: 'dependencies', label: 'Dependências' },
  { key: 'checklists', label: 'Checklists' },
  { key: 'points', label: 'Pontos (sprint)' },
  { key: 'multipleAssignees', label: 'Múltiplos responsáveis' },
];
const STATUS_TYPES: { v: Status['type']; label: string }[] = [
  { v: 'open', label: 'Não iniciado' },
  { v: 'custom', label: 'Ativo' },
  { v: 'done', label: 'Feito' },
  { v: 'closed', label: 'Fechado' },
];

function SpacesTab() {
  const { hierarchy } = useWorkspace();
  const search = useSearchParams();
  const [spaceId, setSpaceId] = useState(search.get('space') ?? hierarchy?.spaces[0]?.id ?? '');
  useEffect(() => {
    if (!spaceId && hierarchy?.spaces[0]) setSpaceId(hierarchy.spaces[0].id);
  }, [hierarchy, spaceId]);
  const space = hierarchy?.spaces.find((s) => s.id === spaceId);
  const inv = useInvalidate();
  const [statuses, setStatuses] = useState<
    { id?: string; status: string; color: string; type: Status['type'] }[]
  >([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (space) {
      setStatuses(
        space.statuses.map((s) => ({ id: s.id, status: s.status, color: s.color, type: s.type })),
      );
      setDirty(false);
    }
  }, [space?.id, space?.statuses]);
  if (!space) return <div className="text-[13px] muted">Nenhum Space.</div>;
  const toggleFeature = async (k: keyof SpaceFeatures) => {
    await api.put(`space/${space.id}`, {
      features: { ...space.features, [k]: !(space.features[k] ?? true) },
    });
    inv.hierarchy();
  };
  const move = (i: number, dir: -1 | 1) => {
    const n = [...statuses];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setStatuses(n);
    setDirty(true);
  };
  return (
    <div>
      <H sub="Recursos ativos (ClickApps), fluxo de statuses e cor de cada Space.">
        Spaces e statuses
      </H>
      <div className="mb-4 flex flex-wrap gap-1">
        {hierarchy?.spaces.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSpaceId(s.id)}
            className={cx(
              'rounded-md border px-2.5 py-1 text-[12px]',
              s.id === spaceId
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-line hover:bg-muted-page',
            )}
          >
            <span
              className="mr-1 inline-block h-2 w-2 rounded-sm"
              style={{ background: s.color }}
            />
            {s.name}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        <div className="rounded-lg border border-line p-4">
          <div className="mb-3 text-[13px] font-semibold">Geral</div>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Nome">
              <input
                className={`${inputClass} w-64`}
                defaultValue={space.name}
                onBlur={async (e) => {
                  if (e.target.value.trim() && e.target.value !== space.name) {
                    await api.put(`space/${space.id}`, { name: e.target.value.trim() });
                    inv.hierarchy();
                  }
                }}
              />
            </Field>
            <Field label="Cor">
              <ColorPicker
                value={space.color}
                onChange={async (c) => {
                  await api.put(`space/${space.id}`, { color: c });
                  inv.hierarchy();
                }}
              />
            </Field>
            <label className="flex h-8 items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={space.private}
                onChange={async (e) => {
                  await api.put(`space/${space.id}`, { private: e.target.checked });
                  inv.hierarchy();
                }}
              />{' '}
              Privado
            </label>
          </div>
        </div>
        <div className="rounded-lg border border-line p-4">
          <div className="mb-3 text-[13px] font-semibold">Recursos (ClickApps)</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <label
                key={f.key}
                className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-[12.5px] hover:bg-muted-page"
              >
                <input
                  type="checkbox"
                  className="accent-brand-500"
                  checked={space.features[f.key] ?? true}
                  onChange={() => toggleFeature(f.key)}
                />{' '}
                {f.label}
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-line p-4">
          <div className="mb-1 flex items-center gap-2">
            <Workflow size={14} className="text-brand-500" />
            <span className="text-[13px] font-semibold">Statuses</span>
            <span className="text-[11px] muted">Ordem = fluxo. "Fechado" conclui a tarefa.</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {statuses.map((st, i) => (
              <div key={st.id ?? `new-${i}`} className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="text-[10px] muted hover:text-ink"
                    onClick={() => move(i, -1)}
                    aria-label="Subir"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="text-[10px] muted hover:text-ink"
                    onClick={() => move(i, 1)}
                    aria-label="Descer"
                  >
                    ▼
                  </button>
                </div>
                <GripVertical size={14} className="muted" />
                <input
                  type="color"
                  value={st.color}
                  onChange={(e) => {
                    const n = [...statuses];
                    n[i] = { ...st, color: e.target.value };
                    setStatuses(n);
                    setDirty(true);
                  }}
                  className="h-7 w-8 cursor-pointer rounded border border-line bg-transparent"
                  aria-label="Cor"
                />
                <input
                  className={`${inputClass} w-56 uppercase`}
                  value={st.status}
                  onChange={(e) => {
                    const n = [...statuses];
                    n[i] = { ...st, status: e.target.value.toLowerCase() };
                    setStatuses(n);
                    setDirty(true);
                  }}
                />
                <select
                  className={`${inputClass} w-36`}
                  value={st.type}
                  onChange={(e) => {
                    const n = [...statuses];
                    n[i] = { ...st, type: e.target.value as Status['type'] };
                    setStatuses(n);
                    setDirty(true);
                  }}
                >
                  {STATUS_TYPES.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <IconButton
                  label="Remover status"
                  onClick={() => {
                    setStatuses(statuses.filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                >
                  <X size={14} />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              icon={<Plus size={13} />}
              onClick={() => {
                setStatuses([
                  ...statuses,
                  { status: 'novo status', color: '#87909e', type: 'custom' },
                ]);
                setDirty(true);
              }}
            >
              Adicionar status
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty || statuses.length === 0}
              onClick={async () => {
                await api.put(`space/${space.id}/status`, statuses);
                inv.hierarchy();
                inv.qc.invalidateQueries({ queryKey: ['statuses'] });
                inv.tasks();
                setDirty(false);
                toast('Statuses salvos', 'success');
              }}
            >
              Salvar statuses
            </Button>
            {dirty && (
              <span className="text-[11px] text-amber-600">
                Alterações não salvas. Tarefas em statuses removidos vão para o primeiro status.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const FIELD_TYPES: { v: CustomFieldType; label: string }[] = [
  { v: 'text', label: 'Texto' },
  { v: 'textarea', label: 'Texto longo' },
  { v: 'number', label: 'Número' },
  { v: 'currency', label: 'Moeda' },
  { v: 'date', label: 'Data' },
  { v: 'drop_down', label: 'Lista suspensa' },
  { v: 'labels', label: 'Etiquetas (múltiplas)' },
  { v: 'checkbox', label: 'Checkbox' },
  { v: 'url', label: 'URL' },
  { v: 'email', label: 'E-mail' },
  { v: 'phone', label: 'Telefone' },
  { v: 'rating', label: 'Avaliação (estrelas)' },
  { v: 'progress', label: 'Progresso (%)' },
  { v: 'users', label: 'Pessoas' },
];

function FieldsTab() {
  const { wsId, hierarchy } = useWorkspace();
  const inv = useInvalidate();
  const [scope, setScope] = useState<{ type: 'workspace' | 'space' | 'list'; id: string }>({
    type: 'workspace',
    id: wsId,
  });
  const q = useQuery({
    queryKey: ['fields-admin', scope.type, scope.id],
    queryFn: () =>
      api.get<{ fields: CustomField[] }>(
        scope.type === 'workspace'
          ? `team/${scope.id}/field`
          : scope.type === 'space'
            ? `space/${scope.id}/field`
            : `list/${scope.id}/field`,
      ),
    select: (d) => d.fields.filter((f) => f.parentType === scope.type && f.parentId === scope.id),
  });
  const [edit, setEdit] = useState<CustomField | 'new' | null>(null);
  const [del, setDel] = useState<CustomField | null>(null);
  const refresh = () => {
    inv.qc.invalidateQueries({ queryKey: ['fields-admin'] });
    inv.qc.invalidateQueries({ queryKey: ['fields'] });
    inv.qc.invalidateQueries({ queryKey: ['fields-scope'] });
  };
  const lists =
    hierarchy?.spaces.flatMap((s) =>
      [...s.lists, ...s.folders.flatMap((f) => f.lists)].map((l) => ({
        ...l,
        label: `${s.name} / ${l.name}`,
      })),
    ) ?? [];
  return (
    <div>
      <H sub="Campos aparecem em todas as tarefas do escopo escolhido (workspace, Space ou lista).">
        Campos personalizados
      </H>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          className={`${inputClass} w-72`}
          value={`${scope.type}:${scope.id}`}
          onChange={(e) => {
            const [type, id] = e.target.value.split(':');
            setScope({ type: type as typeof scope.type, id });
          }}
        >
          <option value={`workspace:${wsId}`}>Workspace (todas as tarefas)</option>
          <optgroup label="Spaces">
            {hierarchy?.spaces.map((s) => (
              <option key={s.id} value={`space:${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Listas">
            {lists.map((l) => (
              <option key={l.id} value={`list:${l.id}`}>
                {l.label}
              </option>
            ))}
          </optgroup>
        </select>
        <Button
          className="ml-auto"
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => setEdit('new')}
        >
          Novo campo
        </Button>
      </div>
      <div className="divide-y divide-[var(--border)] rounded-lg border border-line">
        {q.data?.map((f) => (
          <div key={f.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
            <span className="w-32 rounded bg-ink-100 px-2 py-0.5 text-center text-[11px] font-medium text-ink-700">
              {FIELD_TYPES.find((t) => t.v === f.type)?.label ?? f.type}
            </span>
            <span className="flex-1 font-medium">
              {f.name}
              {f.required && <span className="text-red-500"> *</span>}
            </span>
            {f.typeConfig.options && (
              <span className="text-[11px] muted">{f.typeConfig.options.length} opção(ões)</span>
            )}
            <Button size="xs" onClick={() => setEdit(f)}>
              Editar
            </Button>
            <IconButton label="Excluir" onClick={() => setDel(f)}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        {q.data && q.data.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] muted">Nenhum campo neste escopo.</div>
        )}
      </div>
      {edit && (
        <FieldDialog
          field={edit === 'new' ? null : edit}
          scope={scope}
          onClose={() => setEdit(null)}
          onSaved={refresh}
        />
      )}
      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        title={`Excluir campo "${del?.name}"?`}
        text="Os valores preenchidos nas tarefas serão apagados."
        onConfirm={async () => {
          if (del) {
            await api.del(`field/${del.id}`);
            refresh();
          }
        }}
      />
    </div>
  );
}

function FieldDialog({
  field,
  scope,
  onClose,
  onSaved,
}: {
  field: CustomField | null;
  scope: { type: 'workspace' | 'space' | 'list'; id: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { wsId } = useWorkspace();
  const [name, setName] = useState(field?.name ?? '');
  const [type, setType] = useState<CustomFieldType>(field?.type ?? 'text');
  const [required, setRequired] = useState(field?.required ?? false);
  const [options, setOptions] = useState<{ id: string; name: string; color?: string }[]>(
    field?.typeConfig.options ?? [],
  );
  const [currency, setCurrency] = useState(field?.typeConfig.currencyType ?? 'BRL');
  const [count, setCount] = useState(field?.typeConfig.count ?? 5);
  const hasOptions = type === 'drop_down' || type === 'labels';
  const save = async () => {
    if (!name.trim()) return;
    const typeConfig = {
      ...(hasOptions ? { options: options.filter((o) => o.name.trim()) } : {}),
      ...(type === 'currency' ? { currencyType: currency, precision: 2 } : {}),
      ...(type === 'rating' ? { count } : {}),
      ...(type === 'progress' ? { method: 'manual' as const } : {}),
    };
    if (field) await api.put(`field/${field.id}`, { name: name.trim(), typeConfig, required });
    else
      await api.post(
        scope.type === 'workspace'
          ? `team/${scope.id}/field`
          : `${scope.type}/${scope.id}/field?workspaceId=${wsId}`,
        { name: name.trim(), type, typeConfig, required },
      );
    onSaved();
    onClose();
  };
  const palette = [
    '#7b68ee',
    '#1090e0',
    '#e04f8a',
    '#2ea44f',
    '#f0a30a',
    '#d33',
    '#0ab4a8',
    '#6b7280',
  ];
  return (
    <Modal open onClose={onClose} title={field ? 'Editar campo' : 'Novo campo'} width={520}>
      <div className="space-y-4 p-4">
        <Field label="Nome">
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Tipo">
          <select
            className={inputClass}
            value={type}
            disabled={!!field}
            onChange={(e) => setType(e.target.value as CustomFieldType)}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.v} value={t.v}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        {type === 'currency' && (
          <Field label="Moeda">
            <select
              className={inputClass}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="BRL">BRL (R$)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </Field>
        )}
        {type === 'rating' && (
          <Field label="Quantidade de estrelas">
            <input
              type="number"
              min={1}
              max={10}
              className={`${inputClass} w-24`}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </Field>
        )}
        {hasOptions && (
          <Field label="Opções">
            <div className="space-y-1">
              {options.map((o, i) => (
                <div key={o.id || i} className="flex items-center gap-1">
                  <select
                    className="h-8 w-20 rounded-md surface"
                    value={o.color ?? palette[0]}
                    onChange={(e) => {
                      const n = [...options];
                      n[i] = { ...o, color: e.target.value };
                      setOptions(n);
                    }}
                    style={{ color: o.color ?? palette[0] }}
                  >
                    {palette.map((c) => (
                      <option key={c} value={c} style={{ color: c }}>
                        ●
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    value={o.name}
                    onChange={(e) => {
                      const n = [...options];
                      n[i] = { ...o, name: e.target.value };
                      setOptions(n);
                    }}
                  />
                  <IconButton
                    label="Remover"
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  >
                    <X size={13} />
                  </IconButton>
                </div>
              ))}
              <Button
                size="xs"
                icon={<Plus size={12} />}
                onClick={() =>
                  setOptions([
                    ...options,
                    { id: '', name: '', color: palette[options.length % palette.length] },
                  ])
                }
              >
                Opção
              </Button>
            </div>
          </Field>
        )}
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />{' '}
          Obrigatório
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TagsTab() {
  const { hierarchy } = useWorkspace();
  const inv = useInvalidate();
  const [spaceId, setSpaceId] = useState(hierarchy?.spaces[0]?.id ?? '');
  useEffect(() => {
    if (!spaceId && hierarchy?.spaces[0]) setSpaceId(hierarchy.spaces[0].id);
  }, [hierarchy, spaceId]);
  const q = useQuery({
    queryKey: ['tags', spaceId],
    queryFn: () => api.get<{ tags: Tag[] }>(`space/${spaceId}/tag`),
    enabled: !!spaceId,
    select: (d) => d.tags,
  });
  const [name, setName] = useState('');
  const refresh = () => inv.qc.invalidateQueries({ queryKey: ['tags', spaceId] });
  return (
    <div>
      <H sub="Tags pertencem a um Space e podem ser aplicadas a qualquer tarefa dele.">Tags</H>
      <div className="mb-3 flex flex-wrap gap-1">
        {hierarchy?.spaces.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSpaceId(s.id)}
            className={cx(
              'rounded-md border px-2.5 py-1 text-[12px]',
              s.id === spaceId
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-line hover:bg-muted-page',
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      <form
        className="mb-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await api.post(`space/${spaceId}/tag`, { name: name.trim() });
          setName('');
          refresh();
        }}
      >
        <input
          className={`${inputClass} w-64`}
          placeholder="nova tag"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="primary" icon={<Plus size={14} />}>
          Criar
        </Button>
      </form>
      <div className="divide-y divide-[var(--border)] rounded-lg border border-line">
        {q.data?.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
            <TagIcon size={14} style={{ color: t.bg }} />
            <input
              type="color"
              value={t.bg}
              onChange={async (e) => {
                await api.put(`tag/${t.id}`, { bg: e.target.value });
                refresh();
                inv.tasks();
              }}
              className="h-6 w-7 cursor-pointer rounded border border-line bg-transparent"
              aria-label="Cor"
            />
            <input
              className="h-7 flex-1 rounded bg-transparent px-1 outline-none focus:bg-muted-page"
              defaultValue={t.name}
              onBlur={async (e) => {
                if (e.target.value.trim() && e.target.value !== t.name) {
                  await api.put(`tag/${t.id}`, { name: e.target.value.trim().toLowerCase() });
                  refresh();
                  inv.tasks();
                }
              }}
            />
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-medium"
              style={{ background: `${t.bg}22`, color: t.bg }}
            >
              {t.name}
            </span>
            <IconButton
              label="Excluir"
              onClick={async () => {
                await api.del(`tag/${t.id}`);
                refresh();
                inv.tasks();
              }}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        {q.data && q.data.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] muted">Nenhuma tag neste Space.</div>
        )}
      </div>
    </div>
  );
}

function ApiTab() {
  const { wsId } = useWorkspace();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const ex = [
    ['GET', `team/${wsId}/hierarchy`, 'árvore completa (spaces, pastas, listas, views)'],
    ['GET', `team/${wsId}/task?assignees=u_danilo&include_closed=false`, 'tarefas filtradas'],
    [
      'POST',
      'list/{listId}/task',
      '{"name":"...","priority":2,"dueDate":"2026-11-01","assignees":["u_x"],"tags":["urgente"]}',
    ],
    ['PUT', 'task/{taskId}', '{"status":"em andamento","customFields":{"cf_cliente":"João"}}'],
    ['POST', 'task/{taskId}/comment', '{"text":"@Ana Ribeiro pode revisar?"}'],
    ['POST', `team/${wsId}/time_entries/start`, '{"taskId":"..."}'],
    ['GET', `team/${wsId}/search?q=contestação`, 'busca global'],
    ['GET', 'dashboard/{id}', 'dados calculados dos widgets'],
  ];
  return (
    <div>
      <H sub="Todas as telas usam a mesma API REST, pronta para n8n, Make, scripts Python e outros agentes.">
        API e integrações
      </H>
      <div className="mb-4 rounded-lg border border-line p-4 text-[13px]">
        <div className="mb-2 flex items-center gap-2 font-semibold">
          <Code2 size={15} className="text-brand-500" /> Base:{' '}
          <code className="rounded bg-muted-page px-1.5 py-0.5">{origin}/api/v2/</code>
        </div>
        <p className="muted">
          Identificação do usuário: header <code>x-user-id</code> ou cookie <code>nexo_user</code>{' '}
          (padrão: proprietário). Respostas e erros em JSON (
          <code>{'{"err":"...","ECODE":404}'}</code>). Os caminhos seguem o formato team / space /
          folder / list / task / comment / checklist / field / time_entries / goal / doc / view,
          então integrações feitas para esse padrão migram com ajustes mínimos.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        {ex.map(([m, p, b]) => (
          <div
            key={p}
            className="grid grid-cols-[60px_1fr] gap-2 border-b border-line px-3 py-2 text-[12px] last:border-b-0"
          >
            <span
              className={cx(
                'font-mono font-semibold',
                m === 'GET'
                  ? 'text-emerald-700'
                  : m === 'POST'
                    ? 'text-brand-700'
                    : 'text-amber-700',
              )}
            >
              {m}
            </span>
            <div>
              <code className="break-all">{p}</code>
              <div className="muted">{b}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-line p-4 text-[12px]">
        <div className="mb-1 font-semibold">Exemplo (n8n / curl)</div>
        <pre className="overflow-auto rounded bg-muted-page p-2">{`curl -X POST ${origin}/api/v2/list/{listId}/task \\
  -H "content-type: application/json" -H "x-user-id: u_danilo" \\
  -d '{"name":"Contestação — Cliente X","priority":1,"dueDate":"2026-11-10","tags":["urgente"]}'`}</pre>
      </div>
    </div>
  );
}
