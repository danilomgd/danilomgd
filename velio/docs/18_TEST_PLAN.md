# 18 — Plano de Testes

Derivado de `apps/api/vitest.config.ts` (`src/**/*.test.ts` + `test/**/*.test.ts`; `NODE_ENV=test`, `PAYMENTS_PROVIDER=sandbox`, `SMS_PROVIDER=log`, `PUSH_PROVIDER=memory`; `pool: forks`; timeouts 30 s/60 s), `apps/api/test/harness.ts`, dos cenários existentes `apps/api/test/scenarios/{a-immediate-plumber,b-scheduled-ac-cleaning,c-subscription-plan,d-laundry-custody}.test.ts`, dos testes de domínio em `packages/domain/src/**/*.test.ts` e dos módulos em `apps/api/src/modules`. `pnpm test:scenarios` roda `test/scenarios`.

## 1. Pirâmide

| Nível | Escopo | Ferramenta | Banco | Estado |
|---|---|---|---|---|
| Unitário de domínio | `engine.test.ts`, `matching.test.ts`, `pricing.test.ts`, `policies.test.ts`, `rulePlanner.test.ts` | Vitest | nenhum | **existente** (~45 casos) |
| Contratos | Schemas Zod com exemplos; `ORDER_STATUS_LABELS` cobre todo `OrderStatus`; toda `TransitionAction` usada nas definições existe no enum; `EffectName` tem executor em `effects.ts` | Vitest | nenhum | a criar |
| Integração da API | `buildApp` com PGlite em memória, migração `0000`, `seed`, `fastify.inject`, `FakeClock`, `SandboxGateway`, `MemoryPushSender`; `outbox.drain()` + `scheduler.runDue(clock.now())` explícitos (`background: false`, `realtime: false`) | Vitest (`apps/api/test/**`) | PGlite | harness **existente**; `test/unit/` vazio |
| Cenários ponta a ponta | Fluxos completos cliente → prestador → ops sobre HTTP | Vitest (`test/scenarios`) | PGlite | **A–D existentes**; E–L a criar |
| Realtime | `socket.io-client` contra `fastify.server` (`realtime: true`) | Vitest | PGlite | a criar |
| Mobile | `tsc` strict; lógica pura (formatação, store de tokens, intervalo de GPS) | Vitest (`apps/mobile/vitest.config.ts`) | nenhum | config existente |
| Web | `next build` + typecheck; componentes de fila/tabela | Vitest + build | nenhum | a criar |
| Carga | k6 em staging | k6 | Postgres | §6 |
| Manual | Checklist por tela | humano | staging | §7 |

Regra: regra de negócio nova nasce como teste de domínio; a API testa orquestração (transação, outbox, jobs, efeitos).

## 2. Harness (`apps/api/test/harness.ts`)

| Elemento | Implementação |
|---|---|
| `createTestApp({ now })` | `FakeClock(DEFAULT_NOW = 2026-10-13T12:00Z, terça 09:00 SP)`; `createDb({ url: null, nodeEnv: 'test' })` + `migrate` + `seed(adminEmail, adminPassword)`; `buildApp({ dbHandle, background: false, realtime: false, adapters: { clock }, config: { JWT_ACCESS_TTL_SECONDS: 10 anos, LOG_LEVEL: 'silent', RATE_LIMIT_MAX: 100000 } })` |
| `drain(maxRounds = 25)` | Alterna `outbox.drain()` e `scheduler.runDue(clock.now())` até ambos devolverem 0 |
| `advance(ms)` / `advanceTo(target, stepMs = 1 h)` | Avança o relógio e drena; `advanceTo` em passos para jobs intermediários rodarem em ordem (lembretes, timeouts) |
| `asCustomer(phone, { name, cardToken, lat, lng, pushToken })` | OTP com `devCode`; `PATCH /v1/me` (nome + consentimentos); `POST /v1/me/devices`; endereço "Rua dos Pinheiros, 100 — Pinheiros" (`SP = −23,5614; −46,6823`); cartão `tok_sandbox_4242` (ou `cardToken: null` para nenhum) |
| `asProvider(phone, { categorySlugs, lat, lng, approve = true, online = true, pushToken })` | OTP `provider`; perfil; onboarding (`documentNumber` derivado do telefone, raio 25 km); documento `ID_FRONT`; **refresh para obter `providerId` no token**; `asAdmin()` aprova; `PATCH availability ONLINE` com posição |
| `asAdmin()` | Login por senha (`admin@velio.test`) |
| `read.*` | Atalhos Drizzle: `order`, `events`, `intents`, `notifications`, `ledgerForOrder`, `wallet`, `offers`, `rounds`, `incidents`, `custody`, `domainEvents`, `provider`, `jobs`, `service`, `children` |
| `requestAndAccept(t, customer, provider, serviceSlug, extra)` | Cria `NOW`, drena, lê a oferta do prestador, aceita, drena; devolve `{ orderId, offerId, serviceId }` |
| `transition(api, orderId, action, payload)` | `POST /v1/orders/:id/transition` |
| Constantes | `PHOTO`, `HOUR`, `DAY`, `MINUTE` |

