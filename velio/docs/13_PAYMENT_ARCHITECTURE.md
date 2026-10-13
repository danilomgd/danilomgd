# 13 — Arquitetura de Pagamentos

Derivado de `apps/api/src/adapters/{ports,sandbox,pagarme,index}.ts`, `apps/api/src/config.ts`, `apps/api/src/modules/payments/{service,routes,index}.ts`, `apps/api/src/modules/wallet/{service,routes,index}.ts`, `apps/api/src/modules/effects.ts`, `apps/api/src/modules/registry.ts`, `packages/domain/src/pricing/{commission,estimate}.ts` (+ `pricing.test.ts`), `packages/domain/src/policies/cancellation.ts`, `packages/contracts/src/payments.ts` e `apps/api/src/db/schema/payments.ts`. Cenários A (cartão autorizado → capturado, ledger), B (agendado), C (assinatura) e D (lavanderia) em `apps/api/test/scenarios` cobrem o caminho feliz. Itens **(previsto)** não existem no código.

## 1. Princípios (ADR-007, ADR-015, ADR-016)

| Princípio | Implementação |
|---|---|
| Porta e adaptadores | Módulos falam só com `adapters.payments: PaymentGateway`; `buildAdapters` escolhe `SandboxGateway` ou `PagarmeGateway` por `PAYMENTS_PROVIDER` |
| Nenhum PAN no servidor | `AddPaymentMethodInput.CARD` traz só `gatewayToken` + `holderName`; `payment_methods` guarda token, `last4` (derivado do token), `brand = 'card'` |
| Dinheiro inteiro | Centavos; `roundHalfUp = floor(n + 0,5)`; `applyBps` |
| Nada é cobrado sem aprovação | Pré-autorização no aceite; captura em `COMPLETED`; `ADDITIONAL` só após `quotes.status = APPROVED`; `QUOTE`/`CONCIERGE` só após `customer.approve_quote` |
| Ledger próprio | `wallet.journal()` recusa lançamentos desbalanceados e atualiza `balance_cents` |
| Nada de mock em produção | `loadConfig` lança com `PAYMENTS_PROVIDER=sandbox` em produção |
| Falha de gateway não quebra a ordem | `createAndAuthorize` nunca lança por recusa: grava intent `FAILED` e notifica; efeitos pós-commit registram `effect.failed` |

## 2. Porta `PaymentGateway` (`ports.ts`)

| Método | Entrada | Saída | Uso no módulo |
|---|---|---|---|
| `createPixCharge` | `{ amountCents, referenceId, expiresInSeconds, customer { userId, name } }` | `{ gatewayRef, qrCode, copyPaste, expiresAt }` | `createAndAuthorize` com `methodKind = PIX`, `expiresInSeconds = 1800`, `referenceId = ${orderId}:${kind}` |
| `authorizeCard` | `{ amountCents, referenceId, cardToken, customer }` | `{ ok, gatewayRef } \| { ok: false, code, message }` | Pré-autorização de `INITIAL`, `ADDITIONAL`, `CANCELLATION_FEE`; `chargeSubscription` |
| `capture` | `{ gatewayRef, amountCents }` | `{ ok } \| erro` | `capture(order)` por intent; `chargeSubscription`; captura da taxa de cancelamento |
| `cancelAuthorization` | `{ gatewayRef }` | `void` | `cancelAuthorization(order)`; troca de método |
| `refund` | `{ gatewayRef, amountCents }` | `{ ok, refundRef } \| erro` | `refund(order, amount)`; devolução do excedente PIX na taxa de cancelamento |
| `tokenizeForTests?` | cartão | `{ token, brand, last4 }` | Só sandbox |
| `parseWebhook` | `rawBody`, `headers` | `{ externalId, eventType, gatewayRef, status: PAID\|FAILED\|REFUNDED\|EXPIRED\|OTHER, amountCents? } \| null` | `handleWebhook` |

`Adapters` inclui `clock` (`SystemClock`/`FakeClock`): expiração de PIX, lotes de repasse e lembretes são determinísticos nos testes.

### 2.1 Seleção (`adapters/index.ts`, `config.ts`)

| `PAYMENTS_PROVIDER` | Adaptador | Exigências |
|---|---|---|
| `sandbox` (padrão) | `SandboxGateway` | Recusado em `NODE_ENV=production` |
| `pagarme` | `PagarmeGateway(PAGARME_SECRET_KEY, PAGARME_WEBHOOK_SECRET)` | `PAGARME_SECRET_KEY` obrigatório (lança); `PAGARME_WEBHOOK_SECRET` opcional: **sem ele o webhook não é verificado** (tornar obrigatório em produção, §16) |

