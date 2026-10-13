# 18 — Plano de Testes

Derivado de `apps/api/vitest.config.ts` (inclui `src/**/*.test.ts` e `test/**/*.test.ts`; `NODE_ENV=test`, `PAYMENTS_PROVIDER=sandbox`, `SMS_PROVIDER=log`, `PUSH_PROVIDER=memory`; `pool: forks`; timeouts 30 s/60 s), `apps/api/src/app.ts` (`buildApp({ background: false, realtime, adapters, dbHandle })`), `apps/api/src/adapters/sandbox.ts` (`SandboxGateway`, `FakeClock`, `LogSmsSender.sent`, `MemoryPushSender.sent`), `apps/api/src/platform/{outbox,scheduler}.ts` (`drain()`, `runDue(now)`), dos testes já existentes em `packages/domain/src/**/*.test.ts` e do script `pnpm test:scenarios` (`apps/api/test/scenarios`, diretório ainda a criar). Tudo que referencia `apps/api/test/**` é **a implementar** junto com os módulos.

## 1. Pirâmide

| Nível | Escopo | Ferramenta | Banco / I/O | Velocidade alvo | Estado |
|---|---|---|---|---|---|
| Unitário de domínio | `packages/domain`: engine (`engine.test.ts`), matching (`matching.test.ts`), pricing/comissão (`pricing.test.ts`), políticas (`policies.test.ts`), concierge (`rulePlanner.test.ts`) | Vitest | nenhum | < 2 s total | **existente** (5 arquivos, ~45 casos) |
| Contratos | Schemas Zod aceitam/recusam exemplos; `ORDER_STATUS_LABELS` cobre todo `OrderStatus`; `RealtimeEvents`/`ClientRealtimeEvents` tipados; `TransitionAction` usados nas definições existem no enum | Vitest em `packages/contracts` | nenhum | < 1 s | a criar |
| Integração da API | `buildApp` com PGlite em memória (`createDb()` sem `DATABASE_URL`), migração real `0000`, seed, HTTP via `fastify.inject`, `FakeClock`, `SandboxGateway`, `outbox.drain()` e `scheduler.runDue(clock.now())` chamados explicitamente (`background: false`) | Vitest (`apps/api/test/**`) | PGlite em memória por arquivo de teste | < 60 s total | a criar |
| Cenários ponta a ponta A–L | Fluxos completos cliente → prestador → ops sobre a API (sem UI) | Vitest (`apps/api/test/scenarios/*.test.ts`, `pnpm test:scenarios`) | PGlite | < 90 s | a criar |
| Realtime | Socket.IO client contra `fastify.server` em porta efêmera (`realtime: true`) | `socket.io-client` (devDependency já presente) | PGlite | | a criar |
| Mobile | `tsc` strict, testes de lógica pura (formatação, `locationIntervalSeconds` no app, store de tokens), snapshot leve de componentes críticos | Vitest/Jest + typecheck | nenhum | | a criar com `apps/mobile` |
| Web | `next build` + typecheck; testes de componentes de fila/tabela | Vitest + build | nenhum | | a criar com `apps/web` |
| Carga | k6 contra staging | k6 | Postgres real | | §6 |
| Manual em dispositivo | Checklist por tela | humano | staging | | §7 |

Regra: lógica de negócio nova entra primeiro como teste de domínio; a API testa orquestração (transação, outbox, jobs, efeitos), não regras.

## 2. Harness de integração (a implementar em `apps/api/test/helpers.ts`)

```ts
const clock = new FakeClock(new Date('2026-10-13T12:00:00Z'));
const gateway = new SandboxGateway();
const push = new MemoryPushSender();
const sms = new LogSmsSender(silentLog);
const app = await buildApp({ background: false, realtime: false, adapters: { clock, payments: gateway, push, sms } });
await seed(app.ctx.db);
// utilitários
const tick = async () => { await app.ctx.scheduler.runDue(clock.now()); await app.ctx.outbox.drain(); };
const advance = async (ms: number) => { clock.advance(ms); await tick(); };
const asCustomer = await loginOtp(app, '+5511999990001');   // usa devCode da resposta (NODE_ENV=test)
const asProvider = await onboardApprovedProvider(app, '+5511999990002', { categories: ['hidraulica'], at: { lat: -23.556, lng: -46.689 } });
const asOps = await loginPassword(app, 'ops@velio.test', 'senha-forte-123');
```

| Utilitário | Garante |
|---|---|
| `tick()` | Executa jobs vencidos e drena o outbox até esvaziar; chamado após cada ação para que efeitos declarados rodem (não há loops em background em teste) |
| `advance(ms)` | Avança o relógio injetado; `verifyJwt` usa `adapters.clock.now()` em `app.ts`, então tokens expiram de forma determinística |
| `expectState(orderId, status)` | `GET /v1/orders/:id` com o ator certo |
| `expectEvents(orderId, [...])` | `order_events` ordenados por `seq` |
| `expectLedgerBalanced(orderId)` | Para cada `journal_id` da ordem, Σ CREDIT = Σ DEBIT |
| `expectPush(kind, toUserId)` | `push.sent` contém mensagem com `data.kind` |
| `settlePix(gatewayRef)` | `gateway.settlePix` + `POST /v1/payments/webhooks/sandbox` |

