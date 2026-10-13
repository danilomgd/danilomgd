# 14 — Segurança e LGPD

Derivado de `apps/api/src/app.ts`, `apps/api/src/config.ts`, `apps/api/src/lib/{auth,jwt,password,errors,validate}.ts`, `apps/api/src/realtime/io.ts`, `apps/api/src/adapters/*.ts`, `packages/domain/src/workflow/guards.ts`, `packages/domain/src/policies/location.ts`, `packages/domain/src/reputation/stats.ts`, `packages/domain/src/concierge/rulePlanner.ts`, `packages/contracts/src/{auth,providers,admin}.ts` e do schema (`07_DATABASE_SCHEMA.md`). Itens marcados **(conforme contrato)** dependem dos módulos em implementação.

## 1. Superfícies e modelo de ameaças (STRIDE)

| Superfície | Ameaça (STRIDE) | Vetor | Controle existente | Lacuna / backlog |
|---|---|---|---|---|
| `POST /v1/auth/otp/*` | Spoofing | Força bruta do código de 6 dígitos (1M combinações) | `code_hash`, `attempts`, expiração 300 s (`OTP_TTL_SECONDS`), `consumed_at`; limite de 5 tentativas por challenge e 3 pedidos/telefone/10 min (conforme contrato) | SMS pumping: limitar por IP e por prefixo de DDD; captcha após N pedidos |
| JWT de acesso | Spoofing / Tampering | Token forjado ou alterado | HS256 com `JWT_SECRET ≥ 32`, `timingSafeEqual`, `exp` 15 min, claims validadas por `AccessTokenClaims` (`verifyJwt`) | Rotação de segredo exige `kid` (V1); considerar RS256 se houver mais de um emissor |
| Refresh token | Spoofing / Repudiation | Roubo do token de 30 dias | Opaco (48 bytes `randomBytes`), armazenado por hash, rotação a cada uso, `replaced_by_id` para detectar reuso e revogar a cadeia (conforme contrato) | Vincular a `device` e alertar login novo |
| Senha de operador | Spoofing | Dicionário | `scrypt` N=2^15, r=8, p=1, salt 16 bytes, `timingSafeEqual`; mesma mensagem de erro para e-mail inexistente e senha errada | ADR-008 diz Argon2id; o código usa scrypt (equivalente aceitável, documentar a divergência no ADR). 2FA TOTP para ops/admin (V1) |
| Rotas de ordem | Elevation of privilege | Prestador A age na ordem do prestador B; cliente X cancela a ordem de Y | Guards `actorIsAssignedProvider` e `actorIsOrderCustomer` na engine; `allowedActors` por transição; `canUserAccessOrder` para leitura e sala realtime | Testes de autorização cruzada em todos os atalhos (18 §5) |
| Rotas `ops`/`admin` | Elevation of privilege | Cliente chama `/v1/admin/*` | `preHandlers.ops/admin` (`requireRole`); `actorFrom` nunca eleva cliente a operador | IP allowlist/VPN para `/admin` (V1) |
| Entrada JSON | Tampering / DoS | Payload malicioso, campos extras, corpo gigante | Zod em toda rota (`lib/validate.ts: parse`), `bodyLimit` 2 MiB, enums fechados, regex para telefone/placa/PIN/cupom | Limitar profundidade de `jsonb` livres (`payload`, `metadata`) |
| Rate limit | DoS | Flood | `@fastify/rate-limit` 300/min por `userId` ou IP (`RATE_LIMIT_MAX`) | Limites específicos por rota (OTP, login, chat, location) conforme contrato; WAF/CDN na borda |
| Webhook de pagamento | Spoofing | "Pagamento confirmado" falso | `parseWebhook` com HMAC-SHA256 e `timingSafeEqual`; `rawBody` preservado; `null` → 401; `webhook_events` único | `PAGARME_WEBHOOK_SECRET` é opcional no `config.ts`: tornar obrigatório em produção |
| Realtime | Information disclosure | Entrar na sala `order:{id}` de outro | Handshake JWT; `order.subscribe` passa por `canJoinOrder`; `location.push` só com `providerId` | Rate limit de `location.push` (1/s) e de `order.subscribe` |
| Localização do prestador | Information disclosure | Rastreamento fora da ordem | `provider.location` só para `order:{id}` em estados `liveLocation`; pings rejeitados por `acceptPing`; retenção 30 d | Jitter da posição exibida ao cliente antes de `EN_ROUTE` (não exibida) |
| Oferta ao prestador | Information disclosure | Endereço completo antes do aceite | `DispatchOffer.summary.approxLocation` (bairro + coordenadas arredondadas); `address_instructions` só após aceite | Garantir arredondamento a 3 casas no serializador (conforme contrato) |
| `startPin` | Information disclosure | PIN no payload do prestador | Serializador omite `startPin` para prestador/ops (ops só via rota com auditoria) | Teste automatizado do serializador por papel |
| Logs | Information disclosure | PII em log | `pino` `redact: ['req.headers.authorization','body.password','body.code','body.pin']`; `LogSmsSender` mascara telefone e código | Redigir também `documentNumber`, `gatewayToken`, `refreshToken`, `pushToken`, `phone`, `email` |
| Documentos do prestador | Information disclosure | URL pública de RG/selfie | Bucket privado + URL assinada curta (conforme contrato) | Validar MIME e tamanho no upload; antivírus (V1) |
| Admin de configuração | Tampering / Repudiation | Alterar comissão ou pesos sem rastro | `audit_logs` com `before/after`, `actor`, `ip` em toda escrita ops/admin | Aprovação em dupla para mudanças de comissão (V2) |
| Scheduler/outbox | DoS | Job envenenado em loop | `attempts`/`max_attempts` 5, backoff `min(60 s×n, 600 s)`, `FAILED` terminal; outbox desiste após 5 falhas | Alerta de `FAILED` crescente (15 §10) |
| Concierge com IA | Tampering (prompt injection) | Texto do cliente instrui o modelo a "aprovar pagamento" | Saída validada por `ConciergePlan` (Zod); planner **não tem ferramentas**; nunca executa ação; `needsHumanReview` aplica limites independentemente do que o modelo diz; fallback `RuleBasedPlanner` | Registrar `planner_name` e versão do prompt; red team periódico |
| Dependências | Tampering | Supply chain | `pnpm` lockfile, `onlyBuiltDependencies` restrito | `pnpm audit` no CI, Renovate, SBOM |
| Configuração | Information disclosure | Segredo de dev em produção | `loadConfig` recusa `JWT_SECRET` iniciado em `dev-only`, `sandbox`, `log`, `memory` e ausência de `DATABASE_URL` em produção (ADR-015) | Gerenciador de segredos (Doppler/Vault/SSM) e rotação |

