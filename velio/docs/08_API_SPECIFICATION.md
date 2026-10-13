# 08 — Especificação da API

Fonte de verdade: rotas registradas em `apps/api/src/modules/*/routes.ts` (e `admin/routes.ts`, `ops/routes.ts`), serviços em `apps/api/src/modules/*/service.ts`, orquestração em `apps/api/src/modules/registry.ts` e `effects.ts`, convenções em `apps/api/src/app.ts` e `apps/api/src/lib/*.ts`, contratos em `packages/contracts/src/*.ts`, cliente tipado em `packages/api-client/src/api.ts` e realtime em `apps/api/src/realtime/io.ts` + `packages/contracts/src/realtime.ts`. Tudo abaixo foi verificado contra esse código; o que ainda é intenção está marcado **(previsto)**. Rotas que existem na API mas não no `api.ts` estão marcadas **(sem método no cliente)**.

## 1. Convenções

### 1.1 Transporte

| Item | Regra |
|---|---|
| Base | `https://api.<domínio>/v1`; dev `http://localhost:4000/v1`. `GET /health` → `{ ok, db: 'pglite'\|'postgres', payments: 'sandbox'\|'pagarme', time }` |
| Formato | JSON UTF-8; `Content-Type: application/json`; corpo máximo 2 MiB (`bodyLimit`); JSON inválido → 400 pelo parser customizado que também preserva `req.rawBody` para webhooks |
| Datas | ISO 8601 UTC (`2026-10-13T15:04:05.000Z`); entradas aceitam offset (`IsoDateTime`) |
| Dinheiro | Inteiros em centavos (`*Cents`); percentuais em bps |
| Ids | UUID v7 em string |
| `X-Velio-App` | `customer \| provider \| web` (enviado por `HttpClient.appHeader`); lido em `POST /v1/me/devices` para gravar `devices.app` |
| Proxy / CORS | `trustProxy: true`; `CORS_ORIGINS` (lista separada por vírgula; `*` em dev) com `credentials: true` |
| Códigos de sucesso | 200 padrão; 201 em criações (`/v1/requests`, endereços, veículos, equipamentos, métodos de pagamento, quotes, intents, evidências, reviews, disputas, tickets, mensagens, concierge, onboarding de prestador, assinaturas); 204 em logout, devices, documentos do prestador, deletes, rejeição de oferta, marcar notificação lida, analytics |

### 1.2 Autenticação e papéis

| Item | Regra |
|---|---|
| Esquema | `Authorization: Bearer <accessToken>`; JWT HS256 (`lib/jwt.ts`) com claims `{ sub, roles[], providerId?, iat, exp }`; TTL 900 s (`JWT_ACCESS_TTL_SECONDS`) |
| Hook | `onRequest` em `app.ts` decodifica e preenche `req.auth` sem lançar (usa `adapters.clock.now()` para expiração, o que torna testes determinísticos); cada rota chama `requireAuth`, `requireRole(...)` ou `requireProvider` |
| Papéis | `customer`, `provider`, `operator`, `admin` acumuláveis. `requireProvider` exige papel `provider` **e** `providerId` no token (403 "Complete o cadastro de prestador"). Após `POST /v1/providers/me` o app deve chamar `POST /v1/auth/refresh` para receber token com `providerId` (`identity.issueTokens` resolve via `providers.providerIdForUser`) |
| Ator do domínio | `actorFrom(auth, preferred)`: operador/admin → `operator`; `/v1/orders/:id/transition` usa `actorForAction` pelo prefixo da ação (`provider.*` exige papel provider com `providerId`, ou ops; `operator.*`/`system.*` exigem ops; `customer.*` → `customer`) |
| Refresh | Opaco (48 bytes), hash SHA-256 em `refresh_tokens`, rotação: o antigo recebe `revoked_at` + `replaced_by_id`. Reuso de token revogado → 401 "Sessão expirada" (não revoga a cadeia; ver 14 §14) |

### 1.3 Erros

```json
{ "error": { "code": "INVALID_TRANSITION", "message": "PIN inválido", "details": { "status": "ARRIVED", "allowedActions": ["provider.start", "provider.cancel"], "code": "GUARD_FAILED", "guard": "requiresPin" } } }
```

| HTTP | `code` | Origem (`lib/errors.ts`) e exemplos de `message` |
|---|---|---|
| 400 | `BAD_REQUEST` | Zod (`details: [{ path, message }]`), "Código inválido" (OTP, com `details.attemptsLeft`), "Código expirado", "Código já utilizado", "Webhook inválido", "Janela inválida", "Método não corresponde ao tipo informado", "providerId obrigatório para atribuição" |
| 401 | `UNAUTHORIZED` | Sem token/expirado; "Credenciais inválidas"; "Sessão expirada"/"Sessão inválida" (refresh) |
| 402 | `PAYMENT_FAILED` | `chargeSubscription` recusado (`details.code`); "Saldo da carteira insuficiente" (`debitCustomer`) |
| 403 | `FORBIDDEN` | Papel insuficiente; "Sem acesso a esta ordem" (`requireOrderFor`); "Ação exclusiva do prestador"/"da operação"; "Oferta de outro prestador"; "Somente o prestador atribuído envia evidências/orçamentos/registra custódia"; "Somente o cliente da ordem decide o orçamento/contesta"; "Somente prestadores aprovados podem ficar online"; "Conta desativada"; "Login com senha disponível apenas para operação" |
| 404 | `NOT_FOUND` | "Ordem/Oferta/Orçamento/Prestador/Serviço/Endereço/Veículo/Equipamento/Método de pagamento/Recurso/Gateway/Desafio/Cadastro de prestador não encontrado" |
| 409 | `CONFLICT` | "Ordem alterada simultaneamente; tente novamente" (lock otimista), "Oferta não está mais disponível", "Oferta expirada", "Pedido já foi aceito por outro prestador", "Pedido não pode mais ser aceito", "Já existe um orçamento aguardando decisão do cliente", "Orçamento já decidido ou expirado", "Pagamento já capturado", "Já existe contestação para esta ordem", "Contestação já resolvida", "Avaliação já registrada para esta ordem", "Conversa encerrada", "Cadastro de prestador já existe", "Documento já cadastrado", "E-mail já utilizado" |
| 409 | `INVALID_TRANSITION` | `applyTransition` falhou: `details { status, allowedActions, code: INVALID_ACTION\|FORBIDDEN_ACTOR\|GUARD_FAILED\|TERMINAL, guard }`; também "Orçamento inicial não cabe nesta etapa", "Orçamento adicional só durante a execução", "Avaliação só é possível após a conclusão" |
| 422 | `UNPROCESSABLE` | "Serviço indisponível", "Este serviço não aceita agendamento", "Horário agendado deve estar no futuro", "Este serviço precisa ser agendado", "Endereço/Veículo/Equipamento obrigatório para este serviço", "Cupom inválido ou expirado", "Código não corresponde ao item desta ordem", "PIN de confirmação do cliente inválido", "Esta ordem não envolve veículo", "Esta categoria não permite orçamento adicional", "Esta ordem não exige pagamento", "Prestador não está aprovado", "Aprovação exige ao menos um documento enviado", "Assinaturas exigem cartão de crédito", "Plano indisponível", "Pedido sem plano para aprovar" |
| 429 | `RATE_LIMITED` | Global 300 req/min por `userId` ou IP (`RATE_LIMIT_MAX`); OTP request/verify 5/min por `ip:phone`; login por senha 10/min por IP; "Número máximo de tentativas excedido" (5 erros no mesmo challenge) |
| 500 | `INTERNAL` | "Erro interno"; detalhes só no log |

Efeitos pós-commit que falham não revertem a transição: geram `order_events(type='effect.failed')` e log de erro (`orders/service.ts: runEffects`).

### 1.4 Paginação, idempotência e limites

| Item | Regra |
|---|---|
| Paginação | Listas de ordens (`/v1/orders`, `/v1/providers/me/orders`, `/v1/ops/orders`): `Page<T> { items, nextCursor }`; cursor = `id` do último item (UUID v7 é ordenável); consulta `WHERE id < cursor ORDER BY id DESC LIMIT limit+1` (`_shared/util.ts: page`). `OrderListQuery.limit` ≤ 50; ops ≤ 100 |
| Listas simples | Notificações (50), mensagens (200), extrato (50), tickets (100), incidentes/disputas (200), audit (100), usuários (100), prestadores (200) devolvem array sem cursor |
| Idempotência | `POST /v1/requests` com `idempotencyKey` (8–64) devolve a **mesma ordem** (status 201 nas duas chamadas, cenário A). Webhook: `webhook_events(gateway, external_id)` único → `{ ok: true, duplicate: true }`. Jobs: `dedupe_key` |
| Rate limits | Global por usuário/IP; específicos em OTP e login (acima); webhook isento (`config.rateLimit: false`) |

