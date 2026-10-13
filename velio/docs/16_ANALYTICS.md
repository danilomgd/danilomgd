# 16 — Analytics

Derivado de `packages/contracts/src/analytics.ts` (`AnalyticsEventName`, `AnalyticsEvent`, `AnalyticsBatchInput`, `DashboardMetrics`), `apps/api/src/db/schema/platform.ts` (`analytics_events`), dos efeitos `analytics.track` nas `WorkflowDefinition` e das tabelas `service_orders`, `payment_intents`, `reviews`, `dispatch_offers`, `order_events`. Ingestão e views do dashboard pertencem ao módulo `analytics` (em implementação; marcado **(conforme contrato)** onde aplicável).

## 1. Arquitetura (ADR-013)

| Camada | Implementação |
|---|---|
| Catálogo fechado | `AnalyticsEventName` (35 nomes). Nome fora do enum → 400. Novo evento = PR em `contracts` |
| Ingestão pelos apps | `POST /v1/analytics/events` com `AnalyticsBatchInput { events[1..100], app, appVersion }`; lote enviado a cada 30 s ou 20 eventos ou ao ir para background; fila local persistida no dispositivo |
| Ingestão pelo servidor | Efeito `analytics.track` em transições + eventos de pagamento/dispatch; `app = 'api'`; são a fonte de verdade para funis de ordem (não dependem do app estar aberto) |
| Armazenamento | `analytics_events(name, user_id, provider_id, order_id, session_id, app, app_version, properties jsonb, occurred_at, created_at)`; índices por `(name, occurred_at)` e `(user_id, occurred_at)` |
| Identidade | `user_id`/`provider_id` sempre do JWT (nunca do corpo); anônimo permitido para eventos de descoberta |
| Dashboard | `GET /v1/admin/analytics/dashboard?from&to` → `DashboardMetrics` calculado por SQL sobre tabelas transacionais + `analytics_events` (§4) |
| Retenção | Brutos 13 meses; agregados diários permanentes sem `user_id` |

## 2. Catálogo de eventos

Propriedades padrão em **todo** evento (preenchidas pelo servidor ou pelo cliente): `occurredAt`, `sessionId?` (app), `app`, `appVersion?`, `orderId?`, e, no servidor, `user_id`, `provider_id`. `properties` só aceita escalares (`string | number | boolean | null`).

