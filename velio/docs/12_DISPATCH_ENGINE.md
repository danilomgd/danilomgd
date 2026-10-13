# 12 — Motor de Matching e Dispatch

Derivado de `packages/domain/src/matching/{score,waves}.ts` e `matching.test.ts`, `packages/domain/src/geo/distance.ts`, `packages/domain/src/policies/scheduling.ts`, `apps/api/src/modules/dispatch/{service,routes,index}.ts`, `apps/api/src/modules/providers/service.ts` (`findCandidates`, `ingestLocation`), `apps/api/src/modules/orders/service.ts` (`scheduleDispatch`, `columnPatch`, `providersWithBookingConflict`, `providersWhoServedCustomer`), `apps/api/src/modules/reputation/service.ts`, `apps/api/src/db/schema/dispatch.ts`, `apps/api/src/db/seed-data.ts` e das `WorkflowDefinition`. Cenários A (imediato, 4 prestadores, 3 ofertas) e B (agendado, matching 6 h antes) em `apps/api/test/scenarios` exercitam o fluxo.

## 1. Visão geral

```
POST /v1/requests ──► service_orders(REQUESTED|SCHEDULED) + job dispatch.start
                       run_at = now  |  scheduledMatchingStart(scheduledFor) = max(now, scheduledFor − 6h)
                       (PIX: só após webhook PAID → releaseForDispatch)
   ▼ job dispatch.start
system.start_matching ──► MATCHING (matching_started_at, dispatch_wave = 0) ──► efeito dispatch.start
   ▼ dispatch.start(orderId)   [loop até OFFER, ESCALATE ou FAIL]
findCandidates(bbox do raio da onda) ──► rankCandidates(weights) ──► planWave(waveIndex, ranked, waves, alreadyOffered)
   ├─ OFFER       → dispatch_rounds(wave n+1) + dispatch_offers + push offer_received + realtime offer.created
   │                job dispatch.wave_timeout(expiresAt) ; system.offer → OFFERED ; dispatch_wave = n+1
   ├─ NEXT_WAVE   → dispatch_rounds(outcome EMPTY) ; waveIndex++ ; repete imediatamente
   ├─ ESCALATE    → system.no_provider → NO_PROVIDER_FOUND ; incidents(NO_PROVIDER, HIGH) ; fila ops
   └─ FAIL        → idem (escalateToOps=false: ainda cai em system.no_provider)
   ▼ aceite (POST /v1/offers/:id/accept) — primeiro vence
provider.accept → ACCEPTED | DRIVER_ASSIGNED | UNDER_REVIEW ; demais ofertas WITHDRAWN ; rodada CLOSED/ACCEPTED
   ▼ timeout (job dispatch.wave_timeout) ou todas rejeitadas (reject antecipa)
ofertas PENDING → EXPIRED ; rodada EXPIRED ; system.wave_exhausted → MATCHING ; dispatch.start de novo
```

Princípios (ADR-006): sem prestador fixo; score configurável por categoria (`matching_configs`); toda decisão auditada (`dispatch_rounds.snapshot`, `dispatch_offers.score_breakdown`); humano como fallback explícito.

## 2. Entrada do matching

### 2.1 `MatchRequest` (`dispatch/service.ts: rankForOrder`)

| Campo | Origem |
|---|---|
| `location` | `service_orders.lat/lng` (ordem sem coordenadas → zero candidatos) |
| `scheduledFor` | `service_orders.scheduled_for`; `null` = imediato |
| `now` | `adapters.clock.now()` |
| `radiusKm` | `waves.waves[waveIndex].radiusKm` (ou o da última onda se o índice passar) |

### 2.2 `MatchCandidate` (`providers/service.ts: findCandidates`)