## 3. Adaptador sandbox (`sandbox.ts`)

Determinístico e em memória. Convenções por sufixo do token (`tokenizeForTests` gera `tok_sandbox_<last4>`):

| Token termina em | `authorizeCard` | `capture` | Uso em testes |
|---|---|---|---|
| `0002` | `{ ok: false, code: 'card_declined', message: 'Cartão recusado pelo emissor' }` | — | Recusa na pré-autorização → intent `FAILED`, push `payment_failed`, ordem segue aguardando novo método |
| `0009` | `{ ok: false, code: 'insufficient_funds', message: 'Saldo insuficiente' }` | — | Recusa por saldo |
| `0004` | ok com `gatewayRef = auth_<uuid>_capfail` | `{ ok: false, code: 'capture_failed' }` | Falha na captura em `COMPLETED` → `incidents(PAYMENT, HIGH)` |
| outro (`4242`) | ok | ok | Caminho feliz (harness usa `tok_sandbox_4242`) |

| Operação | Sandbox |
|---|---|
| `createPixCharge` | `pix_<uuid>`; `qrCode` imita EMV; `copyPaste = sandbox-pix-<ref>`; `expiresAt = now + expiresInSeconds` (relógio real do processo, não o `FakeClock`) |
| `settlePix(ref)` | Marca pago e devolve o JSON do webhook `{ id: evt_..., type: 'charge.paid', data: { id, status: 'paid', amount } }` para `POST /v1/payments/webhooks/sandbox` |
| `capture` | `authorization_not_found` se cancelada/inexistente; soma `captured` (`gateway.authorizations.get(ref).captured` é verificado no cenário A) |
| `refund` | Soma `refunded`; aceita PIX existente; `not_found` caso contrário |
| `parseWebhook` | Sem assinatura; mapeia `data.status` paid/failed/refunded/expired; JSON inválido → `null` (API responde 400) |

## 4. Adaptador Pagar.me v5 (`pagarme.ts`)

| Operação | Chamada | Mapeamento |
|---|---|---|
| Auth | `Authorization: Basic base64(secretKey + ':')` | |
| `createPixCharge` | `POST /core/v5/orders` (`payments: [{ payment_method: 'pix', pix: { expires_in } }]`, `code = referenceId`, `customer.code = userId`, `customer.name ?? 'Cliente VÉLIO'`) | `gatewayRef = charges[0].id`; `qrCode = copyPaste = last_transaction.qr_code` |
| `authorizeCard` | `POST /orders` (`credit_card: { operation_type: 'auth_only', installments: 1, card_token }`) | ok se `status ∈ { authorized_pending_capture, paid }`; senão `code = acquirer_return_code ?? status`; exceção → `gateway_error` |
| `capture` | `POST /charges/{id}/capture { amount }` | parcial permitida |
| `cancelAuthorization` | `DELETE /charges/{id}` | |
| `refund` | `DELETE /charges/{id} { amount }` | `refundRef = id` |
| `parseWebhook` | `X-Hub-Signature: sha256=<HMAC-SHA256(rawBody)>` com `timingSafeEqual` (só se `webhookSecret`); `charge.paid → PAID`, `charge.payment_failed → FAILED`, `charge.refunded → REFUNDED`, `charge.pending → OTHER`, outros → `OTHER` | `null` em assinatura inválida/JSON malformado |

Lacunas a homologar (§16): sem `charge.antifraud_reproved`, `charge.chargedback`, PIX expirado real; `installments` fixo 1; sem payload de antifraude (CPF, endereço); sem retry HTTP; sem testes automatizados (`fetchImpl` injetável permite fixtures).

## 5. Ciclo de vida de `payment_intents`

### 5.1 Estados implementados

```
                         createPixCharge              webhook PAID               payments.capture (COMPLETED)
 criar ──► REQUIRES_ACTION ───────────────────────► AUTHORIZED ──────────────────────────► CAPTURED ──► REFUNDED / PARTIALLY_REFUNDED
   │            │ webhook FAILED/EXPIRED,                 │ cancelAuthorization /                   (refund, webhook REFUNDED)
   │            │ job payment.pix_timeout (CANCELLED)     │ troca de método
   │            ▼                                         ▼
   ├──► FAILED (authorizeCard ok:false, no_payment_method, insufficient_wallet, capture_failed)
   └──► AUTHORIZED (authorizeCard ok / WALLET com saldo) ──► CANCELLED
```

