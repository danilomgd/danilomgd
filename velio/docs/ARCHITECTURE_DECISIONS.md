# Architecture Decision Records — VÉLIO

Formato: contexto, decisão, consequências. Numeração estável; decisões revogadas ficam marcadas, nunca apagadas.

## ADR-001 — TypeScript de ponta a ponta em monorepo

**Contexto.** Nada existe (ver `01_CURRENT_STATE_AUDIT.md`). Quatro superfícies (app cliente, app prestador, painel ops, painel admin) e um backend compartilham domínio, contratos e regras.

**Decisão.** Monorepo `velio/` com pnpm workspaces + Turborepo. TypeScript `strict` em todos os pacotes. Pacotes: `packages/domain` (regras puras), `packages/contracts` (Zod + tipos compartilhados), `packages/ui` (tokens e componentes), `apps/api`, `apps/mobile`, `apps/web`.

**Consequências.** Um só vocabulário de tipos entre backend e frontends; validação única (Zod) no servidor e nos clientes; onboarding de equipe em uma linguagem.

## ADR-002 — O VÉLIO nasce em `velio/` dentro deste repositório e será extraído

**Contexto.** O repositório `danilomgd/danilomgd` é um repositório de perfil com automações pessoais. Criar um repositório novo é ação externa que o autor deve decidir.

**Decisão.** Workspace autônomo em `velio/` (próprio `package.json`, lockfile, CI). Nenhum arquivo fora de `velio/` é alterado além de um ponteiro no `README.md` da raiz.

**Consequências.** Extração futura com `git subtree split --prefix=velio` para `danilomgd/velio` sem perder histórico. Recomendado antes de entrar mais gente no time.

## ADR-003 — Modular monolith com fronteiras explícitas

**Contexto.** Microserviços no MVP multiplicariam custo operacional sem tráfego que o justifique.

**Decisão.** Um processo `apps/api` (Fastify 5) organizado em módulos por contexto delimitado: `identity`, `catalog`, `geo`, `assets` (veículos, equipamentos), `providers` (cadastro, documentos, disponibilidade, localização, agenda), `orders` (engine de workflow), `dispatch`, `quotes`, `payments`, `wallet`, `subscriptions`, `communication` (chat, notificações), `reputation`, `support` (tickets, disputas), `concierge`, `ops`, `admin`, `analytics`. Cada módulo expõe um serviço e rotas; comunicação entre módulos via chamadas diretas tipadas e via eventos de domínio (outbox em banco). Nenhum módulo lê tabela de outro módulo diretamente.

**Consequências.** Extração posterior de `payments`, `dispatch` ou `communication` para serviços próprios é possível sem reescrever o domínio.

## ADR-004 — PostgreSQL + Drizzle ORM; PGlite para testes e dev sem Docker

**Contexto.** O ambiente de desenvolvimento desta sessão não tem daemon Docker nem Postgres instalado. O produto precisa de Postgres real em produção (Supabase, RDS, Neon ou equivalente).

**Decisão.** Drizzle ORM com schema em TypeScript e migrações SQL geradas pelo `drizzle-kit`. Em produção e staging: Postgres 16 via `postgres` (postgres-js). Em testes e desenvolvimento local sem Docker: `@electric-sql/pglite` (Postgres compilado para WebAssembly, mesmo SQL, mesmo schema). A escolha é por variável de ambiente (`DATABASE_URL` ausente = PGlite em memória ou em arquivo).

**Geo.** Sem PostGIS no MVP: `latitude`/`longitude` em `double precision`, pré-filtro por bounding box com índice composto e distância Haversine no domínio. PostGIS entra em V1 por migração aditiva quando o volume justificar.

**RLS.** No MVP nenhum cliente acessa o banco diretamente; toda autorização é aplicada na API por policies por papel e por posse do recurso. Se o produto adotar acesso direto (ex.: Supabase client no mobile), RLS passa a ser obrigatório e o schema já separa `owner_user_id` em todas as tabelas de dados pessoais para viabilizar as políticas.

**Consequências.** Testes de integração rodam em qualquer máquina e no CI em segundos, sem serviços externos. O custo é não usar funções exclusivas de extensões no MVP.

## ADR-005 — Engine de workflow declarativa para ordens de serviço

**Contexto.** Pedido de comida tem um fluxo; serviço tem vários (imediato, agendado, orçamento, logístico, lavanderia, concierge) e surgirão outros.

**Decisão.** `packages/domain/workflow`: uma definição de workflow é um objeto de dados (`WorkflowDefinition`) com estados, transições, papel autorizado a disparar cada transição, guards e efeitos declarados. As definições embutidas são versionadas; o banco pode guardar definições adicionais ou sobrepostas (`workflow_definitions`), carregadas pelo serviço de ordens. Cada mudança gera um `OrderEvent` imutável (append-only). O estado atual da ordem é derivado e também materializado na coluna `status` para consulta.

**Consequências.** Novo tipo de serviço = nova definição, sem alterar app. Auditoria completa por construção. Testes de workflow são testes de dados.

## ADR-006 — Matching por score configurável e dispatch em ondas

**Contexto.** Nenhum prestador fixo; a plataforma precisa escolher e ofertar.

**Decisão.** `ProviderMatchScore` = soma ponderada de componentes normalizados (proximidade, qualificação, reputação, disponibilidade, compatibilidade de agenda/preço, taxa de aceite, cancelamentos). Pesos por categoria em `matching_configs` com padrão global; nunca em código. Dispatch em ondas: oferta aos N melhores por T segundos, depois amplia raio e grupo, depois cai para a fila do painel operacional (`NO_PROVIDER_FOUND`), onde o operador atribui manualmente.

**Consequências.** Operação pode calibrar sem deploy. Toda decisão de matching é registrada (`dispatch_rounds`, `dispatch_offers`) para análise.

