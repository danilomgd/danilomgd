# 08 — Especificação da API

Fonte de verdade: `packages/api-client/src/api.ts` (rotas), `packages/contracts/src/*.ts` (schemas Zod), `apps/api/src/app.ts` (convenções transversais), `apps/api/src/lib/*.ts` (auth, erros, validação), `apps/api/src/realtime/io.ts` e `packages/contracts/src/realtime.ts` (realtime). Os módulos em `apps/api/src/modules/*` estão em implementação; onde o comportamento ainda não pôde ser verificado em código, a rota está marcada **(conforme contrato)**: o cliente tipado já a chama e os efeitos listados derivam das `WorkflowDefinition` e dos jobs/eventos declarados.

## 1. Convenções

### 1.1 Transporte

| Item | Regra |
|---|---|
| Base | `https://api.<domínio>/v1`; dev `http://localhost:4000/v1`. `GET /health` fora do prefixo devolve `{ ok, db, payments, time }` |
| Formato | JSON UTF-8 em ambos os sentidos; `Content-Type: application/json`; corpo máximo 2 MiB (`bodyLimit`) |
| Datas | ISO 8601 com offset (`IsoDateTime`), sempre UTC na resposta (`2026-10-13T15:04:05.000Z`) |
| Dinheiro | Inteiros em centavos, sufixo `Cents`; percentuais em bps | 
| Ids | UUID v7 em string |
| Cabeçalho de app | `X-Velio-App: customer \| provider \| web` (enviado por `HttpClient.appHeader`); usado em analytics e para escolher o papel criado no primeiro OTP quando `app` não vem no corpo |
| Proxy | `trustProxy: true`; rate limit e `audit_logs.ip` usam `X-Forwarded-For` |
| CORS | `CORS_ORIGINS` (lista separada por vírgula; `*` só em dev) com `credentials: true` |

### 1.2 Autenticação

| Item | Regra |
|---|---|
| Esquema | `Authorization: Bearer <accessToken>`; JWT HS256 assinado com `JWT_SECRET` (`lib/jwt.ts`), claims `AccessTokenClaims { sub, roles[], providerId? }` + `iat`, `exp` |
| Validade | Access 15 min (`JWT_ACCESS_TTL_SECONDS`); refresh 30 dias (`JWT_REFRESH_TTL_SECONDS`), opaco, armazenado por hash e rotacionado a cada uso |
| Hook | `onRequest` decodifica o token e preenche `req.auth` sem lançar; cada rota decide com `requireAuth`, `requireRole`, `requireProvider` (`lib/auth.ts`) |
| Papéis | `customer`, `provider`, `operator`, `admin` (acumuláveis). `preHandlers.ops` aceita `operator` ou `admin`; `preHandlers.admin` só `admin`; `preHandlers.provider` exige papel `provider` e `providerId` no token (prestador com onboarding feito) |
| Ator do domínio | `actorFrom(auth, preferred)` traduz papéis em `ActorType`; operador e admin viram `operator` |
| Refresh automático | `HttpClient` repete a requisição uma vez após 401 com `POST /v1/auth/refresh`; se falhar, limpa tokens e chama `onUnauthorized` |

### 1.3 Erros

Formato único (`lib/errors.ts`, `setErrorHandler` em `app.ts`):

```json
{ "error": { "code": "INVALID_TRANSITION", "message": "Ação provider.complete não permitida em ARRIVED", "details": { "status": "ARRIVED", "allowedActions": ["provider.start", "provider.cancel"] } } }
```

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `BAD_REQUEST` | Falha de validação Zod (`details: [{ path, message }]`), parâmetro inválido |
| 401 | `UNAUTHORIZED` | Sem token, token expirado ou assinatura inválida |
| 402 | `PAYMENT_FAILED` | Gateway recusou autorização/captura (`details: { failureCode, failureMessage }`) |
| 403 | `FORBIDDEN` | Papel insuficiente, recurso de outro usuário, guard `actorIsAssignedProvider`/`actorIsOrderCustomer`, prestador `PENDING` tentando ficar online |
| 404 | `NOT_FOUND` | Recurso inexistente ou invisível para o ator (não se distingue para evitar enumeração) |
| 409 | `CONFLICT` | Oferta já aceita por outro prestador, `version` da ordem mudou, cupom esgotado, documento duplicado |
| 409 | `INVALID_TRANSITION` | `applyTransition` devolveu `INVALID_ACTION`, `GUARD_FAILED` ou `TERMINAL`; `details` traz `status`, `guard` e `allowedActions` |
| 422 | `UNPROCESSABLE` | Entrada válida mas semanticamente impossível (serviço exige veículo e nenhum foi informado; endereço fora de região ativa; PIX para valor zero) |
| 429 | `RATE_LIMITED` | Limite por usuário/IP (`@fastify/rate-limit`, `RATE_LIMIT_MAX`=300/min) ou limites específicos (OTP) |
| 500 | `INTERNAL` | Erro não tratado; mensagem genérica, detalhes só no log |

### 1.4 Paginação, idempotência e limites

| Item | Regra |
|---|---|
| Paginação | Cursor opaco (`Pagination { cursor?, limit 1..100 (padrão 20) }`); resposta `Page<T> { items, nextCursor }`. Cursor = base64url de `created_at|id` do último item; ordenação `created_at DESC, id DESC`. `OrderListQuery.limit` máx. 50 |
| Idempotência de criação | `POST /v1/requests` aceita `idempotencyKey` (8–64) único por cliente: repetição devolve 200 com a ordem existente. Intents usam `idempotency_key` interna; webhooks `webhook_events(gateway, external_id)` |
| Rate limit global | 300 req/min por `userId` autenticado ou por IP (`keyGenerator`) |
| Rate limits específicos (conforme contrato) | OTP: 3 pedidos/telefone/10 min e 5 verificações/challenge; login por senha: 10/IP/10 min; `location.push`: 1/s por prestador; mensagens: 20/min por conversa; analytics: 100 eventos por lote |
| Retentativas do cliente | Seguro repetir `GET` e qualquer `POST` com idempotency key ou que seja transição (a engine devolve 409 se já aplicada) |

### 1.5 Versionamento e depreciação

| Regra | Detalhe |
|---|---|
| Prefixo de versão | `/v1`. Quebra de contrato = `/v2` convivendo por no mínimo 6 meses |
| Aditivo não quebra | Novos campos opcionais na resposta, novos enums em `OrderStatus`/`TransitionAction` (os apps renderizam rótulos de `ORDER_STATUS_LABELS` e caem em `generic` se desconhecido), novas rotas |
| Quebra | Remover/renomear campo, mudar tipo, tornar opcional em obrigatório, mudar semântica de erro |
| Depreciação | Cabeçalhos `Deprecation: true` e `Sunset: <data RFC 1123>` na rota antiga; aviso no changelog de `packages/contracts`; app mínimo suportado controlado por `platform_settings.minAppVersion` (V1) com erro `426` |
| Contratos | `packages/contracts` é versionado com o monorepo; mobile e web compilam contra a mesma versão, então a compatibilidade a observar é com apps já instalados (janela de 90 dias) |

## 2. Autenticação e perfil (`identity`)

### 2.1 `POST /v1/auth/otp/request`

| Item | Valor |
|---|---|
| Papel | Público |
| Entrada | `OtpRequestInput { phone: PhoneBR (+55DDDNÚMERO), app: 'customer' \| 'provider' = 'customer' }` |
| Resposta 200 | `OtpRequestResult { challengeId, expiresInSeconds (300), devCode? }` — `devCode` **só** em `NODE_ENV=test` |
| Erros | 400 telefone inválido; 429 mais de 3 pedidos em 10 min para o mesmo telefone |
| Efeitos | Insere `otp_challenges` com `code_hash`; `SmsSender.send` (adaptador `log` grava `[sms:log]` com código mascarado); nenhum evento de domínio |

