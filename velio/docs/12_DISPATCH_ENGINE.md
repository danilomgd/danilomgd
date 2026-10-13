# 12 — Motor de Matching e Dispatch

Derivado de `packages/domain/src/matching/score.ts`, `packages/domain/src/matching/waves.ts`, `packages/domain/src/matching/matching.test.ts`, `packages/domain/src/geo/distance.ts`, `packages/domain/src/policies/scheduling.ts`, `apps/api/src/db/schema/dispatch.ts`, `apps/api/src/db/seed-data.ts` e das `WorkflowDefinition` em `packages/domain/src/workflow/definitions/*`. O módulo `apps/api/src/modules/dispatch` ainda está em implementação; os passos marcados **(conforme contrato)** descrevem o comportamento esperado da orquestração a partir do domínio puro já existente e testado.

## 1. Visão geral

```
service_orders(REQUESTED | SCHEDULED)
   │  job dispatch.start (now | scheduledMatchingStart)
   ▼
system.start_matching ──► MATCHING ──► candidatos (SQL bbox) ──► rankCandidates (domínio)
                                                                      │
                                       planWave(waveIndex, ranked, config, alreadyOffered)
                                                                      │
          ┌──────────────────────┬──────────────────────┬─────────────┴───────────┐
          ▼                      ▼                      ▼                         ▼
     OFFER                  NEXT_WAVE             ESCALATE_TO_OPS                FAIL
dispatch_rounds +        wave++ (sem oferta)    system.no_provider           (escalateToOps=false)
dispatch_offers          recalcula raio         NO_PROVIDER_FOUND           CANCELLED_BY_PLATFORM
system.offer → OFFERED                           ops.alert:no_provider
job dispatch.wave_timeout(T)                     fila ops → operator.assign
          │
   provider.accept (primeiro vence) ──► ACCEPTED / DRIVER_ASSIGNED / UNDER_REVIEW
   demais ofertas → WITHDRAWN; onda outcome=ACCEPTED
          │ timeout sem aceite
   system.wave_exhausted → MATCHING, wave++ → volta a planWave
```

Princípios (ADR-006): nenhum prestador fixo; a plataforma escolhe por score; toda decisão fica registrada (`dispatch_rounds`, `dispatch_offers.score_breakdown`); pesos e ondas são dados (`matching_configs`), nunca código; humano é fallback explícito (`NO_PROVIDER_FOUND`).

## 2. Entrada do matching

### 2.1 `MatchRequest`

| Campo | Origem | Observação |
|---|---|---|
| `location` | `service_orders.lat/lng` | Para `LOGISTICS`/`LAUNDRY` é o ponto de coleta |
| `scheduledFor` | `service_orders.scheduled_for` | `null` = imediato; muda elegibilidade de `BUSY` e a `availability` |
| `now` | `adapters.clock.now()` | `FakeClock` nos testes |
| `radiusKm` | `waveRadius(waveIndex, config)` | Raio da onda corrente; normaliza `proximity` |

### 2.2 `MatchCandidate` (montado pela API a partir de `providers`, `provider_skills`, `provider_stats`, `bookings`, `reviews`)

| Campo | Fonte | Regra de derivação (conforme contrato) |
|---|---|---|
| `providerId` | `providers.id` | |
| `location` | `providers.last_lat/last_lng` se `last_location_at > now − 15 min`, senão `base_lat/base_lng` | Prestador sem posição recente e sem base é descartado antes do score |
| `availability` | `providers.availability` | Só `status = APPROVED` chegam ao candidato |
| `serviceRadiusKm` | `providers.service_radius_km` | |
| `qualification` | `provider_skills.level` para `service_orders.category_id` (0 se não houver linha) | 0,5 declarado; 0,8 verificado; 1,0 certificado |
| `ratingAvg`, `ratingCount` | `providers.rating_avg`, `rating_count` | Média ponderada por recência (`recencyWeightedRating`) |
| `acceptanceRate` | `provider_stats.offers_accepted / offers_received` | `null` sem histórico |
| `cancellationRate` | `provider_stats.cancelled_count / (completed + cancelled)` | `null` sem histórico |
| `avgResponseSeconds` | `provider_stats.avg_response_seconds` | Média de `dispatch_offers.responded_at − offered_at` |
| `hasScheduleConflict` | `bookings` do prestador sobrepondo `[scheduledFor, scheduledFor + duração]` OU fora de `provider_schedules` OU dentro de `provider_time_off` | Para imediato: ordem ativa em estado `providerBusy` ou booking nas próximas 2 h |
| `servedCustomerBefore` | existe `service_orders(provider_id, customer_id, status ∈ COMPLETED/REVIEWED/CLOSED)` com `reviews.rating ≥ 4` | Favorece recorrência com quem já agradou |
| `minutesSinceLastOrder` | `now − providers.last_order_completed_at` | `null` para prestador novo |