Diferença importante em relação à intenção original: **PIX pago fica `AUTHORIZED`**, não `CAPTURED`; a captura lógica acontece em `COMPLETED` como nas demais (sem chamada ao gateway para PIX). Isso mantém `hasAuthorizedInitial` uniforme e permite `chargeCancellationFee` reter a taxa do PIX já pago.

| Transição | Gatilho | Efeito |
|---|---|---|
| → `REQUIRES_ACTION` | PIX criado (`createInitialPixIntent` na criação da ordem, ou `createIntentForOrder`) | `pix_*`, `gateway_ref`; outbox `payment.updated` |
| → `AUTHORIZED` | `authorizeCard` ok; `WALLET` com saldo (`gateway = 'wallet'`, `wallet_applied_cents`) | |
| → `FAILED` | recusa do cartão (`failure_code` do gateway), `no_payment_method`, `insufficient_wallet`, webhook `FAILED`/`EXPIRED` (`failure_code = 'failed'\|'expired'`), captura falha (`capture_failed`, `wallet_debit_failed`) | push `payment_failed` + `analytics payment_failed` |
| `REQUIRES_ACTION` → `AUTHORIZED` | webhook `PAID` | push `payment_approved`; `onAuthorized` |
| `REQUIRES_ACTION` → `CANCELLED` | job `payment.pix_timeout` (15 min após criação da ordem) com `failure_code = pix_timeout` | ordem → `operator.cancel` pelo sistema ("PIX não pago") |
| `AUTHORIZED` → `CAPTURED` | `payments.capture` (`captured_cents = amount_cents` de cada intent) | push `payment_approved` ("Pagamento de R$ 80,00 confirmado."), `payment_completed` |
| `AUTHORIZED`/`REQUIRES_ACTION` → `CANCELLED` | `payments.cancelAuthorization` (cancelamentos) ou troca de método | |
| `CAPTURED` → `REFUNDED`/`PARTIALLY_REFUNDED` | `refund()` ou webhook `REFUNDED` | `refunds(DONE\|FAILED)` |

### 5.2 Tipos e momento de criação

| kind | Quando | Valor | Captura |
|---|---|---|---|
| `INITIAL` | Cartão/carteira: efeito `payments.authorize` em `provider.accept`/`operator.assign` (IMMEDIATE, SCHEDULED, LOGISTICS, LAUNDRY) e em `customer.approve_quote` (CONCIERGE); PIX: **na criação da ordem** (`createInitialPixIntent`), e o dispatch só começa após `PAID` | `total_cents` da ordem (`price − discount`; `RANGE` usa `minCents` como preço) | `COMPLETED` |
| `ADDITIONAL` | `quotes.approve()` de um `ADDITIONAL` (`authorizeAdditional`) | `quotes.amount_cents`; `idempotency_key = ${orderId}:ADDITIONAL:${quoteId}` | `COMPLETED`, junto da inicial |
| `SUBSCRIPTION` | `POST /v1/me/subscriptions` e job `subscription.charge` (`chargeSubscription`: cartão obrigatório; autoriza e captura na hora) | `subscription_plans.price_cents` | imediata |
| `CANCELLATION_FEE` | `payments.chargeCancellationFee` quando `customerCancellation().feeCents > 0` e havia prestador | `feeCents` | imediata (cartão autoriza+captura; PIX pago retém da intent original) |

`QUOTE`: `payments.authorize` **não** está em `customer.approve_quote`; o cliente chama `POST /v1/orders/:id/payments` e, autorizado, `onAuthorized` dispara `customer.authorize_payment` pelo sistema (`QUOTE_APPROVED → AUTHORIZED`). Em CONCIERGE a definição tem `payments.authorize` em `approve_quote`, então a autorização é automática com o método padrão.

Invariantes mantidos pelo código: `authorizeForOrder` reutiliza intent `INITIAL` viva (`AUTHORIZED`/`CAPTURED`/`REQUIRES_ACTION`); `createIntentForOrder` cancela as anteriores antes de criar; `paymentAuthorized` no snapshot = `total ≤ 0 || billedViaParent || coveredByPlan || INITIAL em AUTHORIZED/CAPTURED`.

## 6. Fluxos

### 6.1 Cartão