| Evento | Disparador | Origem | Propriedades específicas | Observações |
|---|---|---|---|---|
| `app_open` | Abertura/retorno do app (cold/warm start) | app | `cold: boolean`, `role: customer\|provider` | Base de DAU |
| `home_view` | Tela inicial renderizada | app | `sectionsShown: number`, `contextHintSource?: string` | Avaliar seções contextuais |
| `category_view` | Tela de categoria | app | `categorySlug` | |
| `service_view` | Tela de serviço | app | `serviceSlug`, `pricingModel`, `fromSection?` | |
| `search_performed` | Busca executada | app | `queryLength: number`, `results: number` | Texto da busca **não** é enviado sem consentimento `personalization` |
| `service_request_started` | Primeiro passo do fluxo de pedido | app | `serviceSlug`, `scheduleMode` | Início do funil de pedido |
| `checkout_view` | Tela de confirmação com preço | app | `serviceSlug`, `totalCents?`, `hasCoupon: boolean`, `methodKind?` | |
| `payment_method_added` | `POST /v1/me/payment-methods` ok | api | `methodKind`, `brand?` | |
| `service_request_completed` | `POST /v1/requests` 201 | api | `serviceSlug`, `categorySlug`, `workflowKind`, `scheduleMode`, `priceCents`, `discountCents`, `regionId?` | Equivale a "pedido criado" |
| `provider_matched` | Primeira onda com ofertas (`system.offer`) | api | `wave: 0`, `offeredCount`, `eligibleCount`, `secondsSinceRequest` | Chamado uma vez por ordem |
| `offer_received` | `dispatch_offers` criada (push/realtime) | api | `wave`, `score`, `distanceKm`, `providerPayoutCents` | Um por prestador ofertado; `provider_id` preenchido |
| `offer_accepted` | `POST /v1/offers/:id/accept` ok | api | `wave`, `responseSeconds`, `score` | Lado do prestador |
| `offer_rejected` | `POST /v1/offers/:id/reject` | api | `wave`, `responseSeconds` | |
| `offer_expired` | Timeout da onda | api | `wave` | Conta como não-resposta |
| `provider_accepted` | Transição `provider.accept`/`operator.assign` | api | `manual: boolean`, `matchingSeconds`, `wave` | Lado da ordem |
| `provider_en_route` | `provider.en_route` | api | `etaMinutes?`, `distanceKm?` | |
| `provider_arrived` | `provider.arrive` | api | `travelSeconds`, `onTime?: boolean` (agendado: dentro da janela) | |
| `service_started` | `provider.start` | api | `pinUsed: boolean`, `beforePhotos: number` | |
| `quote_sent` | `quotes` criada | api | `kind: INITIAL\|ADDITIONAL`, `amountCents`, `items` | |
| `quote_approved` | Cliente aprova | api | `kind`, `amountCents`, `decisionSeconds` | |
| `quote_rejected` | Cliente recusa | api | `kind`, `amountCents`, `decisionSeconds` | |
| `service_completed` | `provider.complete` / `system.children_completed` | api | `totalCents`, `additionalApprovedCents`, `durationSeconds`, `afterPhotos` | GMV |
| `payment_completed` | Intent `CAPTURED` | api | `kind`, `methodKind`, `amountCents`, `gateway` | |
| `payment_failed` | Intent `FAILED` | api | `kind`, `methodKind`, `failureCode` | Sem mensagem do emissor |
| `order_cancelled` | `customer.cancel`, `provider.cancel`, `operator.cancel` | api | `by: customer\|provider\|platform`, `fromStatus`, `feeCents`, `secondsSinceAccept?`, `reasonCategory?` | Texto livre do motivo **não** vai |
| `no_provider_found` | `system.no_provider` | api | `wavesTried`, `lastRadiusKm`, `regionId?` | |
| `review_created` | `customer.review` ou avaliação do prestador | api | `rating`, `targetType`, `tags: number` | Comentário não vai |
| `dispute_opened` | `customer.open_dispute` | api | `reason` | |
| `subscription_started` | `POST /v1/me/subscriptions` ok | api | `planSlug`, `priceCents`, `equipments: number` | |
| `subscription_cancelled` | Cancelamento | api | `planSlug`, `monthsActive` | |
| `concierge_submitted` | `POST /v1/concierge/requests` | api | `inputType`, `textLength` | Texto não vai |
| `concierge_plan_approved` | `customer.approve_plan` | api | `tasks`, `estimateMaxCents`, `plannerName`, `requiredHuman: boolean`, `confidence` | |
| `provider_online` / `provider_offline` | `PATCH /v1/providers/me/availability` | api | `hourLocal`, `weekday`, `sessionSeconds?` (no offline) | Cobertura por hora |
| `notification_opened` | Toque em push/in-app | app | `kind`, `secondsSinceSent` | |

### 2.1 Mapeamento transição → evento (efeito `analytics.track`)

| Ação (`TransitionAction`) | Evento |
|---|---|
| `system.start_matching` | nenhum direto (marca `matching_started_at`); `provider_matched` sai no `system.offer` |
| `system.no_provider` | `no_provider_found` |
| `provider.accept`, `operator.assign` | `provider_accepted` (+ `offer_accepted` pelo lado do prestador) |
| `provider.en_route`, `provider.return_depart` | `provider_en_route` |
| `provider.arrive`, `provider.arrive_destination` | `provider_arrived` |
| `provider.start`, `provider.pickup` | `service_started` |
| `provider.submit_quote` | `quote_sent` |
| `customer.approve_quote` / `customer.reject_quote` | `quote_approved` / `quote_rejected` |
| `customer.authorize_payment` | `payment_completed` (quando autoriza) |
| `provider.complete`, `provider.deliver`, `system.children_completed` | `service_completed` |
| `customer.review` | `review_created` |
| `customer.cancel`, `provider.cancel`, `operator.cancel` | `order_cancelled` |
| `customer.open_dispute` | `dispute_opened` |
| `customer.approve_plan` | `concierge_plan_approved` |

### 2.2 PII proibida

Nunca em `properties`: nome, telefone, e-mail, CPF/CNPJ, placa, endereço/CEP, coordenadas precisas (só `regionId`/bairro agregado), texto livre (busca, notas, motivos, mensagens, comentários), tokens, PIN. O ingest descarta eventos com chaves da lista negra (`name`, `phone`, `email`, `address`, `cpf`, `document`, `plate`, `comment`, `notes`, `query`) e conta `analytics.dropped_pii` para alerta. Identificação só por ids (`user_id`, `order_id`) preenchidos pelo servidor; exclusão de conta zera `user_id` (14 §10).