### 2.3 Pré-filtro SQL (sem PostGIS, ADR-004)

```sql
-- boundingBox(center, radiusKm) do domínio: dLat = r/110.574; dLng = r/(111.32·cos(lat))
SELECT p.*, s.level, st.*
FROM providers p
JOIN provider_skills s ON s.provider_id = p.id AND s.category_id = :categoryId
LEFT JOIN provider_stats st ON st.provider_id = p.id
WHERE p.status = 'APPROVED'
  AND p.availability IN ('ONLINE', 'BUSY')
  AND COALESCE(p.last_lat, p.base_lat) BETWEEN :minLat AND :maxLat
  AND COALESCE(p.last_lng, p.base_lng) BETWEEN :minLng AND :maxLng
  AND p.id NOT IN (SELECT provider_id FROM dispatch_offers WHERE order_id = :orderId);  -- alreadyOffered
```

Índices usados: `providers_availability_idx (availability, status)`, `providers_location_idx (last_lat, last_lng)`, `provider_skills_category_idx`. A caixa é maior que o círculo; `scoreCandidate` descarta quem ficou fora do raio real (Haversine).

## 3. Elegibilidade

`scoreCandidate` avalia as condições nesta ordem e para na primeira falha (`ineligibleReason` em pt-BR, gravado em `dispatch_rounds.snapshot` para auditoria):

| Ordem | Condição | Motivo | Observação |
|---|---|---|---|
| 1 | `availability ∈ {OFFLINE, UNAVAILABLE}` | "Prestador indisponível" | |
| 2 | imediato e `availability = BUSY` | "Prestador ocupado" | `BUSY` **é elegível para agendado** (vai terminar antes) |
| 3 | `distanceKm > min(req.radiusKm, c.serviceRadiusKm)` | "Fora do raio" | O menor entre o raio da onda e o raio que o prestador aceita |
| 4 | `hasScheduleConflict` | "Conflito de agenda" | |
| 5 | `qualification ≤ 0` | "Sem qualificação para a categoria" | |

Inelegíveis **ainda recebem score** (para o painel de candidatos de ops) mas `rankCandidates` os ordena depois de todos os elegíveis: `Number(b.eligible) − Number(a.eligible) || b.score − a.score || a.distanceKm − b.distanceKm`.

## 4. `ProviderMatchScore`

### 4.1 Componentes (todos em 0..1 após `clamp01`)

| Componente | Fórmula exata (`score.ts`) | Faixa e leitura |
|---|---|---|
| `proximity` | `clamp01(1 − distanceKm / max(radiusKm, 0.1))` | 1 no ponto; 0 na borda do raio da onda. Como o raio cresce por onda, o mesmo prestador ganha proximidade relativa na onda seguinte |
| `qualification` | `clamp01(c.qualification)` | `provider_skills.level` |
| `reputation` | `clamp01((bayesianRating(avg, count) − 3) / 2)` | 3,0 → 0; 4,0 → 0,5; 5,0 → 1. Notas abaixo de 3 zeram |
| `availability` | `ONLINE → 1`; `BUSY e agendado → 0.6`; caso contrário `0` | Para imediato, `BUSY` já foi reprovado na elegibilidade |
| `compatibility` | `clamp01( (servedCustomerBefore ? 0.5 : 0.2) + (minutesSinceLastOrder === null ? 0.2 : clamp01(min/240)·0.3) + (avgResponseSeconds === null ? 0.1 : clamp01(1 − s/120)·0.3) )` | Três parcelas: histórico com o cliente (0,2/0,5), tempo ocioso (0..0,3; satura em 4 h — distribui demanda), rapidez de resposta (0..0,3; zero a partir de 120 s). Máximo 1,1 antes do clamp |
| `acceptanceRate` | `acceptanceRate === null ? 0.7 : clamp01(acceptanceRate)` | Novato recebe 0,7 (benefício da dúvida) |
| `cancellationPenalty` | `cancellationRate === null ? 0.9 : clamp01(1 − cancellationRate·4)` | 0 % → 1; 10 % → 0,6; ≥ 25 % → 0. Novato 0,9 |