| Campo | Derivação implementada | Observação |
|---|---|---|
| Pré-filtro SQL | `providers INNER JOIN provider_skills ON category_id = :categoryId WHERE status = 'APPROVED' AND availability IN ('ONLINE','BUSY') AND last_lat BETWEEN bbox AND last_lng BETWEEN bbox` | `boundingBox(center, radiusKm)` do domínio. Só `last_*` (inicializado com a base no onboarding); não há exigência de ping recente |
| Exclusões | `metadata.excludedProviderIds` (quem cancelou após aceitar) e linhas sem `last_*` | `alreadyOffered` é aplicado depois, em `planWave` |
| `location` | `last_lat/last_lng` | |
| `availability`, `serviceRadiusKm` | colunas | |
| `qualification` | `provider_skills.level` (0,5 declarado; admin eleva a 0,8/1,0 **manualmente**, sem rota dedicada ainda) | |
| `ratingAvg`, `ratingCount`, `acceptanceRate`, `cancellationRate`, `avgResponseSeconds` | colunas de `providers`, mantidas por `reputation.recompute` | `acceptanceRate = offers_accepted / offers_received`; `cancellationRate = cancelled / max(offers_accepted, completed + cancelled)` |
| `hasScheduleConflict` | Só para agendados: `bookings` ativos (`released_at IS NULL`) sobrepondo `[scheduledFor, scheduledFor + estimatedDuration]` | `provider_schedules` e `provider_time_off` **não** entram ainda (previsto) |
| `servedCustomerBefore` | Existe `service_orders(provider_id, customer_id)` em `COMPLETED/REVIEWED/CLOSED` | Sem filtro por nota ≥ 4 (previsto) |
| `minutesSinceLastOrder` | `now − providers.last_order_completed_at` | `null` para novato |

## 3. Elegibilidade (`scoreCandidate`)

Avaliada nesta ordem; a primeira falha define `ineligibleReason` (gravado no `snapshot` da rodada):

| # | Condição | Motivo |
|---|---|---|
| 1 | `availability ∈ {OFFLINE, UNAVAILABLE}` | "Prestador indisponível" (na prática não chegam ao candidato: o SQL já filtra) |
| 2 | imediato e `BUSY` | "Prestador ocupado" (`BUSY` é elegível para agendado) |
| 3 | `distanceKm > min(radiusKm, serviceRadiusKm)` | "Fora do raio" |
| 4 | `hasScheduleConflict` | "Conflito de agenda" |
| 5 | `qualification ≤ 0` | "Sem qualificação para a categoria" |

Inelegíveis recebem score mesmo assim e vão para o fim do ranking: `Number(b.eligible) − Number(a.eligible) || b.score − a.score || a.distanceKm − b.distanceKm`.

## 4. `ProviderMatchScore`

### 4.1 Componentes (0..1 via `clamp01`)

| Componente | Fórmula (`score.ts`) | Leitura |
|---|---|---|
| `proximity` | `1 − distanceKm / max(radiusKm, 0.1)` | 1 no ponto, 0 na borda do raio da onda; o mesmo prestador ganha proximidade relativa em ondas maiores |
| `qualification` | `c.qualification` | `provider_skills.level` |
| `reputation` | `(bayesianRating(avg, count) − 3) / 2` | 3,0 → 0; 4,0 → 0,5; 5,0 → 1 |
| `availability` | `ONLINE → 1`; `BUSY` e agendado → `0.6`; senão `0` | |
| `compatibility` | `(servedCustomerBefore ? 0.5 : 0.2) + (minutesSinceLastOrder null ? 0.2 : clamp01(min/240)·0.3) + (avgResponseSeconds null ? 0.1 : clamp01(1 − s/120)·0.3)` | Histórico com o cliente; ociosidade (satura em 4 h, distribui demanda); rapidez (0 a partir de 120 s) |
| `acceptanceRate` | `null → 0.7`, senão o valor | Novato com benefício da dúvida |
| `cancellationPenalty` | `null → 0.9`, senão `1 − 4·cancellationRate` | 10 % → 0,6; ≥ 25 % → 0 |

### 4.2 Média bayesiana

`bayesianRating(avg, count, prior = 4.2, priorWeight = 5) = (avg·count + 4.2·5) / (count + 5)`; sem avaliações → 4,2.

| avg | count | bayes | reputation |
|---|---|---|---|
| — | 0 | 4,200 | 0,600 |
| 5,0 | 1 | 4,333 | 0,667 |
| 5,0 | 3 | 4,500 | 0,750 |
| 3,5 | 2 | 4,000 | 0,500 |
| 4,0 | 10 | 4,067 | 0,533 |
| 4,8 | 120 | 4,776 | 0,888 |
| 5,0 | 200 | 4,980 | 0,990 |