Asserções típicas: `t.push.sent` (push por token e `data.kind`), `t.gateway.authorizations.get(ref).captured`, `read.events(orderId)` como `${type}:${toStatus}`.

## 3. Cobertura atual do domínio

| Arquivo | Casos |
|---|---|
| `workflow/engine.test.ts` | 6 workflows registrados e válidos; caminho feliz IMMEDIATE com atores; efeitos do aceite e conclusão; guards (`actorIsAssignedProvider`, `requiresPin`, `requiresEvidence:AFTER`, `noOpenAdditionalQuote`, `actorIsOrderCustomer`, `FORBIDDEN_ACTOR`); `provider.cancel → MATCHING`; `system.no_provider` + `operator.assign`; `allowedActions`; QUOTE (hasSentQuote, hasApprovedQuote, paymentAuthorized, recusa e novo orçamento); LOGISTICS (custódia, handover, evidência, ciclo); LAUNDRY = LOGISTICS; CONCIERGE (plano → execução → filhas; NEEDS_HUMAN); SCHEDULED (remind idempotente) |
| `matching/matching.test.ts` | Proximidade; inelegibilidades; BUSY em agendado; pesos; bayesiano; cancelamentos; ondas (N melhores, não repete, escala, FAIL, minScore) |
| `pricing/pricing.test.ts` | FIXED + opções + cupom com teto; HOURLY + surge; QUOTE/RANGE; cupom mínimo/teto; `settle` (padrão, mín/máx, taxa repassada, arredondamento); `pickCommissionRule` |
| `policies/policies.test.ts` | Cancelamento por fase; intervalo de GPS; filtro de pings; lembretes; matching 6 h antes; manutenção; próxima visita; `parseWhen` |
| `concierge/rulePlanner.test.ts` | Carro para revisão (6 tarefas, humano); sem veículo pede placa; desconhecido → humano; `needsHumanReview` com `PURCHASE` |

## 4. Cenários A–L (`apps/api/test/scenarios`)

Notação: **Pré**; **Passos** (ator → rota); **Estados**; **Efeitos** (eventos, notificações, pagamentos, ledger). A–D descrevem o teste existente; E–L são a especificação dos arquivos a criar.

### A — Cliente chama encanador imediato (`a-immediate-plumber.test.ts`, existente)

| Item | Conteúdo |
|---|---|
| Pré | Cliente com push token; 4 prestadores `hidraulica` ONLINE a 0,1–2,9 km; serviço `encanador-visita` (8000, `requiresStartPin`, `requiresBeforeAfterPhotos`) |
| Passos | 1 `POST /v1/requests` (NOW, cartão, `idempotencyKey`) → 201 `REQUESTED`, `startPin` 4 dígitos, `priceCents 8000`; repetição com a mesma chave devolve o mesmo id; 2 `drain()` → `OFFERED`, 3 ofertas (p1, p2, p3), eventos `order.created:REQUESTED`, `order.transitioned:MATCHING`, `order.transitioned:OFFERED`; 3 p1 vê 1 oferta com `summary.serviceName` e `approxLocation.neighborhood = 'Pinheiros'`; 4 p1 aceita → `ACCEPTED`, `providerId = p1`, `startPin = null`; `drain()`; 5 p2 aceita → 409; 6 intent única `INITIAL AUTHORIZED 8000`; 2 ofertas `WITHDRAWN`; p1 `BUSY`; 7 notificações `provider_found` INAPP e push com `data.kind`; 8 chat tem mensagem `system` e nenhum `+5511`; 9 `provider.en_route` → `EN_ROUTE`; `provider.arrive` → `ARRIVED`; 10 evidência `BEFORE`; `start` com PIN errado → 409 `INVALID_TRANSITION` (`details.status = ARRIVED`, `allowedActions` contém `provider.start`); PIN certo → `IN_PROGRESS`; 11 `complete` sem `AFTER` → 409; evidência `AFTER`; `complete` → `COMPLETED`; `drain()`; 12 `platform_fee_cents 1600`, `provider_payout_cents 6400`, intent `CAPTURED 8000`, `gateway.authorizations[ref].captured = 8000`; ledger `provider_payout 6400`, `platform_fee 1600`, `order_charge 8000`; carteira do prestador 6400; p1 `ONLINE`, `completed_count 1`; notificações `service_completed` e `review_request`; 13 review 5 → `REVIEWED`, `rating_avg 5`; segunda review → 409; detalhe lista os 9 status e `allowedActions = []`; 1 job `order.auto_close` |

### B — Agendar limpeza de ar-condicionado para daqui a 2 dias (`b-scheduled-ac-cleaning.test.ts`, existente)