### 4.2 Média bayesiana

`bayesianRating(avg, count, prior = 4.2, priorWeight = 5) = (avg·count + 4.2·5) / (count + 5)`; `null`/0 avaliações → 4,2.

| avg | count | resultado | reputation |
|---|---|---|---|
| — | 0 | 4,200 | 0,600 |
| 5,0 | 1 | 4,333 | 0,667 |
| 5,0 | 3 | 4,500 | 0,750 |
| 3,5 | 2 | 4,000 | 0,500 |
| 4,0 | 10 | 4,067 | 0,533 |
| 4,8 | 120 | 4,776 | 0,888 |
| 5,0 | 200 | 4,980 | 0,990 |

Efeito: um prestador com uma única nota 5 não supera um veterano 4,8; um veterano 4,1 (60 avaliações) fica em 4,108 e perde reputação para o novato sem notas (4,2). Teste: `bayesianRating(5,1) < 4.5`, `bayesianRating(5,200) > 4.95`, `bayesianRating(null,0) = 4.2`.

### 4.3 Agregação

```
score = Σ(componente_i × peso_i) / Σ(peso_i)        arredondado a 4 casas
```

Normalizar pela soma dos pesos permite ao admin salvar pesos que não somam 1 sem distorcer a escala. `distanceKm` é arredondado a 2 casas.

### 4.4 Pesos padrão (`DEFAULT_WEIGHTS` = `seedMatchingWeights`)

| Componente | Peso | Soma acumulada |
|---|---|---|
| proximity | 0,30 | 0,30 |
| reputation | 0,20 | 0,50 |
| qualification | 0,15 | 0,65 |
| availability | 0,15 | 0,80 |
| compatibility | 0,10 | 0,90 |
| acceptanceRate | 0,10 | 1,00 |
| cancellationPenalty | 0,10 | 1,10 |

Soma 1,10 (dividida na agregação). Interpretação: distância pesa 27 %, reputação 18 %, qualificação e disponibilidade 14 % cada, os três comportamentais 9 % cada.

### 4.5 Configuração por categoria (`matching_configs`)

| Coluna | Uso |
|---|---|
| `category_id = NULL` | Configuração global (seed) |
| `category_id = X` | Sobrepõe para a categoria; `matching_configs_category_uq` garante uma por categoria |
| `weights` | `MatchingWeights` (Zod: cada um 0..1) |
| `waves` | `WaveConfig` (1..6 ondas; `offerCount` 1..20; `timeoutSeconds` 15..900; `escalateToOps`; `minScore` 0..1, padrão 0,2) |
| `active` | Inativa cai para a global; sem global cai para `DEFAULT_WEIGHTS`/`DEFAULT_WAVES` do domínio |

Resolução: categoria → global → padrão de código. Toda alteração via `PUT /v1/admin/matching-configs` grava `audit_logs` e vale para a **próxima onda** de ordens em andamento (o snapshot da onda corrente registra os pesos usados).

Sugestões iniciais por categoria (a calibrar com `dispatch_offers.score_breakdown` e taxa de aceite):

| Categoria | Ajuste sugerido | Motivo |
|---|---|---|
| `assistencia` (chaveiro, emergências) | proximity 0,45, availability 0,2 | Urgência; quem está perto resolve |
| `ar-condicionado`, `eletrica`, `hidraulica` | qualification 0,25, reputation 0,25 | Técnica e confiança importam mais que 2 km |
| `lavanderia`, `entregas` | proximity 0,35, acceptanceRate 0,15 | Alto volume, baixo ticket, margem depende de aceite rápido |
| `automotivo` leva e traz | qualification 0,2 (exige `DRIVER_LICENSE` verificado) | Custódia de veículo |

## 5. Ondas (`waves.ts`)

### 5.1 `DEFAULT_WAVES` (= `seedWaves`)

| Onda | Raio | Ofertas simultâneas | Expiração | Acumulado máximo |
|---|---|---|---|---|
| 0 | 5 km | 3 | 90 s | 90 s |
| 1 | 10 km | 5 | 120 s | 210 s |
| 2 | 20 km | 8 | 180 s | 390 s |

`escalateToOps = true`; `minScore = 0.2`. Pior caso até `NO_PROVIDER_FOUND`: 6,5 min, dentro do SLA de 600 s de `MATCHING`/`OFFERED` no `IMMEDIATE`. Para `SCHEDULED` (SLA 6 h) e `QUOTE` (SLA 1 h) o admin deve configurar ondas com `timeoutSeconds` maiores (ex.: 600/900/900) via `matching_configs` por categoria, já que ofertas de agendado toleram resposta mais lenta (02 §4.1: 5–15 min).