Testes: `bayesianRating(5,1) < 4.5`; `bayesianRating(5,200) > 4.95`; `bayesianRating(null,0) = 4.2`. `ratingAvg` do prestador é a média ponderada por recência (`recencyWeightedRating`: 50 mais recentes pesam 70 %).

### 4.3 Agregação e pesos padrão

`score = Σ(componente × peso) / Σ(pesos)`, 4 casas; `distanceKm` 2 casas. Normalizar pela soma permite pesos que não somam 1.

| Componente | `DEFAULT_WEIGHTS` = `seedMatchingWeights` | Participação |
|---|---|---|
| proximity | 0,30 | 27 % |
| reputation | 0,20 | 18 % |
| qualification | 0,15 | 14 % |
| availability | 0,15 | 14 % |
| compatibility | 0,10 | 9 % |
| acceptanceRate | 0,10 | 9 % |
| cancellationPenalty | 0,10 | 9 % |
| soma | 1,10 | |

### 4.4 Configuração por categoria (`matching_configs`, `configFor`)

Resolução em `dispatch/service.ts`: linha ativa com `category_id = categoria da ordem` → linha ativa com `category_id IS NULL` (seed) → `DEFAULT_WEIGHTS`/`DEFAULT_WAVES` do domínio. Lida a cada onda (sem cache), então `PUT /v1/admin/matching-configs` vale para a **próxima** onda de qualquer ordem; `DELETE` só desativa. `UpsertMatchingConfigInput` valida `MatchingWeights` (0..1 cada) e `WaveConfig` (1–6 ondas; `offerCount` 1–20; `timeoutSeconds` 15–900; `escalateToOps`; `minScore`).

Sugestões iniciais para calibrar com `score_breakdown` × `response`:

| Categoria | Ajuste | Motivo |
|---|---|---|
| `assistencia` (chaveiro, emergência) | proximity 0,45; availability 0,2; ondas 60/90/120 s | Urgência |
| `hidraulica`, `eletrica`, `ar-condicionado` | qualification 0,25; reputation 0,25 | Técnica e confiança |
| `lavanderia`, `entregas` | proximity 0,35; acceptanceRate 0,15 | Volume e aceite rápido |
| `automotivo` leva e traz | qualification 0,2; exigir `DRIVER_LICENSE` para `level ≥ 0,8` | Custódia de veículo |
| Categorias `SCHEDULED` em geral | `timeoutSeconds` 600/900/900 | Resposta pode ser lenta (02 §4.1); SLA de `MATCHING` é 6 h |

## 5. Ondas

### 5.1 `DEFAULT_WAVES` = `seedWaves`

| Índice (`planWave`) | `dispatch_rounds.wave` | Raio | Ofertas | Expiração | Acumulado |
|---|---|---|---|---|---|
| 0 | 1 | 5 km | 3 | 90 s | 90 s |
| 1 | 2 | 10 km | 5 | 120 s | 210 s |
| 2 | 3 | 20 km | 8 | 180 s | 390 s |

`escalateToOps = true`; `minScore = 0.2`. Pior caso até `NO_PROVIDER_FOUND`: 6,5 min, dentro do SLA de 600 s de `MATCHING`/`OFFERED` no `IMMEDIATE`. `service_orders.dispatch_wave` guarda o índice **da próxima onda** a tentar (0 antes da primeira; `n+1` após ofertar a onda `n`); `dispatch_rounds.wave` é 1-based.

### 5.2 `planWave` e o loop `start()` (`dispatch/service.ts`)

`start(orderId)` só age se `status ∈ {MATCHING, OFFERED}`. Começa em `waveIndex = dispatch_wave` e itera até `waves.length + 1` vezes:

| Resultado de `planWave` | Condição | O que `start()` faz |
|---|---|---|
| `OFFER { radiusKm, timeoutSeconds, providerIds }` | ≥ 1 candidato `eligible && score ≥ minScore && !alreadyOffered` (até `offerCount`) | `dispatch_rounds(wave = idx+1, radius_km, candidates_count = total do bbox, eligible_count, offered_count, expires_at = now + timeout, snapshot = { ranked: top 20 })`; para cada id: `dispatch_offers(score, distance_km, score_breakdown, expires_at)`, outbox `offer.created`, push `offer_received`; `reputation.recordOffers` (`offers_received++`); `dispatch_wave = idx+1`; job `dispatch.wave_timeout` (`dedupe wave_timeout:{roundId}`); se a ordem ainda está `MATCHING`, `system.offer` → `OFFERED`. **Retorna** |
| `NEXT_WAVE { waveIndex+1 }` | Nenhum candidato aproveitável e há próxima onda | `dispatch_rounds(wave = idx+1, outcome 'EMPTY', offered_count 0, ended_at)`; `dispatch_wave = idx+1`; **continua o loop sem esperar** |
| `ESCALATE_TO_OPS` / `FAIL` | Ondas esgotadas | `dispatch_wave = idx`; `system.no_provider` (`→ NO_PROVIDER_FOUND`, efeito `ops.alert:no_provider` → `incidents(NO_PROVIDER, HIGH)` + realtime `ops.order_needs_attention`, `no_provider_found`). Com `escalateToOps = false` o comportamento é o mesmo (não há cancelamento automático; o `FAIL` do domínio é tratado como escalonamento) |

`alreadyOffered` = todos os `provider_id` em `dispatch_offers` da ordem (qualquer resposta): ninguém recebe a mesma ordem duas vezes, nem em ondas maiores; `dispatch_offers_uq (order_id, provider_id, round_id)` garante dentro da rodada. Testes do domínio fixam: 3 ofertas na onda 0 excluindo `OFFLINE`; `alreadyOffered` completo → `NEXT_WAVE 1`; `planWave(3)` → `ESCALATE_TO_OPS`; `escalateToOps=false` → `FAIL`; `minScore = 0.99` → `NEXT_WAVE`.

### 5.3 Timeout e rejeição (`onWaveTimeout`, `rejectOffer`, `expireOffer`)

1. `dispatch.wave_timeout` roda em `expires_at`; se a rodada já tem `ended_at`, nada.
2. Se a ordem já tem `provider_id` ou saiu de `MATCHING/OFFERED`: rodada `outcome = ACCEPTED` (ou `CLOSED`) e pendentes → `WITHDRAWN` (realtime `offer.expired` sem push).
3. Caso contrário: pendentes → `EXPIRED` (+ push `offer_expired` + realtime), rodada `EXPIRED`, `system.wave_exhausted` (`OFFERED → MATCHING`) e `start()` de novo (próxima onda imediata, raio maior).
4. `POST /v1/offers/:id/reject`: oferta `REJECTED`; se não resta `PENDING` na rodada, chama `onWaveTimeout` na hora (o cliente não espera o relógio).
5. `offer.expire` (job por oferta individual): mesmo encadeamento; hoje nenhum fluxo agenda esse job (reservado).

Expiração conta como não-aceite em `acceptance_rate` (`offers_received` já foi incrementado na oferta, `offers_accepted` não) — a "recusa leve" de 02 §4.1. `WITHDRAWN` também pesa da mesma forma (não há distinção em `provider_stats`; melhoria prevista: não contar `WITHDRAWN` em `offers_received`).

### 5.4 `minScore`

Corte absoluto 0,2. Um prestador `ONLINE` a 0 km com qualificação 0,5, 25 % de cancelamento, 30 % de aceite e nota 3,0 ainda pontua ≈ 0,41; cair abaixo de 0,2 exige combinar borda do raio com reputação e comportamento no piso. Elevar `minScore` por categoria é a alavanca para categorias com acesso à residência.

## 6. Aceite concorrente (`acceptOffer`)