| Item | Conteúdo |
|---|---|
| Pré | Cliente; prestador `ar-condicionado`; equipamento LG 12.000 BTUs com manutenção há 200 dias; `ac-limpeza` (18000, SCHEDULED, `requiresEquipment`) |
| Passos | 1 criar `SCHEDULED` (+2 dias, janela 60, `btus: ate18`) → `SCHEDULED`; `drain()` não muda nada; job `dispatch.start.run_at = startsAt − 6 h`; 2 jobs `booking.remind`; 2 `advanceTo(startsAt − 24 h)` → 1 notificação `booking_reminder` ao cliente (ainda sem prestador), ordem `SCHEDULED`; home `contextHint.source = 'upcoming_booking'`; 3 `advanceTo(startsAt − 6 h)` → `OFFERED`; oferta com `summary.scheduledFor = startsAt`; aceite → `ACCEPTED`; intent `AUTHORIZED`; 4 `advanceTo(startsAt − 1 h)` → `REMINDED`; 2 lembretes ao cliente, 1 ao prestador; 5 `advanceTo(startsAt)`; en_route, arrive, `BEFORE`, start com PIN, `AFTER`, complete → `COMPLETED`; intent `CAPTURED 18000`; `equipments.lastMaintenanceAt = clock.now()` |

### C — Assinatura Plano Residencial (`c-subscription-plan.test.ts`, existente)

| Item | Conteúdo |
|---|---|
| Pré | Cliente "Ana Souza"; equipamento com manutenção há 7 meses (intervalo 6) → `nextMaintenanceDueAt` no passado |
| Passos | 1 home: `greeting = 'Bom dia, Ana!'`, `contextHint.source = 'equipment_due'` com "Sala", seção `equipment_due` com itens, `morning` presente e `evening` ausente (09:00 SP); 2 `GET /v1/catalog/plans` → `ac-residencial`; 3 `POST /v1/me/subscriptions` (MORNING) → 201 `ACTIVE`, `nextVisitDueAt = now + 6 meses`; intent `SUBSCRIPTION CAPTURED 69900` com `subscriptionId`; 4 `advanceTo(due − 10 d, passo 5 d)` → nenhuma ordem; 5 `advanceTo(due − 6 d, passo 1 d)` → 1 ordem `SCHEDULED`, `priceCents 0`, `totalCents 0`, `serviceId` do plano, `scheduledFor` no dia devido; `subscription_visits` com a ordem; `nextVisitDueAt` avançou; 6 cancelar → `CANCELLED` |

### D — Lavanderia com cadeia de custódia (`d-laundry-custody.test.ts`, existente)

| Item | Conteúdo |
|---|---|
| Pré | Cliente; motorista `lavanderia`; `lavanderia-coleta` com `sacos: 1` |
| Passos | 1 `requestAndAccept` → `DRIVER_ASSIGNED`, `flags.requiresCustody`, `custodyCode ~ /^VL-[A-Z0-9]{6}$/`, `totalCents 15800`; 2 `provider.en_route` → `EN_ROUTE_PICKUP`; evidência `PICKUP`; `provider.pickup` sem scan → 409 `INVALID_TRANSITION`; scan com código errado → 422; scan certo (com foto e posição) → 200; `pickup` → `PICKED_UP`; 3 `depart` → `IN_TRANSIT`; `arrive_destination` → `AT_DESTINATION`; `third_party_start` → `THIRD_PARTY_IN_PROGRESS` e motorista `ONLINE`; `third_party_done` → `THIRD_PARTY_DONE`; 4 `return_pickup` sem scan → 409; scan; `return_pickup` → `RETURN_PICKUP`; `return_depart` → `RETURNING`; 5 evidência `DELIVERY`; `deliver` sem scan → 409; scan com código em minúsculas; `deliver` → `DELIVERED`; 6 `custody_events` = `EN_ROUTE_PICKUP:CUSTOMER>PROVIDER`, `IN_TRANSIT:PROVIDER>THIRD_PARTY`, `THIRD_PARTY_DONE:THIRD_PARTY>PROVIDER`, `RETURNING:PROVIDER>CUSTOMER`, todos com o mesmo `itemCode`; 7 `complete` → `COMPLETED`; `provider_payout_cents = round(15800 × 0,8) = 12640`; intent `CAPTURED` |

### E — Orçamento inicial (`e-quote-flow.test.ts`, a criar)

| Item | Conteúdo |
|---|---|
| Pré | `reforma-hidraulica` (QUOTE, `price null`); prestador `hidraulica` |
| Passos | 1 criar → `REQUESTED`, `priceCents null`; `drain()` → `OFFERED`; aceite → `UNDER_REVIEW`, **sem intent**, prestador não fica `BUSY`; 2 `POST /v1/orders/:id/quotes { INITIAL, items }` → 201 `SENT`, ordem `QUOTED`, push `quote_available`, job `quote.expire`; segundo `INITIAL` enquanto `SENT` → 409; 3 cliente `reject` → `REJECTED`, ordem `QUOTE_REJECTED`; 4 novo orçamento → `QUOTED`; 5 `approve` → `APPROVED`, ordem `QUOTE_APPROVED`, `price_cents = amount`, `total_cents`; 6 `POST /v1/orders/:id/payments { CARD }` → 201 `AUTHORIZED` e ordem `AUTHORIZED` (transição pelo sistema); prestador `BUSY`; 7 en_route/arrive/start/complete → captura do valor orçado; `settle` sobre o orçamento |
| Erros | `approve` de quote `REJECTED` → 409; `advance(> expiresInMinutes)` sem decisão → `quote.expire` → `EXPIRED` e `approve` → 409 |