### 5.2 `planWave(waveIndex, ranked, config, alreadyOffered)` — quatro resultados

| Resultado | Condição | Ação da API (conforme contrato) |
|---|---|---|
| `OFFER { waveIndex, radiusKm, timeoutSeconds, providerIds }` | Há ≥ 1 candidato `eligible && score ≥ minScore && !alreadyOffered` | Cria `dispatch_rounds(wave, radius_km, candidates_count, eligible_count, offered_count, expires_at = now + timeout, snapshot)` e um `dispatch_offers` por `providerId` (`score`, `distance_km`, `score_breakdown`, `expires_at`); `system.offer` (`MATCHING → OFFERED`); push `offer_received` + realtime `offer.created`; agenda `dispatch.wave_timeout` (dedupe `wave:{orderId}:{wave}`); `service_orders.dispatch_wave = wave` |
| `NEXT_WAVE { waveIndex+1, reason }` | Nenhum candidato elegível nesta onda e existe próxima | Registra `dispatch_rounds(outcome='NEXT_WAVE', offered_count=0)`; recalcula candidatos com `waveRadius(waveIndex+1)` **imediatamente** (sem esperar timeout) e chama `planWave` de novo |
| `ESCALATE_TO_OPS { reason }` | Ondas esgotadas (ou nenhuma com candidato) e `escalateToOps = true` | `system.no_provider` (`→ NO_PROVIDER_FOUND`), efeito `ops.alert:no_provider` → `incidents(NO_PROVIDER)` + realtime `ops.order_needs_attention`; `analytics.track(no_provider_found)`; cliente vê "Nossa equipe está encontrando um profissional para você" |
| `FAIL { reason }` | Idem com `escalateToOps = false` | `operator.cancel` pelo sistema → `CANCELLED_BY_PLATFORM`, reembolso integral, notificação com sugestão de agendar |

Testes que fixam o comportamento: primeira onda oferta aos 3 melhores elegíveis e exclui `OFFLINE`; `alreadyOffered` com todos → `NEXT_WAVE` 1; `planWave(3, ...)` → `ESCALATE_TO_OPS`; `escalateToOps=false` e sem ninguém → `FAIL`; `minScore = 0.99` → `NEXT_WAVE`.

### 5.3 Ciclo de uma onda com ofertas

1. `dispatch.wave_timeout` dispara em `expires_at`. Se a ordem já saiu de `OFFERED` (aceite ou cancelamento), o job termina sem efeito.
2. Ofertas `PENDING` da onda → `EXPIRED` (`responded_at = now`), realtime `offer.expired`, `analytics.track(offer_expired)`; `provider_stats.offers_received` já contou na criação, então a expiração reduz `acceptance_rate` (não-resposta = recusa leve, 02 §4.1).
3. `dispatch_rounds.outcome = 'EXPIRED'`, `ended_at`.
4. `system.wave_exhausted` (`OFFERED → MATCHING`), `dispatch_wave++`.
5. `alreadyOffered` = todos os `provider_id` em `dispatch_offers` da ordem (qualquer resposta): o mesmo prestador **nunca** recebe a mesma ordem duas vezes, mesmo em raio maior (`dispatch_offers_uq` garante dentro da onda; o conjunto garante entre ondas).
6. Volta ao passo `planWave`.

Rejeição explícita (`POST /v1/offers/:id/reject`): marca `REJECTED`; se não restar `PENDING` na onda, a API antecipa o passo 1 (não faz o cliente esperar o relógio).

### 5.4 `minScore`

Corte absoluto 0,2 evita ofertar a quem só está "disponível e perto" com histórico ruim: um prestador `ONLINE` a 0 km com qualificação 0,5, 25 % de cancelamento, 30 % de aceite e nota 3,0 pontua ≈ 0,41; para cair abaixo de 0,2 é preciso combinar borda do raio com reputação e comportamento no piso. Elevar `minScore` por categoria é a alavanca para categorias de risco (acesso à residência).

## 6. Aceite concorrente

Duas ofertas da mesma onda podem ser aceitas no mesmo segundo. Regra: **o primeiro commit vence; os demais recebem 409**.