Divergência com `03_PRODUCT_REQUIREMENTS_DOCUMENT.md §10`: o PRD cita `service_viewed`, `checkout_viewed`, `order_created`, `quote_decided`, `order_completed`, `review_submitted`, `payment_recovered`; os nomes canônicos em `contracts` são `service_view`, `checkout_view`, `service_request_completed`, `quote_approved`/`quote_rejected`, `service_completed`, `review_created`; `payment_recovered` não existe (derivar de `payment_failed` seguido de `payment_completed` na mesma ordem). O PRD deve adotar os nomes do enum.

## 3. Funis

### 3.1 Cliente

| Etapa | Evento | Métrica de conversão | SQL de referência (janela `:from`–`:to`) |
|---|---|---|---|
| 1 | `home_view` | — | base |
| 2 | `category_view` | % de 1 | |
| 3 | `service_view` | % de 2 | |
| 4 | `service_request_started` | % de 3 (interesse) | |
| 5 | `checkout_view` | % de 4 | |
| 6 | `service_request_completed` | % de 5 (abandono de checkout = 1 − isto) | |
| 7 | `provider_matched` | % de 6 (densidade) | |
| 8 | `provider_accepted` | % de 7 (aceite) | tempo médio 6→8 = matching |
| 9 | `service_started` | % de 8 (comparecimento) | tempo 8→9 = chegada + início |
| 10 | `service_completed` | % de 9 | |
| 11 | `review_created` | % de 10 | |

```sql
WITH e AS (
  SELECT name, count(DISTINCT COALESCE(order_id, session_id, user_id::text)) n
  FROM analytics_events
  WHERE occurred_at BETWEEN :from AND :to AND app IN ('customer','api')
  GROUP BY name)
SELECT name, n, round(100.0 * n / first_value(n) OVER (ORDER BY step), 1) pct_of_top
FROM e JOIN (VALUES ('home_view',1),('category_view',2),('service_view',3),('service_request_started',4),('checkout_view',5),
  ('service_request_completed',6),('provider_matched',7),('provider_accepted',8),('service_started',9),('service_completed',10),('review_created',11)) s(name, step) USING (name)
ORDER BY step;
```

Etapas 1–5 usam `session_id` (app); 6–11 usam `order_id` (api). Para o funil por ordem estrito, usar `order_events`/`service_orders` (fonte transacional) e `analytics_events` só para 1–5.

### 3.2 Prestador

| Etapa | Evento | Métrica |
|---|---|---|
| 1 | `provider_online` | Horas online (soma de `sessionSeconds` em `provider_offline`) |
| 2 | `offer_received` | Ofertas por hora online |
| 3 | `offer_accepted` | Taxa de aceite = 3 / 2; tempo de resposta (`responseSeconds`) |
| 4 | `service_started` | Comparecimento = 4 / 3 |
| 5 | `service_completed` | Conclusão = 5 / 4; ganhos (`providerPayoutCents` via `ledger_entries`) |

```sql
SELECT provider_id,
  sum((name='offer_received')::int) ofertas,
  sum((name='offer_accepted')::int) aceites,
  sum((name='service_completed')::int) concluidas,
  avg((properties->>'responseSeconds')::float) FILTER (WHERE name IN ('offer_accepted','offer_rejected')) resp_s
FROM analytics_events WHERE occurred_at BETWEEN :from AND :to AND provider_id IS NOT NULL
GROUP BY provider_id;
```

## 4. `DashboardMetrics`

Janela `[periodStart, periodEnd)`; valores em centavos; percentuais 0–100 com uma casa; `null` quando o denominador é zero.