### 1.5 Versionamento e depreciação

| Regra | Detalhe |
|---|---|
| Prefixo | `/v1`; quebra de contrato = `/v2` convivendo ≥ 6 meses |
| Aditivo não quebra | Campos opcionais novos, novos valores em `OrderStatus`/`TransitionAction` (apps renderizam `ORDER_STATUS_LABELS`), novas rotas |
| Quebra | Remover/renomear campo, mudar tipo, mudar semântica de erro |
| Depreciação **(previsto)** | `Deprecation: true` e `Sunset: <RFC 1123>`; versão mínima de app em `platform_settings` com 426 |
| Contratos | `packages/contracts` versiona com o monorepo; janela de compatibilidade com apps instalados: 90 dias |

## 2. Identidade (`identity`)

### 2.1 `POST /v1/auth/otp/request`

| Item | Valor |
|---|---|
| Papel | Público; rate limit 5/min por `ip:phone` |
| Entrada | `OtpRequestInput { phone: PhoneBR, app: 'customer' \| 'provider' = 'customer' }` |
| Resposta 200 | `{ challengeId, expiresInSeconds: 300, devCode? }` — `devCode` só em `NODE_ENV=test` |
| Efeitos | `otp_challenges(code_hash = sha256(code), expires_at = now + OTP_TTL_SECONDS)`; `SmsSender.send` ("Seu código VÉLIO é 482913. Válido por 5 min."); log com telefone mascarado |

```json
{ "phone": "+5511987654321", "app": "customer" }
→ { "challengeId": "019298f1-6b3e-7c1a-9a1b-3f2e4d5c6b7a", "expiresInSeconds": 300 }
```

### 2.2 `POST /v1/auth/otp/verify`

| Item | Valor |
|---|---|
| Papel | Público; rate limit 5/min por `ip:phone` |
| Entrada | `OtpVerifyInput { challengeId, code: ^\d{6}$, deviceName? }` |
| Resposta 200 | `AuthTokens { accessToken, refreshToken, expiresInSeconds: 900, user: UserPublic, needsOnboarding }` (`needsOnboarding` = sem `name` ou sem `consents.terms/privacy`) |
| Erros | 404 desafio; 400 "Código já utilizado" / "Código expirado" / "Código inválido" (`attemptsLeft`); 429 após 5 erros; 403 "Conta desativada" |
| Efeitos | Primeiro acesso cria `users` com `roles = ['customer']` ou `['customer','provider']` (app provider); `consumed_at`; `refresh_tokens`; `last_seen_at` |

```json
{ "challengeId": "019298f1-...", "code": "482913", "deviceName": "iPhone de Ana" }
→ { "accessToken": "eyJhbGciOiJIUzI1NiIs...", "refreshToken": "Yk3f...", "expiresInSeconds": 900,
    "user": { "id": "019298f2-...", "name": null, "phone": "+5511987654321", "email": null, "roles": ["customer"], "avatarUrl": null, "createdAt": "2026-10-13T15:04:05.000Z" },
    "needsOnboarding": true }
```

### 2.3 `POST /v1/auth/password/login`

Público; rate limit 10/min por IP. `PasswordLoginInput { email, password 8..200 }` → `AuthTokens` (device `web`). 401 "Credenciais inválidas" (mesma mensagem para e-mail inexistente); 403 se o usuário não tem `operator`/`admin`. Senha em `scrypt` (`lib/password.ts`).

### 2.4 `POST /v1/auth/refresh` (sem método no cliente; usado por `HttpClient.refresh`)

`RefreshInput { refreshToken }` → `AuthTokens` novos; o token antigo recebe `revoked_at` e `replaced_by_id`. 401 se desconhecido, revogado, expirado ou usuário não `ACTIVE`. O novo access token traz `providerId` se o usuário já tiver cadastro de prestador.

### 2.5 `POST /v1/auth/logout`

Autenticado. Corpo opcional `{ refreshToken? }`: revoga esse token ou, sem ele, todos os refresh ativos do usuário. 204.

### 2.6 `GET /v1/me` · `PATCH /v1/me` · `POST /v1/me/devices`

| Rota | Entrada | Resposta | Regras |
|---|---|---|---|
| `GET /v1/me` | — | `UserPublic` | |
| `PATCH /v1/me` | `UpdateProfileInput { name?, email?, timezone?, consents? { terms, privacy, marketing, personalization } }` | `UserPublic` | Cada consentimento booleano vira `consents[k] = { granted, at: now }`; e-mail em minúsculas; 409 "E-mail já utilizado" |
| `POST /v1/me/devices` | `RegisterDeviceInput { pushToken (≥10), platform: ios\|android\|web }` | 204 | Upsert por `push_token` (reatribui ao usuário atual, `active = true`); `app` do cabeçalho `X-Velio-App` |

## 3. Catálogo (`catalog`, `geo`, `subscriptions`)

### 3.1 `GET /v1/catalog/home?lat&lng`

| Item | Valor |
|---|---|
| Papel | Público; com token personaliza (saudação, ordens ativas, equipamentos, assinatura) |
| Resposta | `HomeResponse { greeting, contextHint, sections[] }` |
| Saudação | "Bom dia"/"Boa tarde"/"Boa noite" pela hora local (`users.timezone`, `hourInTimezone`) + primeiro nome ("Bom dia, Ana!") |
| Seções | `home_sections` ativas por `sort_order`; filtradas por `rules.hoursOfDay`, `requiresEquipmentDue` (`assets.dueEquipments`: vencidos **com** `last_maintenance_at` preenchido), `requiresActiveOrder`, `requiresSubscription`. `items` por `kind`: `categories` (todas ativas exceto `concierge`), `quick_services` (até 8 `IMMEDIATE`), `recommendations`/`scheduled` (`config.serviceSlugs` → `ServiceSummary[]`), `active_orders` (`{ id, status, serviceName }` até 5, exclui `COMPLETED` e filhas), `subscriptions` (planos ativos), `banner` (`banners` ativos); `search`, `hero`, `concierge` vêm com `items: []` |
| `contextHint` | Sempre presente, na ordem: ordem ativa ("Você tem um pedido em andamento: {serviço}.", `active_order`) → agendamento nas próximas 48 h em estado pré-execução (`upcoming_booking`) → equipamento vencido ("Seu ar-condicionado (Sala) está há 7 meses sem manutenção.", `equipment_due`) → frase por hora (`time_of_day`). O contrato permite `null`, mas o serviço nunca devolve `null` |
| `lat/lng` | Validados, ainda não usados (`_loc`) **(previsto: região para preços)** |

```json
{ "greeting": "Bom dia, Ana!",
  "contextHint": { "text": "Seu ar-condicionado (Sala) está há 7 meses sem manutenção.", "source": "equipment_due" },
  "sections": [
    { "id": "search", "kind": "search", "title": "O que você precisa?", "subtitle": null, "items": [], "meta": {} },
    { "id": "categories", "kind": "categories", "title": null, "subtitle": null, "items": [ { "id": "0192...", "slug": "hidraulica", "name": "Encanador", "icon": "droplet", "config": { "requiresStartPin": true, "requiresBeforeAfterPhotos": true, "requiresVehicle": false, "requiresEquipment": false, "requiresCustody": false, "allowsAdditionalQuote": true, "defaultServiceRadiusKm": 15 }, "parentId": null, "description": "Vazamentos, entupimentos, torneiras, caixas e registros", "sortOrder": 1, "active": true } ], "meta": {} },
    { "id": "morning", "kind": "recommendations", "title": "Para começar o dia", "subtitle": null, "items": [ { "id": "0192...", "slug": "lavanderia-coleta", "name": "Lavanderia com coleta e entrega", "pricingModel": "FIXED", "basePriceCents": 8900, "priceMinCents": null, "priceMaxCents": null, "estimatedDurationMinutes": 2880, "allowsImmediate": true, "allowsScheduling": true, "workflowKind": "LAUNDRY", "categoryId": "0192...", "shortDescription": "Lavar e secar, saco de até 8 kg, devolução em 48h", "imageUrl": null } ], "meta": {} },
    { "id": "equipment_due", "kind": "recommendations", "title": "Está na hora de revisar seu ar-condicionado?", "subtitle": null, "items": [ "..." ], "meta": {} } ] }
```

### 3.2 Catálogo público