```json
// requisição
{ "phone": "+5511987654321", "app": "customer" }
// resposta
{ "challengeId": "019298f1-6b3e-7c1a-9a1b-3f2e4d5c6b7a", "expiresInSeconds": 300 }
```

### 2.2 `POST /v1/auth/otp/verify`

| Item | Valor |
|---|---|
| Papel | Público |
| Entrada | `OtpVerifyInput { challengeId, code: /^\d{6}$/, deviceName? }` |
| Resposta 200 | `AuthTokens { accessToken, refreshToken, expiresInSeconds: 900, user: UserPublic, needsOnboarding }` |
| Erros | 400 código mal formado; 401 código errado/expirado/consumido (`attempts++`); 429 após 5 tentativas no mesmo challenge |
| Efeitos | Cria `users` (roles `[app]`) no primeiro acesso; marca `consumed_at`; insere `refresh_tokens(token_hash)`; `users.last_seen_at`; evento `analytics.track(app_open)` |

```json
{ "challengeId": "019298f1-6b3e-7c1a-9a1b-3f2e4d5c6b7a", "code": "482913", "deviceName": "iPhone de Ana" }
// 200
{ "accessToken": "eyJhbGciOiJIUzI1NiIs...", "refreshToken": "Yk3f...base64url...", "expiresInSeconds": 900,
  "user": { "id": "019298f2-...", "name": null, "phone": "+5511987654321", "email": null, "roles": ["customer"], "avatarUrl": null, "createdAt": "2026-10-13T15:04:05.000Z" },
  "needsOnboarding": true }
```

### 2.3 `POST /v1/auth/password/login`

| Item | Valor |
|---|---|
| Papel | Público (operador/admin) |
| Entrada | `PasswordLoginInput { email, password (8..200) }` |
| Resposta 200 | `AuthTokens` |
| Erros | 401 credenciais inválidas (mesma mensagem para e-mail inexistente e senha errada); 429 após 10 falhas/IP/10 min; 403 `users.status != ACTIVE` |
| Efeitos | `verifyPassword` (scrypt); `refresh_tokens`; `audit_logs(action='auth.login', ip)` |

### 2.4 `POST /v1/auth/refresh`

| Item | Valor |
|---|---|
| Papel | Público (porta refresh token) |
| Entrada | `RefreshInput { refreshToken (min 20) }` |
| Resposta 200 | `{ accessToken, refreshToken, expiresInSeconds }` — refresh **rotacionado**: o antigo recebe `revoked_at` e `replaced_by_id` |
| Erros | 401 token desconhecido, expirado ou revogado. Se um token com `replaced_by_id` preenchido for apresentado (reuso), toda a cadeia do usuário é revogada |
| Efeitos | `refresh_tokens` insert + update |

Observação: não existe em `api.ts` porque o `HttpClient` a chama internamente (`http.ts: refresh()`).

### 2.5 `POST /v1/auth/logout`

Papel: autenticado. Sem corpo. 204. Revoga o refresh token do dispositivo (enviado no corpo opcional `{ refreshToken? }`; sem ele, revoga todos do usuário) e desativa `devices` do app chamador.

### 2.6 `GET /v1/me` e `PATCH /v1/me`

| Item | GET | PATCH |
|---|---|---|
| Papel | autenticado | autenticado |
| Entrada | — | `UpdateProfileInput { name?, email?, timezone?, consents?: { terms, privacy, marketing=false, personalization=false } }` |
| Resposta | `UserPublic` | `UserPublic` |
| Erros | 401 | 400; 409 e-mail já em uso |
| Efeitos | — | Grava `users.consents[chave] = { granted, at }` com timestamp do servidor (prova de consentimento); `needsOnboarding` passa a `false` quando `name` e `terms`+`privacy` existem |

```json
// PATCH
{ "name": "Ana Souza", "consents": { "terms": true, "privacy": true, "marketing": false, "personalization": true } }
```

### 2.7 `POST /v1/me/devices`

Papel: autenticado. Entrada `RegisterDeviceInput { pushToken (min 10), platform: ios|android|web }`. 204. Upsert em `devices` por `push_token` (reatribui ao usuário atual; `app` vem de `X-Velio-App`).

## 3. Catálogo (`catalog`)

### 3.1 `GET /v1/catalog/home?lat&lng`

| Item | Valor |
|---|---|
| Papel | autenticado (cliente); anônimo recebe só `search`, `categories`, `quick_services` (conforme contrato) |
| Resposta | `HomeResponse { greeting, contextHint: { text, source: time_of_day \| equipment_due \| upcoming_booking \| active_order } \| null, sections: HomeSection[] }` |
| Regras | Seções de `home_sections` ativas, ordenadas por `sort_order`, filtradas por `rules`: `hoursOfDay` contra a hora local (`users.timezone`), `requiresActiveOrder` (ordem não terminal), `requiresEquipmentDue` (`maintenanceDue`), `requiresSubscription`. `items` resolvidos no servidor (`config.serviceSlugs` → `ServiceSummary[]`, categorias, ordens ativas, planos). `contextHint` nunca inventado: cada fonte tem um registro real por trás |
| Erros | 400 lat/lng fora de faixa |

```json
{ "greeting": "Boa tarde, Ana",
  "contextHint": { "text": "A limpeza do ar-condicionado da sala venceu há 32 dias.", "source": "equipment_due" },
  "sections": [
    { "id": "search", "kind": "search", "title": "O que você precisa?", "subtitle": null, "items": [], "meta": {} },
    { "id": "today", "kind": "recommendations", "title": "Resolver hoje", "subtitle": null, "items": [ { "id": "0192...", "slug": "encanador-visita", "name": "Encanador: visita e reparo simples", "pricingModel": "FIXED", "basePriceCents": 8000, "priceMinCents": null, "priceMaxCents": null, "estimatedDurationMinutes": 60, "allowsImmediate": true, "allowsScheduling": true, "workflowKind": "IMMEDIATE", "categoryId": "0192...", "shortDescription": "Vazamento, torneira, sifão, válvula", "imageUrl": null } ], "meta": {} },
    { "id": "equipment_due", "kind": "recommendations", "title": "Está na hora de revisar seu ar-condicionado?", "subtitle": null, "items": [ "..." ], "meta": { "equipmentId": "0192..." } }
  ] }
```

### 3.2 `GET /v1/catalog/categories`, `GET /v1/catalog/services?category=`, `GET /v1/catalog/services/:slug`, `GET /v1/catalog/plans`

| Rota | Papel | Resposta | Notas |
|---|---|---|---|
| categories | público | `ServiceCategory[]` (ativas, com `config` completo após merge com padrões de `CategoryConfig`) | Cache HTTP 5 min |
| services | público | `ServiceSummary[]` filtrado por `category` (slug) | Só `active = true` |
| services/:slug | público | `Service` completo com `options` | 404 se inativo |
| plans | público | `SubscriptionPlan[]` ativos | |

### 3.3 `GET /v1/catalog/search?q&lat&lng`

Papel: público. `SearchQuery { q (1..120), lat?, lng? }`. Resposta `ServiceSummary[]` (até 20). Busca em `services.search_text` com `ILIKE %termo%` por token (pg_trgm em V1); registra `analytics.track(search_performed { q_len, results })` sem o texto da busca quando o usuário não consentiu `personalization`.