1. App tokeniza no SDK → `POST /v1/me/payment-methods { CARD, gatewayToken, holderName }`.
2. Aceite → `payments.authorize` → `authorizeCard(total, ${orderId}:INITIAL, token)` → `AUTHORIZED` (cenário A: 8000) ou `FAILED` + push.
3. Recusa: ordem permanece `ACCEPTED`; cliente troca método em `POST /v1/orders/:id/payments`; não há prazo automático nem cancelamento por falta de pagamento no cartão **(previsto: job `payment.reconcile` com limite de 5 min, PRD 13.1)**. O guard `paymentAuthorized` só bloqueia em QUOTE/CONCIERGE; em IMMEDIATE o prestador pode seguir sem autorização (risco aceito no MVP; UI deve alertar).
4. Orçamento adicional aprovado → `authorizeAdditional` imediata.
5. `COMPLETED` → `capture` de cada intent `AUTHORIZED` pelo seu `amount_cents` (cenário A: `captured = 8000` no sandbox); falha → intent `FAILED` + `incidents(PAYMENT, HIGH)`; `wallet.settle` roda **independentemente** da captura (efeito seguinte na lista) — ver risco §17.
6. Validade da pré-autorização em agendados distantes: não tratada **(previsto)**.

### 6.2 PIX

1. `POST /v1/requests` com método PIX → intent `REQUIRES_ACTION` (QR, 30 min) **e** `metadata.awaitingPixPayment = true`; o `dispatch.start` **não** é agendado; job `payment.pix_timeout` em +15 min.
2. Webhook `PAID` → `AUTHORIZED` → `onAuthorized` → `releaseForDispatch`: limpa a flag, cancela o timeout, agenda `dispatch.start` (ou `concierge.plan`). Isso resolve a pergunta 13.1 do PRD: o prestador só é procurado com PIX pago.
3. Sem pagamento em 15 min: intent `CANCELLED (pix_timeout)` e `operator.cancel` pelo sistema → `CANCELLED_BY_PLATFORM`, notificações; para tentar de novo o cliente cria outra ordem (não há "novo PIX" na mesma ordem após o timeout; antes dele, `POST /v1/orders/:id/payments` gera novo QR).
4. `expireStalePix(now)` existe no serviço mas nenhum job o chama **(previsto: `payment.reconcile`)**; o QR de 30 min do gateway expira sem refletir na intent até o webhook `EXPIRED`.
5. Em `COMPLETED`, `capture` marca `CAPTURED` sem chamar o gateway; se `total < amount` (RANGE concluído abaixo), não há reembolso automático **(previsto)**.

### 6.3 Carteira

`methodKind = WALLET` ou método padrão `WALLET`: `createAndAuthorize` verifica `wallet.balance('USER')`; insuficiente → `FAILED insufficient_wallet`; suficiente → `AUTHORIZED` (`gateway = 'wallet'`, sem reserva do saldo). Captura → `debitCustomer` (journal `wallet_payment`: DEBIT usuário / CREDIT clearing; 402 se o saldo sumiu entre autorização e captura → `wallet_debit_failed`). `useWalletCredit` (misto) **(previsto)**. Saldo nasce de `creditCustomer` (reembolso para carteira quando a intent original era `WALLET`).

## 7. Taxa de cancelamento (`customerCancellation` + `chargeCancellationFee`)

`settings.cancellation` (`platform_settings`, padrão `DEFAULT_CANCELLATION`): `freeMinutesAfterAccept 10`, `lateFeeCents 1500`, `enRouteFeeBps 2000`, `enRouteFeeMinCents 2000`.

| Estado anterior | Resultado do domínio | Efeito implementado |
|---|---|---|
| `REQUESTED`, `MATCHING`, `OFFERED`, `SCHEDULED`, `NO_PROVIDER_FOUND`, `UNDER_REVIEW`, `QUOTED`, `QUOTE_REJECTED`, `SUBMITTED`, `INTERPRETING`, `PLAN_PROPOSED`, `NEEDS_HUMAN`, `PLAN_APPROVED` | grátis | `cancelAuthorization` (intents `AUTHORIZED`/`REQUIRES_ACTION` → `CANCELLED`); PIX já pago **não é reembolsado automaticamente** neste caminho (só `operator.cancel` tem `payments.refund`) — risco §17 |
| `ACCEPTED`, `REMINDED`, `QUOTE_APPROVED`, `AUTHORIZED`, `DRIVER_ASSIGNED` ≤ 10 min do aceite | grátis | idem |
| idem > 10 min | R$ 15,00 → prestador | Cartão: nova intent `CANCELLATION_FEE` autorizada e capturada; carteira: `debitCustomer`; PIX pago (`AUTHORIZED`): `refund(amount − fee)`, intent original `PARTIALLY_REFUNDED (captured = fee)`, intent `CANCELLATION_FEE CAPTURED`; depois `creditProviderFee` (journal `cancellation_fee_charge` clearing → `cancellation_fee` prestador) e `cancellation_fee_cents`; `recordLateCancellation` do cliente |
| `EN_ROUTE`, `ARRIVED`, `EN_ROUTE_PICKUP` | `max(2000, 20 % × price)` → prestador | idem. Ex.: R$ 80 → R$ 20; R$ 110 → R$ 22; R$ 300 → R$ 60 |
| `IN_PROGRESS` e demais | não permitido | Guard `customerCancelAllowed` → 409 |