| Rota | Resposta | Regras |
|---|---|---|
| `GET /v1/catalog/categories` | `ServiceCategory[]` ativas (`config` completo via `CategoryConfig.parse`) | |
| `GET /v1/catalog/services?category=slug` | `ServiceSummary[]` ativos por `sort_order, name` | Categoria inexistente → `[]` |
| `GET /v1/catalog/services/:slug` | `Service` | 404 se inexistente ou inativo |
| `GET /v1/catalog/search?q&lat&lng` | `ServiceSummary[]` (≤ 20) | `ILIKE %q%` em `search_text` ou `name`; `q` 1..120 |
| `GET /v1/catalog/plans` | `SubscriptionPlan[]` ativos por `sort_order` | Servida pelo módulo `subscriptions` |
| `GET /v1/geo/regions` (sem método no cliente) | `[{ id, name, city, state }]` ativas | |

### 3.3 `POST /v1/catalog/estimate`

| Item | Valor |
|---|---|
| Papel | Público (cupom validado contra `perUserLimit` só com token) |
| Entrada | `PriceEstimateInput { serviceId, options, regionId?, couponCode? }` |
| Resposta | `PriceEstimate { pricingModel, subtotalCents, minCents, maxCents, discountCents, totalCents, requiresQuote, breakdown[] }` |
| Regras | `catalog.getPriceSource(serviceId, regionId)`: regra da região > regra global do serviço > `services`; `estimatePrice` do domínio; cupom inválido não é erro (`discountCents = 0`); `couponCode` devolvido internamente é removido da resposta |
| Erros | 404 serviço; 400 Zod |

```json
{ "serviceId": "0192...encanador", "options": { "urgente": true }, "couponCode": "BEMVINDO10" }
→ { "pricingModel": "FIXED", "subtotalCents": 11000, "minCents": null, "maxCents": null, "discountCents": 1100, "totalCents": 9900, "requiresQuote": false,
    "breakdown": [ { "label": "Serviço", "amountCents": 8000 }, { "label": "Atendimento urgente (até 1h)", "amountCents": 3000 }, { "label": "Cupom BEMVINDO10", "amountCents": -1100 } ] }
```

## 4. Dados do cliente (`geo`, `assets`, `payments`, `communication`, `wallet`, `subscriptions`)

### 4.1 Endereços, veículos, equipamentos

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `GET /v1/me/addresses` | autenticado | — | `Address[]` (sem soft-deletados, por `created_at`) | `lat/lng` convertidos de `text` |
| `POST /v1/me/addresses` | autenticado | `AddressInput` | 201 `Address` | Primeiro endereço (ou `isDefault`) vira padrão e desmarca os demais. Endereço fora de região ativa **não** é recusado (região só influencia preço) |
| `PATCH /v1/me/addresses/:id` (sem método no cliente) | dono | `AddressInput.partial()` | `Address` | |
| `DELETE /v1/me/addresses/:id` | dono | — | 204 | Soft delete (`deleted_at`, `is_default = false`) |
| `GET/POST /v1/me/vehicles` · `DELETE /v1/me/vehicles/:id` (delete sem método no cliente) | autenticado | `VehicleInput` (placa normalizada) | `Vehicle[]` / 201 / 204 | Sem verificação de placa duplicada |
| `GET/POST /v1/me/equipments` · `DELETE /v1/me/equipments/:id` (delete sem método no cliente) | autenticado | `EquipmentInput` | `Equipment[]` (com `nextMaintenanceDueAt = last + interval`) / 201 / 204 | |

### 4.2 Métodos de pagamento

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `GET /v1/me/payment-methods` | autenticado | — | `PaymentMethod[]` (padrão primeiro) | |
| `POST /v1/me/payment-methods` | autenticado | `AddPaymentMethodInput` (`CARD { gatewayToken ≥10, holderName, setDefault=true }` \| `PIX` \| `WALLET`) | 201 `PaymentMethod` | Primeiro método vira padrão; `CARD` guarda `gatewayToken`, `holderName`, `last4` = últimos 4 dígitos do token (`tok_sandbox_4242` → `4242`), `brand = 'card'` (marca real vem do SDK em V1); `analytics.track(payment_method_added)` |
| `DELETE /v1/me/payment-methods/:id` (sem método no cliente) | dono | — | 204 | Soft delete |

### 4.3 Notificações, carteira, assinaturas, tickets

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `GET /v1/me/notifications` | autenticado | — | `Notification[]` (50 `INAPP` mais recentes) | |
| `POST /v1/me/notifications/:id/read` (sem método no cliente; `api.ts` não tem `markRead`) | dono | — | 204 | `read_at` |
| `GET /v1/me/notifications/unread-count` (sem método no cliente) | autenticado | — | `{ count }` | Sobre as 100 mais recentes |
| `GET /v1/me/wallet` | autenticado | — | `WalletSummary { balanceCents, pendingCents: 0, heldCents, nextPayoutAt: null }` | Conta `USER` criada sob demanda |
| `GET /v1/me/subscriptions` | autenticado | — | `Subscription[]` | |
| `POST /v1/me/subscriptions` | autenticado | `SubscribeInput { planId, equipmentIds ≥1, addressId, paymentMethodId, preferredWeekday?, preferredPeriod? }` | 201 `Subscription` | Valida equipamentos e endereço do usuário; cobra o ciclo **antes** de criar (`chargeSubscription`: cartão obrigatório → 422; recusa → 402); `nextVisitDueAt = nextVisitDue(null, now, interval, visits)`; `nextChargeAt = now + intervalMonths`; jobs `subscription.generate_visit` (7 dias antes da visita) e `subscription.charge`; `subscription_started` |
| `POST /v1/me/subscriptions/:id/cancel` | dono | `{ reason 2..300 = 'Cancelado pelo cliente' }` | `Subscription` `CANCELLED` | Cancela jobs pendentes de visita e cobrança; visitas já criadas não são canceladas automaticamente |
| `POST /v1/support/tickets` · `GET /v1/support/tickets` (sem método no cliente) | autenticado | `SupportTicketInput { orderId?, subject 3..120, body 3..3000, kind }` | 201 `SupportTicket` / `SupportTicket[]` | Cria `conversations(kind=CUSTOMER_SUPPORT)`; `PAYMENT`/`COMPLAINT` → prioridade `HIGH`; o `body` ainda não é gravado como primeira mensagem **(previsto)** |

## 5. Ordens (`orders`, `quotes`, `payments`, `communication`, `reputation`, `support`)

### 5.1 `POST /v1/requests`

| Item | Valor |
|---|---|
| Papel | autenticado (qualquer papel; ator `customer`) |
| Entrada | `CreateServiceRequestInput { serviceId, addressId?, vehicleId?, equipmentId?, schedule: { mode:'NOW' } \| { mode:'SCHEDULED', startsAt, windowMinutes 30..240=60 }, options, notes? ≤1000, mediaUrls ≤6, paymentMethodId?, couponCode?, destinationAddressId?, idempotencyKey? }` |
| Resposta | 201 `ServiceOrderDetail` (mesma ordem se `idempotencyKey` repetida) |
| Validações (`orders/service.ts: createRequest`) | 422: serviço inativo; `SCHEDULED` em serviço sem `allowsScheduling`; `startsAt ≤ now`; `NOW` em serviço sem `allowsImmediate`; endereço/veículo/equipamento ausentes quando `services.requires_*` ou `category.config.requires*`; cupom inválido ("Cupom inválido ou expirado"). 404: endereço/veículo/equipamento de outro usuário |
| Preço | `estimatePrice(getPriceSource(service, região do bbox), options, cupom)`: `FIXED/HOURLY` → `price = totalCents` (pré-desconto), `discount`; **`RANGE` → `price = minCents`** (piso da faixa, não o teto; diverge de 02 §4.2 que prevê pré-autorizar o limite superior); `QUOTE` → `price = null`; `total = max(0, price − discount)` |
| Método de pagamento | `paymentMethodId` informado ou método padrão; exigido só quando `total > 0`. Sem método: ordem criada e o aceite falhará a autorização (`no_payment_method`) |
| Flags | `requiresStartPin`, `requiresBeforeAfterPhotos`, `allowsAdditionalQuote` da categoria; `requiresCustody = config.requiresCustody \|\| LAUNDRY \|\| (LOGISTICS com veículo)`; `requiresVehicleHandover = LOGISTICS com veículo`; `start_pin` 4 dígitos; `custody_code = 'VL-' + 6 chars` |
| Persistência (transação) | `service_requests`, `service_orders(status = initial: REQUESTED \| SCHEDULED \| SUBMITTED, workflow_version = def.version, flags, metadata)`, `order_events(seq 1, type 'order.created')`, `coupon_redemptions` + `coupons.used_count++`, outbox `order.created`, e **um** dos agendamentos: PIX → `createInitialPixIntent` (intent `REQUIRES_ACTION` com QR) + job `payment.pix_timeout` (+15 min); CONCIERGE → job `concierge.plan` (agora); demais → job `dispatch.start` em `now` ou `scheduledMatchingStart(startsAt)` (6 h antes). Agendado → `bookings` + jobs `booking.remind` (24 h e 1 h, só os futuros) **na criação**, antes de haver prestador |
| Resposta ao cliente | `startPin` presente (viewer `customer`); `allowedActions` ex.: `['customer.cancel']` |