### 3.4 `POST /v1/catalog/estimate`

| Item | Valor |
|---|---|
| Papel | público |
| Entrada | `PriceEstimateInput { serviceId, options: Record<string, string\|number\|boolean>, regionId?, couponCode? }` |
| Resposta | `PriceEstimate { pricingModel, subtotalCents, minCents, maxCents, discountCents, totalCents, requiresQuote, breakdown[{label, amountCents}] }` |
| Regras | `domain/pricing/estimate.ts: estimatePrice(priceSource, options, coupon)` com `PriceSource` = `services` sobreposto por `service_price_rules(service, region)`; `couponDiscount` respeita `minOrderCents`/`maxDiscountCents` e nunca excede o subtotal; cupom inválido não é erro: `discountCents = 0` e `breakdown` sem linha de cupom |
| Erros | 404 serviço; 400 opção inválida (`select` com valor fora de `choices`, `number` fora de `min/max`) |

```json
// requisição
{ "serviceId": "0192...encanador", "options": { "urgente": true }, "couponCode": "BEMVINDO10" }
// resposta
{ "pricingModel": "FIXED", "subtotalCents": 11000, "minCents": null, "maxCents": null, "discountCents": 1100, "totalCents": 9900, "requiresQuote": false,
  "breakdown": [ { "label": "Serviço", "amountCents": 8000 }, { "label": "Atendimento urgente (até 1h)", "amountCents": 3000 }, { "label": "Cupom BEMVINDO10", "amountCents": -1100 } ] }
```

## 4. Dados do cliente (`identity`, `assets`, `payments`, `subscriptions`, `communication`)

### 4.1 Endereços, veículos e equipamentos

| Rota | Papel | Entrada | Resposta | Erros / efeitos |
|---|---|---|---|---|
| `GET /v1/me/addresses` | autenticado | — | `Address[]` (sem `deleted_at`) | |
| `POST /v1/me/addresses` | autenticado | `AddressInput` (lat/lng obrigatórios; geocodificação acontece no app) | 201 `Address` | 422 fora de qualquer `regions` ativa (`details.regionless = true`, endereço salvo mesmo assim para permitir lista de espera); primeiro endereço vira `isDefault` |
| `DELETE /v1/me/addresses/:id` | dono | — | 204 | Soft delete; 409 se for o endereço de uma assinatura ativa |
| `GET/POST /v1/me/vehicles` | autenticado | `VehicleInput` (`plate` normalizada por `PlateBR`) | `Vehicle[]` / 201 `Vehicle` | 409 placa já cadastrada pelo mesmo usuário |
| `GET/POST /v1/me/equipments` | autenticado | `EquipmentInput` | `Equipment[]` / 201 `Equipment` com `nextMaintenanceDueAt` derivado | |

```json
// POST /v1/me/vehicles
{ "brand": "Fiat", "model": "Argo", "plate": "bra2e19", "year": 2022, "color": "Prata" }
// 201
{ "id": "0192...", "userId": "0192...", "brand": "Fiat", "model": "Argo", "plate": "BRA2E19", "year": 2022, "color": "Prata", "createdAt": "2026-10-13T15:10:00.000Z" }
```

### 4.2 Métodos de pagamento

| Rota | Papel | Entrada | Resposta |
|---|---|---|---|
| `GET /v1/me/payment-methods` | autenticado | — | `PaymentMethod[]` |
| `POST /v1/me/payment-methods` | autenticado | `AddPaymentMethodInput` (união por `kind`): `CARD { gatewayToken (min 10), holderName, setDefault=true }`, `PIX { setDefault=false }`, `WALLET { setDefault=false }` | 201 `PaymentMethod { id, kind, brand, last4, expMonth, expYear, isDefault }` |

O servidor nunca recebe PAN/CVV: o app tokeniza no SDK do provedor (ADR-007). Em sandbox, `tokenizeForTests` gera `tok_sandbox_<last4>`; tokens terminados em `0002`, `0009` e `0004` simulam falhas (ver `13 §3`). Erros: 402 quando o gateway rejeita o token; 409 cartão já cadastrado (mesmo `gatewayToken`).

### 4.3 Notificações, carteira, assinaturas

| Rota | Papel | Entrada | Resposta | Notas |
|---|---|---|---|---|
| `GET /v1/me/notifications` | autenticado | `Pagination` | `Notification[]` (50 mais recentes) | Marca `read_at` em `PATCH /v1/me/notifications/:id/read` (conforme contrato) |
| `GET /v1/me/wallet` | autenticado | — | `WalletSummary { balanceCents, pendingCents, heldCents, nextPayoutAt: null }` | Conta `USER` criada sob demanda |
| `GET /v1/me/subscriptions` | autenticado | — | `Subscription[]` | |
| `POST /v1/me/subscriptions` | autenticado | `SubscribeInput { planId, equipmentIds (min 1), addressId, paymentMethodId, preferredWeekday?, preferredPeriod? }` | 201 `Subscription` | Cria `payment_intents(kind=SUBSCRIPTION)` e cobra o ciclo; 402 se falhar (assinatura não é criada); agenda `subscription.generate_visit` para `nextVisitDue`; `analytics.track(subscription_started)` |
| `POST /v1/me/subscriptions/:id/cancel` | dono | `{ reason }` | `Subscription` com `status=CANCELLED` | Visitas futuras ainda não aceitas são canceladas pela plataforma; `subscription_cancelled` |

## 5. Ordens (`orders`, `quotes`, `payments`, `communication`, `reputation`, `support`)

### 5.1 `POST /v1/requests` — criar solicitação e ordem

| Item | Valor |
|---|---|
| Papel | `customer` |
| Entrada | `CreateServiceRequestInput { serviceId, addressId?, vehicleId?, equipmentId?, schedule: { mode:'NOW' } \| { mode:'SCHEDULED', startsAt, windowMinutes 30..240=60 }, options, notes?, mediaUrls (≤6), paymentMethodId?, couponCode?, destinationAddressId?, idempotencyKey? }` |
| Resposta | 201 `ServiceOrderDetail` (200 se `idempotencyKey` repetida) |
| Validações | `services.requires_address/vehicle/equipment` → 422 quando falta insumo; `allows_immediate/allows_scheduling` vs `schedule.mode` → 422; `startsAt` no futuro (≥ 30 min) e dentro de 60 dias; cupom válido/elegível → 409 `COUPON_INVALID` em `details`; endereço em região ativa → 422; `customer_risk_signals.risk_score_bps ≥ 5000` e `methodKind=PIX` → exige pagamento antecipado (`metadata.prepayRequired = true`) |
| Efeitos | Transação: `service_requests` + `service_orders` (`status = initial` da definição: `REQUESTED`, `SCHEDULED` ou `SUBMITTED`; `flags` congeladas da categoria; `start_pin` via `pinFromBytes` quando `requiresStartPin`; `custody_code` quando `requiresCustody`; `price_cents`/`discount_cents` de `estimatePrice`) + `order_events[seq=1, type=CREATED]` + `conversations(kind=ORDER)` + `domain_events(order.created)` + `scheduled_jobs(dispatch.start)` em `now` (IMMEDIATE/QUOTE/LOGISTICS/LAUNDRY/CONCIERGE) ou em `scheduledMatchingStart(startsAt)` (6 h antes); `coupon_redemptions` reservado; `analytics.track(service_request_completed)` |