| Campo | Definição | SQL de referência |
|---|---|---|
| `gmvCents` | Σ `total_cents` de ordens com `completed_at` no período e status ∈ `COMPLETED, REVIEWED, CLOSED, DISPUTED` | `SELECT COALESCE(sum(total_cents),0) FROM service_orders WHERE completed_at >= :from AND completed_at < :to AND status IN ('COMPLETED','REVIEWED','CLOSED','DISPUTED')` |
| `orders` | Ordens criadas no período (exclui filhas de concierge) | `SELECT count(*) FROM service_orders WHERE created_at >= :from AND created_at < :to AND parent_order_id IS NULL` |
| `completedOrders` | Ordens concluídas no período | `... WHERE completed_at >= :from AND completed_at < :to AND status IN ('COMPLETED','REVIEWED','CLOSED','DISPUTED')` |
| `cancelledOrders` | Ordens canceladas no período (qualquer ator) | `... WHERE cancelled_at >= :from AND cancelled_at < :to AND status LIKE 'CANCELLED_%'` |
| `avgTicketCents` | `gmvCents / completedOrders` | `round(avg(total_cents))` sobre as concluídas |
| `takeRatePct` | `Σ platform_fee_cents / gmvCents × 100` | `100.0 * sum(platform_fee_cents) / NULLIF(sum(total_cents),0)` sobre as concluídas |
| `platformRevenueCents` | Σ `PLATFORM_FEE` − Σ `COUPON_COST` no ledger (receita líquida) | `SELECT sum(CASE kind WHEN 'PLATFORM_FEE' THEN amount_cents WHEN 'COUPON_COST' THEN -amount_cents END) FROM ledger_entries WHERE created_at >= :from AND created_at < :to AND direction = 'CREDIT' AND kind IN ('PLATFORM_FEE','COUPON_COST')` (ajustar sinal conforme conta) |
| `repeatRatePct` | Clientes com ≥ 2 ordens concluídas nos 90 dias até `periodEnd` / clientes com ≥ 1 | `WITH c AS (SELECT customer_id, count(*) n FROM service_orders WHERE completed_at >= :to - interval '90 days' AND completed_at < :to AND status IN (...) GROUP BY 1) SELECT 100.0 * sum((n>=2)::int) / NULLIF(count(*),0) FROM c` |
| `avgMatchingSeconds` | Média de `accepted_at − matching_started_at` das ordens aceitas no período | `SELECT avg(EXTRACT(epoch FROM accepted_at - matching_started_at)) FROM service_orders WHERE accepted_at >= :from AND accepted_at < :to AND matching_started_at IS NOT NULL` (p50/p90 com `percentile_cont`) |
| `avgArrivalSeconds` | Média `ARRIVED − ACCEPTED` para `IMMEDIATE` | `SELECT avg(EXTRACT(epoch FROM a.created_at - o.accepted_at)) FROM order_events a JOIN service_orders o ON o.id = a.order_id WHERE a.to_status = 'ARRIVED' AND o.workflow_kind = 'IMMEDIATE' AND a.created_at >= :from AND a.created_at < :to` |
| `avgRating` | Média de `reviews.rating` com `target_type = 'PROVIDER'` no período | `SELECT avg(rating) FROM reviews WHERE target_type='PROVIDER' AND hidden_at IS NULL AND created_at >= :from AND created_at < :to` |
| `noProviderRatePct` | Ordens criadas no período que passaram por `NO_PROVIDER_FOUND` / ordens criadas | `SELECT 100.0 * count(DISTINCT e.order_id) / NULLIF((SELECT count(*) FROM service_orders WHERE created_at >= :from AND created_at < :to),0) FROM order_events e JOIN service_orders o ON o.id=e.order_id WHERE e.to_status='NO_PROVIDER_FOUND' AND o.created_at >= :from AND o.created_at < :to` |
| `activeProviders` | Prestadores com ≥ 1 ordem concluída no período | `SELECT count(DISTINCT provider_id) FROM service_orders WHERE completed_at >= :from AND completed_at < :to AND status IN (...)` |
| `newCustomers` | Usuários com papel `customer` criados no período | `SELECT count(*) FROM users WHERE created_at >= :from AND created_at < :to AND roles ? 'customer'` |

Implementação sugerida (conforme contrato): view materializada `analytics_daily` por dia/região/categoria atualizada pelo job `analytics.rollup` 02:00; o dashboard soma os dias. Consultas acima são a definição canônica para validar a view.

## 5. Métricas operacionais

| Métrica | Definição | Fonte |
|---|---|---|
| Tempo de matching p50/p90 | `percentile_cont(0.5/0.9)` de `accepted_at − matching_started_at` | `service_orders` |
| Tempo até chegada p50 (IMMEDIATE) | `ARRIVED − ACCEPTED` | `order_events` |
| Pontualidade agendada | % de `ARRIVED` com `created_at ∈ [scheduled_for, scheduled_for + window_minutes]` | `order_events` + `service_orders` |
| Taxa sem prestador por região/categoria/hora | `no_provider_found` agrupado por `regionId`, categoria, `extract(hour)` | `analytics_events` |
| Ondas por ordem | `max(wave)+1` por ordem aceita | `dispatch_rounds` |
| Taxa de aceite por onda | aceitas/ofertadas por `wave` | `dispatch_offers` |
| Cancelamentos por ator e fase | `order_cancelled` por `by` × `fromStatus` | `analytics_events` ou `order_events(to_status LIKE 'CANCELLED_%')` com `from_status` |
| Cancelamento do prestador pós-aceite | `CANCELLED_BY_PROVIDER` eventos (`provider.cancel`) / aceites | `order_events` |
| Taxa de aprovação de orçamento adicional | `quote_approved(kind=ADDITIONAL)` / `quote_sent(kind=ADDITIONAL)` | `quotes` |
| Disputas / concluídas | `disputes` / concluídas | `disputes`, `service_orders` |
| Falhas de pagamento por código | `payment_failed` por `failureCode`/`methodKind` | `payment_intents` |
| PIX expirado e recuperado | intents `pix_expired` seguidas de `CAPTURED` na mesma ordem | `payment_intents` |
| Cobertura | prestadores `ONLINE` por hora × região (`provider_online/offline`) | `analytics_events` |
| Horas online por prestador | Σ `sessionSeconds` | `analytics_events` |
| Tempo de aprovação de prestador | `verified_at − created_at` (p50) | `providers` |
| Abertura de push | `notification_opened` / `notifications(status=SENT)` por `kind` | `analytics_events`, `notifications` |

