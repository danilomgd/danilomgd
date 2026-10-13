# 13 — Arquitetura de Pagamentos

Derivado de `apps/api/src/adapters/ports.ts` (porta `PaymentGateway`), `apps/api/src/adapters/sandbox.ts`, `apps/api/src/adapters/pagarme.ts`, `apps/api/src/config.ts`, `packages/domain/src/pricing/commission.ts`, `packages/domain/src/pricing/estimate.ts`, `packages/domain/src/policies/cancellation.ts`, `packages/contracts/src/payments.ts`, `apps/api/src/db/schema/payments.ts` e dos efeitos `payments.*`/`wallet.*` nas `WorkflowDefinition`. O módulo `apps/api/src/modules/payments` (orquestração) está em implementação: o que depende dele está marcado **(conforme contrato)**.

## 1. Princípios (ADR-007, ADR-015, ADR-016)

| Princípio | Consequência prática |
|---|---|
| Porta e adaptadores | O domínio e os módulos falam só com `PaymentGateway`; trocar Pagar.me por outro provedor é um novo arquivo em `adapters/` |
| Nenhum PAN no servidor | O app tokeniza no SDK do provedor; a API recebe `gatewayToken`, guarda `brand`, `last4`, `exp_*`. PCI-DSS SAQ-A |
| Dinheiro inteiro | Centavos `integer`; bps para percentuais; arredondamento meio para cima (`roundHalfUp = floor(n + 0,5)`) |
| Nada é cobrado sem aprovação | Pré-autorização no aceite; captura só em `COMPLETED`; adicional só com `Quote.status = APPROVED` |
| Ledger próprio em dupla entrada | Toda movimentação é um `journal_id` com lançamentos que somam zero; saldo é derivável |
| Nada de mock em produção | `loadConfig` aborta com `PAYMENTS_PROVIDER=sandbox` em `NODE_ENV=production` |
| Idempotência em toda fronteira | `payment_intents.idempotency_key`, `webhook_events(gateway, external_id)`, `gateway_ref` único |

## 2. Porta `PaymentGateway`

| Método | Entrada | Saída | Uso |
|---|---|---|---|
| `createPixCharge` | `{ amountCents, referenceId, expiresInSeconds, customer { userId, name } }` | `{ gatewayRef, qrCode, copyPaste, expiresAt }` | Intents `PIX` |
| `authorizeCard` | `{ amountCents, referenceId, cardToken, customer }` | `{ ok: true, gatewayRef } \| { ok: false, code, message }` | Pré-autorização (`auth_only`) no aceite / aprovação de orçamento |
| `capture` | `{ gatewayRef, amountCents }` | `{ ok } \| { ok: false, code, message }` | Captura total ou parcial em `COMPLETED` |
| `cancelAuthorization` | `{ gatewayRef }` | `void` | Liberar pré-autorização em cancelamento |
| `refund` | `{ gatewayRef, amountCents }` | `{ ok, refundRef } \| erro` | Reembolso total/parcial (cartão ou PIX) |
| `tokenizeForTests?` | `{ number, holder, expMonth, expYear }` | `{ token, brand, last4 }` | **Só sandbox/teste**; ausente no Pagar.me |
| `parseWebhook` | `rawBody`, `headers` | `{ externalId, eventType, gatewayRef, status: PAID\|FAILED\|REFUNDED\|EXPIRED\|OTHER, amountCents? } \| null` | Verifica assinatura e normaliza |

`referenceId` é o id da intent (idempotência no provedor: Pagar.me `orders.code`). `Adapters` também expõe `clock` (`SystemClock`/`FakeClock`) para que expiração de PIX e lotes de repasse sejam testáveis.

### 2.1 Seleção (`adapters/index.ts`, `config.ts`)

| `PAYMENTS_PROVIDER` | Adaptador | Exigências |
|---|---|---|
| `sandbox` (padrão) | `SandboxGateway` | Recusado em `NODE_ENV=production` (`loadConfig` lança "PAYMENTS_PROVIDER=sandbox") |
| `pagarme` | `PagarmeGateway(secretKey, webhookSecret)` | `PAGARME_SECRET_KEY` obrigatório (lança "PAGARME_SECRET_KEY ausente"); `PAGARME_WEBHOOK_SECRET` recomendado (sem ele o webhook **não é verificado**; deve ser obrigatório em produção, ver §15) |

## 3. Adaptador sandbox (`sandbox.ts`)

Determinístico, em memória, só para dev/teste. Convenções por sufixo do token (`tokenizeForTests` gera `tok_sandbox_<last4>` a partir do número do cartão; brand `visa` se começar com 4, senão `mastercard`):