```json
// requisição
{ "serviceId": "0192...encanador", "addressId": "0192...casa", "schedule": { "mode": "NOW" }, "options": { "urgente": true }, "notes": "Vazamento embaixo da pia da cozinha", "mediaUrls": ["https://cdn.velio.app/u/0192.../vazamento.jpg"], "paymentMethodId": "0192...visa", "couponCode": "BEMVINDO10", "idempotencyKey": "req-2026-10-13-ana-01" }
// 201 (resumido)
{ "id": "0192a0b1-...", "requestId": "0192a0b0-...", "customerId": "0192...", "providerId": null, "parentOrderId": null, "serviceId": "0192...", "serviceName": "Encanador: visita e reparo simples", "categorySlug": "hidraulica", "workflowKind": "IMMEDIATE", "workflowVersion": 1, "status": "REQUESTED",
  "scheduledFor": null, "windowMinutes": null, "etaAt": null,
  "address": { "summary": "Rua Harmonia, 123 — Vila Madalena, São Paulo", "lat": -23.5563, "lng": -46.6889, "instructions": "Interfone 42" }, "destination": null,
  "priceCents": 11000, "additionalApprovedCents": 0, "discountCents": 1100, "totalCents": 9900, "platformFeeCents": null, "providerPayoutCents": null,
  "startPin": "7391", "custodyCode": null, "notes": "Vazamento embaixo da pia da cozinha", "provider": null, "cancelReason": null,
  "createdAt": "2026-10-13T15:12:00.000Z", "updatedAt": "2026-10-13T15:12:00.000Z", "startedAt": null, "completedAt": null,
  "events": [ { "id": "0192...", "orderId": "0192a0b1-...", "seq": 1, "type": "CREATED", "action": null, "fromStatus": null, "toStatus": "REQUESTED", "actorType": "customer", "actorId": "0192...", "payload": {}, "createdAt": "2026-10-13T15:12:00.000Z" } ],
  "quotes": [], "tasks": [], "allowedActions": ["customer.cancel"] }
```

`startPin` só aparece na resposta para o cliente da ordem; para prestador e ops o campo vem `null`.

### 5.2 `GET /v1/orders?scope&cursor&limit` e `GET /v1/orders/:id`

| Item | Lista | Detalhe |
|---|---|---|
| Papel | autenticado (cliente vê as próprias) | cliente da ordem, prestador atribuído, ops |
| Entrada | `OrderListQuery { scope: active\|history\|all, cursor?, limit ≤50 }` | — |
| Resposta | `Page<ServiceOrder>`; `active` = status não terminal | `ServiceOrderDetail` com `events` (ordenados por `seq`), `quotes`, `tasks`, `allowedActions` (= `allowedActions(def, snapshot, actorFrom(auth))`) |
| Erros | — | 404 se não visível (`canUserAccessOrder`) |

### 5.3 `POST /v1/orders/:id/transition` — transição genérica

| Item | Valor |
|---|---|
| Papel | autenticado; a engine decide por `allowedActors` e guards |
| Entrada | `TransitionInput { action: TransitionAction, payload }` |
| Resposta | 200 `ServiceOrderDetail` |
| Erros | 409 `INVALID_TRANSITION` (`details.code ∈ INVALID_ACTION, FORBIDDEN_ACTOR, GUARD_FAILED, TERMINAL`, `details.guard`, `details.allowedActions`); 403 para ações `system.*`/`operator.*` por não-ops |
| Algoritmo | 1) `SELECT ... FOR UPDATE` da ordem; 2) monta `OrderSnapshot` (evidências, quotes, filhas, custódia, handover, intents); 3) `applyTransition(def, snapshot, action, actor, { now, payload })`; 4) `UPDATE service_orders SET status, version = version+1 ... WHERE version = ?` (409 `CONFLICT` se zero linhas); 5) `order_events(seq+1, type=TRANSITION)`; 6) `domain_events(order.transitioned, { effects })`; 7) commit; 8) handlers do outbox executam os `effects` (ver §9) |

Atalhos abaixo são açúcar sobre esta rota com validação específica de payload.

### 5.4 Atalhos do ciclo de vida

| Rota | Papel | Entrada | Ação disparada | Guards relevantes | Efeitos (da definição) |
|---|---|---|---|---|---|
| `POST /v1/orders/:id/cancel` | cliente da ordem ou ops | `CancelInput { reason 3..300 }` | `customer.cancel` (ops: `operator.cancel`) | `actorIsOrderCustomer`, `customerCancelAllowed` | `dispatch.cancelOffers`, `payments.chargeCancellationFee` (`customerCancellation` → `payment_intents(kind=CANCELLATION_FEE)` creditado ao prestador), `payments.cancelAuthorization`, `booking.release`, `provider.setOnline`, `notify.provider:order_cancelled`, `analytics.track(order_cancelled)`. Resposta inclui `cancellationFeeCents` em `metadata` |
| `POST /v1/orders/:id/start` | prestador atribuído | `StartInput { pin?: 4 dígitos, location? }` | `provider.start` | `actorIsAssignedProvider`, `requiresPin` (compara `payload.pin` com `start_pin`), `requiresEvidence:BEFORE` | `notify.customer:service_started`, `chat.systemMessage`, `analytics.track(service_started)`; `started_at` |
| `POST /v1/orders/:id/complete` | prestador atribuído | `CompleteInput { notes?, evidenceIds[] }` | `provider.complete` | `actorIsAssignedProvider`, `noOpenAdditionalQuote`, `requiresEvidence:AFTER` | `payments.capture` (total = price + additional − discount), `wallet.settle`, `provider.setOnline`, `notify.customer:service_completed`, `notify.customer:review_request`, `chat.systemMessage`, `analytics.track(service_completed)`; agenda `order.auto_complete_check` (+7 d) e `conversation.close` (+48 h) |
| `POST /v1/orders/:id/evidence` | prestador atribuído (ou cliente para `OTHER`) | `EvidenceInput { kind, url, metadata }` | nenhuma | ordem não terminal | Insere `media_evidence`; 201 `MediaEvidence` |
| `POST /v1/orders/:id/custody/scan` | prestador atribuído | `CustodyScanInput { itemCode (≥4), location?, photoUrl?, note? }` | nenhuma (habilita `requiresCustodyScan`) | `itemCode == custody_code` → 409 `CUSTODY_CODE_MISMATCH` se diferente | Insere `custody_events(step = status atual)`; `media_evidence(kind=CUSTODY)` se `photoUrl` |
| `POST /v1/orders/:id/vehicle-handover/:step` | prestador atribuído | `step ∈ PICKUP\|DELIVERY`; `VehicleHandoverInput { odometerKm, fuelLevelPct?, checklist, photoUrls (≥1), customerConfirmationPin? }` | nenhuma (habilita `requiresVehicleHandover`) | `DELIVERY` exige PIN do cliente igual a `start_pin` → 403 se errado | Insere `vehicle_handovers` + `media_evidence(ODOMETER, PICKUP/DELIVERY)` |

Mensagens de 409 vêm dos guards (`guards.ts`), em pt-BR: "PIN inválido", "Foto \"depois\" obrigatória", "Há um orçamento adicional aguardando decisão do cliente", "Leitura do código de custódia obrigatória nesta etapa".

```json
// POST /v1/orders/0192a0b1/start com PIN errado → 409
{ "error": { "code": "INVALID_TRANSITION", "message": "PIN inválido", "details": { "code": "GUARD_FAILED", "guard": "requiresPin", "status": "ARRIVED", "allowedActions": ["provider.start", "provider.cancel"] } } }
```

