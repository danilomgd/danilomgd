# @velio/web

Painéis web do VÉLIO em Next.js (App Router): **operação** (`/ops`) e **administração** (`/admin`).
Consome a API via `@velio/api-client`; tokens e DTOs vêm de `@velio/contracts`; cores, espaçamento e raios de `@velio/ui` (tokens "Aura" → CSS custom properties, claro e escuro por `prefers-color-scheme`).

## Rodar

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # ajuste a URL da API se preciso
pnpm --filter @velio/web dev                    # http://localhost:3000
```

A API (`apps/api`) precisa estar no ar para login e dados: o app não embute dados falsos; sem API, as telas mostram erro com "Tentar de novo".

## Variáveis

| Variável | Padrão | Uso |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Base da API REST e do Socket.IO (`/realtime`) |

## Scripts

- `pnpm --filter @velio/web dev` — desenvolvimento
- `pnpm --filter @velio/web build` — `next build`
- `pnpm --filter @velio/web typecheck` — `next typegen && tsc`
- `pnpm exec biome check apps/web` — lint e formatação (config na raiz)

## Estrutura

```
src/app            rotas: /login, /forbidden, (authed)/ops/*, (authed)/admin/*
src/components/ui  design system web: Button, Input, Select, Switch, Card, StatusPill, DataTable, Drawer, Dialog, Toast, Tabs, EmptyState, Skeleton, Stat
src/components/shell  Sidebar, Header, AuthGuard
src/components/ops    OpsMap (Leaflet, só cliente), OrderTimeline, AssignDrawer, diálogos de ação
src/components/admin  FormDrawer, MoneyInput, ServiceOptionsEditor
src/lib            api (HttpClient + TokenStore em localStorage), auth, realtime, query, format, errors, admin
```

Acesso: login por e-mail e senha (`POST /v1/auth/password/login`). `/ops` exige papel `operator` ou `admin`; `/admin` exige `admin`. Sem token o app redireciona para `/login`; sem papel mostra acesso negado.