Dados: um prestador por teste com `provider_skills` da categoria, `availability=ONLINE`, posição a ~1 km do endereço; endereço do cliente dentro da bbox da região seed (São Paulo).

## 3. Cobertura atual do domínio (referência para os cenários)

| Arquivo | Casos relevantes |
|---|---|
| `workflow/engine.test.ts` | Seis workflows registrados e válidos; caminho feliz IMMEDIATE; efeitos do aceite e da conclusão; guards `actorIsAssignedProvider`, `requiresPin`, `requiresEvidence:AFTER`, `noOpenAdditionalQuote`, `actorIsOrderCustomer`, `FORBIDDEN_ACTOR`; cancelamento do prestador → MATCHING; `system.no_provider` + `operator.assign`; `allowedActions`; QUOTE (hasSentQuote, hasApprovedQuote, paymentAuthorized, recusa e novo orçamento); LOGISTICS (custódia, handover, evidência, ciclo completo); LAUNDRY = LOGISTICS; CONCIERGE (plano, aprovação, orçamento, execução, filhas, NEEDS_HUMAN); SCHEDULED (remind idempotente) |
| `matching/matching.test.ts` | Proximidade, inelegibilidades, BUSY em agendado, pesos alteram ranking, bayesiano, cancelamentos derrubam score, ondas (N melhores, não repete, escala, FAIL, minScore) |
| `pricing/pricing.test.ts` | FIXED + opções + cupom com teto; HOURLY + surge; QUOTE/RANGE; cupom mínimo e teto; `settle` (padrão, mín/máx, taxa repassada, arredondamento); `pickCommissionRule` |
| `policies/policies.test.ts` | Cancelamento por fase; intervalo de GPS; filtro de pings; lembretes; matching 6 h antes; manutenção devida; próxima visita; `parseWhen` |
| `concierge/rulePlanner.test.ts` | Carro para revisão (6 tarefas, humano); sem veículo pede placa; desconhecido → humano; `needsHumanReview` aplica `PURCHASE` |

## 4. Cenários A–L (`apps/api/test/scenarios/*.test.ts`)

Notação: **Pré** = pré-condições; **Passos** = chamadas HTTP (ator → rota); **Estados** = `service_orders.status` esperados; **Efeitos** = eventos/outbox, notificações (`MemoryPushSender`), pagamentos (`payment_intents`) e ledger.

### A — Imediato caminho feliz (`a-immediate-happy-path.test.ts`)

| Item | Conteúdo |
|---|---|
| Pré | Cliente com endereço (Vila Madalena) e cartão `tok_sandbox_4242`; prestador aprovado, ONLINE, skill `hidraulica`, a 0,9 km; categoria com `requiresStartPin` e `requiresBeforeAfterPhotos`; cupom `BEMVINDO10` |
| Passos | 1 cliente `POST /v1/requests` (encanador-visita, `urgente: true`, cupom, NOW) → `tick()`; 2 prestador `GET /v1/providers/me/offers` (1 oferta, `approxLocation` sem rua, `providerPayoutCents = 8800`); 3 prestador `POST /v1/offers/:id/accept` → `tick()`; 4 `POST /v1/orders/:id/transition { provider.en_route }`; 5 `POST .../transition { provider.arrive }`; 6 `POST .../start { pin }` com PIN errado (409) e sem foto BEFORE (409), depois `POST .../evidence { BEFORE }` e `start` com PIN certo; 7 `POST .../evidence { AFTER }`; 8 `POST .../complete` → `tick()`; 9 cliente `POST .../review { rating: 5 }` → `tick()` |
| Estados | `REQUESTED → MATCHING → OFFERED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED → REVIEWED`; `order_events.seq` 1..n sem buracos |
| Efeitos | `dispatch_rounds(wave 0, offered 1)`; intent `INITIAL` `AUTHORIZED` (9900) após aceite → `CAPTURED` (9900) após conclusão; ledger: `ORDER_GROSS 9900`, `PROVIDER_EARNING 8800`, `PLATFORM_FEE 2200`, `COUPON_COST 1100`, balanceado; `service_orders.platform_fee_cents = 2200`, `provider_payout_cents = 8800`; push ao cliente `provider_found`, `provider_en_route`, `provider_arriving`, `service_started`, `service_completed`, `review_request`; `messages(system)` por status; `providers.availability` ONLINE → BUSY → ONLINE; `provider_stats.completed_count = 1`, `rating_avg = 5`; `analytics_events` com `service_request_completed`, `provider_matched`, `provider_accepted`, `service_started`, `service_completed`, `payment_completed`, `review_created`; `startPin` presente só na resposta do cliente |

### B — Agendado com lembretes (`b-scheduled-reminders.test.ts`)