### 5.5 Orçamentos

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `POST /v1/orders/:id/quotes` | prestador atribuído | `CreateQuoteInput { kind: INITIAL\|ADDITIONAL, items[{description, quantity, unitPriceCents}] (≥1), notes?, expiresInMinutes 5..4320=60 }` | 201 `Quote` (`status=SENT`, `amountCents = Σ qty×unit` arredondado meio para cima) | `INITIAL` só em `UNDER_REVIEW`/`QUOTE_REJECTED`/`PLAN_APPROVED` e dispara `provider.submit_quote` (guard `hasSentQuote`); `ADDITIONAL` só em `IN_PROGRESS` com `flags.allowsAdditionalQuote` e sem outro `SENT` (409); agenda `quote.expire`; `notify.customer:quote_available`; realtime `quote.created`; `analytics.track(quote_sent)` |
| `POST /v1/quotes/:quoteId/approve` | cliente da ordem | — | `Quote` `APPROVED` | `INITIAL`: dispara `customer.approve_quote` (guard `hasApprovedQuote`) e grava `price_cents = amount`; `ADDITIONAL`: `additional_approved_cents += amount` e cria `payment_intents(kind=ADDITIONAL, quote_id)` com autorização imediata (402 se falhar: quote volta a `SENT`); `notify.provider:quote_decided`; `quote_approved` |
| `POST /v1/quotes/:quoteId/reject` | cliente da ordem | — | `Quote` `REJECTED` | `INITIAL`: `customer.reject_quote` → `QUOTE_REJECTED`; `ADDITIONAL`: prestador conclui só o escopo original; `quote_rejected` |

Erros: 409 quote não está `SENT` (já decidida/expirada); 403 ator errado; 404.

### 5.6 Pagamentos da ordem

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `POST /v1/orders/:id/payments` | cliente da ordem | `CreatePaymentIntentInput { paymentMethodId?, methodKind: CARD\|PIX\|WALLET, useWalletCredit=false }` | 201 `PaymentIntent` | Usada para (a) trocar o método antes do aceite, (b) gerar novo PIX após expiração (`status=FAILED, failureCode=pix_expired`) sem recriar a ordem, (c) `customer.authorize_payment` em `QUOTE`/`CONCIERGE`. Idempotente por `order:{id}:{kind}:{n}`. `CARD` → `authorizeCard` (402 em recusa); `PIX` → `createPixCharge` (expira em 30 min) e `status=REQUIRES_ACTION`; `WALLET` → debita saldo até cobrir, restante no método padrão |
| `GET /v1/orders/:id/payments` | cliente da ordem, ops | — | `PaymentIntent[]` | Prestador não vê intents (vê só `providerPayoutCents`) |

```json
// 201 PIX
{ "id": "0192...", "orderId": "0192a0b1-...", "quoteId": null, "subscriptionId": null, "kind": "INITIAL", "methodKind": "PIX", "amountCents": 9900, "capturedCents": 0, "refundedCents": 0, "status": "REQUIRES_ACTION", "gateway": "sandbox", "gatewayRef": "pix_3f2e...",
  "pix": { "qrCode": "00020126sandboxpix_3f2e...5204000053039865406 99.005802BR", "copyPaste": "sandbox-pix-pix_3f2e...", "expiresAt": "2026-10-13T15:42:00.000Z" },
  "failureCode": null, "failureMessage": null, "createdAt": "2026-10-13T15:12:01.000Z", "updatedAt": "2026-10-13T15:12:01.000Z" }
```

### 5.7 Avaliação, disputa e chat

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `POST /v1/orders/:id/review` | cliente da ordem (prestador avalia cliente pela mesma rota com `targetType` inferido) | `ReviewInput { rating 1..5, tags (≤5), comment? (≤600) }` | 201 `Review` | Dispara `customer.review` (`COMPLETED → REVIEWED`); 409 fora de `reviews.windowDays` ou já avaliado (`reviews_order_target_uq`); `reputation.recompute`; `review_created`. Rating ≤ 2 abre `support_tickets(kind=COMPLAINT, priority=HIGH)` e `wallet.hold` (conforme contrato; ver inconsistência em 18 §7) |
| `POST /v1/orders/:id/disputes` | cliente da ordem | `OpenDisputeInput { reason: NOT_DONE\|POOR_QUALITY\|DAMAGE\|OVERCHARGE\|OTHER, description 10..2000, evidenceUrls (≤10) }` | 201 `Dispute` (`status=OPEN`) | Dispara `customer.open_dispute` (`COMPLETED\|REVIEWED → DISPUTED`); `wallet.hold` congela `PROVIDER_EARNING` da ordem; `ops.alert:dispute` → realtime `ops.order_needs_attention`; 409 se já existe disputa (`disputes_order_uq`) ou fora da janela (7 d) |
| `GET /v1/orders/:id/messages` | participante da conversa, ops | `Pagination` | `Message[]` | Marca `conversation_participants.last_read_at` |
| `POST /v1/orders/:id/messages` | participante | `SendMessageInput { body? (≤2000), mediaUrl? }` (um dos dois) | 201 `Message` | 409 conversa fechada (`closed_at`); 429 > 20/min; filtro de palavras-chave marca `metadata.flagged`; outbox `message.created` → realtime para `order:{id}` e `notification.created` |

## 6. Concierge (`concierge`)

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `POST /v1/concierge/requests` | `customer` | `ConciergeRequestInput { inputType: TEXT\|AUDIO\|IMAGE, text? (5..2000), audioUrl?, imageUrls (≤4), addressId?, vehicleId? }` | 201 `ConciergeRequest` | Cria `service_orders(workflow=CONCIERGE, status=SUBMITTED)` para o serviço `concierge` + `concierge_requests`; job `dispatch.start` → `system.start_matching` (`SUBMITTED → INTERPRETING`, efeito `concierge.plan`); `concierge_submitted` |
| `GET /v1/concierge/requests/:id` | cliente dono, ops | — | `ConciergeRequest` com `plan` | |
| `POST /v1/concierge/requests/:id/answers` | cliente dono | `ConciergeAnswerInput { answers[{question, answer ≤500}] }` | `ConciergeRequest` | Anexa a `answers` e replaneja (`concierge.plan` com texto + respostas) |
| `POST /v1/concierge/requests/:id/approve-plan` | cliente dono | — | `ServiceOrderDetail` | Dispara `customer.approve_plan` (`PLAN_PROPOSED → PLAN_APPROVED`, guard `planPresent`); efeito `concierge.quote` gera `quotes(kind=INITIAL)` a partir de `estimateMaxCents` e dispara `provider.submit_quote` pelo sistema → `QUOTED`; `concierge_plan_approved` |

Efeito `concierge.plan`: chama `adapters.planner.plan(text, ctx)` (`RuleBasedPlanner` ou `ClaudePlanner`), valida com `ConciergePlan`, grava `plan` e `planner_name`, aplica `needsHumanReview(plan, settings.concierge)`; se exigir humano → `system.plan_needs_human` (`NEEDS_HUMAN`, `ops.alert:needs_human`), senão `system.plan_ready` (`PLAN_PROPOSED`, `notify.customer:plan_proposed`). A IA nunca cria pagamento (ADR-014).