```json
// requisição (cenário A)
{ "serviceId": "0192...encanador-visita", "addressId": "0192...casa", "schedule": { "mode": "NOW" }, "paymentMethodId": "0192...visa", "notes": "Vazamento na pia", "idempotencyKey": "req-a-0001" }
// 201 (resumido)
{ "id": "0192a0b1-...", "requestId": "0192a0b0-...", "customerId": "0192...", "providerId": null, "parentOrderId": null, "serviceId": "0192...", "serviceName": "Encanador: visita e reparo simples", "categorySlug": "hidraulica", "workflowKind": "IMMEDIATE", "workflowVersion": 1, "status": "REQUESTED",
  "scheduledFor": null, "windowMinutes": null, "etaAt": null,
  "address": { "summary": "Rua dos Pinheiros, 100 — Pinheiros, São Paulo", "lat": -23.5614, "lng": -46.6823, "instructions": null }, "destination": null,
  "priceCents": 8000, "additionalApprovedCents": 0, "discountCents": 0, "totalCents": 8000, "platformFeeCents": null, "providerPayoutCents": null,
  "startPin": "7391", "custodyCode": null, "notes": "Vazamento na pia", "provider": null, "cancelReason": null,
  "createdAt": "2026-10-13T12:00:00.000Z", "updatedAt": "2026-10-13T12:00:00.000Z", "startedAt": null, "completedAt": null,
  "events": [ { "id": "0192...", "orderId": "0192a0b1-...", "seq": 1, "type": "order.created", "action": null, "fromStatus": null, "toStatus": "REQUESTED", "actorType": "customer", "actorId": "0192...", "payload": { "serviceId": "0192...", "kind": "IMMEDIATE", "scheduledFor": null, "priceCents": 8000, "discountCents": 0 }, "createdAt": "2026-10-13T12:00:00.000Z" } ],
  "quotes": [], "tasks": [], "allowedActions": ["customer.cancel"] }
```

Após o job `dispatch.start` (próximo tick do scheduler, 2 s): `system.start_matching` → `MATCHING` → onda 0 → `system.offer` → `OFFERED`; eventos `order.created:REQUESTED`, `order.transitioned:MATCHING`, `order.transitioned:OFFERED` (cenário A).

### 5.2 `GET /v1/orders?scope&cursor&limit` · `GET /v1/orders/:id`

| Item | Lista | Detalhe |
|---|---|---|
| Papel | autenticado; só as próprias como cliente | cliente da ordem, prestador atribuído ou ops (`canUserAccessOrder`); caso contrário **403** "Sem acesso a esta ordem" |
| Entrada | `OrderListQuery { scope: active\|history\|all = all, cursor?, limit ≤50 }` (`active` = status não terminal; `history` = terminal) | — |
| Resposta | `Page<ServiceOrder>` (sem `startPin` filtrado: `toDto` sem viewer mostra PIN; lista é do próprio cliente) | `ServiceOrderDetail` com `events` por `seq`, `quotes`, `tasks`, `allowedActions` para o ator deduzido (prestador atribuído → `provider`; cliente → `customer`; ops → `operator`) |
| `startPin` | | `null` para `provider`; presente para `customer` e `operator` |

### 5.3 `POST /v1/orders/:id/transition`

| Item | Valor |
|---|---|
| Papel | autenticado com acesso à ordem; ator por prefixo (`actorForAction`): `provider.*` → 403 "Ação exclusiva do prestador" sem papel/`providerId` (ops pode); `operator.*`/`system.*` → 403 "Ação exclusiva da operação" para não-ops |
| Entrada | `TransitionInput { action, payload }` |
| Resposta | 200 `ServiceOrderDetail` |
| Algoritmo (`transitionTx`) | 1) `SELECT ... FOR UPDATE` (Postgres; PGlite sem lock); 2) `buildSnapshot` (evidências, quotes, filhas, custódia da etapa atual, handover `PICKUP`/`DELIVERY`, `paymentAuthorized = total ≤ 0 \|\| billedViaParent \|\| coveredByPlan \|\| intent INITIAL AUTHORIZED/CAPTURED`, `hasPlan`); 3) `applyTransition`; falha → 409 `INVALID_TRANSITION` com `details { status, allowedActions, code, guard }`; 4) `columnPatch` por ação (`matching_started_at`, `provider_id`/`accepted_at`, `provider_id = null` + `excludedProviderIds` em `provider.cancel`, `started_at`, `completed_at`, `cancel_*`, `price_cents/total_cents` em `customer.approve_quote`); 5) `UPDATE ... WHERE version = ?` → 0 linhas = 409 `CONFLICT`; 6) `order_events(type 'order.transitioned')` sem `pin`; 7) outbox `order.transitioned`; 8) commit; 9) efeitos em sequência (`effects.ts`), erro vira `effect.failed`; 10) hook `afterTransition` (`registry.ts`): em `COMPLETED` → `reputation.recordCompletion`, `assets.markMaintained(metadata.equipmentIds)`, job `order.auto_close` em `+reviews.windowDays`; em `customer.cancel` com taxa → `recordLateCancellation`; filha terminal → `concierge.onChildTerminal` |

### 5.4 Atalhos do ciclo de vida

| Rota | Papel | Entrada | Ação | Observações verificadas |
|---|---|---|---|---|
| `POST /v1/orders/:id/cancel` | cliente da ordem **ou** prestador atribuído | `CancelInput { reason 3..300 }` | `provider.cancel` se o chamador for o prestador atribuído e não o cliente; senão `customer.cancel` | Mesma rota para os dois atores. Efeitos do cliente: `dispatch.cancelOffers`, `payments.chargeCancellationFee`, `payments.cancelAuthorization`, `booking.release`, `provider.setOnline`, `notify.provider:order_cancelled`, `analytics.track`. Prestador: `reputation.penalizeProviderCancel`, `provider.setOnline`, `dispatch.restart` (nova onda excluindo quem cancelou), `notify.customer:order_cancelled` |
| `POST /v1/orders/:id/start` | `requireProvider` | `StartInput { pin?, location? }` | `provider.start` | `payload.pin` só se informado; guards `actorIsAssignedProvider`, `requiresPin`, `requiresEvidence:BEFORE`; `started_at` |
| `POST /v1/orders/:id/complete` | `requireProvider` | `CompleteInput { notes?, evidenceIds }` | `provider.complete` | Guards `noOpenAdditionalQuote`, `requiresEvidence:AFTER`; efeitos `payments.capture`, `wallet.settle` (grava `platform_fee_cents`/`provider_payout_cents`), `provider.setOnline`, notificações `service_completed` + `review_request`, `chat.systemMessage`. Em LOGISTICS/LAUNDRY parte de `DELIVERED` |
| `POST /v1/orders/:id/evidence` | prestador atribuído ou ops (403 caso contrário) | `EvidenceInput { kind, url, metadata }` | — | 201 `MediaEvidence`; `order_events(type 'evidence.added')` |
| `POST /v1/orders/:id/custody/scan` | `requireProvider` atribuído | `CustodyScanInput { itemCode ≥4, location?, photoUrl?, note? }` | — | Código normalizado (maiúsculas, `[A-Z0-9-]`); válido se igual a `custody_code` (com ou sem hífen) ou à placa; 422 "Código não corresponde ao item desta ordem"; grava `custody_events(step = status atual)` uma vez por etapa; devolve `ServiceOrderDetail` |
| `POST /v1/orders/:id/vehicle-handover/:step` | `requireProvider` atribuído | `step ∈ PICKUP\|DELIVERY` (case-insensitive); `VehicleHandoverInput { odometerKm, fuelLevelPct?, checklist, photoUrls ≥1, customerConfirmationPin? }` | — | 422 se `flags.requiresVehicleHandover = false` ou PIN ≠ `start_pin`; cria `vehicle_handovers` + `media_evidence(kind = step)` por foto (satisfaz `requiresEvidence:PICKUP/DELIVERY`) |