## 2. Autenticação

| Fluxo | Implementação | Parâmetros |
|---|---|---|
| OTP (cliente, prestador) | `otp_challenges(phone, code_hash, app, attempts, expires_at, consumed_at)`; `SmsSender` (`log` em dev imprime mascarado; `devCode` na resposta **só** em `NODE_ENV=test`); verificação cria/encontra `users` por `phone`, adiciona papel `customer` ou `provider` conforme `app`, emite `AuthTokens` | TTL 300 s; 6 dígitos; 5 tentativas; 3 pedidos/10 min |
| Senha (operador, admin) | `hashPassword`/`verifyPassword` (`scrypt$N$r$p$salt$hash`); usuários criados pelo seed (`SEED_ADMIN_*`) ou por admin | Mín. 8, máx. 200 caracteres (`PasswordLoginInput`); política de 12+ com verificação contra vazamentos (V1) |
| Access token | `signJwt({ sub, roles, providerId? }, JWT_SECRET, 900)`; `onRequest` preenche `req.auth` sem lançar | HS256; `exp`; `iat` |
| Refresh | `refresh_tokens(token_hash = sha256(token))`; rotação; `revoked_at`; `expires_at = +30 d`; `POST /v1/auth/refresh` | Reuso de token já substituído revoga a cadeia (conforme contrato) |
| Logout | Revoga refresh do dispositivo (ou todos) e desativa `devices` | |
| Realtime | `io.use` verifica JWT no handshake; `connect_error('unauthorized')` | Reconexão renova token (`RealtimeClient`) |
| Papéis | `UserRole` acumulável; `requireRole(req, ...roles)`; `requireProvider` exige `providerId` no token (prestador aprovado precisa renovar token após onboarding) | |