Sem prestador atribuído a taxa nunca é cobrada (`!providerId → return`). Falha na cobrança → `incidents(PAYMENT, MEDIUM)` "Taxa de cancelamento não cobrada". A taxa não entra na base de comissão.

## 8. Reembolsos (`refund`)

| Regra | Implementação |
|---|---|
| Alvo | Intents `CAPTURED`/`PARTIALLY_REFUNDED`, exceto `CANCELLATION_FEE`; percorre em ordem de criação até cobrir `amountCents` (ou tudo quando `null`) |
| Carteira | `creditCustomer` (journal `customer_credit`: DEBIT revenue / CREDIT usuário) |
| Gateway | `refund(ref, amt)`; ok → `refunds(DONE, gateway_ref)`; falha → `refunds(FAILED)` + `incidents(PAYMENT, HIGH)` e segue para a próxima intent |
| Status | `refunded_cents += amt`; `REFUNDED` se ≥ `captured_cents`, senão `PARTIALLY_REFUNDED` |
| Origem | `operator.cancel` (integral), `operator.resolve_dispute` (`payload.refundCents`; 0 → nada), `operator.refund` |
| Crédito em carteira como opção do cliente (02 §4.4) | **(previsto)**; hoje só quando a intent original foi `WALLET` |

## 9. Carteira e ledger (`wallet/service.ts`)

### 9.1 Contas

| `owner_type` | `owner_id` | Função |
|---|---|---|
| `USER` | user_id | Saldo do cliente |
| `PROVIDER` | provider_id | A repassar; `held_cents` em disputa |
| `PLATFORM` | `clearing` | Contrapartida do que foi cobrado do cliente; fica **negativa** (DEBIT) a cada liquidação porque a captura no gateway não gera lançamento — saldo negativo = valor a receber do gateway |
| `PLATFORM` | `revenue` | Comissão líquida (comissão − desconto de cupom) |
| `PLATFORM` | `payouts_payable` | Repasses agendados a pagar |

### 9.2 `settleOrder` (efeito `wallet.settle` em `COMPLETED`)

Idempotente (existe `provider_payout` da ordem → retorna `null`). `rule = pickRule(categoria, região)` sobre regras ativas (`active_from ≤ now < active_until`). `s = settle(gross = price + additional, discount, rule)`.

| Caso | Lançamentos (um `journal_id`) |
|---|---|
| Ordem normal com prestador | DEBIT `clearing` `s.chargedCents` (`order_charge`); CREDIT prestador `s.providerPayoutCents` (`provider_payout`); CREDIT `revenue` `charged − payout` (`platform_fee`) |
| Filha de concierge (`billedViaParent`) | DEBIT `revenue` payout (`provider_payout_funding`); CREDIT prestador payout (`provider_payout`) — o pai já foi cobrado |
| Sem prestador (pai concierge) | DEBIT `clearing` charged; CREDIT `revenue` charged (`provider_payout`) |

Exemplo cenário A (8000, sem cupom): `order_charge 8000`, `provider_payout 6400`, `platform_fee 1600`; `service_orders.platform_fee_cents = 1600`, `provider_payout_cents = 6400`; `GET /v1/providers/me/wallet` → `balanceCents 6400`. Exemplo com cupom (11000, desconto 1100): clearing −9900, prestador +8800, revenue +1100 (fee 2200 − cupom 1100: o cupom é custo da plataforma, embutido em `platform_fee`; não há linha separada `COUPON_COST`).

### 9.3 Disputa, taxas e carteira

| Operação | Lançamentos | Observação |
|---|---|---|
| `hold(order, provider, payout)` | prestador: `balance −= payout`, `held += payout`; linha única DEBIT `dispute_hold` | `metadata.disputeHeldCents` |
| `releaseHold(held, finalPayout)` | `held −= held`; CREDIT prestador `release = min(held, finalPayout)` (`dispute_release`); CREDIT `revenue` `held − release` (`dispute_adjustment`) | Linhas únicas (sem contrapartida); `payments.refund` devolve ao cliente pelo gateway |
| `creditProviderFee` | DEBIT clearing / CREDIT prestador (`cancellation_fee_charge`/`cancellation_fee`) | |
| `debitCustomer` | DEBIT usuário / CREDIT clearing (`wallet_payment`) | 402 se saldo insuficiente |
| `creditCustomer` | DEBIT revenue / CREDIT usuário (`customer_credit`) | |
| `runPayoutBatch` | DEBIT prestador / CREDIT `payouts_payable` (`payout`) por conta com `balance > 0`; `payouts(SCHEDULED, amount = balance, período 7 d)` | `held_cents` já está fora do `balance`, então disputas abertas não entram |