```sql
-- cancelamentos por ator e fase, últimos 30 dias
SELECT properties->>'by' ator, properties->>'fromStatus' fase, count(*) n, avg((properties->>'feeCents')::int) taxa_media
FROM analytics_events WHERE name = 'order_cancelled' AND occurred_at > now() - interval '30 days'
GROUP BY 1,2 ORDER BY n DESC;
```

## 6. North Star e metas iniciais

**North Star: ordens concluídas com avaliação ≥ 4 por semana** (combina volume, execução e qualidade; exclui cancelamentos e disputas).

| Métrica | Mês 3 (MVP, 1 cidade) | Mês 9 (V1) | Fonte |
|---|---|---|---|
| North Star | 200 / semana | 1.500 / semana | `service_orders` + `reviews` |
| GMV mensal | R$ 150 mil | R$ 1 milhão | `gmvCents` |
| Ordens criadas / mês | 1.200 | 8.000 | `orders` |
| Taxa de conclusão | > 80 % | > 88 % | `completedOrders / orders` |
| Ticket médio | R$ 150 | R$ 170 | `avgTicketCents` |
| Take rate | 18–22 % | 18–22 % | `takeRatePct` |
| Repeat rate 90 d | > 35 % | > 45 % | `repeatRatePct` |
| Matching p50 / p90 | 3 / 10 min | 2 / 6 min | §5 |
| Chegada p50 (IMMEDIATE) | 45 min | 35 min | `avgArrivalSeconds` |
| `NO_PROVIDER_FOUND` | < 10 % | < 4 % | `noProviderRatePct` |
| Aceite onda 0 | > 30 % | > 40 % | `dispatch_offers` |
| Rating médio | > 4,6 | > 4,7 | `avgRating` |
| Disputas | < 2 % | < 1 % | §5 |
| Prestadores ativos / mês | 80 | 500 | `activeProviders` |

Guardrails (não podem piorar ao otimizar a North Star): cancelamento pelo prestador pós-aceite < 5 %, disputas < 2 %, `payment_failed` < 5 %, pontualidade agendada > 85 %.

## 7. Evolução

| Fase | Capacidade | Detalhe |
|---|---|---|
| MVP | Tabela única + SQL + dashboard `DashboardMetrics` | Suficiente para < 1 M eventos/mês |
| V1 | Rollup diário (`analytics_daily`) e particionamento mensal de `analytics_events` por `occurred_at` | Mantém consultas < 1 s |
| V1 | Export para warehouse por CDC (Postgres logical replication → BigQuery/ClickHouse via Debezium/Airbyte) das tabelas `analytics_events`, `service_orders`, `order_events`, `dispatch_rounds`, `dispatch_offers`, `payment_intents`, `ledger_entries`, `reviews` (sem `users` identificáveis: pseudonimizar `user_id` com HMAC no conector) | Fonte única para BI; `domain_events` como stream alternativo |
| V1 | Métricas por região/categoria/hora e coortes de retenção (semana de primeira ordem × semanas seguintes) | |
| V2 | Experimentação: `experiments(id, name, variants, allocation)` e `experiment_assignments(user_id, experiment_id, variant)` por hash determinístico de `user_id`; variante anexada como propriedade padrão `exp_<id>` em todos os eventos; análise de conversão por variante no warehouse; flags em `platform_settings` para liga/desliga | Testes de pesos de matching por categoria, textos de notificação, ordem das seções da home |
| V2 | Alertas automáticos sobre métricas (queda de aceite, alta de `payment_failed`) via job `analytics.watch` → `incidents` | |
| V3 | Modelos de previsão de demanda e aprendizado de pesos (12 §14) consumindo o warehouse | |