### F — Orçamento adicional em execução (`f-additional-quote.test.ts`, a criar)

| Item | Conteúdo |
|---|---|
| Pré | Cenário A até `IN_PROGRESS` |
| Passos | 1 `POST .../quotes { ADDITIONAL, 2 × 4500 }` → `SENT`, notificação `quote_available` com valor, mensagem `quote_additional`, `order_events(quote.created)`; segundo `ADDITIONAL` → 409; `complete` → 409 `noOpenAdditionalQuote`; 2a `reject` → notificação ao prestador; `complete` captura só 8000; 2b (teste irmão) `approve` → `additional_approved_cents 9000`, `total 17000`, intent `ADDITIONAL 9000 AUTHORIZED` com `quote_id`; `complete` → ambas `CAPTURED`; `settle(17000, 0)` → fee 3400, payout 13600; 3 variante: `advance(61 min)` → `EXPIRED`; `complete` liberado |
| Negativos | Categoria com `allowsAdditionalQuote = false` → 422; `ADDITIONAL` em `ARRIVED` → 409 `INVALID_TRANSITION`; cliente de outra ordem aprova → 403 |

### G — Leva e traz de veículo (`g-logistics-vehicle.test.ts`, a criar)

| Item | Conteúdo |
|---|---|
| Pré | `leva-e-traz-veiculo` (LOGISTICS, `requiresVehicle`), veículo `BRA2E19`, `destinationAddressId`; prestador `automotivo` |
| Passos | 1 criar sem `vehicleId` → 422; com → `REQUESTED`; `flags.requiresCustody` e `requiresVehicleHandover` verdadeiros; `custodyCode`; `destination` preenchido; 2 aceite → `DRIVER_ASSIGNED`; `en_route` → `EN_ROUTE_PICKUP`; 3 `pickup` → 409 `requiresCustodyScan`; scan pela **placa** (`bra2e19`) → ok; `pickup` → 409 `requiresVehicleHandover`; `vehicle-handover/pickup { odometerKm, checklist, photoUrls }` → cria `vehicle_handovers` + `media_evidence(PICKUP)`; `pickup` → `PICKED_UP` (evidência satisfeita pelas fotos do handover); 4 `depart`, `arrive_destination` (custódia `IN_TRANSIT` registrada pelo efeito), `third_party_start` (ONLINE), `third_party_done`, scan + `return_pickup`, `return_depart`; 5 `vehicle-handover/delivery` com PIN errado → 422; com `start_pin` → `customer_confirmed` preenchido; scan; `deliver` → `DELIVERED`; 6 `complete`; 4 `custody_events`, 2 `vehicle_handovers`; `provider.location` só emitido em estados `liveLocation` |

### H — Concierge com revisão humana (`h-concierge-human.test.ts`, a criar)

| Item | Conteúdo |
|---|---|
| Pré | `CONCIERGE_PLANNER=rules`; cliente com veículo e endereço; prestador `automotivo` para a filha |
| Passos | 1 `POST /v1/concierge/requests { TEXT, "Pegue meu carro amanhã às 8h, leve para revisão na concessionária e devolva quando terminar." }` → 201; ordem `SUBMITTED` sem intent; `drain()` → `INTERPRETING` → `NEEDS_HUMAN`; `plan` com 6 tarefas, `requiresHuman`, `plannerName 'rules@1'`; incidente `NEEDS_HUMAN`; 2 ops `POST /v1/ops/concierge/:id/approve-plan { plan editado }` → `PLAN_PROPOSED`, push `plan_proposed`, `operator_user_id`, `audit_logs(concierge.approve_plan, edited true)`; 3 cliente `approve-plan` → `PLAN_APPROVED` → `drain()` → `QUOTED` com `quotes(INITIAL, provider 'platform', amount = Σ estimateCents = 12000)`; 4 cliente `approve` quote → `QUOTE_APPROVED` → `payments.authorize` → `drain()` → `IN_EXECUTION`; `order_tasks` 6 linhas; filha `leva-e-traz-veiculo` `SCHEDULED` para amanhã 08:00 com `billedViaParent`, `parent_order_id`, `price_override = 6000`; tarefas sem `serviceSlug` `PENDING`; 5 concluir a filha (ou cancelar pela plataforma) → `onChildTerminal` → `system.children_completed` → pai `COMPLETED`; captura do pai; `settle` da filha com `provider_payout_funding` |
| Variantes | Texto desconhecido → fallback humano com `confidence < 0,5`; cliente sem veículo → `clarifications` com "placa"; `answers` acrescentadas via `POST .../answers` |

