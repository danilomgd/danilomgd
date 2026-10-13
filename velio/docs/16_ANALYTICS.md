# 16 — Analytics

Derivado de `packages/contracts/src/analytics.ts` (`AnalyticsEventName`, `AnalyticsEvent`, `AnalyticsBatchInput`, `DashboardMetrics`), `apps/api/src/modules/analytics/{service,routes}.ts`, `apps/api/src/modules/effects.ts` (`ANALYTICS_BY_ACTION`), chamadas diretas a `analytics.track` em `payments`, `quotes`, `subscriptions`, `apps/api/src/db/schema/platform.ts` (`analytics_events`) e das tabelas `service_orders`, `order_events`, `payment_intents`, `reviews`, `dispatch_offers`. "Implementado" = verificado; "**previsto**" = não existe.

## 1. Arquitetura (ADR-013)

| Camada | Implementação |
|---|---|
| Catálogo fechado | `AnalyticsEventName` (35 nomes); nome fora do enum → 400 Zod |
| Ingestão pelos apps | `POST /v1/analytics/events` (`requireAuth`; 204) com `AnalyticsBatchInput { events 1..100, app, appVersion? }`; `user_id` do JWT; `properties` gravadas como enviadas; `occurredAt` do cliente aceito sem limite |
| Ingestão pelo servidor | `analytics.track(name, { userId, providerId, orderId, properties })` com `app = 'api'` e `occurred_at = clock.now()`: efeito `analytics.track` das transições (mapa `ANALYTICS_BY_ACTION`) e chamadas diretas em pagamentos, orçamentos e assinaturas |
| Armazenamento | `analytics_events`; índices `(name, occurred_at)` e `(user_id, occurred_at)` |
| Dashboard | `GET /v1/admin/analytics/dashboard?from&to` (ops/admin; padrão últimos 30 dias) → `DashboardMetrics` por SQL direto (`analytics/service.ts: dashboard`) |
| Retenção | Brutos 13 meses; agregados permanentes (**previsto**: job de expurgo e rollup) |

## 2. Catálogo de eventos

Campos padrão: `occurredAt`, `sessionId?`, `app`, `appVersion?`, `orderId?`; no servidor também `user_id`/`provider_id`. `properties` só escalares (`string | number | boolean | null`).

### 2.1 Eventos emitidos pelo servidor (implementado)

| Evento | Disparador real | Propriedades gravadas |
|---|---|---|
| `service_request_started` | efeito `analytics.track` em `system.start_matching` (início do matching, não o início do fluxo no app) | `{ action, from, to, kind }` |
| `provider_matched` | `operator.assign` (atribuição manual) | idem |
| `provider_accepted` | `provider.accept` | idem |
| `provider_en_route` | `provider.en_route` | idem |
| `provider_arrived` | `provider.arrive`, `provider.deliver` | idem |
| `service_started` | `provider.start`, `provider.pickup` | idem |
| `service_completed` | `provider.complete`, `system.children_completed` | idem |
| `order_cancelled` | `customer.cancel`, `provider.cancel`, `operator.cancel` | idem (`action` identifica o ator) |
| `no_provider_found` | `system.no_provider` | idem |
| `review_created` | `customer.review` | idem |
| `dispute_opened` | `customer.open_dispute` | idem |
| `quote_sent` | `provider.submit_quote` (INITIAL) e `quotes.create` (ADDITIONAL, chamada direta) | `{ action, from, to, kind }` / vazio |
| `quote_approved` / `quote_rejected` | `customer.approve_quote`/`reject_quote` (INITIAL) e `quotes.approve/reject` (todos os tipos, chamada direta) | idem |
| `concierge_plan_approved` | `customer.approve_plan` | idem |
| `checkout_view` | `customer.authorize_payment` (**mapeamento inadequado**: deveria ser `payment_completed` ou um evento próprio) | idem |
| `payment_method_added` | `payments.addMethod` | `{ kind }` |
| `payment_completed` | `payments.capture` com `captured > 0` | `{ amountCents }` |
| `payment_failed` | intent `FAILED` (`notifyFailure`) | `{ code }` |
| `subscription_started` / `subscription_cancelled` | `subscriptions.subscribe/cancel` | `{ planSlug }` / vazio |