| Item | Conteúdo |
|---|---|
| Pré | `ac-limpeza` (SCHEDULED, `requiresEquipment`), equipamento cadastrado, prestador com `provider_schedules` cobrindo a janela e um `bookings` em outro horário; `scheduledFor = now + 48 h`, `windowMinutes 60` |
| Passos | 1 criar pedido (422 sem `equipmentId`; 201 com); 2 `tick()` imediato: nenhuma oferta; `scheduled_jobs(dispatch.start).run_at = scheduledFor − 6 h`; 3 `advance(42 h)` → ofertas; prestador aceita; 4 verificar `bookings` e jobs `booking.reminder` em `−24 h` (já passado → não criado) e `−1 h`; 5 `advance` até `−1 h` → `REMINDED`, push `booking_reminder` a ambos; repetir `system.remind` manualmente → idempotente (sem segundo push); 6 `advance` até a janela; en_route/arrive/start/complete |
| Estados | `SCHEDULED → MATCHING → OFFERED → ACCEPTED → REMINDED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED` |
| Efeitos | `reminder_1h_sent_at` preenchido uma vez; `provider_arrived.onTime = true`; `equipments.last_maintenance_at` atualizado na conclusão (conforme contrato) |

### C — Orçamento inicial (`c-quote-flow.test.ts`)

| Item | Conteúdo |
|---|---|
| Pré | `reforma-hidraulica` (QUOTE), prestador aprovado |
| Passos | 1 criar (preço `null`, `requiresQuote`); 2 aceite → `UNDER_REVIEW` (sem intent); 3 `POST /v1/orders/:id/quotes { kind: INITIAL, items }` → `QUOTED`, push `quote_available`; 4 cliente `POST /v1/quotes/:id/reject` → `QUOTE_REJECTED`; 5 novo orçamento → `QUOTED`; 6 `approve` → `QUOTE_APPROVED`, `price_cents = amount`; 7 `POST /v1/orders/:id/payments { methodKind: CARD }` → intent `AUTHORIZED` e transição `customer.authorize_payment` → `AUTHORIZED`; 8 execução até `COMPLETED` |
| Estados | `REQUESTED → MATCHING → OFFERED → UNDER_REVIEW → QUOTED → QUOTE_REJECTED → QUOTED → QUOTE_APPROVED → AUTHORIZED → EN_ROUTE → ... → COMPLETED` |
| Efeitos | Sem intent antes de `QUOTE_APPROVED`; captura = valor do orçamento; `quote_sent` ×2, `quote_rejected`, `quote_approved`; `provider.setBusy` só em `AUTHORIZED` |

### D — Orçamento adicional em execução (`d-additional-quote.test.ts`)

| Item | Conteúdo |
|---|---|
| Pré | Cenário A até `IN_PROGRESS` |
| Passos | 1 prestador `complete` com quote `SENT` pendente → 409 `noOpenAdditionalQuote`; 2 `POST .../quotes { kind: ADDITIONAL, items: [2 × 4500] }` (segundo `ADDITIONAL` enquanto o primeiro está `SENT` → 409); 3a cliente `reject` → `complete` captura só 9900; 3b (teste irmão) cliente `approve` → intent `ADDITIONAL` 9000 `AUTHORIZED`, `additional_approved_cents = 9000`; `complete` → ambas `CAPTURED`; 4 variante: `advance(61 min)` sem decisão → `quote.expire` → `EXPIRED`, `complete` permitido |
| Estados | `IN_PROGRESS` não muda durante o orçamento; `COMPLETED` ao final |
| Efeitos | `total_cents = 9900 + 9000 = 18900`; `settle(20000, 1100)` → fee 4000, payout 16000; realtime `quote.created`/`quote.decided`; nenhuma intent `ADDITIONAL` existe na variante rejeitada/expirada |

### E — Leva e traz de veículo (`e-logistics-vehicle.test.ts`)

| Item | Conteúdo |
|---|---|
| Pré | `leva-e-traz-veiculo` (LOGISTICS, `requiresVehicle`), veículo `BRA2E19`, destino (oficina) como `destinationAddressId`, categoria `automotivo` com `requiresBeforeAfterPhotos`; `flags.requiresVehicleHandover = true`, `requiresCustody = true`, `custody_code` gerado |
| Passos | 1 criar (422 sem `vehicleId`); 2 aceite → `DRIVER_ASSIGNED`; 3 `provider.en_route` → `EN_ROUTE_PICKUP`; 4 `pickup` → 409 `requiresCustodyScan`; `POST .../custody/scan { itemCode: custody_code }` (código errado → 409); `pickup` → 409 `requiresVehicleHandover`; `POST .../vehicle-handover/PICKUP { odometerKm, checklist, photoUrls }`; `pickup` → 409 `requiresEvidence:PICKUP`; `POST .../evidence { PICKUP }`; `pickup` → `PICKED_UP`; 5 `depart`, `arrive_destination` (custódia registrada), `third_party_start` (prestador volta a ONLINE), `third_party_done`, `return_pickup` (novo scan), `return_depart`; 6 `deliver` com handover `DELIVERY` (PIN do cliente errado → 403; certo → ok) + evidência `DELIVERY` + scan → `DELIVERED`; 7 `complete` |
| Estados | `REQUESTED → MATCHING → OFFERED → DRIVER_ASSIGNED → EN_ROUTE_PICKUP → PICKED_UP → IN_TRANSIT → AT_DESTINATION → THIRD_PARTY_IN_PROGRESS → THIRD_PARTY_DONE → RETURN_PICKUP → RETURNING → DELIVERED → COMPLETED` |
| Efeitos | 4 `custody_events` (PICKED_UP, AT_DESTINATION, RETURN_PICKUP, DELIVERED) com `from/to_party`; 2 `vehicle_handovers`; `provider.location` só em estados `liveLocation`; `providers.availability` ONLINE durante `THIRD_PARTY_IN_PROGRESS`; captura 16000, fee 3200 |