### I — Matriz de cancelamento (`i-cancellation-matrix.test.ts`, a criar)

| Caso | Estado | Ator | Esperado |
|---|---|---|---|
| I1 | `OFFERED` | cliente | `CANCELLED_BY_CUSTOMER`; ofertas `WITHDRAWN`; rodada `CLOSED`; sem intent |
| I2 | `ACCEPTED` + 5 min | cliente | fee 0; intent `CANCELLED`; prestador `ONLINE`; push `order_cancelled` ao prestador |
| I3 | `ACCEPTED` + 30 min | cliente | intent `CANCELLATION_FEE 1500 CAPTURED`; ledger `cancellation_fee` CREDIT prestador 1500; `cancellation_fee_cents 1500`; `customer_risk_signals.late_cancellations_90d 1` |
| I4 | `EN_ROUTE`, preço 8000 | cliente | fee 2000 (mínimo) |
| I5 | `EN_ROUTE`, preço 30000 (`reforma`-like com `priceOverride` ou serviço de 30000) | cliente | fee 6000 |
| I6 | `IN_PROGRESS` | cliente | 409 `customerCancelAllowed` |
| I7 | `ACCEPTED` | outro cliente | 403 "Sem acesso a esta ordem" |
| I8 | `ACCEPTED` | prestador atribuído via `POST /v1/orders/:id/cancel` | `MATCHING`; `provider_id null`; `excludedProviderIds`; `cancelled_count 1`; nova onda sem ele; push ao cliente |
| I9 | `IN_PROGRESS` | prestador | 409 `providerCancelAllowed` |
| I10 | `ACCEPTED` com PIX pago (`AUTHORIZED`) | ops `POST /v1/ops/orders/:id/cancel` | `CANCELLED_BY_PLATFORM`; `refunds(DONE)`; intent `REFUNDED`; `audit_logs(ops.cancel)` |
| I11 | `ACCEPTED` agendado | cliente | `bookings.released_at`; jobs `booking.remind` `CANCELLED` |
| I12 | `REVIEWED` | cliente | 409 `TERMINAL` |
| I13 | `ACCEPTED` com PIX pago | cliente dentro de 10 min | **documenta o comportamento atual**: intent fica `CANCELLED` sem reembolso (risco 13 §17) — teste deve falhar após a correção prevista |

### J — Nenhum prestador e dispatch manual (`j-no-provider-manual.test.ts`, a criar)

| Item | Conteúdo |
|---|---|
| Pré | P1 ONLINE a 2 km, P2 ONLINE a 8 km, P3 ONLINE a 1 km com `serviceRadiusKm 0,5` (fora do raio próprio); `DEFAULT_WAVES` |
| Passos | 1 criar → `drain()`: onda 1 (5 km) oferta P1 (P3 inelegível "Fora do raio" no `snapshot`); P1 `reject` → `onWaveTimeout` imediato → onda 2 (10 km) oferta P2; `advance(120 s)` → `EXPIRED`, `system.wave_exhausted`, onda 3 (20 km) `EMPTY` → `NO_PROVIDER_FOUND`; 3 `dispatch_rounds` (`EXPIRED`? a 1ª vira `EXPIRED` ao rejeitar, 2ª `EXPIRED`, 3ª `EMPTY`), incidente `NO_PROVIDER`, `dispatch_wave 2`; 2 `GET /v1/ops/orders?attention=true` lista; `GET /v1/ops/orders/:id` traz `dispatch.rounds/offers`; `GET .../candidates` com `alreadyOffered` para P1/P2; 3 P3 aumenta raio (`PATCH` não existe; usar `read`/update direto ou novo prestador P4); ops `assign { providerId: P4, note }` → `ACCEPTED`, intent `AUTHORIZED`, `audit_logs(ops.assign)`, `provider_stats(P4).offers_received 1, offers_accepted 1`; 4 concorrência: dois prestadores da mesma onda aceitam em paralelo (`Promise.all`) → um 200, outro 409 |

### K — Pagamentos (`k-payments.test.ts`, a criar)