```json
// POST /v1/orders/0192a0b1/start com PIN errado (cenário A)
{ "error": { "code": "INVALID_TRANSITION", "message": "PIN inválido", "details": { "status": "ARRIVED", "allowedActions": ["provider.start", "provider.cancel"], "code": "GUARD_FAILED", "guard": "requiresPin" } } }
```

### 5.5 Orçamentos (`quotes`)

| Rota | Papel | Entrada | Resposta | Regras (`quotes/service.ts`) |
|---|---|---|---|---|
| `POST /v1/orders/:id/quotes` | `requireProvider` atribuído (403) | `CreateQuoteInput { kind, items ≥1, notes?, expiresInMinutes 5..4320=60 }` | 201 `Quote` (`SENT`) | 409 se já há `SENT` do mesmo `kind`. `INITIAL`: estado ∈ `UNDER_REVIEW`/`QUOTE_REJECTED` (QUOTE) ou `PLAN_APPROVED` (CONCIERGE) senão 409 `INVALID_TRANSITION`; dispara `provider.submit_quote` (→ `QUOTED`, `notify.customer:quote_available`). `ADDITIONAL`: estado ∈ `IN_PROGRESS`, `AT_DESTINATION`, `THIRD_PARTY_IN_PROGRESS`, `THIRD_PARTY_DONE`; `flags.allowsAdditionalQuote` (422); expiração = `min(input, settings.quotes.additionalQuoteExpiresMinutes)`; notificação `quote_available` com valor, mensagem de sistema `quote_additional`, `order_events(quote.created)`, `quote_sent`. Ambos: job `quote.expire`, outbox `quote.created` |
| `POST /v1/quotes/:quoteId/approve` | cliente da ordem (403) | — | `Quote` `APPROVED` | 409 se não `SENT`; se expirado marca `EXPIRED` e 409. `INITIAL` → `customer.approve_quote` (`price_cents = amount`, `total` recalculado). `ADDITIONAL` → `additional_approved_cents += amount`, `total` recalculado, `payments.authorizeAdditional` (intent `ADDITIONAL` no método da ordem; recusa gera `payment_failed` mas **o orçamento permanece APPROVED**), notificação ao prestador "Orçamento aprovado", `order_events(quote.decided)`; `quote_approved` |
| `POST /v1/quotes/:quoteId/reject` | cliente da ordem | — | `Quote` `REJECTED` | `INITIAL` → `customer.reject_quote` (`QUOTE_REJECTED`); `ADDITIONAL` → notificação "Conclua o escopo original"; `quote_rejected` |

### 5.6 Pagamentos da ordem (`payments`)

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `GET /v1/orders/:id/payments` | quem acessa a ordem (403) | — | `PaymentIntent[]` | Prestador atribuído **vê** as intents (não há filtro adicional) |
| `POST /v1/orders/:id/payments` | cliente da ordem (403) | `CreatePaymentIntentInput { paymentMethodId?, methodKind, useWalletCredit }` | 201 `PaymentIntent` | 422 "Esta ordem não exige pagamento" (`total ≤ 0`, `billedViaParent`, `coveredByPlan`); 404 método; 400 se `method.kind ≠ methodKind`; 409 "Pagamento já capturado". Cancela intents `INITIAL` `AUTHORIZED`/`REQUIRES_ACTION` anteriores (cartão: `cancelAuthorization`), grava novo método em `metadata`, cria nova intent (`createAndAuthorize`): `PIX` → `REQUIRES_ACTION` com QR (30 min); `CARD` → `AUTHORIZED` ou `FAILED` (sem 402: a resposta é 201 com `status: FAILED`); `WALLET` → `AUTHORIZED` se saldo cobre, senão `FAILED insufficient_wallet`. Se autorizada e a ordem está em `QUOTE_APPROVED` → `customer.authorize_payment` pelo sistema; se `awaitingPixPayment` → libera o dispatch. `useWalletCredit` ainda não combina carteira + outro método **(previsto)** |

```json
// 201 PIX
{ "id": "0192...", "orderId": "0192a0b1-...", "quoteId": null, "subscriptionId": null, "kind": "INITIAL", "methodKind": "PIX", "amountCents": 8000, "capturedCents": 0, "refundedCents": 0, "status": "REQUIRES_ACTION", "gateway": "sandbox", "gatewayRef": "pix_3f2e...",
  "pix": { "qrCode": "00020126sandboxpix_3f2e...5204000053039865406 80.005802BR", "copyPaste": "sandbox-pix-pix_3f2e...", "expiresAt": "2026-10-13T12:30:00.000Z" },
  "failureCode": null, "failureMessage": null, "createdAt": "2026-10-13T12:00:01.000Z", "updatedAt": "2026-10-13T12:00:01.000Z" }
```

### 5.7 Avaliação, disputa, chat

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `POST /v1/orders/:id/review` | cliente da ordem ou prestador atribuído | `ReviewInput { rating 1..5, tags ≤5, comment? ≤600 }` | 201 `Review` | Ordem em `COMPLETED`/`REVIEWED`/`CLOSED` senão 409 `INVALID_TRANSITION`; `targetType` deduzido (`PROVIDER` se cliente, `CUSTOMER` se prestador); uma por lado (409 "Avaliação já registrada"); cliente → soma `tags` em `provider_stats`, `recompute`, e `customer.review` (`COMPLETED → REVIEWED`). Sem checagem da janela de 7 dias **(previsto)**; sem ticket automático para nota baixa **(previsto)** |
| `GET /v1/orders/:id/reviews` (sem método no cliente) | autenticado | — | `Review[]` | Sem checagem de posse |
| `POST /v1/orders/:id/disputes` | cliente da ordem (403) | `OpenDisputeInput { reason, description 10..2000, evidenceUrls ≤10 }` | 201 `Dispute` (`OPEN`) | 409 se já existe; a transição `customer.open_dispute` (`COMPLETED\|REVIEWED → DISPUTED`) roda antes do insert (valida estado); efeitos `wallet.hold` (move `provider_payout_cents` para `held_cents`, `metadata.disputeHeldCents`), `ops.alert:dispute` → `incidents(DISPUTE, HIGH)` + realtime; `recordDisputeOpened`; prestador notificado `dispute_update` |
| `GET /v1/orders/:id/messages` | quem acessa a ordem (403) e participante (ou ops) | — | `Message[]` (≤ 200, `readAt` sempre `null`) | Cria a conversa `CUSTOMER_PROVIDER` sob demanda |
| `POST /v1/orders/:id/messages` | idem | `SendMessageInput { body? ≤2000, mediaUrl? }` | 201 `Message` | 409 "Conversa encerrada" se `closed_at`; `sender_type` = papel do participante (`operator` para ops); outbox `message.created` → realtime |

## 6. Concierge (`concierge`)

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `POST /v1/concierge/requests` | autenticado | `ConciergeRequestInput { inputType, text? 5..2000, audioUrl?, imageUrls ≤4, addressId?, vehicleId? }` | 201 `ConciergeRequest` | 400 sem texto/áudio/imagem; 422 se o serviço `concierge` não existir no catálogo. Cria a ordem via `createRequest` com `relaxRequirements` e `priceOverrideCents = null` (sem cobrança) → `SUBMITTED`; grava `concierge_requests` (`transcript = text` quando `TEXT`); job `concierge.plan` |
| `GET /v1/concierge/requests/:id` | cliente dono ou ops (403) | `:id` aceita id do request **ou** da ordem | `ConciergeRequest` | |
| `POST /v1/concierge/requests/:id/answers` | cliente dono | `ConciergeAnswerInput { answers[] }` | `ConciergeRequest` | Acrescenta a `answers`; **não** replaneja automaticamente (ops reexecuta via `concierge.plan` **(previsto)**) |
| `POST /v1/concierge/requests/:id/approve-plan` | cliente dono | — | `ServiceOrderDetail` | `customer.approve_plan` (`PLAN_PROPOSED → PLAN_APPROVED`, guard `planPresent`) → efeito `concierge.quote` |
| `POST /v1/ops/concierge/:id/approve-plan` (sem método no cliente) | ops | `{ plan?: ConciergePlan }` | `ServiceOrderDetail` | Substitui o plano se enviado, zera `requiresHuman`, grava `operator_user_id`; `operator.approve_plan` (`NEEDS_HUMAN → PLAN_PROPOSED`); `audit_logs(concierge.approve_plan)` |