Observação sobre `lib/jwt.ts: sha256(input)`: usa `createHmac('sha256', 'velio-hash')` com chave fixa. Serve para hash de refresh token (alta entropia), mas **não** deve ser usado para `providers.document_hash`: CPF tem 11 dígitos (10^11 combinações, enumerável offline). Usar HMAC com segredo de ambiente dedicado (`DOCUMENT_HASH_KEY`) — item do backlog §13.

## 3. Autorização por módulo

| Módulo | Regra de posse / papel | Onde é aplicada |
|---|---|---|
| identity | Usuário só lê/edita o próprio `/v1/me*`; `devices`, `addresses` por `user_id` | Rota (`requireAuth` + filtro `user_id = auth.userId`) |
| catalog | Leitura pública; escrita só admin | `preHandlers.admin` |
| assets | `vehicles`/`equipments` por `user_id` | Rota |
| providers | `GET/POST /v1/providers/me*` pelo dono; `providers.status = APPROVED` para `ONLINE`; documentos do prestador só dono e ops | Rota + regra de negócio (403 "Complete o cadastro de prestador") |
| orders | Leitura: cliente da ordem, prestador atribuído, ops (`canUserAccessOrder`). Transição: `allowedActors` + guards `actorIsOrderCustomer`/`actorIsAssignedProvider`; operador e sistema passam pelos guards de posse por definição (`guards.ts`) | Engine do domínio (`applyTransition`) + rota |
| dispatch | Oferta só pelo `provider_id` da oferta; candidatos só ops | Rota |
| quotes | Criar: prestador atribuído; decidir: cliente da ordem | Rota + guards `hasSentQuote`/`hasApprovedQuote` |
| payments | Intents do próprio usuário/ordem; prestador não vê intents; webhooks por assinatura | Rota + `parseWebhook` |
| wallet | Carteira/extrato do próprio `USER` ou `PROVIDER`; ledger completo só admin | Rota |
| communication | Participante da conversa (`conversation_participants`) ou ops; notificações do próprio | Rota |
| reputation | Avaliar: cliente da ordem (ou prestador para `CUSTOMER`); `customer_risk_signals` nunca exposto | Rota + transição `customer.review` |
| support | Ticket do próprio; disputa do cliente da ordem; resolução só ops | Rota + `operator.resolve_dispute` |
| concierge | Request do próprio cliente; `operator.approve_plan` só ops | Rota + engine |
| ops/admin | `operator`/`admin`; `admin` para configuração e decisão de prestador; tudo em `audit_logs` | `preHandlers` |
| analytics | Qualquer autenticado envia eventos **próprios** (`user_id` do JWT, nunca do corpo); dashboard ops/admin | Rota |

Princípio: a rota decide "quem pode chamar"; a engine decide "quem pode disparar esta transição nesta ordem"; o serializador decide "quais campos este papel vê" (`startPin`, `address.instructions`, `legal_name`, `document_masked`, telefone).

## 4. Validação e saneamento

| Camada | Mecanismo |
|---|---|
| Entrada HTTP | `parse(schema, input)` (Zod) → 400 `BAD_REQUEST` com `details[{ path, message }]`; JSON inválido → 400 pelo parser customizado |
| Enums | `OrderStatus`, `TransitionAction`, `EvidenceKind`, `NotificationKind`, `AnalyticsEventName` fechados; string livre nunca vira status |
| Formatos | `PhoneBR` (`^\+55\d{10,11}$`), `PlateBR` (normaliza e valida Mercosul/antigo), `PIN ^\d{4}$`, `OTP ^\d{6}$`, cupom `^[A-Z0-9]{4,20}$`, slugs `^[a-z0-9-]+$`, `postalCode`, `url()` para mídias |
| Tamanhos | `notes ≤ 1000`, `body ≤ 2000`, `description ≤ 2000`, `mediaUrls ≤ 6`, `pings ≤ 60`, `events ≤ 100`, `tasks ≤ 12` |
| Saída | Schemas de resposta (`ServiceOrder`, `ProviderMe`...) como allowlist de campos: nada que não esteja no contrato sai da API |
| SQL | Drizzle parametriza tudo; `search_text` usa `ILIKE` com parâmetro |
| Uploads (conforme contrato) | URL pré-assinada por tipo (`image/jpeg|png|webp`, `audio/m4a`), tamanho máx. 10 MB, nome aleatório, bucket privado; a API só guarda a URL |