| Caso | Passos | Esperado |
|---|---|---|
| K1 PIX | Cliente com método `PIX`; criar pedido → intent `REQUIRES_ACTION` com `pix.qrCode`, **sem** job `dispatch.start`, job `payment.pix_timeout`; `settlePix(ref)` → `POST /v1/payments/webhooks/sandbox` → `{ ok: true }`; intent `AUTHORIZED`, push `payment_approved`; `drain()` → `OFFERED`; aceite; conclusão → `CAPTURED` sem chamada ao gateway |
| K2 PIX não pago | `advance(16 min)` sem webhook | intent `CANCELLED pix_timeout`; ordem `CANCELLED_BY_PLATFORM`; notificações |
| K3 Webhook duplicado | Reenviar o mesmo corpo | `{ ok: true, duplicate: true }` |
| K4 Webhook inválido | Corpo não JSON; `gateway = 'pagarme'` | 400 "Webhook inválido"; 404 "Gateway" |
| K5 Cartão recusado | `cardToken: 'tok_sandbox_0002'` | Aceite → intent `FAILED card_declined`; push `payment_failed`; ordem `ACCEPTED`; `POST /v1/orders/:id/payments { CARD }` com novo cartão → `AUTHORIZED` e antiga `CANCELLED` |
| K6 Captura falha | `tok_sandbox_0004` | `complete` → `COMPLETED`; intent `FAILED capture_failed`; `incidents(PAYMENT, HIGH)`; **ledger já lançado** (documenta risco 13 §17) |
| K7 Carteira insuficiente | método `WALLET` sem saldo | intent `FAILED insufficient_wallet` |
| K8 Cupom | `BEMVINDO10` em 11000 (`urgente`) | `discount 1100`, `total 9900`; `coupon_redemptions`; `used_count 1`; `settle` → `platform_fee` ledger 1100 (líquido), `provider_payout 8800`; 2ª ordem com o cupom → 422 |
| K9 Regra por categoria | `PUT /v1/admin/commission-rules` 15 % para `lavanderia` | Ordem de lavanderia liquida com 15 %; hidráulica com 20 % |
| K10 Lote semanal | `advanceTo(próxima quarta 03:00 UTC)` | `payouts SCHEDULED` por prestador com saldo; journal `payout`; `nextPayoutAt` do prestador = próximo job |
| K11 Produção recusa sandbox | `loadConfig({ NODE_ENV: 'production', PAYMENTS_PROVIDER: 'sandbox', DATABASE_URL, JWT_SECRET })` | lança |

### L — Disputa e reembolso (`l-dispute-refund.test.ts`, a criar)

| Item | Conteúdo |
|---|---|
| Pré | Cenário A concluído (`CAPTURED 8000`, `provider_payout 6400`) |
| Passos | 1 cliente `POST /v1/orders/:id/disputes { DAMAGE }` → 201 `OPEN`; ordem `DISPUTED`; carteira do prestador `balance 0`, `held 6400`; `metadata.disputeHeldCents 6400`; incidente `DISPUTE`; prestador notificado; segunda disputa → 409; 2 `advanceTo(quarta 03:00)` → `payout.batch` não gera repasse para o prestador; 3 ops `resolve { RESOLVED_SPLIT, refundCents 3000, note }` → `CLOSED`; `refunds(DONE 3000)`; intent `PARTIALLY_REFUNDED`; `disputes.resolution = { refundCents 3000, providerPayoutCents 3400 }`; `dispute_release 3400` ao prestador, `dispute_adjustment 3000` para `revenue`; `held 0`; notificações `dispute_update`; incidente resolvido; `audit_logs`; 4 variantes: `RESOLVED_CUSTOMER` (refund 8000, `REFUNDED`, payout 0); `REJECTED` (`customer_risk_signals.disputes_rejected_90d 1`, payout 6400 liberado) |

## 5. Testes de segurança (`apps/api/test/security/*.test.ts`, a criar)

| ID | Teste | Esperado |
|---|---|---|
| S-01 | Prestador B chama `start`/`complete`/`transition` na ordem de A | 403 "Sem acesso a esta ordem" (não é prestador atribuído) |
| S-02 | Cliente Y lê/cancela/avalia ordem de X | 403; 403; 403/409 |
| S-03 | Cliente chama `/v1/ops/*`, `/v1/admin/*`; operador chama `PUT /v1/admin/settings` | 403 |
| S-04 | Cliente dispara `system.start_matching` / `operator.assign` via `/transition` | 403 "Ação exclusiva da operação" |
| S-05 | `startPin` ausente em `GET /v1/orders/:id` como prestador e em `/offers`; presente para cliente e ops; **`GET /v1/providers/me/orders` hoje expõe o PIN** (teste deve documentar e falhar após correção) | |
| S-06 | Oferta sem `address.summary`/`instructions`; `approxLocation` com 3 casas | |
| S-07 | OTP: 6º erro → 429; expirado (`advance(301 s)`) → 400; reuso de challenge → 400; 6º pedido no minuto → 429 | |
| S-08 | JWT expirado (`advance(16 min)` com TTL padrão) → 401; assinatura adulterada → 401 | |
| S-09 | Refresh: rotação funciona; reuso do antigo → 401 | |
| S-10 | Rate limit global (`RATE_LIMIT_MAX` baixo no teste) → 429 `RATE_LIMITED` | |
| S-11 | Webhook: JSON inválido → 400; gateway errado → 404; duplicado → `duplicate` | |
| S-12 | Realtime (`realtime: true`): sem token → `connect_error`; `order.subscribe` alheio não recebe `order.updated`; `location.push` sem `providerId` ignorado | |
| S-13 | Logs: `authorization`, `password`, `code`, `pin` redigidos (capturar `pino` em stream) | |
| S-14 | Analytics: anônimo → 401; `user_id` do corpo ignorado | |
| S-15 | Prestador `PENDING` → `ONLINE` → 403; `SUSPEND` → `OFFLINE` | |
| S-16 | Config: `loadConfig` produção com adaptadores de dev lança; `createDb` sem URL em produção lança | |
| S-17 | Zod: tipos errados → 400 com `details[].path`; corpo > 2 MiB → 413 | |
| S-18 | Mensagens: não participante → 403; conversa com `closed_at` → 409 | |