```json
// POST /v1/concierge/requests
{ "inputType": "TEXT", "text": "Pegue meu carro amanhã às 8h, leve para revisão na concessionária e devolva quando terminar.", "vehicleId": "0192...argo", "addressId": "0192...casa" }
// GET após planejamento (status da ordem: NEEDS_HUMAN)
{ "id": "0192...", "orderId": "0192...", "customerId": "0192...", "inputType": "TEXT", "rawText": "Pegue meu carro amanhã às 8h...", "transcript": null, "plannerName": "rules@1", "operatorUserId": null,
  "plan": { "summary": "Retirar o veículo em 14/10/2026, 08:00, levar para revisão e devolver ao cliente.", "estimateMinCents": 15000, "estimateMaxCents": 45000, "confidence": 0.8, "clarifications": [], "requiresHuman": true,
    "requiresHumanReasons": ["Serviço de terceiro (oficina) exige combinação humana de custo e prazo", "Plano com muitas tarefas"],
    "tasks": [ { "seq": 1, "title": "Retirada do veículo", "kind": "VEHICLE_PICKUP", "serviceSlug": "leva-e-traz-veiculo", "startsAt": "2026-10-14T11:00:00.000Z", "dependsOnSeq": [], "estimateCents": 6000 }, { "seq": 2, "title": "Transporte até o destino", "kind": "TRANSPORT", "dependsOnSeq": [1] }, { "seq": 3, "title": "Entrega na oficina/concessionária para revisão", "kind": "THIRD_PARTY_SERVICE", "dependsOnSeq": [2], "notes": "Custo da revisão é cobrado pela oficina; a plataforma acompanha." }, { "seq": 4, "title": "Acompanhamento e espera", "kind": "WAIT", "dependsOnSeq": [3] }, { "seq": 5, "title": "Nova coleta no destino", "kind": "RETURN_PICKUP", "dependsOnSeq": [4] }, { "seq": 6, "title": "Devolução ao cliente", "kind": "VEHICLE_RETURN", "dependsOnSeq": [5], "estimateCents": 6000 } ] },
  "createdAt": "2026-10-13T15:20:00.000Z", "updatedAt": "2026-10-13T15:20:02.000Z" }
```

## 7. Prestador (`providers`, `dispatch`, `wallet`)

### 7.1 Cadastro e estado

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `GET /v1/providers/me` | `provider` | — | `ProviderMe` (inclui `documents[]` com status e `walletBalanceCents`) | 404 se ainda não fez onboarding |
| `POST /v1/providers/me` | autenticado com papel `provider` (ou cliente que quer virar prestador: adiciona o papel) | `ProviderOnboardingInput { displayName, legalName, documentNumber (11 ou 14 dígitos), bio?, categoryIds (≥1), baseAddress { lat, lng, city, state }, serviceRadiusKm 1..100=15 }` | 201 `ProviderMe` (`status=PENDING`) | `document_hash = HMAC(documentNumber)`, `document_masked`; 409 `providers_document_uq` (documento já usado); cria `provider_skills(level=0.5)` por categoria; `wallet_accounts(PROVIDER)`; novo access token com `providerId` deve ser obtido via refresh |
| `POST /v1/providers/me/documents` | `provider` | `ProviderDocumentInput { kind, fileUrl }` | 204 | Substitui documento anterior do mesmo `kind` (`PENDING`); `audit_logs` não (ação do próprio) |
| `PATCH /v1/providers/me/availability` | `provider` | `SetAvailabilityInput { availability, location? }` | `ProviderMe` | 403 se `status != APPROVED` ao tentar `ONLINE`; `BUSY` é controlado pelo sistema (`provider.setBusy`) e devolve 409 se tentar manualmente; `OFFLINE` com ordem ativa em estado `providerBusy` → 409; `provider_online`/`provider_offline` |
| `POST /v1/providers/me/location` | `provider` | `LocationBatchInput { pings[1..60] { lat, lng, accuracyM?, headingDeg?, speedMps?, recordedAt } }` | `{ accepted }` | Para cada ping, `acceptPing({ accuracyM, previous, current, maxAccuracyM: settings.location.maxAccuracyM })`; aceitos gravam `provider_locations` (com `order_id` da ordem ativa), atualizam `providers.last_*` e emitem `provider.location` para `order:{id}` se o estado tiver `liveLocation`. Intervalo recomendado ao app: `locationIntervalSeconds` (3 s / 10 s / 60 s / 120 s / 0) devolvido em `ProviderMe.meta.locationIntervalSeconds` (conforme contrato) |

### 7.2 Ofertas

| Rota | Papel | Resposta | Regras |
|---|---|---|---|
| `GET /v1/providers/me/offers` | `provider` | `DispatchOffer[]` pendentes e não expiradas | `summary.approxLocation` = centroide do bairro ou coordenadas arredondadas a 3 casas (~110 m); endereço, instruções e PIN nunca aparecem antes do aceite |
| `POST /v1/offers/:offerId/accept` | prestador da oferta | `ServiceOrderDetail` | Transação: `UPDATE dispatch_offers SET response='ACCEPTED' WHERE id=? AND response='PENDING' AND expires_at > now()` (0 linhas → 409 `OFFER_UNAVAILABLE`); `applyTransition(provider.accept)` (`OFFERED\|MATCHING → ACCEPTED/DRIVER_ASSIGNED/UNDER_REVIEW`); demais ofertas pendentes da ordem → `WITHDRAWN`; `dispatch_rounds.outcome=ACCEPTED`; cancela job `dispatch.wave_timeout`; efeitos `payments.authorize`, `provider.setBusy`, `notify.customer:provider_found`, `booking.scheduleReminders` (SCHEDULED); 409 `INVALID_TRANSITION` se a ordem saiu de `OFFERED/MATCHING` (cancelada) |
| `POST /v1/offers/:offerId/reject` | prestador da oferta | 204 | `response='REJECTED'`, `responded_at`; se todas as ofertas da onda estiverem respondidas, antecipa `dispatch.wave_timeout`; `offer_rejected` |

```json
// GET /v1/providers/me/offers
[ { "id": "0192...", "orderId": "0192a0b1-...", "roundId": "0192...", "providerId": "0192...", "score": 0.8123, "response": "PENDING", "offeredAt": "2026-10-13T15:12:03.000Z", "expiresAt": "2026-10-13T15:13:33.000Z",
    "summary": { "serviceName": "Encanador: visita e reparo simples", "categorySlug": "hidraulica", "distanceKm": 1.8, "approxLocation": { "neighborhood": "Vila Madalena", "city": "São Paulo", "lat": -23.556, "lng": -46.689 }, "priceCents": 11000, "providerPayoutCents": 8800, "estimatedDurationMinutes": 60, "scheduledFor": null, "notes": "Vazamento embaixo da pia da cozinha" } } ]
```

### 7.3 Ordens, indicadores e carteira do prestador

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `GET /v1/providers/me/orders` | `provider` | `OrderListQuery` | `Page<ServiceOrder>` | `active` = estados com `providerBusy` ou aceitos futuros; `startPin: null`; `address.instructions` só após `ACCEPTED` |
| `GET /v1/providers/me/indicators?days=30` | `provider` | `days` 7..90 | `ProviderIndicators { periodDays, completed, cancelled, offersReceived, offersAccepted, acceptanceRate, earningsCents, ratingAvg, avgResponseSeconds }` | Agregado de `service_orders`, `dispatch_offers`, `ledger_entries` |
| `GET /v1/providers/me/wallet` | `provider` | — | `WalletSummary { balanceCents, pendingCents (ordens COMPLETED ainda não em payout), heldCents (disputas), nextPayoutAt (próxima quarta-feira, `payouts.weekday=3`) }` | |
| `GET /v1/providers/me/ledger` | `provider` | `Pagination` | `LedgerEntryPublic[]` | Só lançamentos da conta `PROVIDER` do prestador |
| `GET /v1/providers/me/payouts` | `provider` | — | `Payout[]` | |

## 8. Operação e administração (`ops`, `admin`, `analytics`)