Ações **sem** evento hoje: `system.offer`, `system.wave_exhausted`, `system.remind`, `system.auto_close`, `system.plan_ready`, `system.plan_needs_human`, `provider.depart`, `provider.arrive_destination`, `provider.third_party_*`, `provider.return_*`, `operator.resolve_dispute`, `operator.approve_plan`, `operator.refund`, `provider.reject`. Eventos de oferta (`offer_received`, `offer_accepted`, `offer_rejected`, `offer_expired`) e `provider_online/offline` **não são gravados** pelo servidor (os dados existem em `dispatch_offers` e `providers`); `concierge_submitted`, `service_request_completed` (pedido criado) também não.

### 2.2 Eventos do app (contrato; instrumentação a fazer nos apps)

| Evento | Disparador | Propriedades sugeridas |
|---|---|---|
| `app_open` | Cold/warm start | `cold`, `role` |
| `home_view` | Home renderizada | `sectionsShown`, `contextHintSource` |
| `category_view` | Tela de categoria | `categorySlug` |
| `service_view` | Tela de serviço | `serviceSlug`, `pricingModel`, `fromSection` |
| `search_performed` | Busca | `queryLength`, `results` (texto só com consentimento `personalization`) |
| `service_request_started` | Primeiro passo do pedido no app (colide com o uso do servidor; ver §2.4) | `serviceSlug`, `scheduleMode` |
| `checkout_view` | Tela de confirmação | `serviceSlug`, `totalCents`, `hasCoupon`, `methodKind` |
| `service_request_completed` | 201 de `POST /v1/requests` | `serviceSlug`, `workflowKind`, `priceCents` |
| `offer_received` / `offer_accepted` / `offer_rejected` / `offer_expired` | App do prestador ao exibir/responder oferta (ou mover para o servidor) | `wave`, `score`, `responseSeconds` |
| `provider_online` / `provider_offline` | Toggle no app | `hourLocal`, `weekday`, `sessionSeconds` |
| `concierge_submitted` | 201 do Concierge | `inputType`, `textLength` |
| `notification_opened` | Toque em push/in-app | `kind`, `secondsSinceSent` |

### 2.3 PII proibida

Nunca em `properties`: nome, telefone, e-mail, CPF/CNPJ, placa, endereço/CEP, coordenadas precisas, texto livre (busca, notas, motivos, mensagens, comentários), tokens, PIN. O ingest **não valida** isso hoje (**previsto**: lista negra de chaves `name`, `phone`, `email`, `address`, `cpf`, `document`, `plate`, `comment`, `notes`, `query` e contador `analytics.dropped_pii`). Identificação só por ids do servidor; exclusão de conta zera `user_id` (14 §10).

### 2.4 Divergências de nomes a resolver

| Onde | Problema | Proposta |
|---|---|---|
| `effects.ts` | `system.start_matching → service_request_started` (semântica de app) e `customer.authorize_payment → checkout_view` | Novos nomes no enum: `matching_started`, `payment_authorized`; ou mapear `start_matching` para `service_request_completed` |
| `effects.ts` | `operator.assign → provider_matched` e `provider.accept → provider_accepted`: "matched" deveria sair em `system.offer` (primeira onda com ofertas) | Adicionar `system.offer → provider_matched` e `operator.assign → provider_accepted` com `properties.manual = true` |
| PRD §10 | Cita `service_viewed`, `checkout_viewed`, `order_created`, `quote_decided`, `order_completed`, `review_submitted`, `payment_recovered`, inexistentes no enum | Alinhar PRD ao enum (`service_view`, `checkout_view`, `service_request_completed`, `quote_approved/rejected`, `service_completed`, `review_created`); `payment_recovered` derivado |
| Ofertas | Sem eventos no servidor | Emitir `offer_received/accepted/rejected/expired` em `dispatch/service.ts` (dados já disponíveis) |

## 3. Funis

### 3.1 Cliente