| Token termina em | `authorizeCard` | `capture` | Cenário de teste |
|---|---|---|---|
| `0002` | `{ ok: false, code: 'card_declined', message: 'Cartão recusado pelo emissor' }` | — | Recusa na pré-autorização → 402 ao cliente, ordem segue aguardando novo método |
| `0009` | `{ ok: false, code: 'insufficient_funds', message: 'Saldo insuficiente' }` | — | Recusa por saldo |
| `0004` | `ok` com `gatewayRef = auth_<uuid>_capfail` | `{ ok: false, code: 'capture_failed' }` | Autoriza mas falha na captura em `COMPLETED` → `incidents(PAYMENT_FAILURE)` + `payment.reconcile` |
| qualquer outro (ex. `4242`) | `ok` | `ok` | Caminho feliz |

| Operação | Comportamento sandbox |
|---|---|
| `createPixCharge` | `gatewayRef = pix_<uuid>`; `qrCode` imita EMV ("00020126sandbox...5802BR"); `copyPaste = sandbox-pix-<ref>`; `expiresAt = now + expiresInSeconds`; guarda em `pixCharges` com `paid = false` |
| `settlePix(gatewayRef)` | Marca pago e **devolve o corpo JSON** que o webhook entregaria (`{ id: evt_..., type: 'charge.paid', data: { id, status: 'paid', amount } }`); os testes fazem `POST /v1/payments/webhooks/sandbox` com esse corpo |
| `capture` | Erro `authorization_not_found` se a autorização não existe ou foi cancelada; soma `captured` |
| `cancelAuthorization` | `cancelled = true` |
| `refund` | Soma `refunded` na autorização ou aceita para PIX existente; `not_found` caso contrário; `refundRef = rf_<uuid>` |
| `parseWebhook` | Sem assinatura (sandbox); mapeia `data.status` paid/failed/refunded/expired → `PAID/FAILED/REFUNDED/EXPIRED`, resto `OTHER`; JSON inválido → `null` (401) |

Cartões de teste sugeridos para QA manual no app com `PAYMENTS_PROVIDER=sandbox`: `4242 4242 4242 4242` (aprova), `4000 0000 0000 0002` (recusa), `4000 0000 0000 9995`→ use `...0009` (saldo), `4000 0000 0000 0004` (falha na captura).

## 4. Adaptador Pagar.me v5 (`pagarme.ts`)

| Operação | Chamada | Mapeamento |
|---|---|---|
| Autenticação | `Authorization: Basic base64(secretKey + ':')` | |
| `createPixCharge` | `POST /core/v5/orders` com `payments: [{ payment_method: 'pix', pix: { expires_in } }]`, `code = referenceId`, `customer.code = userId` | `gatewayRef = charges[0].id`; `qrCode`/`copyPaste = last_transaction.qr_code`; `expiresAt = last_transaction.expires_at` |
| `authorizeCard` | `POST /orders` com `credit_card: { operation_type: 'auth_only', installments: 1, card_token }` | `ok` se `charges[0].status ∈ { authorized_pending_capture, paid }`; senão `code = acquirer_return_code ?? status`, `message = acquirer_message`; exceções de rede → `gateway_error` |
| `capture` | `POST /charges/{id}/capture { amount }` | Captura parcial permitida (valor final ≤ autorizado) |
| `cancelAuthorization` | `DELETE /charges/{id}` | Cancela charge não capturada |
| `refund` | `DELETE /charges/{id} { amount }` | Estorno parcial/total de charge capturada; `refundRef = id` devolvido |
| `parseWebhook` | Verifica `X-Hub-Signature: sha256=<HMAC-SHA256(rawBody, webhookSecret)>` com `timingSafeEqual`; mapeia `charge.paid → PAID`, `charge.payment_failed → FAILED`, `charge.refunded → REFUNDED`, `charge.pending → OTHER`; outros tipos → `OTHER` | `null` quando assinatura ausente/inválida ou JSON malformado |

Lacunas conhecidas (homologar antes de produção, §15): o adaptador não trata `charge.antifraud_reproved`, `charge.chargedback` nem PIX expirado (`EXPIRED` só vem do sandbox); `installments` fixo em 1; não envia `antifraud` payload (CPF, endereço de cobrança) — necessário para taxa de aprovação; `customer.name` cai em "Cliente VÉLIO" quando `users.name` é nulo (homologação do provedor costuma exigir nome real); sem retry/backoff nas chamadas HTTP (tratar na camada de job).

## 5. Ciclo de vida de `payment_intents`

### 5.1 Estados (`PaymentIntentStatus`)

```
                 createPixCharge                 webhook PAID
   ┌──────────► REQUIRES_ACTION ───────────────────────────────► CAPTURED ──► REFUNDED
   │                 │ webhook EXPIRED / FAILED                      │  refund    PARTIALLY_REFUNDED
   │                 ▼                                              │
 criar            FAILED  ◄──── authorizeCard ok:false              │
   │                                                                │
   └──────────► AUTHORIZED ──── capture ok ─────────────────────────┘
                     │  cancelAuthorization (cancelamento) 
                     ▼
                 CANCELLED
```