### F — Lavanderia com custódia por QR (`f-laundry-custody.test.ts`)

| Item | Conteúdo |
|---|---|
| Pré | `lavanderia-coleta` (LAUNDRY), opção `sacos: 1`, `passar: true`; `flags.requiresCustody = true` forçado pelo tipo; sem handover de veículo |
| Passos | Mesmo ciclo de E sem `vehicle-handover`; `PICKED_UP` exige scan + foto `PICKUP`; `DELIVERED` exige scan + foto `DELIVERY`; cliente confirma recebimento (V1: PIN) |
| Estados | Idênticos a E (LAUNDRY compartilha a máquina) |
| Efeitos | Preço `8900 + 6900 + 4500 = 20300`; `custody_events.item_code` = código do saco; `getWorkflow('LAUNDRY').transitions.length === getWorkflow('LOGISTICS').transitions.length` |

### G — Concierge com revisão humana (`g-concierge-human.test.ts`)

| Item | Conteúdo |
|---|---|
| Pré | `CONCIERGE_PLANNER=rules`; cliente com veículo e endereço; operador logado |
| Passos | 1 `POST /v1/concierge/requests { TEXT, "Pegue meu carro amanhã às 8h, leve para revisão na concessionária e devolva quando terminar." }` → `tick()`; 2 `GET` → `plan` com 6 tarefas, `requiresHuman = true`, ordem em `NEEDS_HUMAN`, `incidents`/realtime `ops.order_needs_attention`; 3 operador ajusta plano (PUT conforme contrato) e `POST /v1/orders/:id/transition { operator.approve_plan }` → `PLAN_PROPOSED`, push `plan_proposed`; 4 cliente `POST /v1/concierge/requests/:id/approve-plan` → `PLAN_APPROVED` → `tick()` → `concierge.quote` → `QUOTED`; 5 cliente `approve` quote → `QUOTE_APPROVED`; `POST /v1/orders/:id/payments` → `authorize_payment` → `IN_EXECUTION`; 6 verificar ordens filhas (`parent_order_id`) por tarefa com `serviceSlug` e `order_tasks.child_order_id`; 7 concluir filhas (ou cancelar pela plataforma uma delas) → `tick()` → `system.children_completed` → `COMPLETED` |
| Estados | `SUBMITTED → INTERPRETING → NEEDS_HUMAN → PLAN_PROPOSED → PLAN_APPROVED → QUOTED → QUOTE_APPROVED → IN_EXECUTION → COMPLETED` |
| Efeitos | `concierge_requests.planner_name = 'rules@1'`, `operator_user_id`; nenhuma intent antes de `QUOTE_APPROVED`; `concierge_submitted`, `concierge_plan_approved`; `allChildrenDone` bloqueia enquanto houver filha `IN_PROGRESS` |

### H — Matriz de cancelamento (`h-cancellation-matrix.test.ts`)

| Caso | Estado no cancelamento | Ator | Esperado |
|---|---|---|---|
| H1 | `MATCHING` | cliente | `CANCELLED_BY_CUSTOMER`, fee 0, ofertas `WITHDRAWN`, sem intent |
| H2 | `ACCEPTED` + 5 min (`advance`) | cliente | fee 0; intent `INITIAL` `CANCELLED` (`cancelAuthorization`); prestador ONLINE; push `order_cancelled` ao prestador |
| H3 | `ACCEPTED` + 30 min | cliente | fee 1500 → intent `CANCELLATION_FEE` 1500 `CAPTURED`; ledger `CANCELLATION_FEE` CREDIT `PROVIDER` 1500; `cancellation_fee_cents = 1500` |
| H4 | `EN_ROUTE`, preço 11000 | cliente | fee `max(2000, 2200) = 2200` |
| H5 | `EN_ROUTE`, preço 8000 | cliente | fee 2000 (mínimo) |
| H6 | `IN_PROGRESS` | cliente | 409 `customerCancelAllowed` ("abra uma contestação") |
| H7 | `ACCEPTED` | outro cliente | 409 `actorIsOrderCustomer` |
| H8 | `ACCEPTED` | prestador | `MATCHING`, `reputation.penalizeProviderCancel` (`cancelled_count++`), `dispatch.restart` → nova onda sem o prestador (`alreadyOffered`), push `order_cancelled` ao cliente |
| H9 | `IN_PROGRESS` | prestador | 409 `providerCancelAllowed` |
| H10 | `ACCEPTED` com PIX pago | ops (`operator.cancel`) | `CANCELLED_BY_PLATFORM`, `refund` integral (`refunds` + `REFUNDED`), ambos notificados, `audit_logs` |
| H11 | `SCHEDULED` aceito, `booking` | cliente | `booking.release` (`released_at`), jobs de lembrete cancelados (`CANCELLED`) |
| H12 | `REVIEWED` | cliente | 409 `TERMINAL` |