```sql
-- dentro da transação de POST /v1/offers/:id/accept (conforme contrato)
UPDATE dispatch_offers SET response = 'ACCEPTED', responded_at = now()
 WHERE id = :offerId AND provider_id = :providerId AND response = 'PENDING' AND expires_at > now()
RETURNING order_id;                                  -- 0 linhas → 409 OFFER_UNAVAILABLE
SELECT * FROM service_orders WHERE id = :orderId FOR UPDATE;
-- applyTransition(def, snapshot, 'provider.accept', { type:'provider', providerId }) → ok ou 409 INVALID_TRANSITION
UPDATE service_orders SET status = :to, provider_id = :providerId, accepted_at = now(), version = version + 1
 WHERE id = :orderId AND version = :version;         -- 0 linhas → 409 CONFLICT (outro aceite ganhou)
UPDATE dispatch_offers SET response = 'WITHDRAWN', responded_at = now()
 WHERE order_id = :orderId AND response = 'PENDING';
UPDATE dispatch_rounds SET outcome = 'ACCEPTED', ended_at = now() WHERE order_id = :orderId AND wave = :wave;
```

O segundo prestador vê no app "Esta oferta já foi aceita por outro profissional" e a oferta some da lista (`offer.expired` reaproveitado com `reason` no payload em V1). `WITHDRAWN` não conta como recusa em `provider_stats`.

Efeitos da transição `provider.accept` (da definição): `dispatch.cancelOffers`, `payments.authorize`, `provider.setBusy`, `notify.customer:provider_found`, `chat.systemMessage`, `analytics.track(provider_accepted / offer_accepted)`; no `SCHEDULED` também `booking.scheduleReminders`; no `QUOTE` **não** há `payments.authorize` (só após orçamento aprovado) nem `provider.setBusy` (análise pode ser remota).

## 7. Fallback para operador e dispatch manual

| Passo | Detalhe |
|---|---|
| Fila | `GET /v1/ops/orders?attention=true` lista `NO_PROVIDER_FOUND` ordenadas por `matching_started_at`; SLA do estado: 300 s (IMMEDIATE), 900 s (LOGISTICS), 3600 s (SCHEDULED/QUOTE) → `incidents(SLA_BREACH)` se estourar |
| Candidatos | `GET /v1/ops/orders/:id/candidates`: `rankCandidates` com raio = último raio × 2, **incluindo inelegíveis** com `ineligibleReason`, telefone mascarado e última posição; o operador liga para quem está `OFFLINE` ou `BUSY` |
| Atribuição | `POST /v1/ops/orders/:id/assign { providerId, note }` → `operator.assign` (`NO_PROVIDER_FOUND\|MATCHING\|OFFERED → ACCEPTED/DRIVER_ASSIGNED/UNDER_REVIEW`) com os mesmos efeitos do aceite; cria `dispatch_rounds(wave = −1, snapshot.manual = true)` e `dispatch_offers(response='ACCEPTED', score = 0, score_breakdown = {})` para que métricas de aceite distingam manual de automático; `audit_logs(ops.order.assign)` |
| Alternativas | Propor novo horário ao cliente (chat da ordem, `operator` é participante) e recriar como `SCHEDULED`; ou `POST /v1/ops/orders/:id/cancel` com reembolso integral |
| Cliente | Status `NO_PROVIDER_FOUND` tem rótulo "Buscando alternativa"; cancelamento continua gratuito (`customerCancellation` → "Sem prestador confirmado") |

Enquanto a densidade de prestadores for baixa, esse caminho é parte do fluxo normal, não exceção (02 §4.10).

## 8. Agendados (`SCHEDULED`)

| Regra | Implementação |
|---|---|
| Início do matching | `scheduledMatchingStart(scheduledFor, now)`: `scheduledFor − 6 h`, ou `now` se faltar menos de 6 h; job `dispatch.start` com `run_at` nesse instante (dedupe `dispatch.start:{orderId}`) |
| Elegibilidade | `BUSY` elegível (`availability = 0.6`); `hasScheduleConflict` olha `bookings` + `provider_schedules` + `provider_time_off` na janela `[startsAt, startsAt + windowMinutes + estimatedDuration]` |
| Ondas | SLA de `MATCHING`/`OFFERED` = 6 h; recomenda-se `matching_configs` com timeouts de 10–15 min por onda para agendados (configuração, não código) |
| Aceite | Cria `bookings(order_id, provider_id, starts_at, ends_at)` e agenda `booking.reminder` em `reminderTimes` (24 h e 1 h antes, só os futuros; dedupe `reminder:{orderId}:24h|1h`) → `system.remind` (`ACCEPTED → REMINDED`, idempotente) |
| Cancelamento pelo prestador | `provider.cancel` → `MATCHING` com `reputation.penalizeProviderCancel`, `booking.release`, `dispatch.restart`; se faltar < 6 h, o novo `dispatch.start` é imediato |
| Visitas de assinatura | `subscription.generate_visit` cria a ordem `SCHEDULED` em `nextVisitDue` com `preferred_weekday/period`; o matching favorece `servedCustomerBefore` (mesmo técnico quando possível) |