## 5. Segredos e ambientes

| Variável | Sensibilidade | Regra |
|---|---|---|
| `JWT_SECRET` | Crítica | ≥ 32 chars; recusado se começar com `dev-only` em produção; rotação semestral (V1 com `kid`) |
| `DATABASE_URL` | Crítica | Obrigatório em produção; TLS; usuário com privilégios mínimos |
| `PAGARME_SECRET_KEY`, `PAGARME_WEBHOOK_SECRET` | Crítica | Só no servidor; nunca no app; webhook secret obrigatório em produção (backlog) |
| `ANTHROPIC_API_KEY` | Alta | Só servidor; `CONCIERGE_PLANNER=claude` sem chave cai em `rules` |
| `SEED_ADMIN_PASSWORD` | Alta | Só no primeiro seed; trocar após login |
| Chaves públicas do provedor e `EXPO_PUBLIC_API_URL` | Baixa | Podem ir no app |

`loadConfig` em produção lança para: sem `DATABASE_URL`; `JWT_SECRET` de dev; `PAYMENTS_PROVIDER=sandbox`; `SMS_PROVIDER=log`; `PUSH_PROVIDER=memory`. `createDb` recusa PGlite em produção. Nenhum segredo em `git`; `.env.example` só com placeholders.

## 6. Logs, auditoria e observabilidade

| Item | Regra |
|---|---|
| Logger | `pino` JSON; `redact` de `authorization`, `password`, `code`, `pin`; `requestId` por requisição; `userId` só como id (não telefone/e-mail) |
| Erros 5xx | `req.log.error({ err })`; resposta genérica "Erro interno" |
| SMS em dev | `[sms:log]` com telefone truncado (`+55119***`) e código substituído por `******` |
| `audit_logs` | Toda escrita de `ops`/`admin`: `action`, `target`, `before`, `after`, `ip`; leitura de `startPin` por ops também auditada (conforme contrato) |
| `order_events` | Append-only; toda transição com ator e payload saneado (sem `pin`) |
| Retenção de logs | 90 dias em quente; PII em logs é incidente |
| Métricas | Por rota e por job; alertas em 06 §9 |

## 7. Confiança operacional (segurança física e antifraude de serviço)

| Controle | Implementação |
|---|---|
| Verificação do prestador | `provider_documents` (`ID_FRONT`, `ID_BACK`, `SELFIE`, `PROOF_OF_ADDRESS`, `CERTIFICATE`, `CNPJ_CARD`, `DRIVER_LICENSE`); `status` `PENDING → APPROVED` só por admin com documentos de identidade `VERIFIED`; `SUSPEND/BLOCK` derruba `availability` e retira ofertas |
| Limites iniciais | Prestador novo recebe `qualification 0.5` (menos ofertas de alto valor) e prior de aceite/cancelamento; V1: teto de valor por ordem por nível |
| PIN de início | `start_pin` (4 dígitos de `pinFromBytes`) exibido só ao cliente; `requiresPin` compara no `provider.start`; prova de presença e de consentimento do cliente para iniciar |
| Fotos antes/depois | `requiresEvidence:BEFORE` em `provider.start`, `requiresEvidence:AFTER` em `provider.complete` quando `flags.requiresBeforeAfterPhotos`; `media_evidence` |
| Custódia | `custody_events` com QR (`custody_code`), foto, posição e `from/to_party` em cada mudança de posse; `requiresCustodyScan` |
| Handover de veículo | `vehicle_handovers` com odômetro, combustível, checklist, fotos (≥1) e PIN do cliente na devolução; `requiresVehicleHandover` |
| Chat mascarado | Sem telefone/e-mail entre as partes; `messages` ligadas à ordem; `operator` pode entrar na conversa; filtro de palavras-chave ("pix direto", telefone) marca para revisão; conversa fecha 48 h após `COMPLETED` |
| Denúncia e bloqueio | `support_tickets(kind=REPORT_USER)` com prioridade alta; admin `BLOCK`; cliente pode bloquear prestador (lista em `users.consents`/`metadata`, V1) para nunca mais ser pareado |
| Avaliação bilateral | `reviews(target_type=CUSTOMER)` privada alimenta `customer_risk_signals` sem exibição |
| Localização | Pings validados (`acceptPing`: precisão ≤ 100 m, deslocamento ≥ 5 m, velocidade ≤ 50 m/s, ordem temporal) evitam spoofing grosseiro de "cheguei" |