### I — Nenhum prestador e dispatch manual (`i-no-provider-manual.test.ts`)

| Item | Conteúdo |
|---|---|
| Pré | 3 prestadores: P1 ONLINE a 2 km (rejeita), P2 ONLINE a 8 km (não responde), P3 OFFLINE a 1 km; `matching_configs` global com `DEFAULT_WAVES` |
| Passos | 1 criar → `tick()` → onda 0 (raio 5): só P1 ofertado; P1 `reject` → antecipa; onda 1 (raio 10): P2 ofertado (P1 não repete); `advance(120 s)` → `EXPIRED`; onda 2 (raio 20): ninguém novo → `ESCALATE_TO_OPS` → `NO_PROVIDER_FOUND`; 2 `GET /v1/ops/orders?attention=true` lista a ordem; `GET /v1/ops/orders/:id/candidates` inclui P3 com "Prestador indisponível"; 3 P3 fica ONLINE; ops `POST /v1/ops/orders/:id/assign { providerId: P3, note }` → `ACCEPTED`; 4 variante: P1 e P2 aceitam "ao mesmo tempo" na mesma onda (duas requisições concorrentes) → uma 200, outra 409 `OFFER_UNAVAILABLE`/`CONFLICT`; ofertas restantes `WITHDRAWN` |
| Estados | `REQUESTED → MATCHING → OFFERED → MATCHING → OFFERED → MATCHING → NO_PROVIDER_FOUND → ACCEPTED` |
| Efeitos | 3 `dispatch_rounds` (outcomes `EXPIRED`/`NEXT_WAVE`/`ESCALATED`) + 1 manual (`wave = −1`); `incidents(NO_PROVIDER)`; realtime `ops.order_needs_attention`; `no_provider_found` com `wavesTried = 3`; `provider_stats(P2).offers_received = 1, offers_accepted = 0`; `audit_logs(ops.order.assign)`; `payments.authorize` executado no assign |

### J — Pagamentos: PIX, recusas e webhooks (`j-payments.test.ts`)

| Caso | Passos | Esperado |
|---|---|---|
| J1 PIX pago | Pedido com `methodKind: PIX`; aceite cria intent `REQUIRES_ACTION` com `pix.qrCode`; `settlePix(ref)` → webhook | `CAPTURED`, `webhook_events.processed_at`, realtime `payment.updated`, `payment_completed` |
| J2 PIX expirado e novo PIX | `advance(31 min)` → `payment.reconcile` → `FAILED (pix_expired)`; `POST /v1/orders/:id/payments { PIX }` | Segunda intent `REQUIRES_ACTION`; ordem inalterada; `payment_failed` |
| J3 Webhook duplicado | Reenviar o mesmo corpo | 200 `duplicate: true`; sem novo ledger |
| J4 Webhook malformado / assinatura (Pagar.me com `fetchImpl` falso e `webhookSecret`) | Corpo inválido; assinatura errada | 401; nada em `webhook_events` |
| J5 Cartão recusado | `tok_sandbox_0002` | Intent `FAILED card_declined`; 402 quando síncrono; push `payment_failed`; ordem segue `ACCEPTED`; novo método `4242` → `AUTHORIZED` |
| J6 Captura falha | `tok_sandbox_0004` até `complete` | `COMPLETED` mantido; intent `AUTHORIZED`; `incidents(PAYMENT_FAILURE)`; `wallet.settle` não executado (sem `PROVIDER_EARNING`); `scheduled_jobs(payment.reconcile)` |
| J7 Idempotência de intent | Dois `payments.authorize` para a mesma ordem (replay do efeito) | Uma intent (`payment_intents_idem_uq`) |
| J8 Comissão por regra | `commission_rules` categoria `lavanderia` 15 % mín. 500 | Ordem de lavanderia usa 15 %; hidráulica usa global 20 % |
| J9 Produção recusa sandbox | `loadConfig({ NODE_ENV: 'production', PAYMENTS_PROVIDER: 'sandbox', ... })` | lança "PAYMENTS_PROVIDER=sandbox" |

### K — Disputa e reembolso (`k-dispute-refund.test.ts`)

| Item | Conteúdo |
|---|---|
| Pré | Cenário A concluído (`CAPTURED` 9900, `PROVIDER_EARNING` 8800) |
| Passos | 1 cliente `POST /v1/orders/:id/disputes { DAMAGE, description, evidenceUrls }` → `DISPUTED`; segunda disputa → 409; 2 `GET /v1/providers/me/wallet` → `heldCents = 8800`, `balanceCents` não inclui; `advance` até quarta 06:00 → `payout.batch` não inclui a ordem; 3 ops `POST /v1/ops/disputes/:id/resolve { RESOLVED_SPLIT, refundCents: 4000, note }` → `CLOSED`; 4 variante `RESOLVED_CUSTOMER` com 9900; variante `REJECTED` |
| Estados | `COMPLETED → DISPUTED → CLOSED` |
| Efeitos | SPLIT: `refunds(4000, DONE via webhook)`, intent `PARTIALLY_REFUNDED`, payout recalculado por `settle`, `held_cents = 0`, `disputes.resolution`; CUSTOMER: `REFUNDED`, estorno de `PROVIDER_EARNING` e `PLATFORM_FEE`, prestador 0; REJECTED: `customer_risk_signals.disputes_rejected_90d = 1`; `dispute_update` para ambos; `audit_logs`; `dispute_opened`; ledger balanceado em todas |