`summary()`: `pendingCents` = Σ `payouts.SCHEDULED`; `nextPayoutAt` = `run_at` do próximo job `payout.batch`.

## 10. Comissão (`commission.ts`)

### 10.1 `settle(gross, discount, rule, paymentFeeBps = 0)`

```
charged        = max(0, gross − discount)
fee            = applyBps(gross, percentBps) + fixedCents   -- sobre o BRUTO
fee            = clamp(fee, minCents, maxCents); fee = min(fee, gross)
paymentFee     = applyBps(charged, paymentFeeBps)
providerPayout = max(0, gross − fee − (passPaymentFeeToProvider ? paymentFee : 0))
platformNet    = roundHalfUp(charged − providerPayout − (passPaymentFeeToProvider ? 0 : paymentFee))
```

| Caso (`pricing.test.ts` e cenários) | gross | desc. | regra | fee | payout | platformNet |
|---|---|---|---|---|---|---|
| Padrão com cupom | 10000 | 1000 | 20 %, mín 500 | 2000 | 8000 | 1000 |
| Cenário A | 8000 | 0 | padrão | 1600 | 6400 | 1600 |
| Cenário D (lavanderia 8900 + saco 6900) | 15800 | 0 | padrão | 3160 | 12640 | 3160 |
| Mínimo | 1000 | 0 | mín 500 | 500 | 500 | 500 |
| Máximo | 100000 | 0 | máx 5000 | 5000 | 95000 | 5000 |
| Taxa 3,2 % repassada | 10000 | 0 | `passPaymentFeeToProvider` | 2000 | 7680 | 2000 |
| Taxa 3,2 % absorvida | 10000 | 0 | padrão | 2000 | 8000 | 1680 |
| Arredondamento 15 % | 1001 / 1003 / 1010 | 0 | | 150 / 150 / 152 | | |

`wallet.settleOrder` chama `settle` sem `paymentFeeBps` (taxa do gateway ainda não contabilizada **(previsto)**).

### 10.2 `pickCommissionRule`

Categoria igual +2, região igual +1; categoria/região diferentes descartam; `NULL` neutro. Ordem: categoria+região > categoria > região > global. O admin **não** fecha a regra anterior ao salvar uma nova no mesmo escopo (`upsert` só insere); duas regras com a mesma pontuação → vence a primeira varrida. Procedimento: `DELETE /v1/admin/commission-rules/:id` (define `active_until = now`) antes de criar a nova. Seed global: 2000 bps, mín 500.

## 11. Repasses (`payout.batch`)

| Regra | Implementação |
|---|---|
| Agendamento | `registry.ts` agenda o primeiro lote para o próximo `settings.payouts.weekday` (3 = quarta) às **03:00 UTC** (`dedupe payout.batch:YYYY-MM-DD`); cada execução reagenda +7 dias (ignora `cadence`) |
| Lote | `runPayoutBatch(now)`: para cada conta `PROVIDER` com `balance > 0`, `payouts(SCHEDULED, amount = balance, period = [now − 7 d, now])` e journal `payout` → `payouts_payable` |
| Pagamento | Manual no MVP: exportar `payouts SCHEDULED`, transferir, marcar `PAID` (rota de admin **(prevista)**; hoje só via banco) |
| Elegibilidade por evidência (02 §4.8) | **(previsto)**; hoje todo saldo entra |
| Mínimo de repasse | **(previsto)** |
| Extrato | `GET /v1/providers/me/{wallet,ledger,payouts}` |

## 12. Cupons, crédito e assinaturas

| Tema | Implementação |
|---|---|
| Validação (`validateCoupon`) | `active`, `valid_from/until`, `usage_limit > used_count`, `category_id` igual à da ordem, `per_user_limit` contra `coupon_redemptions(code, user)`; devolve `CouponSource` ou `null` |
| Aplicação | `estimatePrice` (`couponDiscount`: mínimo de pedido, teto, nunca > subtotal); `createRequest` → 422 se código inválido; `redeemCoupon` grava `coupon_redemptions` e `used_count++` **na criação**; cancelamento não devolve o uso **(previsto)** |
| Contabilização | Embutido em `platform_fee` (= fee − desconto) |
| Crédito promocional | `promotions` sem serviço ainda **(previsto)**; `creditCustomer` existe |
| Assinatura | `subscribe`: `chargeSubscription` (cartão, autoriza + captura; 402) antes de inserir; `next_charge_at = +intervalMonths`; job `subscription.charge` renova ou marca `PAST_DUE` (sem retentativas nem `PAUSED` **(previsto)**); visitas `coveredByPlan` com `price 0` (sem comissão/repasse por visita — modelo de remuneração do técnico de visita **(a definir)**) |