```
BEGIN
  SELECT oferta           → 404 | 403 "Oferta de outro prestador"
  response ≠ PENDING      → 409 "Oferta não está mais disponível" { response }
  expires_at < now        → 409 "Oferta expirada"
  ordem com provider_id ou status ∉ {MATCHING, OFFERED} → 409 "Pedido já foi aceito por outro prestador" { status }
  UPDATE dispatch_offers SET response='ACCEPTED', responded_at=now WHERE id=? AND response='PENDING'  → 0 linhas: 409
COMMIT
orders.transition(orderId, 'provider.accept', { provider, providerId }, { offerId })
  ├─ ok: columnPatch grava provider_id/accepted_at; UPDATE ... WHERE version=?  (0 linhas → 409 CONFLICT)
  └─ INVALID_TRANSITION: oferta volta a WITHDRAWN; 409 "Pedido não pode mais ser aceito"
reputation.recordOfferAccepted(providerId, responseSeconds)   → offers_accepted++, avg_response_seconds
```

Dois aceites simultâneos: o primeiro `UPDATE ... WHERE response='PENDING'` vence; o segundo vê `response = ACCEPTED` (409) ou, se correr antes do commit do primeiro, perde no `version` da ordem (409 `CONFLICT`). Cenário A verifica: p1 aceita (200, `ACCEPTED`, `providerId = p1`, `startPin = null` para o prestador), p2 recebe 409, as 2 ofertas restantes ficam `WITHDRAWN`, p1 vira `BUSY`.

Efeitos de `provider.accept` por workflow: IMMEDIATE/SCHEDULED/LOGISTICS/LAUNDRY → `dispatch.cancelOffers`, `payments.authorize`, `provider.setBusy`, `notify.customer:provider_found`, `chat.systemMessage`, `analytics.track(provider_accepted)`; SCHEDULED também `booking.scheduleReminders` (upsert de `bookings` com `provider_id`); QUOTE → sem autorização nem `BUSY` (análise pode ser remota). Payload `{ offerId }` fica em `order_events`.

## 7. Fallback para operador e dispatch manual

| Passo | Implementação |
|---|---|
| Fila | `GET /v1/ops/orders?attention=true` (`NO_PROVIDER_FOUND`, `NEEDS_HUMAN`, `DISPUTED`, agendados vencidos); SLAs de `NO_PROVIDER_FOUND`: 300 s IMMEDIATE, 900 s LOGISTICS, 3600 s SCHEDULED/QUOTE (`GET /v1/ops/slas` mede por `updated_at`) |
| Candidatos | `GET /v1/ops/orders/:id/candidates` = `rankCandidates` com o raio da **última onda configurada** (20 km no padrão) sobre `findCandidates` (APPROVED e ONLINE/BUSY) + `displayName`, `availability`, `alreadyOffered`, `location`. Prestadores `OFFLINE` **não aparecem** (contato fora do app depende da lista `GET /v1/admin/providers`; melhoria prevista: incluir offline com motivo) |
| Atribuição | `POST /v1/ops/orders/:id/assign { providerId, note }`: 422 se não `APPROVED`; `cancelOffers`; `operator.assign` com `payload { providerId, note }` → `ACCEPTED`/`DRIVER_ASSIGNED`/`UNDER_REVIEW` com os mesmos efeitos do aceite (inclui `payments.authorize`); `recordOffers([p])` + `recordOfferAccepted(p, 0)`; `audit_logs(ops.assign)`. Não cria `dispatch_rounds`/`dispatch_offers`; a atribuição manual é identificável por `order_events.action = 'operator.assign'` e `analytics_events(provider_matched)` (mapeamento de `operator.assign`) |
| Conflito de agenda | Não é verificado na atribuição manual (operador decide) |
| Alternativas | `POST /v1/ops/orders/:id/cancel` (reembolso integral) ou propor reagendamento pelo chat (operador é `sender_type = operator`) |
| Cliente | Rótulo "Buscando alternativa"; cancelamento gratuito (`customerCancellation` → "Sem prestador confirmado") |

## 8. Agendados (`SCHEDULED`)