## 9. Logística e lavanderia (`LOGISTICS`, `LAUNDRY`)

| Aspecto | Regra |
|---|---|
| Ponto de matching | Coleta (`service_orders.lat/lng`); o destino (`destination_lat/lng`) entra na estimativa de ETA/duração, não no raio |
| Qualificação | Categoria `automotivo` exige `provider_skills` com `DRIVER_LICENSE` verificado para `level ≥ 0.8` (regra do admin ao aprovar) |
| Estados após aceite | `DRIVER_ASSIGNED` (não `ACCEPTED`); SLA 1800 s para `provider.en_route` |
| Liberação intermediária | `provider.third_party_start` executa `provider.setOnline`: o motorista volta a ser candidato enquanto a oficina/lavanderia trabalha; `provider.return_pickup` executa `provider.setBusy`. A ordem continua ativa em `THIRD_PARTY_IN_PROGRESS` sem bloquear a agenda |
| Retorno | O mesmo prestador faz a devolução (não há novo matching para a volta no MVP); V1: `dispatch.restart` para `RETURN_PICKUP` quando o original estiver indisponível |
| Custódia | Não altera o matching, mas `requiresCustody` exige QR em `PICKED_UP`, `RETURN_PICKUP`, `DELIVERED`; `LAUNDRY` força `flags.requiresCustody = true` |

## 10. Tabelas de auditoria

| Tabela | O que responde |
|---|---|
| `dispatch_rounds` | Quantas ondas a ordem precisou, raio de cada uma, funil `candidates_count → eligible_count → offered_count`, `outcome` (`ACCEPTED`, `EXPIRED`, `NEXT_WAVE`, `ESCALATED`, `CANCELLED`), duração (`ended_at − started_at`), `snapshot` com pesos/config aplicados e lista de inelegíveis com motivo |
| `dispatch_offers` | Para cada prestador ofertado: `score`, `distance_km`, `score_breakdown` (7 componentes), `response`, tempo de resposta (`responded_at − offered_at`) |

Consultas de calibração:

```sql
-- taxa de aceite por onda nos últimos 30 dias
SELECT r.wave, count(*) ofertas,
       sum((o.response='ACCEPTED')::int) aceitas,
       round(100.0*sum((o.response='ACCEPTED')::int)/count(*),1) pct
FROM dispatch_offers o JOIN dispatch_rounds r ON r.id = o.round_id
WHERE o.offered_at > now() - interval '30 days' GROUP BY r.wave ORDER BY r.wave;

-- componente médio dos aceitos vs. expirados (qual sinal prevê aceite?)
SELECT response,
       avg((score_breakdown->>'proximity')::float) prox,
       avg((score_breakdown->>'reputation')::float) rep,
       avg((score_breakdown->>'acceptanceRate')::float) acc
FROM dispatch_offers WHERE offered_at > now() - interval '30 days' GROUP BY response;
```

## 11. Métricas de saúde do dispatch

| Métrica | Definição | Alvo MVP (PRD §10) | Fonte |
|---|---|---|---|
| Tempo de matching p50/p90 | `accepted_at − matching_started_at` | 3 min / 10 min | `service_orders` |
| Taxa de aceite onda 0 | aceitas / ofertadas na `wave = 0` | > 30 % | `dispatch_offers` + `dispatch_rounds` |
| Ondas por ordem | média de `max(wave)+1` por ordem aceita | ≤ 1,6 | `dispatch_rounds` |
| Taxa `NO_PROVIDER_FOUND` | ordens que passaram por `NO_PROVIDER_FOUND` / ordens criadas | < 10 % | `order_events` |
| Tempo na fila ops | `accepted_at − entrada em NO_PROVIDER_FOUND` | < 5 min (SLA 300 s) | `order_events` |
| Tempo de resposta do prestador | `responded_at − offered_at` (p50) | < 30 s | `dispatch_offers` |
| Cancelamento pós-aceite do prestador | `CANCELLED_BY_PROVIDER` eventos / aceites | < 5 % | `order_events` |
| Candidatos por onda | `eligible_count` médio na `wave = 0` | ≥ 4 (densidade) | `dispatch_rounds` |
| Dispersão de demanda | Gini de ordens por prestador ativo no mês | < 0,5 | `service_orders` |