| Transição | Gatilho | Efeito no `payment_intents` |
|---|---|---|
| `—` → `REQUIRES_ACTION` | PIX criado | `pix_qr_code`, `pix_copy_paste`, `pix_expires_at`, `gateway_ref` |
| `—` → `AUTHORIZED` | `authorizeCard` ok | `gateway_ref` |
| `—` → `FAILED` | `authorizeCard` recusado | `failure_code`, `failure_message`; 402 ao cliente quando síncrono |
| `REQUIRES_ACTION` → `CAPTURED` | webhook `PAID` | `captured_cents = amount` (PIX é captura imediata) |
| `REQUIRES_ACTION` → `FAILED` | webhook `EXPIRED`/`FAILED` ou job `payment.reconcile` após `pix_expires_at` | `failure_code = pix_expired` |
| `AUTHORIZED` → `CAPTURED` | `payments.capture` em `COMPLETED` | `captured_cents = total` (pode ser menor que `amount_cents`, nunca maior) |
| `AUTHORIZED` → `CANCELLED` | `payments.cancelAuthorization` em cancelamento | |
| `CAPTURED` → `REFUNDED` / `PARTIALLY_REFUNDED` | `payments.refund` + webhook `REFUNDED` | `refunded_cents`; `refunds` linha com `status` |
| `FAILED` → nova intent | Cliente escolhe outro método (`POST /v1/orders/:id/payments`) | Intent antiga permanece para auditoria |

Invariantes: `captured_cents ≤ amount_cents`; `refunded_cents ≤ captured_cents`; no máximo uma intent `INITIAL` em `AUTHORIZED`/`CAPTURED` por ordem (constraint parcial proposta em 07 §12); `kind=ADDITIONAL` exige `quote_id` com `quotes.status = APPROVED`.

### 5.2 Tipos (`PaymentIntentKind`) e momento de criação

| kind | Quando nasce | Valor | Captura |
|---|---|---|---|
| `INITIAL` | Efeito `payments.authorize` em `provider.accept`/`operator.assign` (IMMEDIATE, SCHEDULED, LOGISTICS, LAUNDRY) ou `customer.authorize_payment` (QUOTE, CONCIERGE) | `price_cents − discount_cents` (FIXED/HOURLY) ou **limite superior da faixa** (`RANGE`: `maxCents`) ou valor do orçamento aprovado | `total_cents` em `COMPLETED` |
| `ADDITIONAL` | Aprovação de `Quote(kind=ADDITIONAL)` pelo cliente | `quotes.amount_cents` | Junto com a inicial em `COMPLETED` (captura de cada intent pelo seu valor) |
| `SUBSCRIPTION` | `POST /v1/me/subscriptions` e job `subscription.charge` a cada ciclo | `subscription_plans.price_cents` | Imediata (cartão com captura direta ou PIX) |
| `CANCELLATION_FEE` | Efeito `payments.chargeCancellationFee` quando `customerCancellation().feeCents > 0` | `feeCents` | Imediata; cartão: nova autorização+captura do valor da taxa e cancelamento da pré-autorização original; PIX já pago: `refund(amount − fee)` em vez de nova cobrança |

## 6. Fluxos

### 6.1 Cartão (pré-autorização → captura)

1. App: SDK do provedor tokeniza → `POST /v1/me/payment-methods { kind: CARD, gatewayToken, holderName }` → `payment_methods`.
2. Aceite: `payments.authorize` cria intent `INITIAL` (`idempotency_key = order:{id}:INITIAL:1`) e chama `authorizeCard(amount, referenceId = intent.id, cardToken)`.
3. Sucesso → `AUTHORIZED`; realtime `payment.updated`; o prestador vê "Pagamento garantido". Recusa → `FAILED`, `notify.customer:payment_failed`; a ordem continua em `ACCEPTED` por até 5 min (job `payment.reconcile`) aguardando novo método; sem solução → `operator.cancel` automático pelo sistema com motivo `payment_failed` (PRD pergunta 13.1, conforme contrato).
4. Orçamento adicional aprovado → intent `ADDITIONAL` autorizada na hora (402 se recusar: quote volta a `SENT`).
5. `COMPLETED` → `payments.capture` captura `INITIAL` por `total_cents − Σ additional` e cada `ADDITIONAL` por seu valor. Falha → `incidents(PAYMENT_FAILURE, HIGH)`, ordem permanece `COMPLETED`, `wallet.settle` **não** roda até a captura (repasse depende de dinheiro recebido), job `payment.reconcile` tenta 3 vezes com backoff.
6. Validade da pré-autorização: emissores liberam em 5–7 dias (crédito); para `SCHEDULED` com `scheduledFor > now + 5 d`, a autorização é feita pelo job `booking.confirm_request` 48 h antes, não no aceite (conforme contrato).

### 6.2 PIX