| Regra | Implementação |
|---|---|
| Início do matching | `scheduleDispatch`: job `dispatch.start` em `scheduledMatchingStart(scheduledFor, now)` (6 h antes ou agora); cenário B verifica `run_at = startsAt − 6h` |
| Reserva e lembretes | `ensureBookingAndReminders` **na criação** (sem prestador): `bookings(provider_id null, starts_at, ends_at = + estimatedDuration)` e jobs `booking.remind` em `reminderTimes` (24 h e 1 h, só futuros). O lembrete de 24 h pode chegar ao cliente antes de haver prestador (cenário B); `booking.scheduleReminders` no aceite faz upsert com `provider_id` e `released_at = null` |
| `remind(hours)` | Marca `reminder_24h/1h_sent_at` uma vez; se a ordem está `ACCEPTED`, `system.remind` → `REMINDED` (efeitos notificam cliente e prestador); senão notifica só o cliente (`booking_reminder`). Idempotente |
| Elegibilidade | `BUSY` elegível (0,6); conflito via `bookings` do prestador na janela `[scheduledFor, + estimatedDuration]` |
| Cancelamento pelo prestador | `provider.cancel` → `MATCHING`, `provider_id = null`, `excludedProviderIds += p`, `dispatch.restart` (onda 0 de novo, sem o cancelado), `booking.release` não roda (só no cancelamento do cliente); o `bookings.provider_id` fica obsoleto até o próximo aceite (`onConflictDoUpdate` corrige) |
| Visitas de assinatura | `subscription.generate_visit` cria a ordem 7 dias antes (`VISIT_LEAD_DAYS`), às 09:00 ou 14:00 locais (`preferredPeriod`), `windowMinutes 120`, `coveredByPlan` (sem cobrança); matching segue a regra das 6 h |

## 9. Logística e lavanderia

| Aspecto | Regra |
|---|---|
| Ponto de matching | Coleta (`lat/lng`); destino não entra no raio |
| Aceite | `provider.accept` → `DRIVER_ASSIGNED`; SLA 1800 s até `provider.en_route` |
| Liberação intermediária | `provider.third_party_start` → `provider.setOnline` (motorista volta a ser candidato enquanto o terceiro executa; cenário D confirma `ONLINE`); `provider.return_pickup` → `provider.setBusy` |
| Retorno | Mesmo prestador; sem novo matching para a volta (previsto em V1 via `dispatch.restart` quando indisponível) |
| Custódia | Não afeta matching; `requiresCustody = config.requiresCustody \|\| LAUNDRY \|\| (LOGISTICS com veículo)`; scans em `EN_ROUTE_PICKUP`, `THIRD_PARTY_DONE`, `RETURNING` (passos exigidos pelos guards) |

## 10. Auditoria e calibração

| Tabela | Responde |
|---|---|
| `dispatch_rounds` | Ondas por ordem (`wave` 1-based), raio, funil `candidates_count → eligible_count → offered_count`, `outcome` (`EMPTY`, `EXPIRED`, `ACCEPTED`, `CLOSED`), duração, `snapshot.ranked` (top 20 com breakdown e `ineligibleReason`) |
| `dispatch_offers` | Score, distância, `score_breakdown` (7 componentes), `response`, tempo de resposta |
| `order_events` | `system.offer` com `{ roundId, wave, offered }`; `system.wave_exhausted` com `{ roundId, wave }`; `system.no_provider` com `{ reason, wavesTried }`; `provider.accept` com `{ offerId }`; `operator.assign` com `{ providerId, note }` |

```sql
-- taxa de aceite por onda (30 dias)
SELECT r.wave, count(*) ofertas, sum((o.response='ACCEPTED')::int) aceitas,
       round(100.0*sum((o.response='ACCEPTED')::int)/count(*),1) pct
FROM dispatch_offers o JOIN dispatch_rounds r ON r.id = o.round_id
WHERE o.offered_at > now() - interval '30 days' GROUP BY r.wave ORDER BY r.wave;

-- qual componente separa aceitos de expirados
SELECT response,
       avg((score_breakdown->>'proximity')::float) prox,
       avg((score_breakdown->>'reputation')::float) rep,
       avg((score_breakdown->>'acceptanceRate')::float) acc
FROM dispatch_offers WHERE offered_at > now() - interval '30 days' GROUP BY response;

-- funil de ondas vazias por região (buracos de cobertura)
SELECT o.region_id, count(*) FILTER (WHERE r.outcome='EMPTY') vazias, count(*) total
FROM dispatch_rounds r JOIN service_orders o ON o.id = r.order_id
WHERE r.started_at > now() - interval '7 days' GROUP BY o.region_id;
```