## ADR-007 — Pagamentos por porta e adaptadores; ledger próprio

**Contexto.** PIX, cartão, carteira, cupom, crédito promocional; pré-autorização e adicionais; repasse a prestador. Mercado brasileiro.

**Decisão.** Porta `PaymentGateway` (criar cobrança PIX, autorizar/capturar/cancelar cartão por token, reembolsar, webhooks). Adaptadores: `SandboxGateway` (determinístico, só com `PAYMENTS_PROVIDER=sandbox`, recusa iniciar com `NODE_ENV=production`) e `PagarmeGateway` (implementação real contra a API v5, exige credenciais). Cartão é tokenizado no app pelo SDK do provedor; o banco nunca recebe PAN, CVV ou validade. Ledger de carteira em dupla entrada (`ledger_entries`) com contas por usuário, prestador e plataforma; comissão calculada por regra de `commission_rules`; repasses (`payouts`) em lotes. Adicional de orçamento gera uma segunda intenção de pagamento somente após `Quote.status = APPROVED` pelo cliente.

**Consequências.** Troca de provedor sem tocar no domínio. Conciliação possível por construção. O MVP funciona em sandbox com fluxo real de UI → API → regra → banco → evento.

## ADR-008 — Autenticação: OTP por telefone para cliente e prestador; e-mail e senha para operação

**Decisão.** Telefone + código OTP (porta `SmsSender`; adaptador de desenvolvimento registra o código no log e o devolve apenas em `NODE_ENV=test`). Operadores e administradores: e-mail + senha com scrypt (`node:crypto`, sem dependência nativa; parâmetros N=2^15, r=8, p=1) e segundo fator opcional em V1. Tokens JWT de acesso curtos (15 min) e refresh rotativo (30 dias) guardados com hash. Papéis: `customer`, `provider`, `operator`, `admin`. Um mesmo usuário pode ter perfil de cliente e de prestador.

## ADR-009 — Realtime com Socket.IO no mesmo processo; outbox de eventos

**Decisão.** Socket.IO autenticado por JWT, salas `order:{id}`, `provider:{id}`, `ops`. Publicação a partir da tabela `domain_events` (outbox) consumida por um despachante em processo, o que garante que nenhum evento é emitido sem estar persistido. Localização do prestador: o app envia com intervalo adaptativo definido pelo domínio (`LocationPolicy`): 3 s a menos de 500 m do destino, 10 s em deslocamento, 60 s ocioso online, nada offline. O servidor retransmite apenas para a sala da ordem ativa e descarta pontos com precisão pior que 100 m.

**Consequências.** Escala horizontal exige adaptador Redis do Socket.IO (V1), já previsto no código por configuração.

## ADR-010 — Mobile em Expo com dois produtos a partir de um código

**Decisão.** `apps/mobile` com Expo Router. Variantes de build por `EXPO_PUBLIC_APP_ROLE=customer|provider` com bundle IDs distintos (`app.config.ts`), gerando dois aplicativos nas lojas: VÉLIO e VÉLIO Pro. Código compartilhado (auth, chat, mapa, design system) e árvores de navegação separadas por papel.

**Consequências.** Metade do custo de manutenção de dois apps; a separação de produto para o usuário final é preservada.

## ADR-011 — Web em Next.js com painel operacional e administrativo no mesmo app

**Decisão.** `apps/web` (Next.js App Router) com grupos de rota `/ops` e `/admin`, RBAC por papel, componentes do design system em versão web.

## ADR-012 — Jobs agendados em tabela Postgres, sem Redis no MVP

**Decisão.** Tabela `scheduled_jobs` com poller em processo (lembretes, expiração de ofertas, timeouts de matching, geração de visitas de assinatura, lotes de repasse). Redis/BullMQ entram em V1 se o volume exigir.

## ADR-013 — Analytics instrumentado desde o MVP

**Decisão.** Eventos tipados em `packages/contracts/analytics` (`home_view`, `service_request_started`, `provider_matched`, …) gravados em `analytics_events` pela API e enviados pelos apps via endpoint dedicado com lote. Dashboard operacional lê views SQL (GMV, take rate, tempo de matching, etc.). Exportação para warehouse em V1.

## ADR-014 — Concierge com planejador por IA e humano no circuito

**Decisão.** Porta `ConciergePlanner` com adaptador Claude (API da Anthropic) que recebe texto, transcrição de áudio ou descrição de imagem e devolve um `ConciergePlan` validado por Zod (tarefas, dependências, janelas, estimativa). A IA nunca cria pagamento, captura ou repasse. Toda proposta passa por aprovação do cliente e, acima de limiares configuráveis (valor, número de tarefas, categorias de risco), por um operador. Adaptador `RuleBasedPlanner` cobre casos simples e os testes.

## ADR-015 — Nada de mock em produção

**Decisão.** Adaptadores de desenvolvimento (`sandbox`, `log-sms`, `memory-push`) são selecionados por variável de ambiente e abortam a inicialização quando `NODE_ENV=production`. Feature flags vivem em `platform_settings`. Toda funcionalidade entregue tem caminho UI → API → regra → banco → evento → retorno → erro tratado, ou é marcada como pendente no `19_GAP_ANALYSIS.md`.

## ADR-016 — Dinheiro em centavos inteiros; BRL único no MVP

**Decisão.** Todos os valores monetários em `integer` (centavos). Moeda fixa `BRL`. Arredondamento de comissão: meio para cima, centavo a favor do prestador em divisões.

## ADR-017 — Identificadores e tempo

**Decisão.** IDs `uuid v7` (ordenáveis). Timestamps `timestamptz` em UTC; fuso do usuário guardado no perfil para agendamentos e lembretes.