Job `concierge.plan`: em `SUBMITTED` dispara `system.start_matching` (→ `INTERPRETING`, efeito `concierge.plan` → `runPlanner`); em `INTERPRETING` chama `runPlanner` diretamente. `runPlanner`: texto = `transcript ?? rawText` + `answers`; `adapters.planner.plan(text, { now, timezone, hasVehicle, hasAddress, settings.concierge })`; valida com `ConciergePlan`; qualquer falha gera plano de fallback `requiresHuman` ("Falha do planejador automático"); grava `plan` e `planner_name`; `needsHumanReview` → `system.plan_needs_human` (`NEEDS_HUMAN`, incidente `NEEDS_HUMAN` MEDIUM) ou `system.plan_ready` (`PLAN_PROPOSED`, push `plan_proposed`). Efeito `concierge.quote`: `quotes(INITIAL, provider_id = 'platform', expira 24 h)` com `amount = Σ estimateCents` das tarefas (ou `estimateMaxCents`) e `provider.submit_quote` pelo sistema → `QUOTED`. `customer.approve_quote` → `QUOTE_APPROVED` + efeito `payments.authorize` → se autorizado, `customer.authorize_payment` pelo sistema → `IN_EXECUTION` + `concierge.spawnChildren` (ordens filhas `billedViaParent` para tarefas com `serviceSlug` ativo, agendadas se `startsAt` futuro; `order_tasks` com `child_order_id`). Filhas terminais → `onChildTerminal` → `system.children_completed` quando todas terminarem.

```json
// GET /v1/concierge/requests/:id após o planejador (RuleBasedPlanner), ordem em NEEDS_HUMAN
{ "id": "0192...", "orderId": "0192...", "customerId": "0192...", "inputType": "TEXT", "rawText": "Pegue meu carro amanhã às 8h, leve para revisão na concessionária e devolva quando terminar.", "transcript": "Pegue meu carro amanhã às 8h...", "plannerName": "rules@1", "operatorUserId": null,
  "plan": { "summary": "Retirar o veículo em 14/10/2026, 08:00, levar para revisão e devolver ao cliente.", "estimateMinCents": 15000, "estimateMaxCents": 45000, "confidence": 0.8, "clarifications": [], "requiresHuman": true,
    "requiresHumanReasons": ["Serviço de terceiro (oficina) exige combinação humana de custo e prazo", "Plano com muitas tarefas"],
    "tasks": [ { "seq": 1, "title": "Retirada do veículo", "kind": "VEHICLE_PICKUP", "serviceSlug": "leva-e-traz-veiculo", "startsAt": "2026-10-14T11:00:00.000Z", "dependsOnSeq": [], "estimateCents": 6000 }, { "seq": 2, "title": "Transporte até o destino", "kind": "TRANSPORT", "dependsOnSeq": [1] }, { "seq": 3, "title": "Entrega na oficina/concessionária para revisão", "kind": "THIRD_PARTY_SERVICE", "dependsOnSeq": [2], "notes": "Custo da revisão é cobrado pela oficina; a plataforma acompanha." }, { "seq": 4, "title": "Acompanhamento e espera", "kind": "WAIT", "dependsOnSeq": [3] }, { "seq": 5, "title": "Nova coleta no destino", "kind": "RETURN_PICKUP", "dependsOnSeq": [4] }, { "seq": 6, "title": "Devolução ao cliente", "kind": "VEHICLE_RETURN", "dependsOnSeq": [5], "estimateCents": 6000 } ] },
  "createdAt": "2026-10-13T12:00:00.000Z", "updatedAt": "2026-10-13T12:00:02.000Z" }
```

## 7. Prestador (`providers`, `dispatch`, `wallet`)

### 7.1 Cadastro e estado

| Rota | Papel | Entrada | Resposta | Regras |
|---|---|---|---|---|
| `POST /v1/providers/me` | autenticado | `ProviderOnboardingInput { displayName, legalName, documentNumber (11\|14 dígitos), bio?, categoryIds ≥1, baseAddress { lat, lng, city, state }, serviceRadiusKm 1..100=15 }` | 201 `ProviderMe` (`PENDING`) | 409 "Cadastro de prestador já existe"/"Documento já cadastrado" (`document_hash = sha256(documentNumber)`); 404 categoria; `document_masked` (`***.456.789-**`); `last_* = base_*`; `provider_skills(level 0.5)`; adiciona papel `provider`. Renovar token em seguida |
| `GET /v1/providers/me` | autenticado | — | `ProviderMe` (documentos com status, `walletBalanceCents`) | 404 "Cadastro de prestador" se não houver |
| `POST /v1/providers/me/documents` | autenticado com cadastro | `ProviderDocumentInput { kind, fileUrl }` | 204 | Insere `PENDING` (não substitui anteriores) |
| `PATCH /v1/providers/me/availability` | `requireProvider` | `SetAvailabilityInput { availability, location? }` | `ProviderMe` | 403 "Somente prestadores aprovados podem ficar online"; qualquer outro valor (inclusive `BUSY`) é aceito; `location` atualiza `last_*` |
| `POST /v1/providers/me/location` | `requireProvider` | `LocationBatchInput { pings 1..60 }` | `{ accepted, rejected }` | `OFFLINE`/`UNAVAILABLE` → tudo rejeitado; ordenação por `recordedAt`; `acceptPing` com `settings.location.maxAccuracyM`; aceitos → `provider_locations(order_id = ordem ativa em estado liveLocation)`, outbox `provider.location` com `etaMinutes = estimateEtaMinutes(haversine até a ordem)`, `providers.last_*` |
| `GET /v1/providers/me/schedule` · `PUT /v1/providers/me/schedule` (sem método no cliente) | `requireProvider` | `SetScheduleInput { windows ≤42 }` | `{ windows }` | PUT substitui tudo; 400 "Janela inválida" se `endMinute ≤ startMinute`. Ainda **não** entra no matching (ver 12 §2.2) |
| `GET /v1/providers/me/indicators?days=30` | `requireProvider` | `days` 1..365 | `ProviderIndicators` | `earningsCents` = créditos `provider_payout` + `cancellation_fee` no período (últimos 500 lançamentos) |

### 7.2 Ofertas (`dispatch`)

| Rota | Papel | Resposta | Regras (`dispatch/service.ts`) |
|---|---|---|---|
| `GET /v1/providers/me/offers` | `requireProvider` | `DispatchOffer[]` `PENDING` não expiradas, mais recentes primeiro | `summary.approxLocation` = `metadata.neighborhood/city` + lat/lng arredondados a 3 casas; `priceCents = total_cents`; `providerPayoutCents = round(total × 0,8)` (80 % fixo na prévia, não a regra de comissão); sem endereço, sem PIN |
| `POST /v1/offers/:offerId/accept` | `requireProvider` | `ServiceOrderDetail` (ator `provider`) | Transação: 404; 403 "Oferta de outro prestador"; 409 "Oferta não está mais disponível" (`response ≠ PENDING`), "Oferta expirada", "Pedido já foi aceito por outro prestador" (ordem com `provider_id` ou fora de `MATCHING/OFFERED`); `UPDATE ... WHERE response = 'PENDING'`. Depois `provider.accept`; se a transição falhar a oferta vira `WITHDRAWN` e responde 409 "Pedido não pode mais ser aceito". `recordOfferAccepted(responseSeconds)`. Efeitos: `dispatch.cancelOffers` (restantes `WITHDRAWN`, rodada `CLOSED`), `payments.authorize`, `provider.setBusy`, `notify.customer:provider_found`, `chat.systemMessage`; SCHEDULED também `booking.scheduleReminders` |
| `POST /v1/offers/:offerId/reject` | `requireProvider` | 204 | `REJECTED`; se não restar `PENDING` na rodada, antecipa `onWaveTimeout` (próxima onda imediata) |

```json
// GET /v1/providers/me/offers (cenário A)
[ { "id": "0192...", "orderId": "0192a0b1-...", "roundId": "0192...", "providerId": "0192...", "score": 0.8694, "response": "PENDING", "offeredAt": "2026-10-13T12:00:02.000Z", "expiresAt": "2026-10-13T12:01:32.000Z",
    "summary": { "serviceName": "Encanador: visita e reparo simples", "categorySlug": "hidraulica", "distanceKm": 0.11, "approxLocation": { "neighborhood": "Pinheiros", "city": "São Paulo", "lat": -23.561, "lng": -46.682 }, "priceCents": 8000, "providerPayoutCents": 6400, "estimatedDurationMinutes": 60, "scheduledFor": null, "notes": "Vazamento na pia" } } ]
```

### 7.3 Ordens e carteira do prestador

