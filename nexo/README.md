# NEXO — plataforma própria de gestão de trabalho

Sistema completo de gestão de tarefas e projetos, construído do zero com a mesma
arquitetura funcional das plataformas de referência do mercado (hierarquia
Workspace → Space → Pasta → Lista → Tarefa, múltiplas visualizações, campos
personalizados, docs, dashboards, metas e controle de tempo), com código,
banco e API sob seu controle.

## Telas e funcionalidades

| Área | O que tem |
|---|---|
| **Barra lateral** | Workspace, Início, Caixa de entrada, Minhas tarefas, Tudo, Docs, Dashboards, Metas, Controle de tempo, Favoritos, árvore de Spaces → Pastas → Listas com contadores, menus de contexto (renomear, favoritar, criar, excluir), expansão persistida |
| **Início** | Saudação, indicadores (minhas tarefas, atrasadas, hoje, horas na semana), seções Atrasadas / Hoje / Próximos 7 dias / Sem prazo / Mais tarde, comentários atribuídos a mim, lembretes, concluídas recentemente, atividade recente |
| **Caixa de entrada** | Notificações de menção, comentário, atribuição, mudança de status e prazo; não lidas/todas; marcar lidas |
| **Visualizações** | **Lista** (grupos recolhíveis, arrastar entre grupos, edição inline, criação rápida), **Quadro** kanban (drag & drop entre colunas, recolher colunas), **Calendário** (mês/semana, arrastar tarefa para outro dia, criar no dia), **Gantt** (barras início→prazo, arrastar para mover, redimensionar bordas, setas de dependência, linha de hoje, zoom dia/semana), **Tabela** (todas as colunas incluindo campos personalizados, edição inline, seleção em massa) |
| **Barra de visualização** | Abas de views por lista/pasta/space/workspace, criar/excluir views, filtros compostos (status, responsável, prioridade, prazo, tag, nome, campos personalizados), agrupar por (status, responsável, prioridade, prazo, tag, campo dropdown/labels), ordenar, mostrar concluídas, modo de subtarefas, busca na view; configurações salvas por view |
| **Tarefa** (modal ou página inteira) | ID legível (NX-12), breadcrumb, status com avanço rápido, responsáveis múltiplos, prioridade, prazo (com hora), início, estimativa, tempo registrado, pontos, tags (criação inline), acompanhantes, campos personalizados (14 tipos), descrição em markdown, subtarefas, checklists com responsável, anexos por link, dependências (aguardando/bloqueando) e vínculos, cronômetro + registro manual, comentários com menções `@`, respostas, reações, atribuição e resolução, linha do tempo de atividade, duplicar, arquivar, excluir, copiar link |
| **Criação rápida** | Botão "Nova tarefa" global, criação inline em cada grupo/coluna/dia, subtarefa inline |
| **Busca global (Ctrl+K)** | Tarefas (nome, ID, descrição), spaces, pastas, listas, docs e páginas; navegação por teclado |
| **Docs** | Documentos com páginas e subpáginas, editor markdown com autosave, modo leitura/edição, favoritos |
| **Dashboards** | Widgets: número, tarefas por status (anel), por responsável, por prioridade, workload (estimativas), tempo registrado (total/faturável/por pessoa), concluídas ao longo do tempo, lista de tarefas, atrasadas, progresso de meta, texto; configuração por Space/lista/filtro/período; largura e altura ajustáveis |
| **Metas** | Metas em pastas, dono, prazo, cor, resultados-chave (número, percentual, moeda, sim/não, tarefas vinculadas) com progresso automático |
| **Controle de tempo** | Planilha semanal por tarefa e dia, filtro por membro, totais e faturável, registro manual, cronômetro global na barra superior |
| **Configurações** | Workspace, membros e papéis (owner/admin/member/guest), Spaces (nome, cor, privado, recursos ativáveis, editor de fluxo de statuses com reordenação e realocação de tarefas), campos personalizados por escopo (workspace/space/lista) com opções e cores, tags por Space, documentação da API |
| **Tema** | Claro/escuro |

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Tailwind CSS 4**, ícones `lucide-react`, drag & drop `@dnd-kit`
- **Drizzle ORM** com **PGlite** (Postgres embutido, zero configuração) ou **Postgres real** via `DATABASE_URL` (Supabase, Neon, RDS...)
- **TanStack Query** com atualizações otimistas
- **Biome** (lint/format), **Vitest** (testes de integração da API)

## Rodar

```bash
cd nexo
pnpm install
pnpm dev          # http://localhost:3100
```

No primeiro acesso o banco é criado em `.data/pglite` com migrações aplicadas e
um workspace de exemplo (escritório jurídico, produtos de IA e marketing) para
você explorar todas as telas. Para começar do zero: `pnpm db:reset`.

Para usar Postgres/Supabase, copie `.env.example` para `.env` e preencha
`DATABASE_URL`; as mesmas migrações em `drizzle/` são aplicadas no boot.

```bash
pnpm check        # lint + typecheck + testes + build
pnpm test         # só os testes de API
pnpm db:generate  # gera nova migração após alterar src/db/schema.ts
```

## API REST

Tudo que a interface faz passa por `/api/v2/...`, pronta para n8n, Make,
scripts Python ou agentes de IA. Os caminhos seguem o formato
`team / space / folder / list / task / comment / checklist / field /
time_entries / goal / doc / view`, então integrações já escritas para esse
padrão migram com ajustes mínimos. A tela **Configurações → API e integrações**
lista exemplos; a tabela completa está em `src/server/routes.ts`.

Identificação do usuário (enquanto não há login): header `x-user-id` ou cookie
`nexo_user`. Sem isso, usa o proprietário do workspace.

```bash
curl -X POST http://localhost:3100/api/v2/list/{listId}/task \
  -H "content-type: application/json" -H "x-user-id: u_danilo" \
  -d '{"name":"Contestação — Cliente X","priority":1,"dueDate":"2026-11-10","tags":["urgente"]}'
```

## Estrutura

```
src/
  app/                 rotas (App Router)
    api/v2/[...path]   catch-all da API REST
    w/[ws]/...         telas do workspace (home, inbox, l/s/f, docs, dashboards, goals, timesheet, settings, t)
  components/
    shell/             barra lateral, topo, busca, criação rápida, contexto do workspace
    views/             motor de filtro/agrupamento/ordenação + Lista, Quadro, Calendário, Gantt, Tabela
    task/              modal da tarefa, seletores, campos personalizados, seções
    ui/                primitivos (botão, popover, modal, avatar, badges, markdown, gráficos)
  db/                  schema Drizzle, cliente (PGlite/Postgres), seed
  server/              serviços (tarefas, hierarquia, colaboração, módulos), roteador e tabela de rotas
  lib/                 cliente HTTP, hooks TanStack Query, tipos, formatação
drizzle/               migrações SQL geradas
test/                  testes de integração da API
```

## O que ainda não está incluído

- Autenticação real (login, sessões, permissões por Space privado) — hoje o
  usuário vem do header/cookie, pensado para rodar atrás de um proxy autenticado
  ou para evoluir com Supabase Auth.
- Upload binário de anexos (anexos são por link); automações/regras; formulários
  públicos; importação de outras ferramentas; tempo real via WebSocket
  (a interface refaz consultas ao ganhar foco e em intervalos).
