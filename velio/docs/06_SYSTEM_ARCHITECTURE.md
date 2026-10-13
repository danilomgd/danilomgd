# 06 — Arquitetura de Sistema

Complementa `ARCHITECTURE_DECISIONS.md`. Aqui está o desenho; lá, o porquê.

## 1. Visão geral

```
┌───────────────┐  ┌───────────────┐  ┌──────────────────────────────┐
│ VÉLIO (app    │  │ VÉLIO Pro     │  │ Web: /ops (operação)         │
│ do cliente)   │  │ (prestador)   │  │      /admin (configuração)   │
│ Expo / RN     │  │ Expo / RN     │  │ Next.js                      │
└──────┬────────┘  └──────┬────────┘  └──────────────┬───────────────┘
       │ HTTPS REST (Zod)  │  Socket.IO (JWT)         │
       ▼                   ▼                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ apps/api — Fastify 5 (modular monolith)                             │
│                                                                     │
│  identity │ catalog │ geo │ orders (workflow engine) │ dispatch     │
│  quotes │ payments │ wallet │ subscriptions │ assets │ communication│
│  reputation │ support │ concierge │ ops │ admin │ analytics         │
│                                                                     │
│  ── packages/domain (regras puras, sem I/O) ──                      │
│  ── packages/contracts (Zod, DTOs, eventos, rotas) ──               │
│                                                                     │
│  Outbox (domain_events) → Dispatcher → Socket.IO rooms + handlers   │
│  Scheduler (scheduled_jobs) → lembretes, expirações, repasses       │
└──────┬───────────────┬───────────────┬──────────────┬───────────────┘
       │               │               │              │
   PostgreSQL     PaymentGateway    Push/SMS      ConciergePlanner
   (Drizzle;      (sandbox |        (expo-push |  (claude | rules)
    PGlite em     pagarme)          log)
    dev/teste)
```

## 2. Pacotes e responsabilidades

| Pacote | Conteúdo | Pode depender de |
|---|---|---|
| `packages/contracts` | Schemas Zod de todos os DTOs, enums canônicos (status, papéis, tipos de evento), nomes de eventos de analytics, mapa de rotas | nada |
| `packages/domain` | Workflow engine, definições de workflow, matching (score, ondas, fallback), precificação e comissão, políticas (cancelamento, localização, OTP), máquina de orçamento, planejador concierge por regras | `contracts` |
| `packages/ui` | Tokens de design (cor, tipografia, espaçamento, raio, elevação, movimento), componentes React Native e web | nada |
| `packages/api-client` | Cliente HTTP tipado gerado a partir de `contracts`, hooks React Query, cliente Socket.IO | `contracts` |
| `apps/api` | Módulos, rotas, persistência (Drizzle), adaptadores (gateway, SMS, push, IA), outbox, scheduler | todos os pacotes |
| `apps/mobile` | Expo Router; árvores `(customer)` e `(provider)` selecionadas por `EXPO_PUBLIC_APP_ROLE` | `ui`, `api-client`, `contracts` |
| `apps/web` | Next.js; `/ops`, `/admin`, `/login` | `ui`, `api-client`, `contracts` |

Regra de dependência: `domain` nunca importa de `apps/*` nem faz I/O. Módulos da API só conversam entre si por serviços exportados ou por eventos de domínio.

## 3. Módulos da API

| Módulo | Responsabilidade | Tabelas que possui |
|---|---|---|
| `identity` | OTP, senha, JWT, refresh, papéis, dispositivos | `users`, `otp_codes`, `refresh_tokens`, `devices` |
| `catalog` | Categorias, serviços, regras de preço por região, home configurável, busca | `service_categories`, `services`, `service_price_rules`, `home_sections`, `banners` |
| `geo` | Regiões, geocodificação (porta), distância, ETA (porta), raio | `regions`, `addresses` |
| `assets` | Veículos e equipamentos do cliente | `vehicles`, `equipments` |
| `providers` | Cadastro, documentos, especialidades, áreas, agenda, disponibilidade, localização | `providers`, `provider_documents`, `provider_skills`, `provider_service_areas`, `provider_schedules`, `provider_time_off`, `provider_locations` |
| `orders` | Solicitação, ordem, workflow, eventos, tarefas, evidências, custódia, cancelamento | `service_requests`, `service_orders`, `order_events`, `order_tasks`, `media_evidence`, `custody_events`, `bookings`, `workflow_definitions` |
| `dispatch` | Candidatos, score, ondas, ofertas, expiração, fallback para ops | `matching_configs`, `dispatch_rounds`, `dispatch_offers` |
| `quotes` | Orçamento inicial e adicional, aprovação do cliente | `quotes` |
| `payments` | Métodos, intenções, captura, PIX, webhooks, reembolso, cupons | `payment_methods`, `payment_intents`, `refunds`, `coupons`, `coupon_redemptions`, `promotions` |
| `wallet` | Contas, ledger, comissão, repasses | `wallet_accounts`, `ledger_entries`, `commission_rules`, `payouts` |
| `subscriptions` | Planos, assinaturas, geração de visitas, cobrança recorrente | `subscription_plans`, `subscriptions`, `subscription_visits` |
| `communication` | Conversas, mensagens, mensagens automáticas, notificações multicanal | `conversations`, `conversation_participants`, `messages`, `notifications` |
| `reputation` | Avaliações, estatísticas do prestador, sinais internos do cliente | `reviews`, `provider_stats`, `customer_risk_signals` |
| `support` | Tickets, disputas, resolução | `support_tickets`, `ticket_messages`, `disputes` |
| `concierge` | Entrada em linguagem natural, plano, aprovação, ordens filhas | `concierge_requests` |
| `ops` | Mapa, filas, atribuição manual, incidentes, SLA | lê de vários módulos via serviços; escreve `incidents` |
| `admin` | CRUD de configuração, usuários, aprovação de prestadores, settings | `platform_settings`, `audit_logs` |
| `analytics` | Ingestão de eventos, views de dashboard | `analytics_events` |
| `platform` (infra) | Outbox, scheduler, health | `domain_events`, `scheduled_jobs` |