| Rota | Papel | Resposta | Regras |
|---|---|---|---|
| `GET /v1/providers/me/orders?scope&cursor&limit` | `requireProvider` | `Page<ServiceOrder>` | Filtro `provider_id`; `toDto` sem viewer: o PIN **aparece** nesta lista (divergência a corrigir: usar viewer `provider`) |
| `GET /v1/providers/me/wallet` | `requireProvider` | `WalletSummary { balanceCents, pendingCents (Σ payouts SCHEDULED), heldCents, nextPayoutAt (próximo job payout.batch) }` | |
| `GET /v1/providers/me/ledger` | `requireProvider` | `LedgerEntryPublic[]` (50) | `kind` em minúsculas (`provider_payout`, `platform_fee`...) |
| `GET /v1/providers/me/payouts` | `requireProvider` | `Payout[]` | |

## 8. Operação e administração (`ops`, `admin`, `analytics`)

`/v1/ops/*` exige `operator` ou `admin`; `/v1/admin/*` exige `admin` (dashboard também `operator`). Escritas gravam `audit_logs` via `platform.audit({ actorUserId, actorRole, action, targetType, targetId, before, after, ip })`.

### 8.1 Operação

| Rota | Entrada | Resposta | Regras / auditoria |
|---|---|---|---|
| `GET /v1/ops/map` | — | `{ orders: ServiceOrder[] (ativas, não COMPLETED, com coordenadas, ≤500), providers: [{ id, displayName, availability, lat, lng, lastLocationAt }] (APPROVED e ONLINE/BUSY) }` | |
| `GET /v1/ops/orders?status&attention&cursor&limit≤100` | `attention=true` → `NO_PROVIDER_FOUND`, `NEEDS_HUMAN`, `DISPUTED` ou agendamento vencido ainda pré-execução | `Page<ServiceOrder>` | |
| `GET /v1/ops/orders/:id` | — | `ServiceOrderDetail & { dispatch: { rounds, offers } }` | Ator `operator` → `startPin` presente (sem auditoria específica **(previsto)**) |
| `GET /v1/ops/orders/:id/candidates` | — | `[{ providerId, distanceKm, score, breakdown, eligible, ineligibleReason, displayName, availability, alreadyOffered, location }]` | `rankCandidates` com o raio da **última onda configurada** (ex.: 20 km); candidatos vêm de `findCandidates` (só APPROVED e ONLINE/BUSY) — `OFFLINE` não aparece |
| `POST /v1/ops/orders/:id/assign` | `ManualAssignInput { providerId, note? }` | `ServiceOrderDetail` | 422 "Prestador não está aprovado"; `cancelOffers`; `operator.assign` com `payload { providerId, note }` (`NO_PROVIDER_FOUND\|MATCHING\|OFFERED → ACCEPTED/DRIVER_ASSIGNED/UNDER_REVIEW`); `recordOffers` + `recordOfferAccepted(0)`; não cria `dispatch_offers`; audit `ops.assign` |
| `POST /v1/ops/orders/:id/cancel` | `CancelInput { reason }` | `ServiceOrderDetail` | `operator.cancel` → `CANCELLED_BY_PLATFORM` com `payments.refund` integral; audit `ops.cancel` |
| `GET /v1/ops/incidents?status=OPEN` | | `Incident[]` (200) | |
| `POST /v1/ops/incidents/:id/resolve` (sem método no cliente) | — | `Incident` | `RESOLVED`, `assignee_user_id`; audit `ops.incident.resolve` |
| `GET /v1/ops/disputes?status` | | `Dispute[]` | |
| `POST /v1/ops/disputes/:id/resolve` | `ResolveDisputeInput { outcome, refundCents=0, note 3..1000 }` | `Dispute` | 409 se já resolvida. `RESOLVED_CUSTOMER`: reembolso = `refundCents` (se > 0, limitado ao cobrado) senão **total cobrado**; `RESOLVED_SPLIT`: `min(refundCents, cobrado)`; `RESOLVED_PROVIDER`/`REJECTED`: 0. `providerPayoutCents = max(0, repasse original − reembolso)`. Transição `operator.resolve_dispute` (`DISPUTED → CLOSED`) com efeitos `payments.refund(refundCents)`, `wallet.settle` (modo disputa: `releaseHold(held, finalPayout)`, ajuste para `revenue`), `reputation.recompute`; `REJECTED` → `recordDisputeRejected`; notificações `dispute_update`; incidentes `DISPUTE` da ordem resolvidos; audit `ops.dispute.resolve` |
| `GET /v1/ops/slas` | — | `{ generatedAt, breached, byStatus: { [status]: { breached, total, slaSeconds, orderIds } } }` | `slaBreaches`: ordens não terminais cujo `updated_at` ultrapassou `states[status].slaSeconds` da definição |

### 8.2 Administração

| Rota | Entrada | Resposta | Regras |
|---|---|---|---|
| `GET /v1/admin/analytics/dashboard?from&to` | padrão últimos 30 dias até `now` | `DashboardMetrics` | Definições em `16 §4` |
| `GET /v1/admin/:resource` | `resource ∈ categories, services, price-rules, home-sections, banners, regions, commission-rules, matching-configs, coupons, plans, users, providers` | `T[]` | 404 recurso desconhecido |
| `PUT /v1/admin/:resource` | `UpsertCategoryInput`, `UpsertServiceInput`, `UpsertPriceRuleInput`, `UpsertHomeSectionInput`, `UpsertBannerInput` (local: `title 2..80`, `subtitle`, `imageUrl`, `deepLink`, `sortOrder`, `active`; sem vigência), `UpsertRegionInput`, `UpsertCommissionRuleInput`, `UpsertMatchingConfigInput`, `UpsertCouponInput`, `UpsertPlanInput`, `users`: `{ id, roles ≥1 }` (troca papéis) | `T` | Upsert por `id` ou chave natural (`slug`, `code`, `home_sections.id`, `matching_configs.category_id`); `commission-rules` **insere nova regra sem fechar a anterior** (ambas ficam ativas; `pickCommissionRule` escolhe a primeira mais específica encontrada — fechar com `DELETE` antes); `providers` → 422 "Use POST /v1/admin/providers/:id/decision"; audit `admin.{resource}.upsert` |
| `DELETE /v1/admin/:resource/:id` | — | 204 | Categorias/serviços/regiões/matching/cupons/planos → `active = false`; `commission-rules` → `active_until = now`; `price-rules`/`home-sections`/`banners` → delete físico; `users`/`providers` → 422; audit `admin.{resource}.delete` |
| `POST /v1/admin/providers/:id/decision` | `ApproveProviderInput { decision, reason? }` | `ProviderMe` | `APPROVE`: 422 sem nenhum documento; marca **todos** os `PENDING` como `VERIFIED`, `status = APPROVED`, `verified_at`; `REJECT`: documentos `PENDING` → `REJECTED` com `reason`, status permanece `PENDING`; `SUSPEND`/`BLOCK`; não aprovado → `availability = OFFLINE` (ofertas pendentes não são retiradas **(previsto)**); audit `admin.providers.{decision}` com `before/after.status` |
| `GET /v1/admin/settings` · `PUT /v1/admin/settings` | `PlatformSettings` completo | `PlatformSettings` | Uma linha por chave; cache de 2 s em `getSettings`; audit `admin.settings.update` com `before/after` |
| `GET /v1/admin/workflows` | — | `describeWorkflow(def)[]` das definições registradas | |
| `GET /v1/admin/audit-logs` (sem método no cliente) | — | 100 mais recentes | |

```json
// PUT /v1/admin/commission-rules
{ "categoryId": "0192...lavanderia", "regionId": null, "percentBps": 1500, "fixedCents": 0, "minCents": 500, "maxCents": null, "passPaymentFeeToProvider": false }
```

### 8.3 `POST /v1/analytics/events`

Autenticado (`requireAuth`; anônimo → 401). `AnalyticsBatchInput { events 1..100 { name, occurredAt, sessionId?, properties, orderId? }, app, appVersion? }` → **204**. `user_id` vem do JWT; `properties` gravadas como enviadas (lista negra de PII **(prevista)**); `occurredAt` aceito sem limite **(previsto: ±24 h)**.

## 9. Webhooks de pagamento

### `POST /v1/payments/webhooks/:gateway`