## 6. Carga (k6, staging com Postgres)

| Cenário | Script | Carga | Aceite |
|---|---|---|---|
| Criação de pedido | OTP pré-gerado → `POST /v1/requests` (idempotencyKey única) → `GET /v1/orders/:id` | 50 VUs, 5 min | p95 < 500 ms; 0 5xx; `REQUESTED → OFFERED` < 5 s em 95 % (`order_events`) |
| Aceite concorrente | 1 ordem, onda com 8 ofertas; 8 `POST /v1/offers/:id/accept` simultâneos | 200 rodadas | Exatamente um 200; demais 409; nenhuma ordem com 2 `provider_id` |
| Localização | 500 prestadores × `POST /v1/providers/me/location` a cada 10 s | 15 min | p95 < 150 ms; CPU < 70 % |
| Leitura + realtime | 300 clientes `GET /v1/orders/:id` a cada 5 s + sockets | 10 min | p95 < 200 ms; `order.updated` < 1 s |
| Outbox/scheduler | Medir pendentes e atraso durante os anteriores | | pendentes < 200; atraso < 5 s |
| Webhooks | 100/s, 50 % duplicados | 2 min | 100 % 200; p95 < 100 ms |

## 7. Manual em dispositivo

iOS e Android reais, 4G, staging com `PAYMENTS_PROVIDER=sandbox`. Telas em `10_SCREEN_INVENTORY.md`.

### 7.1 VÉLIO (cliente)

| Tela | Verificações |
|---|---|
| Login OTP | Máscara; reenvio; erro claro com tentativas restantes; bloqueio após 5 |
| Onboarding | Nome; termos/privacidade obrigatórios; marketing/personalização desmarcados |
| Home | Saudação com nome; `contextHint` coerente; seções por hora; ordem ativa no topo |
| Categoria / Serviço | Preço, faixa ou "orçamento após análise"; opções recalculam (`estimate`); botão conforme `allows*` |
| Endereço | Mapa, autocomplete, instruções |
| Checkout | `breakdown`, cupom, método, janela; taxa de cancelamento explicada; criação < 3 s |
| PIX | QR, copiar código, contador de 15 min; atualização ao pagar; aviso de que o pedido só é distribuído após o pagamento |
| Acompanhamento | Linha do tempo (`events`); mapa em `EN_ROUTE`/`ARRIVED`; ETA; PIN em destaque em `ARRIVED`; chat; cancelar com valor da taxa |
| Orçamento adicional | Push abre a tela; itens; recusar/aprovar; expiração |
| Conclusão / Avaliação | Fotos; nota, tags, comentário |
| Disputa | Motivos; fotos; status; nota da resolução |
| Perfil | Endereços, veículos, equipamentos (próxima manutenção), pagamentos (`last4`), notificações, assinaturas |
| Erros | Sem rede; 409 com motivo do guard; 401 renova silenciosamente |

### 7.2 VÉLIO Pro (prestador)

| Tela | Verificações |
|---|---|
| Onboarding | Documento mascarado; categorias; raio; upload; `PENDING` explica; token renovado após cadastro |
| Disponibilidade | ONLINE pede localização "sempre"; `PENDING` bloqueado (403) |
| Oferta | Push abre; contador; bairro + distância + repasse estimado; sem endereço; aceita por outro → 409 explicado |
| Execução | Um botão por estado; guards em pt-BR; GPS 10 s/3 s em deslocamento, 120 s em execução, 60 s ocioso, nada offline; consumo de bateria em 1 h |
| Orçamento | Itens; decisão do cliente; bloqueio de concluir com pendente |
| Custódia / handover | QR ou placa; odômetro, combustível, checklist, fotos; PIN na devolução |
| Carteira | Saldo, pendente, retido, próxima quarta; extrato; repasses |
| Indicadores / Agenda | 30 dias; janelas semanais |

### 7.3 Web `/ops` e `/admin`

| Tela | Verificações |
|---|---|
| Login | E-mail/senha; erro genérico; limite 10/min |
| Mapa / filas / SLAs | Tempo real; `attention`; cores por SLA |
| Ordem | Linha do tempo, `dispatch.rounds/offers` com breakdown, pagamentos, chat, PIN |
| Dispatch manual | Candidatos com motivo; atribuir em 3 cliques; 422 explicado |
| Disputas / incidentes | Evidências lado a lado; resolver com nota; incidentes por `kind` |
| Concierge | Plano editável; aprovar; tarefas filhas |
| Admin | CRUD com validação inline; categoria nova aparece no app sem deploy; settings; decisão de prestador; dashboard; `audit_logs` |

## 8. Critérios de aceite de release