1. Cliente escolhe PIX (`methodKind = PIX`); `payments.authorize` cria intent `REQUIRES_ACTION` via `createPixCharge(amount, expiresInSeconds = 1800)` e devolve `pix { qrCode, copyPaste, expiresAt }`.
2. App mostra QR e cópia-e-cola; `payment.updated` chega pelo socket quando o webhook `PAID` for processado (`CAPTURED`).
3. Expirado sem pagamento: webhook `EXPIRED` ou `payment.reconcile` → `FAILED (pix_expired)`; o cliente gera novo PIX **sem recriar a ordem** (`POST /v1/orders/:id/payments`).
4. Em `IMMEDIATE`, o prestador não deve sair antes do `PAID`: `provider.en_route` fica bloqueado na UI até `payment.updated = CAPTURED`; passados 5 min sem pagamento, a ordem volta a `MATCHING` ou é cancelada (PRD 13.1; decisão pendente de produto, conforme contrato).
5. PIX é pago antes do serviço: em `COMPLETED` não há captura; se `total_cents < captured_cents` (serviço de faixa concluído abaixo do teto), `payments.capture` executa `refund(diferença)` automaticamente.

### 6.3 Carteira (`WALLET`)

`useWalletCredit = true` ou `methodKind = WALLET`: debita `wallet_accounts(USER).balance_cents` até cobrir (`wallet_applied_cents`), o restante segue por cartão/PIX na mesma intent. Journal `WALLET_SPEND`: DEBIT conta do usuário / CREDIT `PLATFORM:clearing`. Saldo nasce de reembolsos em crédito (§8) e crédito promocional (`promotions`).

## 7. Taxa de cancelamento (`customerCancellation`)

`customerCancellation(status, acceptedAt, now, priceCents, settings)` com `settings` de `platform_settings.cancellation` (padrão `DEFAULT_CANCELLATION`: `freeMinutesAfterAccept 10`, `lateFeeCents 1500`, `enRouteFeeBps 2000`, `enRouteFeeMinCents 2000`):

| Estado | Resultado | `feeBeneficiary` | Efeito financeiro |
|---|---|---|---|
| `REQUESTED`, `MATCHING`, `OFFERED`, `SCHEDULED`, `NO_PROVIDER_FOUND`, `UNDER_REVIEW`, `QUOTED`, `QUOTE_REJECTED`, `SUBMITTED`, `INTERPRETING`, `PLAN_PROPOSED`, `NEEDS_HUMAN`, `PLAN_APPROVED` | grátis ("Sem prestador confirmado") | — | `cancelAuthorization` se houver intent; PIX pago → `refund` integral |
| `ACCEPTED`, `REMINDED`, `QUOTE_APPROVED`, `AUTHORIZED`, `DRIVER_ASSIGNED` com `now − acceptedAt ≤ 10 min` | grátis ("Dentro da janela gratuita após o aceite") | — | idem |
| idem com > 10 min | R$ 15,00 fixo ("Cancelamento tardio após confirmação") | `provider` | Intent `CANCELLATION_FEE` 1500; ledger: CREDIT `PROVIDER` 1500 (sem comissão) |
| `EN_ROUTE`, `ARRIVED`, `EN_ROUTE_PICKUP` | `max(2000, 20 % × priceCents)` ("Prestador já em deslocamento") | `provider` | Ex.: R$ 80 → R$ 20 (mínimo); R$ 300 → R$ 60; R$ 110 → R$ 22 |
| `IN_PROGRESS` e demais | `allowed: false` ("Não é possível cancelar nesta etapa") | — | Guard `customerCancelAllowed` já bloqueia; caminho é `customer.open_dispute` após `COMPLETED` |

A taxa é exibida na tela de confirmação com o mesmo cálculo (`PriceEstimate`-like) e debitada identicamente (PRD 10.1: "custo exibido = debitado"). Cancelamento pelo prestador não gera taxa ao cliente: penalidade reputacional e `dispatch.restart`. Cancelamento pela plataforma: reembolso integral e crédito de cortesia opcional (`promotions`).

## 8. Reembolsos

| Regra | Implementação |
|---|---|
| Forma original por padrão | `refund(gatewayRef, amount)`; cartão volta em 1–2 ciclos de fatura, PIX em minutos (02 §4.4) |
| Crédito em carteira como alternativa | Na tela de confirmação o cliente pode escolher crédito imediato: journal `REFUND` CREDIT `USER` / DEBIT `PLATFORM:clearing`; bônus configurável (`platform_settings.refunds.walletBonusBps`, padrão 0, V1) |
| Parcial | Sempre referencia item/quote ou motivo estruturado (`refunds.reason`); `PARTIALLY_REFUNDED` |
| Origem | Efeito `payments.refund` em `operator.cancel`, `operator.resolve_dispute` (`refundCents`), `operator.refund` (`CANCELLED_BY_PLATFORM\|DISPUTED → REFUNDED`) e automático para PIX pago acima do total final |
| Conciliação | `refunds.status` passa a `DONE` pelo webhook `REFUNDED`; sem webhook em 48 h → `payment.reconcile` consulta o provedor (V1) e abre incidente |

## 9. Carteira e ledger em dupla entrada

### 9.1 Contas (`wallet_accounts`)