| Etapa | Evento | Fonte hoje | Conversão |
|---|---|---|---|
| 1 | `home_view` | app | base |
| 2 | `category_view` | app | % de 1 |
| 3 | `service_view` | app | % de 2 |
| 4 | `service_request_started` (app) | app | % de 3 |
| 5 | `checkout_view` (app) | app | % de 4 |
| 6 | Pedido criado | `service_orders.created_at` (evento `service_request_completed` do app) | % de 5 |
| 7 | Primeira oferta | `order_events(to_status = 'OFFERED')` | % de 6 |
| 8 | `provider_accepted` | api | % de 7; tempo 6→8 = matching |
| 9 | `service_started` | api | % de 8 |
| 10 | `service_completed` | api | % de 9 |
| 11 | `review_created` | api | % de 10 |

Etapas 1–5 por `session_id` (app); 6–11 por `order_id` usando as tabelas transacionais como fonte de verdade (mais confiáveis que `analytics_events`):

```sql
WITH o AS (
  SELECT id FROM service_orders WHERE created_at BETWEEN :from AND :to AND parent_order_id IS NULL)
SELECT
  (SELECT count(*) FROM o) criadas,
  (SELECT count(DISTINCT order_id) FROM order_events e JOIN o ON o.id = e.order_id WHERE e.to_status = 'OFFERED') ofertadas,
  (SELECT count(DISTINCT order_id) FROM order_events e JOIN o ON o.id = e.order_id WHERE e.action IN ('provider.accept','operator.assign')) aceitas,
  (SELECT count(DISTINCT order_id) FROM order_events e JOIN o ON o.id = e.order_id WHERE e.action IN ('provider.start','provider.pickup')) iniciadas,
  (SELECT count(*) FROM service_orders s JOIN o ON o.id = s.id WHERE s.completed_at IS NOT NULL) concluidas,
  (SELECT count(DISTINCT order_id) FROM reviews r JOIN o ON o.id = r.order_id WHERE r.target_type = 'PROVIDER') avaliadas;
```

### 3.2 Prestador

| Etapa | Fonte | Métrica |
|---|---|---|
| 1 | Online: `providers.availability` ao longo do tempo (sem evento hoje; **previsto** `provider_online/offline`) | Horas online |
| 2 | Ofertas: `dispatch_offers` | Ofertas por hora online |
| 3 | Aceite: `dispatch_offers.response = 'ACCEPTED'` | Taxa de aceite; `responded_at − offered_at` |
| 4 | Início: `order_events(action = 'provider.start')` | Comparecimento |
| 5 | Conclusão: `service_orders.completed_at` | Conclusão; ganhos via `ledger_entries(kind = 'provider_payout')` |

```sql
SELECT o.provider_id,
  count(*) FILTER (WHERE o.response IS NOT NULL) ofertas,
  count(*) FILTER (WHERE o.response = 'ACCEPTED') aceites,
  avg(EXTRACT(epoch FROM o.responded_at - o.offered_at)) FILTER (WHERE o.response IN ('ACCEPTED','REJECTED')) resp_s
FROM dispatch_offers o WHERE o.offered_at BETWEEN :from AND :to GROUP BY o.provider_id;
```

## 4. `DashboardMetrics`

### 4.1 Implementação atual (`analytics/service.ts: dashboard(from, to)`)

Período aplicado sobre `service_orders.created_at` (todas as métricas de ordem), `reviews.created_at`, `users.created_at`. Percentuais com 2 casas; `null` quando o denominador é zero.