## 8. Antifraude (cliente e prestador)

| Sinal | Fonte | Uso |
|---|---|---|
| `customerRiskScore` (0..1) | `customer_risk_signals`: `0.1` se < 5 ordens concluídas + `0.1`/cancelamento tardio (90 d) + `0.25`/disputa rejeitada + `0.5`/chargeback + `0.05`/disputa aberta além da primeira | ≥ 0,5: exigir PIX pré-pago ou cartão pré-autorizado antes do matching; ≥ 0,8: revisão humana da ordem (`NEEDS_HUMAN`-like via `incidents`) — limiares conforme contrato. Nunca recusa serviço por característica pessoal; decisão automatizada revisável (LGPD art. 20) |
| Cartão | Recusas sequenciais (`FAILED` × 3 em 10 min) | Bloquear novas intents por 1 h; alertar |
| Chargeback | Webhook do provedor (V1) | `chargebacks++`, `DISPUTED`, evidências para contestação |
| Prestador | `cancellation_rate` alto, rejeição em massa, `location` implausível, avaliações ≤ 2 recorrentes | `cancellationPenalty` no score; ticket automático; `SUSPEND` |
| Conluio (cliente e prestador combinam fora) | Chat com padrões ("fora do app"), cancelamento após `ARRIVED` repetido com o mesmo par | Revisão; perda de nível do prestador |
| Cupom | `perUserLimit`, `usageLimit`, um por ordem; contas duplicadas por telefone único | `users_phone_uq`; V1: limite por dispositivo |
| Conta | OTP em telefone novo com muitos pedidos | Rate limit; verificação adicional (V1) |

## 9. LGPD by design

### 9.1 Papéis e bases legais

| Tratamento | Base legal (LGPD art. 7º) | Observação |
|---|---|---|
| Cadastro, autenticação, execução da ordem, pagamento, repasse, chat da ordem, notificações transacionais | Execução de contrato (V) | Essencial ao serviço; não depende de consentimento |
| Documentos e selfie do prestador | Execução de contrato (V) + legítimo interesse (IX) para segurança dos clientes | Dado sensível potencial (biometria facial): tratamento mínimo, sem reconhecimento automatizado no MVP |
| Localização do prestador em serviço | Execução de contrato (V) | Só durante estados `liveLocation`; 30 dias |
| Localização do cliente (endereço) | Execução de contrato (V) | Compartilhada com o prestador só após aceite |
| `analytics_events`, `customer_risk_signals`, `provider_stats` | Legítimo interesse (IX) com teste de balanceamento documentado | Sem PII nas propriedades; opt-out de personalização respeitado |
| Marketing (push promocional, e-mail) | Consentimento (I) — `users.consents.marketing` | Padrão `false`; revogável a qualquer momento |
| Personalização da home (recomendações por histórico) | Consentimento (I) — `users.consents.personalization` | Sem consentimento, a home usa só regras de hora e seções fixas |
| Retenção financeira e fiscal | Obrigação legal (II) | 5 anos |
| Defesa em disputas e processos | Exercício regular de direitos (VI) | Evidências, chat e `order_events` preservados enquanto houver disputa |
| Concierge com IA (envio de texto ao provedor do modelo) | Execução de contrato (V) + transferência internacional (art. 33) | Ver §12 |

Controlador: VÉLIO. Operadores: provedor de nuvem/banco, gateway de pagamento, provedor de SMS/push, provedor de IA. Prestador é operador para os dados do cliente que recebe (cláusula de confidencialidade no termo de adesão).

### 9.2 Inventário de dados pessoais (resumo; detalhe por coluna em 07)