## 11. Métricas de saúde

| Métrica | Definição | Alvo MVP | Fonte |
|---|---|---|---|
| Tempo de matching p50/p90 | `accepted_at − matching_started_at` | 3 / 10 min | `service_orders` |
| Taxa de aceite onda 1 | aceitas / ofertadas em `wave = 1` | > 30 % | `dispatch_offers` + `dispatch_rounds` |
| Ondas por ordem aceita | média de `max(wave)` | ≤ 1,6 | `dispatch_rounds` |
| Taxa `NO_PROVIDER_FOUND` | ordens com evento `to_status = NO_PROVIDER_FOUND` / criadas | < 10 % | `order_events` |
| Tempo na fila ops | `accepted_at − evento NO_PROVIDER_FOUND` | < 5 min | `order_events` |
| Tempo de resposta p50 | `responded_at − offered_at` | < 30 s | `dispatch_offers` |
| Cancelamento pós-aceite do prestador | `provider.cancel` / aceites | < 5 % | `order_events` |
| `eligible_count` médio na onda 1 | densidade | ≥ 4 | `dispatch_rounds` |
| Dispersão de demanda | Gini de ordens por prestador ativo | < 0,5 | `service_orders` |

Alertas: `NO_PROVIDER_FOUND` > 10 min sem `operator.assign`; 3 ordens seguidas com `outcome = EMPTY` em todas as ondas na mesma região; `dispatch.wave_timeout` atrasado > 30 s (15 §10).

## 12. Exemplo numérico

Pedido `IMMEDIATE` em Vila Madalena (−23,5563; −46,6889), onda índice 0 (raio 5 km), pesos padrão. Valores calculados com `scoreCandidate` real.

### 12.1 Candidatos

| Prestador | Posição | Dist. | Disp. | Qualif. | Nota (n) | Aceite | Cancel. | Resp. | Já atendeu | Ocioso |
|---|---|---|---|---|---|---|---|---|---|---|
| Carlos | −23,5620; −46,6950 | 0,89 km | ONLINE | 0,8 | 4,8 (120) | 0,85 | 0,02 | 25 s | sim | 90 min |
| Joana | −23,5500; −46,6800 | 1,15 km | ONLINE | 0,5 | 5,0 (3) | — | — | — | não | — |
| Rui | −23,5800; −46,7100 | 3,40 km | ONLINE | 1,0 | 4,1 (60) | 0,60 | 0,15 | 70 s | não | 10 min |
| Marta | −23,5570; −46,6900 | 0,14 km | BUSY | 0,8 | 4,9 (200) | 0,90 | 0,01 | 20 s | não | 30 min |

### 12.2 Componentes

| Componente | Carlos | Joana | Rui | Marta |
|---|---|---|---|---|
| proximity = 1 − d/5 | 0,822 | 0,771 | 0,320 | 0,973 |
| qualification | 0,800 | 0,500 | 1,000 | 0,800 |
| bayes | (4,8·120+21)/125 = 4,776 | (15+21)/8 = 4,500 | (246+21)/65 = 4,108 | 4,883 |
| reputation | 0,888 | 0,750 | 0,554 | 0,941 |
| availability | 1,0 | 1,0 | 1,0 | 0 (BUSY, imediato) |
| compatibility | 0,5 + 0,1125 + 0,2375 = 0,850 | 0,2 + 0,2 + 0,1 = 0,500 | 0,2 + 0,0125 + 0,125 = 0,338 | 0,488 |
| acceptanceRate | 0,850 | 0,700 (prior) | 0,600 | 0,900 |
| cancellationPenalty | 0,920 | 0,900 (prior) | 0,400 | 0,960 |

### 12.3 Agregação (÷ 1,10)

| Prestador | Soma ponderada | Score | Elegível |
|---|---|---|---|
| Carlos | 0,9563 | **0,8694** | sim |
| Joana | 0,8162 | **0,7420** | sim |
| Rui | 0,6404 | **0,5822** | sim |
| Marta | 0,8349 | 0,7590 | não ("Prestador ocupado") |