Todas as rotas `/v1/ops/*` exigem `operator` ou `admin`; `/v1/admin/*` exige `admin` (exceto `analytics/dashboard`, também para `operator`). Toda escrita grava `audit_logs { actor_user_id, actor_role, action, target_type, target_id, before, after, ip }`.

### 8.1 Operação

| Rota | Entrada | Resposta | Regras |
|---|---|---|---|
| `GET /v1/ops/map` | — | `{ orders: ServiceOrder[] (não terminais), providers: [{ id, displayName, availability, lat, lng }] (ONLINE/BUSY com posição < 10 min) }` | Atualiza por realtime `order.updated`/`provider.location` na sala `ops` |
| `GET /v1/ops/orders?status&attention&cursor&limit` | `attention=true` = `NO_PROVIDER_FOUND`, `NEEDS_HUMAN`, `DISPUTED`, SLA estourado | `Page<ServiceOrder>` | |
| `GET /v1/ops/orders/:id` | — | `ServiceOrderDetail` completo (inclui `startPin` para suporte telefônico, com `audit_logs(action='ops.order.view_pin')`) | |
| `GET /v1/ops/orders/:id/candidates` | — | `[{ providerId, displayName, distanceKm, score, breakdown, eligible, ineligibleReason, availability, ratingAvg, phoneMasked }]` | `rankCandidates` com raio da última onda ×2, inclusive inelegíveis (com motivo) para o operador ligar fora do app |
| `POST /v1/ops/orders/:id/assign` | `ManualAssignInput { providerId, note? }` | `ServiceOrderDetail` | `applyTransition(operator.assign)` (`NO_PROVIDER_FOUND\|MATCHING\|OFFERED → ACCEPTED/DRIVER_ASSIGNED/UNDER_REVIEW`); 409 se prestador `!= APPROVED` ou com conflito de agenda (ignorável com `payload.force = true`); registra `dispatch_offers(response=ACCEPTED, score=0, round manual)` e `order_events.payload.note` |
| `POST /v1/ops/orders/:id/cancel` | `{ reason }` | `ServiceOrderDetail` | `operator.cancel` → `CANCELLED_BY_PLATFORM` com reembolso integral (`payments.refund`) e notificação a ambos |
| `GET /v1/ops/incidents` | `status?` | `Incident[]` | |
| `GET /v1/ops/disputes` | `status?` | `Dispute[]` | |
| `POST /v1/ops/disputes/:id/resolve` | `ResolveDisputeInput { outcome: RESOLVED_CUSTOMER\|RESOLVED_PROVIDER\|RESOLVED_SPLIT\|REJECTED, refundCents=0, note 3..1000 }` | `Dispute` | `operator.resolve_dispute` (`DISPUTED → CLOSED`); efeitos `payments.refund(refundCents)`, `wallet.settle` (libera hold; `providerPayoutCents = total − refund` em SPLIT), `reputation.recompute`; `dispute_update` para ambos |
| `GET /v1/ops/slas` | — | `{ byStatus: [{ status, slaSeconds, count, breached }], oldest: [...] }` | A partir de `states[*].slaSeconds` das definições (ver `15 §2`) |

### 8.2 Administração

| Rota | Entrada | Resposta | Regras |
|---|---|---|---|
| `GET /v1/admin/analytics/dashboard?from&to` | período (padrão últimos 30 dias) | `DashboardMetrics` (definições em `16 §4`) | |
| `GET /v1/admin/:resource` | `resource ∈ categories, services, regions, price-rules, commission-rules, matching-configs, coupons, plans, home-sections, banners, providers, users, promotions` | `T[]` | `providers?status=PENDING` para a fila de aprovação |
| `PUT /v1/admin/:resource` | `Upsert*Input` correspondente (`UpsertCategoryInput`, `UpsertServiceInput`, `UpsertRegionInput`, `UpsertPriceRuleInput`, `UpsertCommissionRuleInput`, `UpsertMatchingConfigInput`, `UpsertCouponInput`, `UpsertPlanInput`, `UpsertHomeSectionInput`) | `T` | Upsert por `id` (ou `slug`/`code`); `matching-configs` valida `MatchingWeights` (0..1) e `WaveConfig` (1..6 ondas); `commission-rules` fecha a regra anterior do mesmo escopo com `active_until = now()` em vez de sobrescrever |
| `DELETE /v1/admin/:resource/:id` | — | 204 | Desativa (`active=false`); nunca apaga catálogo referenciado por ordens |
| `POST /v1/admin/providers/:id/decision` | `ApproveProviderInput { decision: APPROVE\|REJECT\|SUSPEND\|BLOCK, reason? }` | `ProviderMe` | `APPROVE` exige documentos `ID_FRONT`, `ID_BACK`, `SELFIE` em `VERIFIED` (409 caso contrário); grava `verified_at`, `status_reason`; `SUSPEND/BLOCK` força `availability=OFFLINE` e retira ofertas pendentes; notificação `generic` ao prestador |
| `GET /v1/admin/settings` / `PUT /v1/admin/settings` | `Partial<PlatformSettings>` | `PlatformSettings` | Validação por chave; cada chave vira uma linha de `platform_settings` com `updated_by_user_id` |
| `GET /v1/admin/workflows` | — | `describeWorkflow(def)[]` das definições registradas (embutidas + banco) | Base da documentação gerada e do editor de SLAs |

```json
// PUT /v1/admin/commission-rules
{ "categoryId": "0192...lavanderia", "regionId": null, "percentBps": 1500, "fixedCents": 0, "minCents": 500, "maxCents": null, "passPaymentFeeToProvider": false }
```

### 8.3 `POST /v1/analytics/events`

| Item | Valor |
|---|---|
| Papel | autenticado (anônimo aceito para `app_open`, `home_view`, `category_view`, `service_view`, `search_performed` com `userId = null`) |
| Entrada | `AnalyticsBatchInput { events[1..100] { name: AnalyticsEventName, occurredAt, sessionId?, properties (escalares), orderId? }, app: customer\|provider\|web, appVersion? }` |
| Resposta | 202 vazio |
| Regras | `name` fora do enum → 400; `properties` com chaves em lista negra (`name`, `phone`, `email`, `address`, `cpf`, `document`) → evento descartado e contado em métrica interna; `user_id`/`provider_id` vêm do JWT; `occurredAt` fora de ±24 h é substituído por `now`; inserção em lote em `analytics_events` |

## 9. Webhooks de pagamento

### `POST /v1/payments/webhooks/:gateway`

| Item | Valor |
|---|---|
| Papel | Público (autenticado por assinatura). `gateway ∈ sandbox \| pagarme`; `sandbox` responde 404 em produção |
| Corpo | Bruto; `app.ts` guarda `req.rawBody` para verificar HMAC |
| Verificação | `adapters.payments.parseWebhook(rawBody, headers)`: Pagar.me valida `X-Hub-Signature: sha256=<hmac>` com `PAGARME_WEBHOOK_SECRET` em `timingSafeEqual`; retorno `null` → **401** sem corpo (assinatura inválida ou JSON malformado) |
| Idempotência | `INSERT INTO webhook_events (gateway, external_id, event_type, payload) ON CONFLICT DO NOTHING`; conflito → 200 `{ received: true, duplicate: true }` |
| Processamento | Localiza `payment_intents` por `(gateway, gateway_ref)`; aplica: `PAID` → `AUTHORIZED` (cartão `auth_only`) ou `CAPTURED` (PIX; `captured_cents = amount`), e se a ordem estiver aguardando pagamento dispara `customer.authorize_payment` pelo sistema; `FAILED` → `FAILED` + `notify.customer:payment_failed`; `REFUNDED` → `REFUNDED`/`PARTIALLY_REFUNDED` e `refunds.status=DONE`; `EXPIRED` → `FAILED (pix_expired)`; `OTHER` → apenas registra. `processed_at` ao final; erro → `error` preenchido e 500 para o provedor reenviar |
| Eventos | `domain_events(payment.updated)` → realtime `payment.updated` para `user:{id}` e `order:{id}`; `analytics.track(payment_completed \| payment_failed)` |
| Resposta | 200 `{ received: true }` sempre que a assinatura é válida, mesmo para intents desconhecidas (registradas em `webhook_events.error = 'intent_not_found'` para conciliação) |