| Tabela | Campos pessoais | Classe | Finalidade | Retenção |
|---|---|---|---|---|
| `users` | phone, email, name, avatar_url, consents, last_seen_at | P | Identidade, contato, consentimento | Conta ativa; anonimização na exclusão |
| `addresses` | tudo | P/G | Local do serviço | Conta ativa |
| `vehicles`, `equipments` | plate, brand/model, room, address | P | Insumo do serviço | Conta ativa |
| `providers` | legal_name, document_hash/masked, base_*, last_*, bio, rating | P/PS/G | Cadastro, matching | Ativo + 5 anos |
| `provider_documents` | file_url | S | Verificação | Ativo + 5 anos |
| `provider_locations` | lat, lng, speed, heading | G | Acompanhamento | 30 dias |
| `service_orders`, `service_requests` | address_summary, instructions, notes, media_urls, lat/lng, start_pin | P/G/PS | Execução | 5 anos (financeiro) com anonimização de campos livres na exclusão |
| `media_evidence`, `custody_events`, `vehicle_handovers` | fotos, posição, odômetro | P/G | Prova de execução | 2 anos (5 se disputa) |
| `payment_methods`, `payment_intents`, `ledger_entries`, `payouts`, `refunds` | token, brand, last4, valores | F | Pagamento | 5 anos |
| `messages`, `notifications` | body, media_url | P | Comunicação | 2 anos após fechamento |
| `reviews` | comment, rating | P | Reputação | Conta ativa; comentário apagado na exclusão |
| `support_tickets`, `disputes`, `incidents` | description, evidence_urls | P | Atendimento | 5 anos |
| `concierge_requests` | raw_text, audio_url, image_urls, transcript, answers | P/S | Planejamento | 1 ano; áudio 30 dias após transcrição |
| `analytics_events` | user_id, session_id, properties | P | Produto | 13 meses brutos |
| `audit_logs`, `order_events`, `domain_events` | ids, before/after | P indireto | Auditoria | 5 anos / 30 dias (outbox) |
| `otp_challenges`, `refresh_tokens`, `devices` | phone, hashes, push_token | P/PS | Autenticação | 24 h / 30 d após expirar / conta ativa |

### 9.3 Minimização

| Prática | Onde |
|---|---|
| Documento só em hash + máscara | `providers.document_hash`, `document_masked`; `documentNumber` nunca logado |
| Localização aproximada na oferta | `DispatchOffer.summary.approxLocation` (bairro, coordenadas arredondadas); endereço após aceite |
| GPS com retenção curta e filtro | `acceptPing` descarta imprecisos; 30 dias; só estados `liveLocation` retransmitem |
| Telefone nunca compartilhado | Chat mascarado; ligação mascarada em V1 |
| Analytics sem PII | `properties` escalares; lista negra de chaves; `user_id` só do JWT |
| PIN e tokens fora de logs e eventos | `redact`; payload de `order_events` sem `pin` |
| Campos do contrato como allowlist | Serializadores por papel |
| IA recebe só o necessário | Texto do pedido + flags (`hasVehicle`, `hasAddress`), sem nome, telefone, endereço, placa (§12) |

## 10. Direitos do titular (LGPD art. 18)

| Direito | Canal | Procedimento | Prazo |
|---|---|---|---|
| Confirmação e acesso | App (`Perfil → Meus dados`) e `privacidade@` | Exportação JSON: `users`, `addresses`, `vehicles`, `equipments`, `service_orders` (sem dados do prestador além do nome), `reviews`, `payment_intents` (sem token), `messages` enviadas, `consents`, `analytics_events` próprios (V1: `POST /v1/me/data-export` gera arquivo assinado por 24 h) | 15 dias (art. 19) |
| Correção | App (`PATCH /v1/me`, endereços, veículos) | Imediato | — |
| Anonimização/eliminação | App (`Excluir conta`) + confirmação por OTP | Procedimento por tabela (abaixo); bloqueado se houver ordem ativa ou disputa aberta (concluir antes) | Imediato para campos identificáveis; financeiro mantido anonimizado |
| Portabilidade | Mesma exportação em formato aberto | | 15 dias |
| Revogação de consentimento | `PATCH /v1/me { consents }` | Marketing/personalização param na hora; registro com `at` | Imediato |
| Informação sobre compartilhamento | Política de privacidade lista operadores (nuvem, gateway, SMS/push, IA) | | — |
| Revisão de decisão automatizada | Suporte (`kind=OTHER`, assunto "revisão de risco") | Operador vê `customer_risk_signals` e pode zerar `risk_score_bps` com justificativa em `audit_logs` | 15 dias |