### L — Assinatura (`l-subscription.test.ts`)

| Item | Conteúdo |
|---|---|
| Pré | Plano `ac-essencial` (12 meses, 2 visitas, R$ 299), 1 equipamento, cartão `4242` |
| Passos | 1 `POST /v1/me/subscriptions` → intent `SUBSCRIPTION` 29900 `CAPTURED`; `next_visit_due_at = nextVisitDue(null, started, 12, 2)` (+6 meses); 2 `advance(6 meses)` → `subscription.generate_visit` cria ordem `SCHEDULED` com `metadata.subscriptionId` e `subscription_visits`; matching 6 h antes; concluir; `last_visit_at`, próxima visita; 3 `advance` até `next_charge_at` com cartão `0002` → `PAST_DUE`, push `payment_failed`; 3 tentativas → `PAUSED`; 4 `POST /v1/me/subscriptions/:id/cancel` → `CANCELLED`, visitas futuras não aceitas → `CANCELLED_BY_PLATFORM` |
| Estados | Assinatura `ACTIVE → PAST_DUE → PAUSED → CANCELLED`; visita `SCHEDULED → ... → COMPLETED` |
| Efeitos | `settle` da visita com base `29900 / 2`; `subscription_started`, `subscription_cancelled`; home mostra seção `subscriptions`/`equipment_due` conforme regras |

## 5. Testes de segurança (`apps/api/test/security/*.test.ts`)

| ID | Teste | Esperado |
|---|---|---|
| S-01 | Prestador B chama `start/complete/transition` na ordem do prestador A | 409 `INVALID_TRANSITION` com `guard: actorIsAssignedProvider` (ou 404 se não visível) |
| S-02 | Cliente Y lê/cancela/avalia ordem de X | 404 em `GET`; 409 `actorIsOrderCustomer` em cancel; 404/403 em review |
| S-03 | Cliente chama `/v1/ops/*` e `/v1/admin/*`; operador chama `/v1/admin/settings` | 403 `FORBIDDEN` |
| S-04 | Cliente dispara `system.start_matching`/`operator.assign` via `/transition` | 409 `FORBIDDEN_ACTOR` ou 403 |
| S-05 | `startPin` nunca aparece em `GET /v1/orders/:id` para prestador, em `GET /v1/providers/me/offers`, nem em `order_events.payload`; aparece para o cliente | Serializador por papel |
| S-06 | Oferta mostra `approxLocation` (bairro, coordenadas arredondadas) e **não** `address.summary`/`instructions` antes do aceite; após aceite o prestador vê endereço | |
| S-07 | PIN: errado → 409; 5 erros seguidos → 429 na rota `start` (conforme contrato) | |
| S-08 | OTP: 6 tentativas erradas → 429; código expirado (`advance(301 s)`) → 401; reuso de `challengeId` consumido → 401; 4º pedido em 10 min → 429 | |
| S-09 | JWT: expirado (`advance(16 min)`) → 401; assinatura adulterada → 401; `roles` adulterados sem reassinar → 401 | `verifyJwt` com `timingSafeEqual` |
| S-10 | Refresh: rotação; reuso do antigo → 401 e cadeia revogada; logout revoga | |
| S-11 | Rate limit global: 301 requisições/min do mesmo usuário → 429 `RATE_LIMITED` | |
| S-12 | Webhook forjado (assinatura inválida), replay (duplicado), intent inexistente | 401 / 200 duplicate / 200 com `error = intent_not_found` |
| S-13 | Realtime: `order.subscribe` em ordem alheia não entra na sala (nenhum `order.updated` recebido); handshake sem token → `connect_error`; `location.push` de socket sem `providerId` ignorado | `socket.io-client` |
| S-14 | Logs: requisições com `Authorization`, `password`, `code`, `pin` não aparecem em claro no `pino` capturado | `redact` |
| S-15 | Analytics: evento com `properties.phone` é descartado; `user_id` do corpo é ignorado | |
| S-16 | Prestador `PENDING` tenta `ONLINE` → 403; `SUSPENDED` perde ofertas pendentes (`WITHDRAWN`) | |
| S-17 | Config de produção com adaptadores de dev → `loadConfig` lança; `createDb` sem URL em produção lança | |
| S-18 | Zod: campos extras ignorados, tipos errados → 400 com `details[].path`; corpo > 2 MiB → 413 | |

## 6. Testes de carga iniciais (k6, staging com Postgres real)