| `owner_type` | `owner_id` | Função |
|---|---|---|
| `USER` | user_id | Saldo do cliente (reembolsos em crédito, promoções) |
| `PROVIDER` | provider_id | Ganhos a repassar; `held_cents` em disputa |
| `PLATFORM` | `clearing` | Dinheiro recebido do gateway ainda não distribuído (contrapartida de capturas) |
| `PLATFORM` | `revenue` | Comissões (receita) |
| `PLATFORM` | `promo` | Custo de cupons e créditos promocionais |
| `PLATFORM` | `fees` | Taxas do gateway (quando não repassadas ao prestador) |

### 9.2 Journals padrão (`ledger_entries.kind`)

Cada operação gera um `journal_id`; Σ CREDIT = Σ DEBIT. Exemplo da ordem do capítulo 12 (bruto 11000, cupom 1100, comissão 20 % mín. R$ 5):

| Momento | kind | DEBIT | CREDIT | Valor |
|---|---|---|---|---|
| Captura (`CAPTURED`) | `ORDER_GROSS` | — (dinheiro externo) | `PLATFORM:clearing` | 9900 (cobrado do cliente) |
| `wallet.settle` | `PROVIDER_EARNING` | `PLATFORM:clearing` | `PROVIDER:carlos` | 8800 |
| `wallet.settle` | `PLATFORM_FEE` | `PLATFORM:clearing` | `PLATFORM:revenue` | 2200 |
| `wallet.settle` | `COUPON_COST` | `PLATFORM:promo` | `PLATFORM:clearing` | 1100 |

Verificação: clearing recebeu 9900 + 1100 = 11000 e pagou 8800 + 2200 = 11000. Receita líquida da plataforma = 2200 − 1100 = 1100 (`platformNetCents`).

| Operação | DEBIT | CREDIT | Observação |
|---|---|---|---|
| Disputa aberta (`wallet.hold`) | — | — | Não gera lançamento; `PROVIDER.held_cents += payout da ordem` e o `PROVIDER_EARNING` da ordem fica fora do próximo `payout.batch` |
| Resolução `RESOLVED_CUSTOMER` com reembolso 9900 | `REFUND`: `PLATFORM:clearing` → externo 9900; `DISPUTE_RELEASE`: estorno do `PROVIDER_EARNING` (DEBIT `PROVIDER` 8800 / CREDIT `clearing`) e da `PLATFORM_FEE` | | Prestador fica com 0; plataforma absorve o cupom |
| `RESOLVED_SPLIT` (refund 4000) | `REFUND` 4000; recalcula `settle(total − 4000)` e lança a diferença | | `providerPayoutCents` registrado em `disputes.resolution` |
| Taxa de cancelamento 2200 | `CANCELLATION_FEE`: externo → `clearing` 2200; `clearing` → `PROVIDER` 2200 | | Sem comissão sobre a taxa |
| Repasse (`payout.batch`) | `PAYOUT`: `PROVIDER` → externo (transferência) | | `payout_id` em cada lançamento |
| Crédito promocional | `WALLET_TOPUP`: `PLATFORM:promo` → `USER` | | |
| Taxa do gateway (ex. 3,2 %) | `GATEWAY_FEE`: `clearing` → `PLATFORM:fees` (ou `PROVIDER` se `passPaymentFeeToProvider`) | | `settle(..., paymentFeeBps)` |

`balance_cents` é materializado para leitura rápida e recalculado por job de conciliação (`SELECT account_id, SUM(CASE direction...)`); divergência abre incidente.

## 10. Comissão (`commission.ts`)

### 10.1 `settle(grossCents, discountCents, rule, paymentFeeBps = 0)`

```
charged       = max(0, gross − discount)
fee           = applyBps(gross, percentBps) + fixedCents        -- sobre o BRUTO, nunca sobre o valor com desconto
fee           = max(minCents, fee); fee = min(maxCents, fee) se maxCents; fee = min(fee, gross)
paymentFee    = applyBps(charged, paymentFeeBps)
providerPayout= max(0, gross − fee − (passPaymentFeeToProvider ? paymentFee : 0))
platformNet   = roundHalfUp(charged − providerPayout − (passPaymentFeeToProvider ? 0 : paymentFee))
```

Lança `Error('Valores negativos')` para entradas negativas. `applyBps(cents, bps) = roundHalfUp(cents × bps / 10000)`.

| Caso (testes `pricing.test.ts`) | gross | desc. | regra | fee | payout | platformNet |
|---|---|---|---|---|---|---|
| Padrão com cupom | 10000 | 1000 | 20 %, mín 500 | 2000 | 8000 | 1000 |
| Mínimo | 1000 | 0 | 20 %, mín 500 | 500 | 500 | 500 |
| Máximo | 100000 | 0 | 20 %, máx 5000 | 5000 | 95000 | 5000 |
| Taxa de gateway 3,2 % repassada | 10000 | 0 | +`passPaymentFeeToProvider` | 2000 | 7680 | 2000 |
| Taxa 3,2 % absorvida | 10000 | 0 | padrão | 2000 | 8000 | 1680 |
| Arredondamento 15 % | 1001 / 1003 / 1010 | 0 | 15 % | 150 / 150 / 152 | | |
| Pequena entrega | 2000 | 0 | padrão | 500 (mínimo = 25 %) | 1500 | 500 |
| Plano Essencial | 29900 | 0 | padrão | 5980 | 23920 | 5980 |