| Campo | Cálculo implementado | Diferença em relação à definição-alvo (§4.2) |
|---|---|---|
| `gmvCents` | Σ `total_cents` de ordens **criadas** no período com status ∈ `COMPLETED, REVIEWED, CLOSED, DISPUTED` | Alvo: por `completed_at` |
| `orders` | Ordens criadas no período (inclui filhas de concierge) | Alvo: excluir `parent_order_id IS NOT NULL` |
| `completedOrders` | Criadas no período e hoje em status concluído | Alvo: `completed_at` no período |
| `cancelledOrders` | Criadas no período e hoje `CANCELLED_*` | Alvo: `cancelled_at` no período |
| `avgTicketCents` | `round(gmv / completed)` | igual |
| `takeRatePct` | `Σ platform_fee_cents / gmv × 100` | igual (fee bruto da regra; em ordens com cupom o `ledger.platform_fee` é líquido) |
| `platformRevenueCents` | Σ `platform_fee_cents` (bruto, antes do cupom) | Alvo: líquido (`ledger_entries.kind = 'platform_fee'`) |
| `repeatRatePct` | Clientes com ≥ 2 ordens concluídas **em toda a história** / clientes com ≥ 1 | Alvo: janela de 90 dias até `to` |
| `avgMatchingSeconds` | `avg(accepted_at − matching_started_at)` das concluídas | Alvo: todas as aceitas no período; p50/p90 |
| `avgArrivalSeconds` | `avg(order_events(ARRIVED).created_at − accepted_at)` das ordens criadas no período | Alvo: só `IMMEDIATE` |
| `avgRating` | `avg(reviews.rating)` `PROVIDER` no período | Alvo: excluir `hidden_at` |
| `noProviderRatePct` | Ordens criadas no período **atualmente** em `NO_PROVIDER_FOUND` / criadas | Alvo: que **passaram** por `NO_PROVIDER_FOUND` (`order_events`) |
| `activeProviders` | Prestadores `APPROVED` e `ONLINE/BUSY` **agora** | Alvo: com ≥ 1 ordem concluída no período |
| `newCustomers` | Todos os `users` criados no período (inclui operadores/prestadores) | Alvo: `roles ? 'customer'` |

### 4.2 Definições-alvo (SQL de referência)

| Campo | SQL |
|---|---|
| `gmvCents` | `SELECT COALESCE(sum(total_cents),0) FROM service_orders WHERE completed_at >= :from AND completed_at < :to AND status IN ('COMPLETED','REVIEWED','CLOSED','DISPUTED')` |
| `orders` | `SELECT count(*) FROM service_orders WHERE created_at >= :from AND created_at < :to AND parent_order_id IS NULL` |
| `completedOrders` | `... WHERE completed_at >= :from AND completed_at < :to AND status IN (...)` |
| `cancelledOrders` | `... WHERE cancelled_at >= :from AND cancelled_at < :to AND status LIKE 'CANCELLED_%'` |
| `platformRevenueCents` | `SELECT COALESCE(sum(amount_cents),0) FROM ledger_entries WHERE kind = 'platform_fee' AND direction = 'CREDIT' AND created_at >= :from AND created_at < :to` |
| `repeatRatePct` | `WITH c AS (SELECT customer_id, count(*) n FROM service_orders WHERE completed_at >= :to - interval '90 days' AND completed_at < :to AND status IN (...) GROUP BY 1) SELECT 100.0 * sum((n>=2)::int) / NULLIF(count(*),0) FROM c` |
| `avgMatchingSeconds` (+ p50/p90) | `SELECT avg(x), percentile_cont(0.5) WITHIN GROUP (ORDER BY x), percentile_cont(0.9) WITHIN GROUP (ORDER BY x) FROM (SELECT EXTRACT(epoch FROM accepted_at - matching_started_at) x FROM service_orders WHERE accepted_at >= :from AND accepted_at < :to AND matching_started_at IS NOT NULL) t` |
| `avgArrivalSeconds` | `SELECT avg(EXTRACT(epoch FROM e.created_at - o.accepted_at)) FROM order_events e JOIN service_orders o ON o.id = e.order_id WHERE e.to_status = 'ARRIVED' AND o.workflow_kind = 'IMMEDIATE' AND e.created_at >= :from AND e.created_at < :to` |
| `avgRating` | `SELECT avg(rating) FROM reviews WHERE target_type = 'PROVIDER' AND hidden_at IS NULL AND created_at >= :from AND created_at < :to` |
| `noProviderRatePct` | `SELECT 100.0 * count(DISTINCT e.order_id) / NULLIF((SELECT count(*) FROM service_orders WHERE created_at >= :from AND created_at < :to),0) FROM order_events e JOIN service_orders o ON o.id = e.order_id WHERE e.to_status = 'NO_PROVIDER_FOUND' AND o.created_at >= :from AND o.created_at < :to` |
| `activeProviders` | `SELECT count(DISTINCT provider_id) FROM service_orders WHERE completed_at >= :from AND completed_at < :to AND status IN (...)` |
| `newCustomers` | `SELECT count(*) FROM users WHERE created_at >= :from AND created_at < :to AND roles ? 'customer'` |

Plano: ajustar `dashboard()` para estas definições (teste de integração comparando com SQL) e, em V1, materializar `analytics_daily` por dia/região/categoria (job `analytics.rollup`).