| Cenário | Script | Carga | Métrica de aceite |
|---|---|---|---|
| Criação de pedido | `k6/create-order.js`: OTP (pré-gerado) → `POST /v1/requests` com `idempotencyKey` único → `GET /v1/orders/:id` | 50 VUs por 5 min (≈ 20 req/s) | p95 `POST /v1/requests` < 500 ms; 0 erros 5xx; `REQUESTED → OFFERED` < 5 s em 95 % (PRD 10.1) medido por `order_events` |
| Aceite concorrente | `k6/accept-race.js`: 1 ordem, 8 prestadores ofertados (config de onda 8), todos `POST /v1/offers/:id/accept` no mesmo instante | 200 rodadas | Exatamente um 200 por ordem; demais 409; nenhuma ordem com 2 `provider_id`; nenhum deadlock |
| Localização | `k6/location.js`: 500 prestadores enviando `POST /v1/providers/me/location` a cada 10 s | 15 min | p95 < 150 ms; `provider_locations` cresce linearmente; CPU da API < 70 % |
| Leitura de ordem + realtime | 300 clientes em `GET /v1/orders/:id` a cada 5 s + sockets conectados | 10 min | p95 < 200 ms; eventos `order.updated` entregues em < 1 s |
| Outbox/scheduler sob carga | Durante os cenários acima, medir `domain_events` pendentes e `scheduled_jobs` atrasados | | pendentes < 200; atraso de job < 5 s |
| Webhooks em rajada | 100 webhooks/s (50 % duplicados) | 2 min | 100 % 200; `webhook_events` sem duplicata; p95 < 100 ms |

Rodar antes do piloto aberto (M6) e a cada mudança em transações da ordem.

## 7. Testes manuais em dispositivo (checklist por tela)

Executar em iOS e Android reais, rede 4G, com `PAYMENTS_PROVIDER=sandbox` em staging. Referência de telas em `10_SCREEN_INVENTORY.md`.

### 7.1 VÉLIO (cliente)

| Tela | Verificações |
|---|---|
| Login OTP | Telefone com máscara; reenvio após 60 s; código errado mostra erro claro; 5 erros bloqueiam; voltar não perde o challenge |
| Onboarding | Nome, consentimentos (termos/privacidade obrigatórios; marketing/personalização opcionais e desmarcados); `needsOnboarding` some |
| Home | Saudação; `contextHint` coerente (hora/equipamento/ordem ativa); seções da hora certa (manhã/tarde/noite); ordem ativa no topo; sem seção vazia |
| Categoria / Serviço | Preço, faixa ou "orçamento após análise"; opções alteram o preço na hora (`estimate`); duração estimada; botão único "Pedir agora"/"Agendar" conforme `allows*` |
| Endereço | Mapa, autocomplete, instruções; fora da região → mensagem de lista de espera |
| Checkout | Resumo, `breakdown`, cupom (válido/inválido), método de pagamento, janela; taxa de cancelamento explicada; confirmação cria ordem em < 3 s |
| Acompanhamento | Linha do tempo por `order_events`; mapa só em `EN_ROUTE`/`ARRIVED`; ETA; PIN em destaque em `ARRIVED`; chat; botão cancelar com valor exato da taxa |
| Orçamento adicional | Push abre a tela; itens; `[RECUSAR] [APROVAR]`; expiração visível |
| PIX | QR legível, copiar código, contador de expiração, atualização automática ao pagar, "gerar novo PIX" após expirar |
| Conclusão / Avaliação | Fotos antes/depois; nota, tags, comentário; só após `COMPLETED`; prazo de 7 dias |
| Disputa | Motivos; upload de fotos; status; nota da resolução |
| Perfil | Endereços, veículos, equipamentos (próxima manutenção), pagamentos (last4), notificações, assinaturas, exportar/excluir conta |
| Offline / erros | Sem rede: estado anterior visível, ação falha com mensagem; 409 mostra motivo do guard; 401 renova silenciosamente |

### 7.2 VÉLIO Pro (prestador)

| Tela | Verificações |
|---|---|
| Onboarding | Documento com máscara; categorias; raio; upload de documentos com status; `PENDING` explica próximos passos |
| Disponibilidade | Toggle ONLINE pede permissão de localização "sempre"; `PENDING` não consegue ficar online; `BUSY` não editável |
| Oferta | Push abre a oferta; contador de expiração; bairro + distância + repasse; sem endereço exato; aceitar/recusar; oferta aceita por outro some com aviso |
| Execução | Um botão principal por estado (A caminho → Cheguei → Iniciar (PIN + foto antes) → Concluir (foto depois)); erros de guard em pt-BR; GPS envia a 10 s/3 s em deslocamento, 120 s em execução, 60 s ocioso, nada offline (verificar consumo de bateria em 1 h) |
| Orçamento | Criar itens; ver decisão do cliente; bloqueio de concluir com orçamento pendente |
| Custódia / handover | Leitura de QR; odômetro, combustível, checklist, fotos; PIN do cliente na devolução |
| Carteira | Saldo, pendente, retido, próxima quarta; extrato; repasses |
| Indicadores | Aceite, cancelamentos, nota, tempo de resposta (30 dias) |
| Agenda | Janelas semanais, folgas; ordens agendadas; lembretes |

### 7.3 Web `/ops` e `/admin`