## 13. Conciliação, falhas e idempotência

| Mecanismo | Estado |
|---|---|
| `webhook_events` | Inserido antes de processar; duplicado → `{ duplicate: true }`; intent desconhecida → `error 'intent não encontrada'`, `{ ignored: true }`; erro de processamento → `error` + 500 |
| Idempotência de autorização | `authorizeForOrder` reaproveita intent viva; `idempotency_key` com timestamp é só rastreio |
| Captura parcial | Cada intent pelo seu `amount_cents`; divergência com `total` só logada (`captura divergente do esperado`) |
| Ordem concluída sem intent autorizada | `incidents(PAYMENT, HIGH)` "Ordem concluída sem pagamento autorizado"; `wallet.settle` ainda lança o repasse |
| `payment.reconcile` | **(previsto)**: PIX expirado (`expireStalePix`), recaptura, webhooks com erro, intents `AUTHORIZED` antigas |
| Chargeback | **(previsto)**: webhook → `customer_risk_signals.chargebacks++`, `DISPUTED`, hold |
| Balanceamento | `journal()` garante por operação; verificação periódica de `balance_cents` vs Σ lançamentos **(prevista)**, excluindo `dispute_*` |

## 14. Requisitos regulatórios (Brasil)

| Tema | Observar | Impacto |
|---|---|---|
| Pix (BCB) | QR dinâmico com expiração; devolução via PSP; MED | `createPixCharge(expires_in)`, `refund`; suporte a MED |
| Split / subadquirência | Receber integral e repassar = intermediação de pagamento | MVP: repasse semanal manual; V1: recebedores e split nativo |
| Nota fiscal | Prestador emite ao cliente; plataforma emite comissão | Coletar dados fiscais no onboarding (V1) |
| Retenções a PF | INSS/IR em pagamentos a autônomo PF | Parecer contábil; priorizar MEI/CNPJ |
| PCI-DSS | Tokenização no app | SAQ-A; nunca logar `gatewayToken` |
| Chargeback | 120 dias; defesa por evidência | PIN, fotos, custódia, chat, `order_events` |
| CDC | Taxa informada antes; reembolso na forma original | Tela de cancelamento com valor calculado = `customerCancellation` |
| LGPD | Financeiro 5 anos | 07 §13, 14 §10 |

## 15. Matriz de testes

| ID | Cenário | Adaptador / dados | Verificações | Estado |
|---|---|---|---|---|
| P-01 | Cartão: aceite → `AUTHORIZED`; conclusão → `CAPTURED` 8000; ledger `order_charge/provider_payout/platform_fee`; carteira do prestador 6400 | `tok_sandbox_4242` | cenário A | **verde** |
| P-02 | Cartão recusado no aceite | `...0002` | intent `FAILED card_declined`, push `payment_failed`, ordem `ACCEPTED`; novo método via `POST /orders/:id/payments` | a criar |
| P-03 | Saldo insuficiente | `...0009` | `insufficient_funds` | a criar |
| P-04 | Falha na captura | `...0004` | intent `FAILED capture_failed`, `incidents(PAYMENT)`, ordem `COMPLETED`, ledger lançado (ver risco) | a criar |
| P-05 | PIX: ordem criada com intent, sem dispatch; `settlePix` + webhook → `AUTHORIZED`, dispatch liberado; conclusão → `CAPTURED` | sandbox | `awaitingPixPayment`, jobs | a criar |
| P-06 | Webhook duplicado | mesmo `id` | `duplicate: true`, nada novo | a criar |
| P-07 | Webhook inválido / assinatura errada | Pagar.me com `fetchImpl` falso | 400, nada persistido | a criar |
| P-08 | PIX não pago em 15 min | `advance(16 min)` | intent `CANCELLED pix_timeout`, ordem `CANCELLED_BY_PLATFORM` | a criar |
| P-09 | Adicional aprovado | | intent `ADDITIONAL` só após `APPROVED`; captura das duas | a criar |
| P-10 | Adicional recusado/expirado | `advance(61 min)` | sem intent; `complete` liberado | a criar |
| P-11 | Cancelamento grátis em `MATCHING` | | ofertas `WITHDRAWN`, intent `CANCELLED` | a criar |
| P-12 | Cancelamento tardio (`ACCEPTED` + 30 min) | `FakeClock` | `CANCELLATION_FEE 1500 CAPTURED`, `cancellation_fee` CREDIT prestador, `cancellation_fee_cents` | a criar |
| P-13 | `EN_ROUTE` com preço 30000 / 8000 | | 6000 / 2000 | a criar |
| P-14 | Disputa `RESOLVED_CUSTOMER` | | `held` durante; `REFUNDED`; `dispute_release 0` + `dispute_adjustment` | a criar |
| P-15 | Disputa `RESOLVED_SPLIT 4000` | | `PARTIALLY_REFUNDED`, payout = original − 4000 | a criar |
| P-16 | Cupom `BEMVINDO10` | | desconto, `used_count`, `platform_fee` líquido, 2ª ordem 422 | a criar |
| P-17 | Regra por categoria | `commission-rules` | `pickRule` escolhe a específica | a criar |
| P-18 | Lote semanal | quarta 03:00 UTC | `payouts SCHEDULED`, `payouts_payable`, `nextPayoutAt` | a criar |
| P-19 | Assinatura: cobrança `SUBSCRIPTION CAPTURED 69900`, visita `price 0`, cancelamento | `4242` | cenário C | **verde** |
| P-20 | Produção recusa sandbox | `loadConfig` | lança | a criar |
| P-21 | Balanceamento | fuzz | Σ CREDIT = Σ DEBIT por journal (exceto `dispute_*`) | a criar |