## 5. Métricas operacionais

| Métrica | Definição | Fonte |
|---|---|---|
| Matching p50/p90 | `accepted_at − matching_started_at` | `service_orders` |
| Chegada p50 (IMMEDIATE) | `ARRIVED − accepted_at` | `order_events` |
| Pontualidade agendada | `ARRIVED` em `[scheduled_for, scheduled_for + window_minutes]` | `order_events` + `service_orders` |
| Sem prestador por região/categoria/hora | `order_events(NO_PROVIDER_FOUND)` × `region_id`, `category_id`, hora | `order_events`, `service_orders` |
| Ondas por ordem; aceite por onda | `dispatch_rounds`, `dispatch_offers` | 12 §10 |
| Cancelamentos por ator e fase | `order_events` com `to_status LIKE 'CANCELLED_%'` (ator em `action`) e `from_status`; ou `analytics_events(order_cancelled).properties.action/from` | |
| Cancelamento do prestador pós-aceite | `order_events(action = 'provider.cancel')` / aceites | |
| Aprovação de adicional | `quotes(kind ADDITIONAL)` `APPROVED` / total | `quotes` |
| Disputas / concluídas | `disputes` / concluídas | |
| Falhas de pagamento por código | `payment_intents(status FAILED).failure_code` | |
| PIX cancelado por timeout | `failure_code = 'pix_timeout'` | |
| Cobertura (online por hora) | **previsto** (`provider_online/offline`); interim: amostragem de `providers.availability` | |
| Tempo de aprovação de prestador | `verified_at − created_at` | `providers` |
| Abertura de push | `notification_opened` (app) / `notifications(channel PUSH, status SENT)` | |

```sql
-- cancelamentos por ator e fase (30 dias)
SELECT action, from_status, count(*) FROM order_events
WHERE to_status LIKE 'CANCELLED_%' AND created_at > now() - interval '30 days' GROUP BY 1,2 ORDER BY 3 DESC;
```

## 6. North Star e metas

**North Star: ordens concluídas com avaliação ≥ 4 por semana.**

| Métrica | Mês 3 (MVP) | Mês 9 (V1) | Fonte |
|---|---|---|---|
| North Star | 200/semana | 1.500/semana | `service_orders` + `reviews` |
| GMV mensal | R$ 150 mil | R$ 1 milhão | `gmvCents` |
| Ordens/mês | 1.200 | 8.000 | `orders` |
| Conclusão | > 80 % | > 88 % | |
| Ticket médio | R$ 150 | R$ 170 | |
| Take rate | 18–22 % | 18–22 % | |
| Repeat 90 d | > 35 % | > 45 % | |
| Matching p50/p90 | 3/10 min | 2/6 min | |
| Chegada p50 | 45 min | 35 min | |
| `NO_PROVIDER_FOUND` | < 10 % | < 4 % | |
| Aceite onda 1 | > 30 % | > 40 % | |
| Rating | > 4,6 | > 4,7 | |
| Disputas | < 2 % | < 1 % | |
| Prestadores ativos/mês | 80 | 500 | |

Guardrails: cancelamento do prestador pós-aceite < 5 %, disputas < 2 %, `payment_failed` < 5 %, pontualidade agendada > 85 %.

## 7. Evolução

| Fase | Capacidade |
|---|---|
| MVP | Corrigir `ANALYTICS_BY_ACTION` (§2.4), emitir eventos de oferta e online/offline no servidor, lista negra de PII no ingest, dashboard pelas definições-alvo |
| V1 | `analytics_daily` (rollup) e particionamento mensal de `analytics_events`; coortes de retenção; export CDC (replicação lógica → BigQuery/ClickHouse) de `analytics_events`, `service_orders`, `order_events`, `dispatch_*`, `payment_intents`, `ledger_entries`, `reviews` com `user_id` pseudonimizado por HMAC |
| V2 | Experimentação: `experiments`/`experiment_assignments` por hash de `user_id`; variante como propriedade padrão `exp_<id>`; flags em `platform_settings`; alertas automáticos (`analytics.watch` → `incidents`) |
| V3 | Previsão de demanda e aprendizado de pesos sobre o warehouse (12 §14) |