```json
// corpo (sandbox / Pagar.me normalizado)
{ "id": "evt_8c1d...", "type": "charge.paid", "data": { "id": "pix_3f2e...", "status": "paid", "amount": 9900 } }
```

## 10. Realtime (Socket.IO)

### 10.1 Handshake

| Item | Valor |
|---|---|
| Endpoint | mesmo host da API, `path: '/realtime'`, transports `websocket` e `polling` (cliente usa só `websocket`) |
| Autenticação | `auth: { token: <accessToken> }` ou `Authorization: Bearer` no handshake; `verifyJwt` (`io.ts`); falha → `connect_error('unauthorized')` |
| Reconexão | `RealtimeClient` renova o token em `reconnect_attempt` (`getAccessToken`) com backoff 1 s → 10 s |
| Salas automáticas | `user:{userId}` sempre; `provider:{providerId}` quando o token tem `providerId`; `ops` para `operator`/`admin` |
| Sala de ordem | Só via `order.subscribe`, autorizado por `modules.orders.canUserAccessOrder(userId, roles, providerId, orderId)` (cliente da ordem, prestador atribuído ou ops); negado silenciosamente |
| Escala | Uma instância no MVP; `@socket.io/redis-adapter` por configuração em V1 (ADR-009) |

### 10.2 Eventos servidor → cliente (`RealtimeEvents`)

| Evento | Payload | Salas | Origem (outbox) |
|---|---|---|---|
| `order.updated` | `{ orderId, status, updatedAt }` | `order:{id}`, `user:{customerId}`, `provider:{providerId}`, `ops` | `order.transitioned` |
| `order.event` | `{ orderId, eventId, type, seq }` | `order:{id}` | todo `order_events` novo (linha do tempo) |
| `offer.created` | `{ offerId, orderId, expiresAt }` | `provider:{providerId}` | `dispatch` ao criar onda; acompanha push `offer_received` |
| `offer.expired` | `{ offerId, orderId }` | `provider:{providerId}` | job `offer.expire`/`dispatch.wave_timeout` |
| `provider.location` | `{ orderId, lat, lng, headingDeg, etaMinutes, recordedAt }` | `order:{id}` apenas, e só em estados `liveLocation` | `providers.ingestLocation` (ping aceito); `etaMinutes = estimateEtaMinutes(haversine)` |
| `message.created` | `{ conversationId, messageId, orderId }` | `order:{id}` (ou `user:{id}` dos participantes em suporte) | `message.created` |
| `quote.created` | `{ quoteId, orderId, amountCents }` | `order:{id}`, `user:{customerId}` | `quote.created` |
| `quote.decided` | `{ quoteId, orderId, status }` | `order:{id}`, `provider:{providerId}` | `quote.decided` |
| `payment.updated` | `{ intentId, orderId, status }` | `user:{userId}`, `order:{id}` | webhook / autorização / captura |
| `notification.created` | `{ notificationId, kind }` | `user:{userId}` | toda `notifications` nova (`INAPP`) |
| `ops.order_needs_attention` | `{ orderId, reason }` | `ops` | `ops.alert:no_provider`, `ops.alert:needs_human`, `ops.alert:dispute`, `sla.escalate` |

### 10.3 Eventos cliente → servidor (`ClientRealtimeEvents`)

| Evento | Payload | Regras |
|---|---|---|
| `order.subscribe` | `{ orderId }` | Entra em `order:{id}` após `canJoinOrder`; o app assina ao abrir a tela da ordem |
| `order.unsubscribe` | `{ orderId }` | Sai da sala |
| `location.push` | `{ lat, lng, accuracyM?, headingDeg?, speedMps?, recordedAt }` | Só sockets com `providerId`; mesmo caminho de `POST /v1/providers/me/location` (`ingestLocation`); rejeições são logadas em `warn` e não devolvem erro ao socket |

Sem ACKs: o cliente confirma estado pela API (`GET /v1/orders/:id`) após reconectar; eventos são notificações, não fonte de verdade.

## 11. Efeitos declarados e seus handlers (resumo para implementadores)

| Efeito (`EffectName`) | Handler da API | Tabelas / adaptadores |
|---|---|---|
| `dispatch.start` / `dispatch.restart` | agenda job `dispatch.start` (`now` ou `scheduledMatchingStart`) | `scheduled_jobs` |
| `dispatch.cancelOffers` | `UPDATE dispatch_offers SET response='WITHDRAWN' WHERE order_id=? AND response='PENDING'`; cancela `wave:{orderId}:*` | `dispatch_offers`, `scheduled_jobs` |
| `payments.authorize` | cria `payment_intents(INITIAL)` com método padrão; `authorizeCard` ou `createPixCharge`; falha → `notify.customer:payment_failed` e ordem segue (cliente troca o método em até 5 min, pergunta 13.1 do PRD) | `PaymentGateway` |
| `payments.capture` | `capture(gatewayRef, total)`; PIX já capturado; falha → `incidents(PAYMENT_FAILURE)` e `payment.reconcile` em 10 min | `PaymentGateway`, `payment_intents` |
| `payments.cancelAuthorization` / `payments.refund` / `payments.chargeCancellationFee` | `cancelAuthorization`; `refund` + `refunds`; `customerCancellation` → `payment_intents(CANCELLATION_FEE)` capturada e `ledger` ao prestador | idem |
| `wallet.settle` / `wallet.hold` | `settle(gross, discount, pickCommissionRule(...))` → journal de 3–4 lançamentos; `held_cents += payout` | `ledger_entries`, `wallet_accounts` |
| `notify.*` | `notifications` (INAPP sempre; PUSH via `PushSender` para `devices` ativos; SMS para `offer_received` sem push) | `Push/SmsSender` |
| `ops.alert:*` | `incidents` + realtime `ops.order_needs_attention` | `incidents` |
| `reputation.recompute` / `reputation.penalizeProviderCancel` | recalcula `provider_stats` e `providers.rating_*`; `cancelled_count++` | `provider_stats`, `providers` |
| `provider.setBusy` / `provider.setOnline` | `providers.availability` | `providers` |
| `booking.scheduleReminders` / `booking.release` | `bookings` + jobs `booking.reminder` em `reminderTimes` (dedupe `reminder:{orderId}:24h|1h`) | `bookings`, `scheduled_jobs` |
| `concierge.plan` / `concierge.quote` / `concierge.spawnChildren` | planner; `quotes(INITIAL)`; cria `service_orders` filhas por `order_tasks` com `parent_order_id` | `concierge_requests`, `order_tasks` |
| `custody.record` | confirma `custody_events` da etapa | `custody_events` |
| `chat.systemMessage` | `messages(sender_type=system, system_kind=status:{to})` com texto de `ORDER_STATUS_LABELS` | `messages` |
| `analytics.track` | `analytics_events(app='api')` com o nome mapeado da transição (`16 §2`) | `analytics_events` |