Regra padrão (`DEFAULT_COMMISSION` = seed `commission_rules` global): 2000 bps, fixo 0, mínimo 500, sem máximo, taxa de gateway absorvida pela plataforma. Desconto de cupom é custo da plataforma: o prestador recebe como se não houvesse cupom.

### 10.2 `pickCommissionRule(rules, categoryId, regionId)`

Pontuação: categoria igual +2; categoria diferente −10 (descarta); região igual +1; região diferente −10; `NULL` = 0. Resultado: categoria+região (3) > categoria (2) > região (1) > global (0). Regras com `active_until` passado são filtradas antes. Testes: `(cat1, reg1) → cr`; `(cat1, reg9) → c`; `(cat3, null) → g`.

## 11. Repasses (`payouts`)

| Regra | Implementação (conforme contrato) |
|---|---|
| Cadência | `platform_settings.payouts { cadence: WEEKLY, weekday: 3 }` → job `payout.batch` toda quarta-feira 06:00 (America/Sao_Paulo) |
| Elegibilidade | `PROVIDER_EARNING` de ordens `COMPLETED/REVIEWED/CLOSED` com `completed_at < period_end`, intent `CAPTURED`, sem disputa aberta (`held_cents`), com evidência mínima da categoria (02 §4.8); ordens sem evidência vão para fila de revisão de ops antes do lote |
| Lote | Um `payouts` por prestador por período: `amount_cents = Σ elegíveis − Σ já pagos`; `status SCHEDULED → PROCESSING → PAID \| FAILED`; journal `PAYOUT` |
| Transferência | MVP: exportação CSV para pagamento manual via banco/PIX da empresa (operador marca `PAID` no painel com `gateway_ref` = id da transferência); V1: API de transferência do provedor ou split nativo (§14) |
| Mínimo | `payouts.minAmountCents` (padrão 2000, V1): abaixo disso acumula para a semana seguinte |
| Falha | `FAILED` com `failure_message`; `incidents(PAYMENT_FAILURE)`; o saldo permanece na conta do prestador |
| Extrato | `GET /v1/providers/me/wallet` (`balanceCents`, `pendingCents`, `heldCents`, `nextPayoutAt`), `/ledger`, `/payouts` |

## 12. Cupons, crédito promocional e assinaturas

| Tema | Regra |
|---|---|
| Cupom (`coupons`) | `couponDiscount(subtotal, coupon)`: 0 se `subtotal < minOrderCents`; `PERCENT` → `applyBps(subtotal, value × 100)`, `FIXED` → `value`; limitado por `maxDiscountCents` e pelo subtotal. Elegibilidade: `active`, vigência, `usageLimit` (`used_count` atômico), `perUserLimit` (`coupon_redemptions(code, user_id)`), `categoryId`. Seed: `BEMVINDO10` (10 %, máx. R$ 30, 1 por usuário) |
| Reserva e consumo | `coupon_redemptions` criado na ordem (`coupon_redemptions_order_uq`); cancelamento antes da captura remove a redenção e decrementa `used_count` |
| Contabilização | `COUPON_COST` em `PLATFORM:promo` no `settle` |
| Crédito promocional (`promotions`, V1) | `WALLET_TOPUP` para `USER`; consumo via `WALLET` |
| Assinatura | `SubscribeInput` → intent `SUBSCRIPTION` cobrada na hora (402 impede criar); `next_charge_at = started + interval_months`; job `subscription.charge` usa `payment_method_id` da assinatura; falha → `PAST_DUE`, 3 tentativas em 7 dias com notificação; depois `PAUSED` (visitas não geradas). Cada visita gera ordem `SCHEDULED` com `price_cents = 0` e `metadata.subscriptionId`; o `settle` da visita usa `price_cents = plan.price / visits_per_cycle` como base de comissão e repasse |

## 13. Conciliação, falhas e idempotência

| Mecanismo | Detalhe |
|---|---|
| `webhook_events` | Toda entrega persiste antes de processar; `UNIQUE(gateway, external_id)` absorve reenvios; `processed_at` nulo = reprocessável; `error` guarda a falha |
| Webhook sem intent | 200 ao provedor + `error = 'intent_not_found'`; `payment.reconcile` tenta de novo em 10 min (intent pode estar em transação concorrente) |
| `payment.reconcile` (job) | A cada 10 min: (a) PIX `REQUIRES_ACTION` com `pix_expires_at < now` → `FAILED`; (b) `webhook_events` não processados → reprocessa; (c) capturas falhas → `capture` de novo (máx. 3, backoff do scheduler `min(60 s × tentativas, 600 s)`); (d) V1: consulta `GET /charges/{id}` para intents `AUTHORIZED` há > 24 h sem captura |
| Idempotência de criação | `payment_intents.idempotency_key` único; `referenceId = intent.id` no provedor evita cobrança dupla mesmo com retry de rede |
| Captura parcial | `capture(amount ≤ authorized)`; nunca captura acima: adicional não aprovado não entra |
| Ordem concluída sem captura | `COMPLETED` é mantido (serviço aconteceu); `wallet.settle` adiado; `incidents` para ops; prestador vê "Pagamento em processamento" |
| Chargeback (V1) | Webhook `charge.chargedback` → `customer_risk_signals.chargebacks++`, `DISPUTED` pelo sistema, `wallet.hold`; contestação com evidências (`media_evidence`, PIN, `custody_events`) |
| Dupla entrada | Job diário recalcula `balance_cents` a partir de `ledger_entries` e compara; journals desbalanceados abrem `incidents(CRITICAL)` |