Alertas (06 §9): `NO_PROVIDER_FOUND` > 10 min sem atribuição; `eligible_count = 0` em todas as ondas por 3 ordens seguidas na mesma região (sinal de buraco de cobertura); job `dispatch.wave_timeout` atrasado > 30 s.

## 12. Exemplo numérico

Pedido `IMMEDIATE` (encanador) em Vila Madalena (−23,5563; −46,6889), onda 0 (raio 5 km), pesos padrão. Valores calculados com `scoreCandidate` real.

### 12.1 Candidatos

| Prestador | Posição | Dist. | Disp. | Qualif. | Nota (n) | Aceite | Cancel. | Resp. (s) | Já atendeu | Min. ocioso |
|---|---|---|---|---|---|---|---|---|---|---|
| Carlos | −23,5620; −46,6950 | 0,89 km | ONLINE | 0,8 | 4,8 (120) | 0,85 | 0,02 | 25 | sim | 90 |
| Joana | −23,5500; −46,6800 | 1,15 km | ONLINE | 0,5 | 5,0 (3) | — | — | — | não | — |
| Rui | −23,5800; −46,7100 | 3,40 km | ONLINE | 1,0 | 4,1 (60) | 0,60 | 0,15 | 70 | não | 10 |
| Marta | −23,5570; −46,6900 | 0,14 km | BUSY | 0,8 | 4,9 (200) | 0,90 | 0,01 | 20 | não | 30 |

### 12.2 Componentes

| Componente | Carlos | Joana | Rui | Marta |
|---|---|---|---|---|
| proximity = 1 − d/5 | 1 − 0,888/5 = **0,822** | 1 − 1,146/5 = **0,771** | 1 − 3,401/5 = **0,320** | 0,973 |
| qualification | **0,800** | **0,500** | **1,000** | 0,800 |
| bayes | (4,8·120 + 21)/125 = 4,776 | (5·3 + 21)/8 = 4,500 | (4,1·60 + 21)/65 = 4,108 | 4,883 |
| reputation = (bayes − 3)/2 | **0,888** | **0,750** | **0,554** | 0,941 |
| availability | **1,0** | **1,0** | **1,0** | 0 (BUSY, imediato) |
| compatibility | 0,5 + (90/240)·0,3 + (1 − 25/120)·0,3 = 0,5 + 0,1125 + 0,2375 = **0,850** | 0,2 + 0,2 + 0,1 = **0,500** | 0,2 + (10/240)·0,3 + (1 − 70/120)·0,3 = 0,2 + 0,0125 + 0,125 = **0,338** | 0,488 |
| acceptanceRate | **0,850** | null → **0,700** | **0,600** | 0,900 |
| cancellationPenalty = 1 − 4·c | 1 − 0,08 = **0,920** | null → **0,900** | 1 − 0,60 = **0,400** | 0,960 |

### 12.3 Agregação (÷ 1,10)

| Prestador | Soma ponderada | Score | Elegível |
|---|---|---|---|
| Carlos | 0,822·0,3 + 0,8·0,15 + 0,888·0,2 + 1·0,15 + 0,85·0,1 + 0,85·0,1 + 0,92·0,1 = 0,9563 | **0,8694** | sim |
| Joana | 0,771·0,3 + 0,5·0,15 + 0,75·0,2 + 1·0,15 + 0,5·0,1 + 0,7·0,1 + 0,9·0,1 = 0,8162 | **0,7420** | sim |
| Rui | 0,320·0,3 + 1·0,15 + 0,554·0,2 + 1·0,15 + 0,338·0,1 + 0,6·0,1 + 0,4·0,1 = 0,6404 | **0,5822** | sim |
| Marta | 0,8349 | 0,7590 | **não** ("Prestador ocupado") |

`rankCandidates` → `[Carlos 0,8694, Joana 0,7420, Rui 0,5822, Marta 0,7590 (inelegível, por último)]`. `planWave(0)` → `OFFER { radiusKm: 5, timeoutSeconds: 90, providerIds: [Carlos, Joana, Rui] }` (3 ofertas: `offerCount` da onda 0). Marta aparece no painel de candidatos de ops com o motivo.