## 16. Checklist de homologação (antes de produção real)

1. Conta sandbox Pagar.me; webhook para `.../v1/payments/webhooks/pagarme` com segredo; confirmar cabeçalho `X-Hub-Signature`.
2. Tornar `PAGARME_WEBHOOK_SECRET` obrigatório em `loadConfig` quando `PAYMENTS_PROVIDER=pagarme`.
3. Tokenização no app com chave pública; cartões de teste do provedor.
4. `auth_only` → `capture` parcial e total; `cancelAuthorization`; `refund` parcial e total; conferir eventos recebidos.
5. PIX de ponta a ponta (QR real, pagamento no simulador, `charge.paid`, expiração).
6. Mapear eventos ausentes: `charge.antifraud_reproved`, `charge.chargedback`, `charge.partial_refunded`, PIX `underpaid/overpaid`.
7. Enviar `customer` completo (nome, CPF, telefone, endereço) para antifraude.
8. Descritor na fatura, limites, parcelamento fixo em 1.
9. Reenvio de webhook pelo painel → `duplicate: true`.
10. Simular falha de rede em `capture` e validar incidente + reconciliação (após implementar `payment.reconcile`).
11. Conciliação diária exportada do provedor × `payment_intents` + `ledger_entries`.
12. Decidir repasse: transferência manual (MVP) vs split nativo; cadastrar recebedor de teste.
13. Parecer contábil/jurídico sobre NF e retenções antes do primeiro repasse.
14. Implementar `payment.reconcile` e `expireStalePix` em job antes do piloto aberto.

## 17. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| `wallet.settle` lança repasse mesmo com captura falha | Alta (ordem dos efeitos) | Repasse sem dinheiro recebido | Condicionar `settle` a `captured_cents > 0` ou executar `settle` dentro de `capture`; até lá, revisar `incidents(PAYMENT)` antes do `payout.batch` |
| Cancelamento gratuito com PIX já pago não reembolsa | Alta | Cliente sem dinheiro de volta | Incluir `payments.refund` em `customer.cancel` quando houver intent PIX `AUTHORIZED`, ou tratar no `cancelAuthorization` |
| IMMEDIATE sem autorização após recusa de cartão | Média | Prestador atende sem garantia | Guard `paymentAuthorized` em `provider.en_route` para IMMEDIATE ou job de 5 min (PRD 13.1) |
| Pré-autorização expira em agendados distantes | Média | Captura falha | `booking.confirm_request` 48 h antes **(previsto)** |
| Webhook sem segredo | Média hoje | Fraude de "pago" | Obrigatório em produção (§16) |
| `providerPayoutCents` da oferta com 80 % fixo | Média | Prestador vê valor diferente do repasse real | Usar `settle` com a regra (12 §13) |
| Divergência ledger × gateway | Média | Repasse errado | Conciliação diária; `payment.reconcile` |
| Classificação fiscal da intermediação | Alta | Autuação | Parecer antes do lançamento; split em V1 |
| Chargebacks | Média | Perda | Evidências; `customer_risk_signals`; PIX pré-pago |
| Adaptador Pagar.me sem testes | Alta | Bugs em produção | Fixtures com `fetchImpl` + homologação |