`rankCandidates` → Carlos, Joana, Rui, Marta (inelegível por último). `planWave(0)` → `OFFER { radiusKm 5, timeoutSeconds 90, providerIds [Carlos, Joana, Rui] }`. `dispatch_rounds(wave 1, candidates_count 4, eligible_count 3, offered_count 3)`. Marta aparece em `snapshot.ranked` com o motivo e na tela de candidatos de ops.

Leituras: Carlos lidera por reputação consolidada e histórico com o cliente; Joana, novata, recebe os priors (0,7 / 0,9 / nota puxada de 5,0 para 4,5) e ainda entra; Rui é o mais qualificado, mas 15 % de cancelamento derruba `cancellationPenalty` a 0,4 e 3,4 km custam 0,68 de proximidade. Na onda de 10 km, a `proximity` de Rui subiria a 0,660 e o score a 0,6750.

### 12.4 Repasse se Carlos concluir (preço R$ 110,00 com cupom R$ 11,00)

`settle(11000, 1100, { 2000 bps, mín 500 })` → cobrado 9900; comissão 2200; repasse **8800**; líquido da plataforma 1100. A prévia na oferta mostra `providerPayoutCents = round(11000 × 0,8) = 8800` (coincide com a regra padrão; com regra de 15 % a prévia divergiria — ver §13).

## 13. Divergências e antipadrões

| Antipadrão evitado | Como |
|---|---|
| Broadcast para toda a cidade | Ondas 3/5/8 por raio crescente e score |
| Repetir prestador entre ondas | `alreadyOffered` + `dispatch_offers_uq` + `excludedProviderIds` |
| Média aritmética de notas | Bayesiana com prior 4,2 e peso 5 |
| Pesos no código | `matching_configs` lido a cada onda |
| Oferta sem relógio | `expires_at` em oferta e rodada; expiração = recusa leve |
| Aceite sem transação | `UPDATE ... WHERE response='PENDING'` + `version` da ordem |
| Decisão opaca | `score_breakdown` + `snapshot.ranked` |
| Sem fallback humano | `NO_PROVIDER_FOUND` + fila + `operator.assign` |
| Endereço na oferta | `approxLocation` (bairro, 3 casas decimais) |

Divergências entre implementação e intenção (a resolver):

| # | Item | Hoje | Alvo |
|---|---|---|---|
| 1 | `providerPayoutCents` na oferta | `round(total × 0.8)` fixo | `settle(total, discount, pickRule(categoria, região))` |
| 2 | Conflito de agenda | só `bookings` | + `provider_schedules` e `provider_time_off` |
| 3 | `servedCustomerBefore` | qualquer ordem concluída | só com `reviews.rating ≥ 4` |
| 4 | Candidatos de ops | só ONLINE/BUSY | incluir OFFLINE/em conflito com motivo, telefone mascarado |
| 5 | `WITHDRAWN` em `acceptance_rate` | conta como não-aceite | excluir de `offers_received` |
| 6 | `escalateToOps = false` | mesmo caminho de escalonamento | cancelar pela plataforma com reembolso, como o domínio sugere |
| 7 | Frescor da posição | qualquer `last_*` | exigir `last_location_at` recente para ONLINE (ex.: 15 min) |
| 8 | Dispatch manual | sem `dispatch_rounds`/`dispatch_offers` | registrar rodada manual para métricas |

## 14. Evolução

| Fase | Capacidade | Base existente |
|---|---|---|
| V1 | Surge por região/hora (`surge_multiplier_bps` já aplicado por `estimatePrice`; falta o job que o ajuste a partir de `eligible_count`) | `service_price_rules`, `dispatch_rounds` |
| V1 | Taxa de deslocamento (piso + km) fora da comissão | `distance_km` em `dispatch_offers` |
| V1 | Níveis de prestador com prioridade na onda 1 | `provider_stats` |
| V1 | PostGIS (`ST_DWithin`, polígonos) | pré-filtro isolado em `findCandidates` |
| V1 | Timeouts por `workflowKind` em `matching_configs` | `WaveConfig` parametrizado |
| V2 | Previsão de demanda e posicionamento sugerido | `analytics_events`, `provider_locations` |
| V3 | Aprendizado dos pesos revisado por humano | `score_breakdown` × `response` |