Leituras: a vantagem de Carlos vem de reputação consolidada e histórico com o cliente, não só da distância; Joana, novata, recebe os priors (0,7 aceite, 0,9 cancelamento, 4,2 de nota puxando sua 5,0 para 4,5) e ainda assim entra na onda; Rui é o mais qualificado, mas 15 % de cancelamento derruba `cancellationPenalty` para 0,4 e a distância de 3,4 km custa 0,68 de proximidade. Se Rui fosse avaliado na onda 1 (raio 10 km), sua `proximity` subiria para 0,660 e o score para 0,6750, sem mudar nada nele.

### 12.4 Repasse se Carlos aceitar e concluir (preço R$ 110,00 com cupom R$ 11,00)

`settle(11000, 1100, { 2000 bps, min 500 })` → bruto 11000; cobrado do cliente 9900; comissão 2200; repasse ao prestador **8800**; líquido da plataforma 1100 (o desconto de R$ 11 é custo da plataforma, não do prestador). `DispatchOffer.summary.providerPayoutCents = 8800` é o que Carlos vê antes de aceitar.

## 13. Antipadrões evitados

| Antipadrão | Por que é ruim | O que o VÉLIO faz |
|---|---|---|
| Broadcast para todos os prestadores da cidade | Corrida pelo botão, prestadores longe aceitam e cancelam, clientes recebem quem não é o melhor | Ondas pequenas (3/5/8) por raio crescente e score |
| Ofertar ao mesmo prestador em todas as ondas | Spam, dessensibiliza o prestador | `alreadyOffered` + `dispatch_offers_uq` |
| Média aritmética de notas | Um prestador com uma nota 5 supera veteranos | Média bayesiana com prior 4,2 e peso 5 |
| Pesos no código | Calibrar exige deploy | `matching_configs` por categoria, com padrão global e fallback de código |
| Oferta sem relógio | Cliente em limbo | `expires_at` em toda oferta e onda; expiração conta como recusa leve |
| Aceite sem transação | Dois prestadores "aceitam" | `UPDATE ... WHERE response='PENDING'` + lock da ordem + `version` |
| Decisão opaca | Impossível explicar por que X não foi chamado | `score_breakdown` por oferta e `snapshot` de inelegíveis por onda |
| Sem fallback humano | Ordem morre em cidade de baixa densidade | `NO_PROVIDER_FOUND` com fila, SLA e `operator.assign` |
| Expor endereço na oferta | Vazamento de dado pessoal e negociação fora do app | `approxLocation` (bairro + coordenadas arredondadas); endereço só após aceite |
| Penalizar `BUSY` em agendado | Perde os melhores prestadores para amanhã | `BUSY` elegível com `availability = 0.6` quando `scheduledFor != null` |

## 14. Evolução

| Fase | Capacidade | Base já existente |
|---|---|---|
| V1 | **Surge por região/hora**: `service_price_rules.surge_multiplier_bps` já é aplicado por `estimatePrice`; falta job que o ajuste a partir de `eligible_count`/demanda por região com teto público (02 §4.11) | `surge_multiplier_bps`, `dispatch_rounds.eligible_count` |
| V1 | **Taxa de deslocamento** (piso + km acima de franquia), fora da base da comissão | `distance_km` em `dispatch_offers`; `Settlement` aceita `paymentFeeBps`, precisa de linha própria |
| V1 | **Níveis de prestador** com prioridade na onda 0 (02 §4.12) | `provider_stats` já tem os insumos; vira componente ou bônus aditivo em `scoreCandidate` com peso configurável |
| V1 | **PostGIS** para `ST_DWithin` e polígonos de região (07 §14.1) | Pré-filtro isolado em SQL; domínio não muda |
| V1 | **Timeouts por workflowKind** além de por categoria (`matching_configs` ganha `workflowKind` opcional) | `WaveConfig` já parametrizado |
| V2 | **Previsão de demanda**: histórico `analytics_events(service_request_started)` por hexágono/hora alimenta avisos de posicionamento aos prestadores ("Pinheiros terá alta demanda às 18h") e surge antecipado | `analytics_events`, `provider_locations` |
| V2 | **Posicionamento sugerido** e modo "lista de ordens disponíveis" para prestadores nível alto | Elegibilidade e score reaproveitados; a diferença é quem inicia (pull vs push) |
| V3 | **Aprendizado dos pesos**: regressão sobre `score_breakdown` → `response` para propor pesos por categoria; sempre revisados por humano antes de salvar em `matching_configs` | Auditoria completa por construção |
