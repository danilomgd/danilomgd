'use client';

import { type UserPublic, UserRole } from '@velio/contracts';
import { useMemo, useState } from 'react';
import s from '@/components/admin/admin.module.css';
import { FormDrawer } from '@/components/admin/FormDrawer';
import {
  Button,
  type Column,
  DataTable,
  Input,
  PageHeader,
  Pill,
  Switch,
  Tabs,
  useToast,
} from '@/components/ui';
import { useAdminList, useAdminUpsert } from '@/lib/admin';
import { errorMessage } from '@/lib/errors';
import { fmtDate } from '@/lib/format';

const ROLE_LABELS: Record<string, string> = {
  customer: 'Cliente',
  provider: 'Profissional',
  operator: 'Operador',
  admin: 'Administrador',
};
const ROLE_TONE: Record<string, 'neutral' | 'info' | 'primary' | 'warning'> = {
  customer: 'neutral',
  provider: 'info',
  operator: 'primary',
  admin: 'warning',
};
type Filter = 'all' | 'staff' | 'provider' | 'customer';

export default function AdminUsersPage() {
  const toast = useToast();
  const list = useAdminList<UserPublic>('users');
  const upsert = useAdminUpsert<UserPublic>('users');
  const [filter, setFilter] = useState<Filter>('staff');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<UserPublic | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (list.data ?? []).filter((u) => {
      if (filter === 'staff' && !u.roles.some((r) => r === 'operator' || r === 'admin')) return false;
      if (filter === 'provider' && !u.roles.includes('provider')) return false;
      if (filter === 'customer' && !u.roles.includes('customer')) return false;
      if (!term) return true;
      return (
        (u.name ?? '').toLowerCase().includes(term) ||
        (u.email ?? '').toLowerCase().includes(term) ||
        (u.phone ?? '').includes(term) ||
        u.id.includes(term)
      );
    });
  }, [list.data, filter, search]);

  function open(u: UserPublic) {
    setEditing(u);
    setRoles(u.roles);
    setFormError(null);
  }

  function submit() {
    if (!editing) return;
    const parsed = UserRole.array().min(1).safeParse(roles);
    if (!parsed.success) {
      setFormError('Escolha ao menos um papel.');
      return;
    }
    upsert.mutate(
      { id: editing.id, roles: parsed.data },
      {
        onSuccess: () => {
          toast.success('Papéis atualizados.');
          setEditing(null);
        },
        onError: (err) => setFormError(errorMessage(err)),
      },
    );
  }

  const columns: Column<UserPublic>[] = [
    {
      key: 'name',
      header: 'Nome',
      render: (u) => <strong>{u.name ?? <span className="muted">Sem nome</span>}</strong>,
    },
    { key: 'email', header: 'E-mail', render: (u) => u.email ?? <span className="muted">—</span> },
    {
      key: 'phone',
      header: 'Telefone',
      render: (u) =>
        u.phone ? (
          <span className="mono">{u.phone.replace(/(\d{2})(\d{2})(\d{4,5})(\d{4})/, '+$1 $2 $3-$4')}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'roles',
      header: 'Papéis',
      render: (u) => (
        <span className="row" style={{ gap: 4 }}>
          {u.roles.map((r) => (
            <Pill key={r} tone={ROLE_TONE[r] ?? 'neutral'}>
              {ROLE_LABELS[r] ?? r}
            </Pill>
          ))}
        </span>
      ),
    },
    { key: 'created', header: 'Desde', render: (u) => fmtDate(u.createdAt) },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Usuários"
        description="Contas e papéis acumuláveis. Operadores e administradores acessam estes painéis."
        actions={
          <div style={{ width: 260 }}>
            <label htmlFor="search" className="sr-only">
              Buscar usuário
            </label>
            <Input
              id="search"
              type="search"
              placeholder="Nome, e-mail, telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      />
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Tabs
          ariaLabel="Filtro de usuários"
          variant="pills"
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'staff', label: 'Equipe' },
            { key: 'provider', label: 'Profissionais' },
            { key: 'customer', label: 'Clientes' },
            { key: 'all', label: 'Todos' },
          ]}
        />
      </div>
      <DataTable
        caption="Usuários"
        columns={columns}
        rows={list.data ? rows : undefined}
        rowKey={(u) => u.id}
        loading={list.isLoading}
        error={list.error}
        errorMessage={errorMessage(list.error)}
        onRetry={() => list.refetch()}
        emptyTitle="Nenhum usuário encontrado"
        onRowClick={(u) => open(u)}
      />
      <FormDrawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Papéis do usuário"
        description={editing ? (editing.email ?? editing.name ?? editing.id) : undefined}
        onSubmit={submit}
        submitting={upsert.isPending}
        error={formError}
      >
        {editing ? (
          <div className={s.group} style={{ borderTop: 0, paddingTop: 0 }}>
            {UserRole.options.map((r) => (
              <Switch
                key={r}
                label={ROLE_LABELS[r] ?? r}
                description={
                  r === 'admin'
                    ? 'Acesso total à administração.'
                    : r === 'operator'
                      ? 'Acesso ao painel operacional.'
                      : r === 'provider'
                        ? 'Perfil profissional no VÉLIO Pro.'
                        : 'Conta de cliente.'
                }
                checked={roles.includes(r)}
                onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))}
              />
            ))}
            <p className="caption">
              Remover o próprio papel de administrador encerra seu acesso a esta área.
            </p>
            <div>
              <Button size="sm" variant="ghost" onClick={() => setRoles(editing.roles)}>
                Restaurar
              </Button>
            </div>
          </div>
        ) : null}
      </FormDrawer>
    </div>
  );
}