## 4. Fluxo de uma ordem imediata (caminho feliz)

1. App cliente `POST /v1/requests` com serviço, endereço, janela (`NOW`), observações e mídia.
2. `orders.createRequest` valida (Zod), calcula estimativa com `domain/pricing`, cria `service_requests` + `service_orders` em `REQUESTED`, grava `order_events[0]`, publica `OrderCreated` no outbox e enfileira job `dispatch.start`.
3. `dispatch.start`: transição `REQUESTED → MATCHING`; busca candidatos (`providers` ONLINE, skill compatível, dentro do raio, sem conflito de agenda); `domain/matching.score` ordena; cria `dispatch_rounds[wave=1]` e N `dispatch_offers` com expiração; notifica prestadores (push + sala `provider:{id}`); transição `MATCHING → OFFERED`.
4. Prestador `POST /v1/offers/:id/accept`: guarda de concorrência (primeiro aceite vence, outros expiram); `OFFERED → ACCEPTED`; `payments.authorize` cria intenção (cartão pré-autorizado ou PIX gerado); cliente notificado.
5. `POST /v1/orders/:id/en-route` → `EN_ROUTE`; localização do prestador flui pela sala `order:{id}` com `LocationPolicy`.
6. `arrived` → `ARRIVED`; `start` com PIN do cliente (quando a categoria exige) → `IN_PROGRESS`.
7. Opcional: prestador cria `Quote(kind=ADDITIONAL)`; cliente aprova ou recusa; só após `APPROVED` nasce `payment_intents(kind=ADDITIONAL)`.
8. `complete` com `MediaEvidence(AFTER)` → `COMPLETED`; `payments.capture` captura o valor final; `wallet.settle` lança ledger (bruto, comissão, líquido do prestador); cliente notificado para avaliar.
9. `POST /v1/orders/:id/review` → `REVIEWED`; `reputation.recompute`.

Em cada passo: evento no outbox → Socket.IO → telas atualizam sem polling; falhas de transição retornam `409` com o estado atual e as transições permitidas.

## 5. Realtime

- Socket.IO no mesmo processo (`/realtime`), handshake com JWT de acesso.
- Salas: `user:{id}` (notificações), `order:{id}` (participantes da ordem), `provider:{id}` (ofertas), `ops` (operadores).
- Eventos emitidos: `order.updated`, `order.event`, `offer.created`, `offer.expired`, `provider.location`, `message.created`, `quote.created`, `quote.decided`, `payment.updated`.
- Localização: `POST /v1/providers/me/location` (lote) ou evento `location.push`; servidor descarta precisão > 100 m, deduplica por < 5 m e retransmite só para a ordem ativa.
- Escala: adaptador Redis do Socket.IO por configuração (V1).

## 6. Jobs

`scheduled_jobs(run_at, kind, payload, status, attempts, locked_by)` com poller a cada 2 s e lock otimista. Tipos: `dispatch.start`, `dispatch.wave_timeout`, `offer.expire`, `booking.reminder`, `booking.confirm_request`, `subscription.generate_visit`, `subscription.charge`, `payment.reconcile`, `payout.batch`, `order.auto_complete_check`, `quote.expire`.

## 7. Segurança (resumo; detalhe em `14_SECURITY_LGPD.md`)

JWT curto; refresh rotativo com hash; RBAC por papel e posse; rate limit por IP e por usuário; validação Zod em toda entrada; segredos só por ambiente; logs estruturados sem PII sensível; `audit_logs` para ações de ops/admin; dados de cartão nunca tocam o servidor (tokenização no app); documentos de prestador em storage privado com URL assinada.

## 8. Ambientes e deploy

| Ambiente | Banco | Gateway | SMS/Push | Hospedagem sugerida |
|---|---|---|---|---|
| test | PGlite em memória | sandbox | log/memory | CI |
| dev | PGlite em arquivo ou Postgres local | sandbox | log | máquina do dev |
| staging | Postgres gerenciado | Pagar.me sandbox | provedores reais em modo teste | Fly.io / Railway / Render |
| prod | Postgres gerenciado com backups PITR | Pagar.me produção | reais | idem, 2+ instâncias + Redis adapter |

API em container Node 22. Migrações rodam no deploy (`drizzle-kit migrate`). Web no Vercel ou junto da API. Mobile via EAS Build/Submit.

## 9. Observabilidade

Logs `pino` em JSON com `requestId`, `userId` (hash), `orderId`. Métricas por endpoint e por job. Alertas iniciais: ordens em `NO_PROVIDER_FOUND` > 10 min, webhooks de pagamento com falha, fila de jobs atrasada.