| Tela | Verificações |
|---|---|
| Login | E-mail/senha; erro genérico; bloqueio após 10 falhas |
| Mapa e filas | Ordens e prestadores em tempo real; filtro `attention`; SLA com cor |
| Ordem | Linha do tempo, ofertas com `score_breakdown`, pagamentos, chat (entrar como operador), PIN com aviso de auditoria |
| Dispatch manual | Candidatos ranqueados com motivos; atribuir em 3 cliques; 409 explicado |
| Disputas / incidentes | Evidências lado a lado; resolver com nota; incidentes por severidade |
| Concierge | Plano editável; aprovar; tarefas filhas |
| Admin | CRUD de cada recurso com validação Zod inline; nova categoria aparece no app sem deploy; settings; aprovação de prestador com documentos; dashboard; `audit_logs` |

## 8. Critérios de aceite de release

| Critério | Medida |
|---|---|
| `pnpm check` verde | lint (Biome), typecheck strict em todos os pacotes, testes de domínio, integração e cenários A–L, build de api/web/mobile (typecheck) |
| Cobertura | Domínio ≥ 90 % de linhas; módulos da API ≥ 75 %; toda transição de cada `WorkflowDefinition` exercitada por pelo menos um teste (verificado por script que compara `describeWorkflow` com ações registradas em `order_events` dos testes) |
| Segurança | S-01..S-18 verdes; checklist 14 §13 itens 1–8 e 12 concluídos; nenhum segredo em repositório (scan) |
| Pagamentos | Matriz 13 §15 P-01..P-21 verde no sandbox; homologação 13 §16 concluída para produção real |
| Dados | Migrações aplicam em PGlite e Postgres 16 limpos e sobre o banco de staging; seed idempotente (rodar 2× sem diff) |
| Operação | Runbooks 15 §10 testados em staging (job travado, webhook com erro, outbox com handler falho) |
| Carga | §6 dentro das metas em staging |
| Manual | Checklist §7 sem bloqueadores em iOS e Android; contraste AA e leitor de tela nas telas MVP |
| Métricas | Eventos de analytics do funil completo presentes após cenário A em staging |
| Divergências documentadas | Lista abaixo revisada e refletida em PRD/ADR ou corrigida em código |

Divergências código × documentação anterior identificadas durante a derivação destes documentos (a resolver antes do release do MVP):

| # | Onde | Divergência | Proposta |
|---|---|---|---|
| 1 | ADR-008 vs `lib/password.ts` | ADR cita Argon2id; código usa scrypt (N=2^15) | Atualizar ADR (scrypt sem dependência nativa) ou trocar para Argon2id |
| 2 | PRD §10 vs `contracts/analytics.ts` | Nomes de eventos divergentes (`service_viewed`, `order_created`, `quote_decided`, `order_completed`, `review_submitted`, `payment_recovered`) | Alinhar PRD ao enum; `payment_recovered` derivado |
| 3 | 06 §3 vs schema | `otp_codes` → `otp_challenges`; `ticket_messages` inexistente; `addresses` em `identity.ts`; `vehicle_handovers` ausente no 06 | Atualizar 06 |
| 4 | 11 §2.3 vs `quoteWorkflow` | Diagrama QUOTE sem `MATCHING/OFFERED`; código tem `REQUESTED → MATCHING → OFFERED → UNDER_REVIEW` | Atualizar 11 (resolve PRD 13.2) |
| 5 | 02 §4.3 vs `OrderStatus` | `CANCELLED_NO_SHOW` citado, não existe no enum | Decidir: adicionar status ou mapear para `CANCELLED_BY_PROVIDER` com `cancel_reason = NO_SHOW` |
| 6 | 02 §4.5 vs efeitos | Nota ≤ 2 → ticket automático + hold não está em `EffectName` | Implementar no handler de `customer.review` (conforme contrato) ou adicionar efeito `support.autoTicket` |
| 7 | Schema (07 §1.5) | `addresses.lat/lng`, `banners.starts_at/ends_at` como `text`; `workflow_definitions.active` text; `vehicle_handovers.customer_confirmed` text | Migração 0001 |
| 8 | `config.ts` | `PAGARME_WEBHOOK_SECRET` opcional em produção | Tornar obrigatório quando `PAYMENTS_PROVIDER=pagarme` |
| 9 | `lib/jwt.ts: sha256` | HMAC com chave fixa `'velio-hash'`; inadequado para `document_hash` | Segredo dedicado de ambiente |
| 10 | README vs repositório | `pnpm test:scenarios` aponta para `apps/api/test/scenarios` inexistente; `apps/mobile` e `apps/web` sem código além de config | Criar com M1/M2 |
| 11 | `api.ts` | Não expõe `POST /v1/auth/refresh` (feito por `HttpClient`) nem `PATCH /v1/me/notifications/:id/read`, `GET /v1/admin/audit-logs` | Adicionar ao cliente quando os módulos existirem |
| 12 | PRD §12 vs seed | PRD tira assinaturas e QUOTE/LOGISTICS/LAUNDRY do MVP; seed já publica planos e serviços desses tipos | Admin desativa (`active=false`) o que não entra no piloto; manter seed completo para V1 |