## 14. Requisitos regulatórios e de mercado (Brasil)

| Tema | O que observar | Impacto no VÉLIO |
|---|---|---|
| Pix (Banco Central) | QR dinâmico com expiração; devolução via API do PSP em até 90 dias; MED (Mecanismo Especial de Devolução) para fraude | `createPixCharge` com `expires_in`; `refund` suportado; política de atendimento a MED no suporte |
| Split de pagamentos / subadquirência | Receber o valor integral e repassar ao prestador caracteriza intermediação; alternativas: split nativo do provedor (recebedores por prestador) ou operar como marketplace com contas de pagamento | MVP: recebimento integral + repasse semanal (simples, exige conta de pagamento e controle de ledger); V1: cadastro de recebedores no provedor e split na captura reduz risco fiscal e de caixa |
| Nota fiscal | Serviço prestado pelo prestador (MEI/autônomo/CNPJ) ao cliente; a plataforma emite NF da comissão ao prestador (ou ao cliente, conforme modelo) | Coletar `legal_name`, CPF/CNPJ (hash + máscara) e, em V1, dados fiscais para emissão; incentivar MEI no onboarding |
| Retenções | Pagamento a autônomo pessoa física pode gerar obrigações (INSS/IR) para quem paga; MEI/CNPJ simplifica | Jurídico/contábil definir antes do primeiro repasse a PF; preferir prestadores com CNPJ no lançamento |
| PCI-DSS | Tokenização no SDK; servidor nunca vê PAN | SAQ-A; manter logs sem `gatewayToken` completo |
| Chargeback | Prazo de contestação até 120 dias; evidência de prestação é a defesa | PIN de início, fotos antes/depois, custódia, chat, `order_events` |
| CDC (Código de Defesa do Consumidor) | Reembolso para a forma original; informação prévia de taxas de cancelamento | Tela de confirmação com taxa calculada; reembolso em crédito só por opção do cliente |
| LGPD | Dados financeiros retidos 5 anos; `user_id` anonimizável | 07 §13 e 14 §10 |

## 15. Matriz de testes

| ID | Cenário | Adaptador | Verificações |
|---|---|---|---|
| P-01 | Cartão aprovado: aceite → `AUTHORIZED`; conclusão → `CAPTURED` por `total_cents` | sandbox `...4242` | `payment_intents`, `ledger_entries` (4 lançamentos balanceados), `service_orders.platform_fee_cents/provider_payout_cents` = `settle` |
| P-02 | Cartão recusado no aceite | `...0002` | `FAILED`, `failure_code = card_declined`, 402, notificação `payment_failed`, ordem permanece `ACCEPTED` |
| P-03 | Saldo insuficiente | `...0009` | idem com `insufficient_funds` |
| P-04 | Falha na captura | `...0004` | `AUTHORIZED` permanece, `incidents(PAYMENT_FAILURE)`, job `payment.reconcile` agendado, `wallet.settle` não executado |
| P-05 | PIX pago via webhook | sandbox `settlePix` → `POST /webhooks/sandbox` | `CAPTURED`, `webhook_events.processed_at`, realtime `payment.updated` |
| P-06 | Webhook duplicado | mesmo `external_id` | 200 `duplicate: true`, nenhum lançamento novo |
| P-07 | Webhook forjado | Pagar.me com `X-Hub-Signature` errada | 401, nada persistido |
| P-08 | PIX expirado e novo PIX | `FakeClock.advance(31 min)` + `payment.reconcile` | Intent 1 `FAILED (pix_expired)`; `POST /orders/:id/payments` cria intent 2 sem recriar a ordem |
| P-09 | Orçamento adicional aprovado | | Intent `ADDITIONAL` só após `APPROVED`; captura final soma as duas |
| P-10 | Orçamento adicional recusado | | Nenhuma intent `ADDITIONAL`; captura só do escopo original |
| P-11 | Cancelamento grátis (`MATCHING`) | | `cancelAuthorization`/sem intent; nenhum lançamento |
| P-12 | Cancelamento tardio (`ACCEPTED` + 30 min) | `FakeClock` | Intent `CANCELLATION_FEE` 1500; CREDIT `PROVIDER` 1500; pré-autorização original cancelada |
| P-13 | Cancelamento em `EN_ROUTE` com preço 30000 | | Taxa 6000 (20 %); preço 8000 → 2000 (mínimo) |
| P-14 | Disputa → `RESOLVED_CUSTOMER` | | `held_cents` durante; `REFUND` + estorno de `PROVIDER_EARNING`; `payouts` exclui a ordem |
| P-15 | Disputa → `RESOLVED_SPLIT` 4000 | | `refunded_cents = 4000`, `PARTIALLY_REFUNDED`, payout recalculado |
| P-16 | Cupom `BEMVINDO10` | | `discount = min(10 %, 3000)`; `COUPON_COST` em `promo`; `used_count`; segunda ordem do mesmo usuário recusa (409) |
| P-17 | Comissão por categoria+região | regras `g`, `c`, `cr` | `pickCommissionRule` escolhe `cr`; `active_until` respeitado |
| P-18 | Lote de repasse semanal | `FakeClock` na quarta 06:00 | `payouts` por prestador, exclui `held`, journal `PAYOUT`, `nextPayoutAt` |
| P-19 | Assinatura: cobrança inicial e recorrente; falha → `PAST_DUE` | `...4242` e `...0002` no ciclo 2 | `payment_intents(SUBSCRIPTION)`, `subscriptions.status`, visitas geradas |
| P-20 | Produção recusa sandbox | `NODE_ENV=production PAYMENTS_PROVIDER=sandbox` | `loadConfig` lança |
| P-21 | Balanceamento do ledger | Fuzz de 200 ordens com cupons, cancelamentos e disputas | Para todo `journal_id`, Σ CREDIT = Σ DEBIT; `balance_cents` = recomputado |