| Item | Valor |
|---|---|
| Papel | Público; isento de rate limit; `gateway` deve ser o adaptador ativo (`sandbox`/`pagarme`), senão 404 "Gateway" |
| Corpo | Bruto (`req.rawBody`) para verificação de assinatura |
| Verificação | `parseWebhook(rawBody, headers)`: Pagar.me valida `X-Hub-Signature: sha256=<HMAC>` com `PAGARME_WEBHOOK_SECRET` (se configurado); retorno `null` → **400** "Webhook inválido" (assinatura inválida ou JSON malformado) |
| Idempotência | `INSERT webhook_events ... ON CONFLICT DO NOTHING`; duplicado → 200 `{ ok: true, duplicate: true }` |
| Intent desconhecida | `processed_at` + `error = 'intent não encontrada'`; 200 `{ ok: true, ignored: true }` |
| Processamento | `PAID` e intent `REQUIRES_ACTION` → `AUTHORIZED` (PIX pago fica autorizado; captura lógica em `COMPLETED`), notificação `payment_approved`, `onAuthorized` (dispara `customer.authorize_payment` se `QUOTE_APPROVED`; libera dispatch se `awaitingPixPayment`); `FAILED`/`EXPIRED` e `REQUIRES_ACTION` → `FAILED (failure_code = 'failed'\|'expired')` + `payment_failed`; `REFUNDED` e `CAPTURED` → `REFUNDED`; outros → só registra. Erro no processamento → `webhook_events.error` e 500 (provedor reenvia) |
| Eventos | outbox `payment.updated` → realtime para `user:{userId}` e `order:{id}` |

```json
{ "id": "evt_8c1d...", "type": "charge.paid", "data": { "id": "pix_3f2e...", "status": "paid", "amount": 8000 } }
→ { "ok": true }
```

## 10. Realtime (Socket.IO)

### 10.1 Handshake

| Item | Valor |
|---|---|
| Endpoint | mesmo host, `path: '/realtime'`, transports `websocket` e `polling` (cliente usa `websocket`) |
| Autenticação | `auth: { token }` ou `Authorization: Bearer`; `verifyJwt`; falha → `connect_error('unauthorized')` |
| Reconexão | `RealtimeClient` renova o token em `reconnect_attempt`; backoff 1 s → 10 s |
| Salas automáticas | `user:{userId}`; `provider:{providerId}` se houver claim; `ops` para `operator`/`admin` |
| Sala de ordem | Só via `order.subscribe`, autorizada por `orders.canUserAccessOrder`; negativa silenciosa |
| Escala | Uma instância; `@socket.io/redis-adapter` em V1 (ADR-009) |

### 10.2 Servidor → cliente (`RealtimeEvents`), emissão por `registerRealtime()` de cada módulo

| Evento | Payload | Salas | Origem (outbox) |
|---|---|---|---|
| `order.updated` | `{ orderId, status, updatedAt }` | `order:{id}`, `user:{customerId}`, `provider:{providerId}`, `ops`; na criação só `user:{customerId}` | `order.transitioned`, `order.created` |
| `order.event` | `{ orderId, eventId, type: <action>, seq }` | `order:{id}` | `order.transitioned` (`type` carrega a `TransitionAction`) |
| `offer.created` | `{ offerId, orderId, expiresAt }` | `provider:{providerId}` | `dispatch.start` (acompanha push `offer_received`) |
| `offer.expired` | `{ offerId, orderId }` | `provider:{providerId}` | `onWaveTimeout`, `cancelOffers` (também para `WITHDRAWN`), `expireOffer` |
| `provider.location` | `{ orderId, lat, lng, headingDeg, etaMinutes, recordedAt }` | `order:{id}` | `ingestLocation` quando há ordem ativa em estado `liveLocation` |
| `message.created` | `{ conversationId, messageId, orderId }` | `order:{id}` (conversas de suporte não emitem) | `insertMessage` |
| `quote.created` | `{ quoteId, orderId, amountCents }` | `order:{id}`, `user:{customerId}` | `quotes.insert` |
| `quote.decided` | `{ quoteId, orderId, status }` | `order:{id}`, `provider:{providerId}` | `quotes.decide` |
| `payment.updated` | `{ intentId, orderId, status }` | `user:{userId}`, `order:{id}` | `updateIntent`/criação de intent |
| `notification.created` | `{ notificationId, kind }` | `user:{userId}` | `notifyUser` |
| `ops.order_needs_attention` | `{ orderId, reason }` (`reason` = `incidents.kind`) | `ops` | `support.createIncident` com `orderId` |

### 10.3 Cliente → servidor (`ClientRealtimeEvents`)

| Evento | Payload | Regras |
|---|---|---|
| `order.subscribe` | `{ orderId }` | Entra em `order:{id}` após `canUserAccessOrder` |
| `order.unsubscribe` | `{ orderId }` | Sai da sala |
| `location.push` | `{ lat, lng, accuracyM?, headingDeg?, speedMps?, recordedAt }` | Só sockets com `providerId`; `providers.ingestLocation(providerId, [p])`; rejeições em `warn`, sem resposta ao socket |

Sem ACKs: o cliente confirma estado por `GET /v1/orders/:id`.

## 11. Efeitos declarados → executores (`effects.ts`)

| Efeito | Executor | Observações |
|---|---|---|
| `dispatch.start` / `dispatch.restart` / `dispatch.cancelOffers` | `dispatch.start(orderId)` (onda imediata, sem job), `restart` (cancela, `dispatch_wave = 0`, `start`), `cancelOffers` (pendentes → `WITHDRAWN`, rodadas `CLOSED`, cancela `dispatch.wave_timeout`) | |
| `payments.authorize` | `authorizeForOrder`: nada se `total ≤ 0`/`billedViaParent`/`coveredByPlan`; reutiliza intent viva; sem método → intent `FAILED no_payment_method` + `payment_failed` | |
| `payments.capture` | Captura cada intent `INITIAL`/`ADDITIONAL` `AUTHORIZED` pelo seu `amount_cents` (cartão `capture`; carteira `debitCustomer`; PIX só muda status); falha → intent `FAILED` + `incidents(PAYMENT, HIGH)` + `payment_failed`; sucesso → `payment_approved` ("Pagamento de R$ 80,00 confirmado.") + `payment_completed`; sem intent autorizada → incidente "Ordem concluída sem pagamento autorizado" | Captura **não** recalcula pelo `total_cents`; divergência é só logada |
| `payments.cancelAuthorization` | Cartão `AUTHORIZED` → `cancelAuthorization`; `AUTHORIZED`/`REQUIRES_ACTION` → `CANCELLED` | |
| `payments.refund` | `refund(order, payload.refundCents ?? total capturado)`; `refundCents = 0` → nada; carteira → `creditCustomer`; gateway → `refunds(DONE)`; falha → `refunds(FAILED)` + incidente | |
| `payments.chargeCancellationFee` | `customerCancellation(previous.status, acceptedAt, now, price, settings)`; só com prestador atribuído e `fee > 0`; PIX pago → `refund(amount − fee)`, intent original `PARTIALLY_REFUNDED`, nova intent `CANCELLATION_FEE CAPTURED`; cartão/carteira → autoriza e captura; sucesso → `creditProviderFee` + `cancellation_fee_cents`; falha → `incidents(PAYMENT, MEDIUM)` "Taxa de cancelamento não cobrada" | |
| `wallet.settle` | Normal: `settleOrder({ gross = price + additional, discount, billedViaParent })` → journal + `platform_fee_cents`/`provider_payout_cents`; em `operator.resolve_dispute`: `releaseHold(held, payload.providerPayoutCents)` e `disputeHeldCents = 0` | |
| `wallet.hold` | `hold(orderId, providerId, provider_payout_cents)` + `metadata.disputeHeldCents` | |
| `notify.*` | `communication.notifyUser/notifyProvider(kind, { orderId, status })`; `notify.provider:quote_decided` usa `generic` com título "Orçamento decidido" | |
| `ops.alert:no_provider` / `needs_human` / `dispute` | `incidents(NO_PROVIDER, HIGH)`, `(NEEDS_HUMAN, MEDIUM)`, `(DISPUTE, HIGH)` + realtime | |
| `reputation.recompute` / `penalizeProviderCancel` | `recompute(providerId)`; `cancelled_count++` do prestador **anterior** | |
| `provider.setBusy` / `setOnline` | `ONLINE → BUSY` / `BUSY → ONLINE` apenas | |
| `booking.scheduleReminders` / `booking.release` | `ensureBookingAndReminders` (upsert `bookings` com `provider_id`); `released_at` + cancela `booking.remind:{id}:24h|1h` | |
| `concierge.plan` / `concierge.quote` / `concierge.spawnChildren` | `runPlanner`, `quoteFromPlan`, `spawnChildren` (§6) | |
| `custody.record` | Garante `custody_events` para `previous.status` | |
| `chat.systemMessage` | `messages(system, system_kind = status, body = ORDER_STATUS_LABELS[status].customer)` | |
| `analytics.track` | `ANALYTICS_BY_ACTION[action]` → `analytics_events(app 'api', properties { action, from, to, kind })`; ações sem mapeamento não geram evento (tabela em 16 §2.1) | |