Procedimento de exclusão por tabela (executado em transação por job `privacy.erase_user`, conforme contrato):

| Tabela | Ação |
|---|---|
| `users` | `status='DELETED'`, `phone=NULL`, `email=NULL`, `name='Usuário removido'`, `avatar_url=NULL`, `password_hash=NULL`, `consents='{}'`; id preservado para integridade |
| `refresh_tokens`, `devices`, `otp_challenges` | DELETE |
| `addresses`, `vehicles`, `equipments`, `payment_methods` | DELETE físico (tokens revogados no gateway) |
| `providers` (se prestador) | `legal_name`, `document_masked`, `bio`, `base_*`, `last_*` = NULL; `document_hash` mantido 5 anos para impedir recadastro fraudulento (base legal VI/IX, documentado); `status='BLOCKED'`, `display_name='Profissional removido'` |
| `provider_documents` | DELETE da linha e do objeto no storage |
| `provider_locations` | DELETE |
| `service_orders`, `service_requests` | `address_summary='[removido]'`, `address_instructions=NULL`, `notes=NULL`, `media_urls='[]'`, `lat/lng` arredondados a 2 casas; valores e status mantidos |
| `media_evidence`, `custody_events` (sem disputa aberta) | Objetos apagados; linhas com `url='[removido]'` |
| `messages` | `body='[removido]'`, `media_url=NULL` para mensagens do titular |
| `reviews` | `comment=NULL`; nota mantida (agregado do prestador) |
| `concierge_requests` | `raw_text`, `transcript`, `answers` = `[removido]`; áudio/imagens apagados |
| `analytics_events` | `user_id=NULL`, `session_id=NULL` |
| `support_tickets`, `disputes` | Mantidos 5 anos com descrição; `user_id` aponta para usuário anonimizado |
| Financeiro (`payment_intents`, `ledger_entries`, `payouts`, `refunds`, `coupon_redemptions`) | Mantidos 5 anos; já não contêm dado identificável além do id |
| `audit_logs` | Linha registrando a exclusão (`privacy.erase_user`) sem os dados apagados |

## 11. DPO, incidentes e transferência internacional

| Tema | Regra |
|---|---|
| Encarregado (DPO) | Nomeado antes do lançamento; contato público na política e no app; registra pedidos de titulares e respostas |
| Incidente de segurança | Playbook: detectar → conter (revogar tokens, rotacionar segredos) → avaliar dados afetados (inventário §9.2) → comunicar ANPD e titulares "em prazo razoável" (ANPD orienta 3 dias úteis a partir do conhecimento, conforme Resolução CD/ANPD nº 15/2024) quando houver risco relevante → registro em `incidents(kind=SAFETY, CRITICAL)` e relatório |
| Transferência internacional | Nuvem (banco/API) pode estar fora do Brasil; provedor de IA (Anthropic) processa fora do Brasil. Garantias: cláusulas contratuais padrão/DPA dos provedores, minimização (§12), informação na política de privacidade (art. 33, IX e cláusulas) |
| Operadores | Contratos com gateway, SMS/push, nuvem e IA com cláusulas de confidencialidade, finalidade e subcontratação; lista pública |
| Relatório de impacto (RIPD) | Elaborar para: localização de prestadores, documentos/selfie, `customer_risk_signals`, Concierge com IA |
| Crianças e adolescentes | Serviço para maiores de 18; declaração no cadastro; sem coleta direcionada |

## 12. Cookies, SDKs e Concierge com IA