| Critério | Medida |
|---|---|
| `pnpm check` verde | Biome, typecheck strict, testes de domínio, integração e cenários A–L, builds |
| Cobertura | Domínio ≥ 90 %; módulos ≥ 75 %; toda transição de cada `WorkflowDefinition` exercitada (script compara `describeWorkflow` com `order_events.action` dos testes) |
| Segurança | S-01..S-18 verdes; 14 §13 itens 1–11 concluídos |
| Pagamentos | 13 §15 P-01..P-21 verdes; homologação 13 §16 para produção real |
| Dados | Migrações em PGlite e Postgres 16 limpos e sobre staging; seed idempotente (2× sem diff) |
| Operação | Runbooks 15 §10 ensaiados em staging |
| Carga | §6 dentro das metas |
| Manual | §7 sem bloqueadores em iOS/Android; contraste AA e leitor de tela |
| Métricas | Funil completo em `analytics_events` + tabelas após cenário A em staging |
| Divergências | Lista abaixo resolvida ou aceita formalmente |

Divergências código × documentação anterior encontradas na derivação destes documentos:

| # | Onde | Divergência | Proposta |
|---|---|---|---|
| 1 | ADR-008 vs `lib/password.ts` | Argon2id documentado; scrypt implementado | Atualizar ADR |
| 2 | PRD §10 vs `contracts/analytics.ts` | Nomes de eventos divergentes; `payment_recovered` inexistente | Alinhar PRD |
| 3 | `effects.ts` vs semântica | `system.start_matching → service_request_started`; `customer.authorize_payment → checkout_view`; `operator.assign → provider_matched`; ofertas e online/offline sem evento | Corrigir mapa (16 §2.4) |
| 4 | 06 §3 vs schema | `otp_codes` → `otp_challenges`; `ticket_messages` inexistente; `addresses` em `identity.ts`; `vehicle_handovers` ausente; jobs `booking.reminder`/`order.auto_complete_check` chamam-se `booking.remind`/`order.auto_close`; `payment.reconcile`, `booking.confirm_request` não existem; `payment.pix_timeout`, `concierge.plan` existem | Atualizar 06 |
| 5 | 11 §2.3 vs `quoteWorkflow` | QUOTE passa por `MATCHING/OFFERED` | Atualizar 11 |
| 6 | 02 §4.2 vs `createRequest` | RANGE deveria pré-autorizar o teto; código usa `minCents` | Decidir e alinhar |
| 7 | 02 §4.3 vs enum | `CANCELLED_NO_SHOW` inexistente | Adicionar ou mapear |
| 8 | 02 §4.5 vs código | Nota ≤ 2 sem ticket/hold automático; janela de 7 dias não checada | Implementar em `createReview` |
| 9 | 02 §4.4 vs `customer.cancel` | PIX pago não é reembolsado no cancelamento gratuito do cliente | Adicionar `payments.refund` ou tratar em `cancelAuthorization` |
| 10 | 13 (intenção) vs `effects.ts` | `wallet.settle` roda mesmo com captura falha | Condicionar |
| 11 | 12 (intenção) vs `offerSummary` | Repasse na oferta = 80 % fixo | Usar `settle` + regra |
| 12 | Schema (07 §1.5) | `addresses.lat/lng`, `banners.*_at`, `workflow_definitions.active`, `vehicle_handovers.customer_confirmed` como `text` | Migração 0001 |
| 13 | `config.ts` | `PAGARME_WEBHOOK_SECRET` opcional | Obrigatório com `pagarme` |
| 14 | `lib/jwt.ts: sha256` | HMAC com chave fixa usado em `document_hash` | Segredo de ambiente |
| 15 | `orders/routes.ts` | `GET /v1/providers/me/orders` expõe `startPin` (`toDto` sem viewer); `GET /v1/orders/:id/reviews` sem posse | Corrigir |
| 16 | `api.ts` vs rotas | Sem métodos para `POST /v1/auth/refresh` (interno), `POST /v1/me/notifications/:id/read`, `unread-count`, `PATCH /v1/me/addresses/:id`, deletes de veículo/equipamento/método, `schedule`, `/v1/support/tickets`, `/v1/orders/:id/reviews`, `/v1/geo/regions`, `/v1/ops/incidents/:id/resolve`, `/v1/ops/concierge/:id/approve-plan`, `/v1/admin/audit-logs` | Completar o cliente |
| 17 | 02 §4.6 vs `communication` | Sem filtro de palavras-chave, fechamento em 48 h, rate limit | V1 |
| 18 | `admin/routes.ts` | `commission-rules` upsert não fecha a regra anterior | Fechar automaticamente por escopo |
| 19 | PRD §12 vs seed | Planos e serviços de V1 já publicados | Admin desativa no piloto |
| 20 | `analytics/service.ts` vs `DashboardMetrics` | Períodos por `created_at`, `noProviderRate` por status atual, `activeProviders` = online agora, `newCustomers` sem filtro de papel, `repeatRate` sem janela | 16 §4.2 |