## 16. Checklist de homologação no sandbox do provedor (antes de produção)

1. Conta sandbox Pagar.me com `PAGARME_SECRET_KEY` de teste e webhook apontando para `https://staging.../v1/payments/webhooks/pagarme` com segredo; confirmar que `X-Hub-Signature` chega e valida (ou ajustar o nome do cabeçalho conforme a conta).
2. Tornar `PAGARME_WEBHOOK_SECRET` obrigatório em produção em `loadConfig` (hoje opcional).
3. Tokenização no app com a chave pública do provedor; cartões de teste do provedor para aprovado, recusado, antifraude reprovado.
4. `auth_only` → `capture` parcial (ex.: autorizar 12000, capturar 9900) e verificar o status final da charge.
5. `cancelAuthorization` (DELETE sem amount) e `refund` parcial (DELETE com amount) em charge capturada; conferir eventos recebidos (`charge.refunded`) e mapear `charge.partial_refunded` se existir.
6. PIX: QR renderiza e paga no simulador do provedor; `charge.paid` chega; testar expiração real.
7. Mapear eventos não tratados: `charge.antifraud_reproved`, `charge.chargedback`, `charge.underpaid/overpaid` (PIX), `order.closed`.
8. Enviar `customer` completo (nome real, CPF, telefone, endereço de cobrança) para antifraude; medir taxa de aprovação.
9. Verificar limites de valor, parcelamento (fixo 1) e descritor na fatura ("VELIO*SERVICO").
10. Testar reenvio de webhook pelo painel do provedor → `duplicate: true`.
11. Timeout e retry: desligar a rede durante `capture` e verificar `payment.reconcile`.
12. Conciliação de um dia inteiro: exportar transações do provedor e bater com `payment_intents` + `ledger_entries` (script `reconcile:provider`, V1).
13. Repasse: decidir split nativo vs. transferência; se split, cadastrar recebedor de teste e validar `payouts`.
14. Revisão jurídica/contábil de NF e retenções antes do primeiro repasse real.

## 17. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Pré-autorização expira antes da captura em agendados distantes | Média | Prestador sem garantia | Autorizar 48 h antes (`booking.confirm_request`); reautorizar se `AUTHORIZED` > 5 d |
| Falha de captura após serviço concluído | Baixa | Perda de receita, prestador sem repasse | `payment.reconcile`, incidente, cobrança por nova intent com consentimento do cliente |
| Webhook não verificado por segredo ausente | Média hoje | Fraude de "pagamento confirmado" | Obrigatório em produção (§16 item 2) + teste P-07 |
| Divergência ledger × gateway | Média | Repasse errado | Conciliação diária; journals imutáveis; `balance` recomputável |
| Chargebacks em serviços residenciais | Média | Perda financeira | Evidências obrigatórias; `customer_risk_signals`; pré-pagamento PIX para risco alto |
| Classificação fiscal da intermediação | Alta (regulatório) | Autuação | Parecer contábil antes do lançamento; split nativo em V1 |
| Adaptador Pagar.me sem testes automatizados | Alta | Bugs em produção | Testes com `fetchImpl` falso (fixtures de respostas reais) + homologação §16 |
| Fuso em lotes de repasse e expiração | Baixa | Lote errado | `Clock` injetável; `users.timezone`; horários dos jobs em UTC com conversão explícita |