| Item | Regra |
|---|---|
| Apps mobile | SDKs: Expo (push), provedor de pagamento (tokenização), mapas. Sem SDK de anúncios no MVP. Analytics próprio (`/v1/analytics/events`) em vez de terceiros |
| Web (`/ops`, `/admin`) | Cookies apenas técnicos (sessão); sem rastreadores |
| Permissões do dispositivo | Localização do prestador: "sempre" só quando `ONLINE`; cliente: "ao usar" para preencher endereço; câmera para evidências; explicação em tela antes do pedido do SO |
| Concierge com IA (ADR-014) | Dados enviados ao modelo (`ClaudePlanner.plan`): texto do pedido (`raw_text` + `answers`), data/hora, fuso, `hasVehicle`/`hasAddress` (booleanos) e o JSON Schema do plano. **Não** são enviados: nome, telefone, endereço, placa, histórico de ordens, dados de pagamento. Saída: `ConciergePlan` validado por Zod; qualquer falha cai no `RuleBasedPlanner`. O modelo não tem ferramentas, não cria pagamento, captura ou repasse; `needsHumanReview` força humano para valor > R$ 500, > 4 tarefas, `PURCHASE`, confiança < 0,5 ou pedido do planejador. Operador revisa em `NEEDS_HUMAN`; cliente aprova plano e orçamento explicitamente. Registro: `planner_name`, `plan`, `confidence`. Política para o cliente: aviso "este plano foi montado com apoio de IA e revisado por nossa equipe quando necessário" |
| Áudio e imagem no Concierge | Transcrição e descrição em V1 por provedor externo; áudio apagado 30 dias após transcrição; imagens limitadas a 4 e apagadas com a ordem |

## 13. Checklist de segurança para produção

| # | Item | Estado |
|---|---|---|
| 1 | `NODE_ENV=production` com `loadConfig` passando (sem adaptadores de dev, `JWT_SECRET` forte, `DATABASE_URL` com TLS) | Implementado |
| 2 | `PAGARME_WEBHOOK_SECRET` obrigatório em produção | **Pendente** (hoje opcional) |
| 3 | `CORS_ORIGINS` explícito (nunca `*`) | Config disponível |
| 4 | Rate limits específicos (OTP, login, chat, location) além do global | Conforme contrato |
| 5 | `redact` ampliado (`documentNumber`, `gatewayToken`, `refreshToken`, `pushToken`, `phone`, `email`) | **Pendente** |
| 6 | `document_hash` com HMAC e segredo dedicado | **Pendente** |
| 7 | Serializadores por papel testados (`startPin`, `instructions`, `legal_name`) | Conforme contrato (18 §5) |
| 8 | Bucket privado + URL assinada para documentos e evidências | Conforme contrato |
| 9 | Backups PITR e teste de restauração | Operacional |
| 10 | Rotação de segredos documentada; segredos em gerenciador | Operacional |
| 11 | Dependências auditadas (`pnpm audit`) no CI; Biome/TS strict | CI |
| 12 | Testes de autorização cruzada e webhook forjado verdes | 18 §5 |
| 13 | Política de privacidade, termos, DPO publicados; consentimentos registrados com `at` | Produto/Jurídico |
| 14 | RIPD para localização, documentos, risco e IA | Jurídico |
| 15 | Runbook de incidente com contatos e prazo ANPD | 15 §10 |

## 14. Backlog de hardening

| Prioridade | Item | Justificativa |
|---|---|---|
| V1 | 2FA TOTP para `operator`/`admin`; sessão web com expiração curta e IP allowlist opcional | Contas de ops acessam PII e dinheiro |
| V1 | WAF/CDN na borda (bloqueio geográfico, bot management), TLS 1.2+ apenas, HSTS | DoS e abuso de OTP |
| V1 | Pentest externo (API, apps, painel) antes de ampliar cidades | Validação independente |
| V1 | `kid` no JWT e rotação de `JWT_SECRET` sem logout em massa | Operação |
| V1 | Detecção de reuso de refresh token com alerta ao usuário e novo-dispositivo | Roubo de sessão |
| V1 | Antivírus e validação de imagem em uploads | Malware em evidências |
| V1 | Adaptador Redis do Socket.IO com autenticação | Escala horizontal |
| V2 | RLS no Postgres se houver acesso direto (07 §14.2); `*_id` para `uuid` | Defesa em profundidade |
| V2 | Aprovação em dupla para mudanças de comissão e pesos | Fraude interna |
| V2 | Criptografia de coluna para `legal_name`, `document_masked`, `address_instructions` (pgcrypto ou app-level) | Vazamento de dump |
| V2 | SIEM e alertas de anomalia (login de ops fora do horário, exportações em massa) | Detecção |
| V2 | Verificação de antecedentes para categorias com acesso à residência (PRD 13.10) | Confiança |
