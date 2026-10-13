# 14 — Segurança e LGPD

Derivado de `apps/api/src/app.ts`, `apps/api/src/config.ts`, `apps/api/src/lib/{auth,jwt,password,errors,validate}.ts`, `apps/api/src/realtime/io.ts`, `apps/api/src/adapters/*.ts`, `apps/api/src/modules/{identity,providers,orders,communication,analytics,admin,ops,reputation,support}/*.ts`, `packages/domain/src/workflow/guards.ts`, `packages/domain/src/policies/location.ts`, `packages/domain/src/reputation/stats.ts`, `packages/domain/src/concierge/rulePlanner.ts` e `apps/api/src/adapters/claudePlanner.ts`. "Implementado" = verificado no código; "**previsto**" = não existe ainda.

## 1. Modelo de ameaças (STRIDE) por superfície

| Superfície | Ameaça | Vetor | Controle implementado | Lacuna / backlog |
|---|---|---|---|---|
| `POST /v1/auth/otp/*` | Spoofing | Força bruta do código (10^6) | `code_hash = sha256(code)`; TTL 300 s; `attempts` com máximo 5 → 429; `consumed_at`; rate limit 5/min por `ip:phone` nas duas rotas (`identity/routes.ts`) | SMS pumping por prefixo; captcha após N pedidos; limite por telefone independente de IP |
| JWT de acesso | Spoofing / Tampering | Token forjado/alterado | HS256 com `JWT_SECRET ≥ 32` (recusa `dev-only*` em produção), `timingSafeEqual`, `exp` 15 min, claims validadas por `AccessTokenClaims` | `kid`/rotação (V1) |
| Refresh token | Spoofing | Roubo do token de 30 dias | Opaco 48 bytes, hash SHA-256, rotação com `revoked_at` + `replaced_by_id`; reuso de revogado → 401 | **Não revoga a cadeia** ao detectar reuso de token substituído; vincular a `device`; alertar login novo |
| Senha de operador | Spoofing | Dicionário | `scrypt` N=2^15 r=8 p=1, salt 16 B, `timingSafeEqual`; 401 genérico; rate limit 10/min por IP; 403 para não-ops | ADR-008 cita Argon2id (divergência documental). 2FA TOTP (V1). Política de 12+ |
| Rotas de ordem | Elevation of privilege | Prestador B age na ordem de A; cliente X na de Y | `requireOrderFor` (403 "Sem acesso a esta ordem"); `actorForAction` por prefixo da ação (403 "Ação exclusiva do prestador/da operação"); guards `actorIsAssignedProvider`/`actorIsOrderCustomer` na engine (409 `GUARD_FAILED`); `requireProvider` em `start`/`complete`/custódia/handover; evidências só prestador atribuído ou ops | Testes de autorização cruzada ainda não escritos (18 §5) |
| `/v1/ops`, `/v1/admin` | Elevation of privilege | Cliente chama rotas internas | `requireRole(operator\|admin)` / `requireRole(admin)`; `actorFrom` nunca eleva cliente | IP allowlist/VPN para `/admin` (V1) |
| Entrada JSON | Tampering / DoS | Payload malicioso, corpo gigante | Zod em toda rota (`parse` → 400 com `details[]`); `bodyLimit` 2 MiB; enums fechados; regex em telefone, placa, PIN, OTP, cupom, slug | Profundidade de `jsonb` livres (`payload`, `metadata`, `properties`) |
| Rate limit | DoS | Flood | Global 300/min por `userId` ou IP (`RATE_LIMIT_MAX`); OTP e login específicos; webhook isento | Limites em `location.push`, mensagens, analytics (**previsto**); WAF/CDN |
| Webhook de pagamento | Spoofing | "Pago" falso | `parseWebhook` com HMAC-SHA256 + `timingSafeEqual` quando `PAGARME_WEBHOOK_SECRET` existe; `rawBody` preservado; inválido → 400; `webhook_events` único; `gateway` precisa ser o adaptador ativo (404) | Segredo é opcional: tornar obrigatório em produção |
| Realtime | Information disclosure | Entrar na sala de outra ordem | JWT no handshake; `order.subscribe` passa por `canUserAccessOrder`; `location.push` só com `providerId` | Rate limit de eventos do socket |
| Localização do prestador | Information disclosure | Rastreamento fora da ordem | `provider.location` só para `order:{id}` e só quando há ordem ativa em estado `liveLocation`; `acceptPing` descarta pings ruins; `OFFLINE/UNAVAILABLE` não grava nada | Retenção de 30 dias **sem job de expurgo** ainda |
| Oferta ao prestador | Information disclosure | Endereço antes do aceite | `offerSummary`: bairro/cidade + lat/lng arredondados a 3 casas; sem rua, sem instruções, sem PIN | — |
| `startPin` | Information disclosure | PIN no payload do prestador | `toDto(o, viewer)`: `startPin = null` para `viewer.type = provider` (cenário A verifica no aceite); operador vê | `GET /v1/providers/me/orders` usa `toDto` **sem viewer** e expõe o PIN na lista do prestador (corrigir); leitura de PIN por ops não é auditada |
| Logs | Information disclosure | PII em log | `pino` com `redact: ['req.headers.authorization','body.password','body.code','body.pin']`; OTP logado com `maskPhone` e código mascarado no `LogSmsSender` | Redigir `documentNumber`, `gatewayToken`, `refreshToken`, `pushToken`, `phone`, `email`, `customerConfirmationPin` |
| Documentos do prestador | Information disclosure | URL pública de RG/selfie | A API só guarda `file_url` | Upload assinado, bucket privado, validação de MIME (**previsto**) |
| Config de produção | Information disclosure | Segredo de dev | `loadConfig` lança para `DATABASE_URL` ausente, `JWT_SECRET` dev, `sandbox`, `log`, `memory`; `createDb` recusa PGlite | Gerenciador de segredos |
| Admin de configuração | Repudiation | Alterar comissão sem rastro | `platform.audit` em todo `PUT/DELETE /v1/admin/*`, decisão de prestador, settings, `ops.assign`, `ops.cancel`, `ops.incident.resolve`, `ops.dispute.resolve`, `concierge.approve_plan` | Aprovação em dupla (V2) |
| Scheduler/outbox | DoS | Job envenenado | `max_attempts 5`, backoff `min(60 s×n, 600 s)`, `FAILED`; outbox desiste após 5 falhas | Alertas (15 §10) |
| Concierge com IA | Tampering (prompt injection) | Texto do cliente instrui o modelo | `ClaudePlanner` sem ferramentas; saída validada por `ConciergePlan` (Zod) duas vezes (adaptador e `runPlanner`); falha → plano de fallback `requiresHuman`; `needsHumanReview` aplica limites da plataforma independentemente do modelo; nenhuma ação financeira automática | Registrar versão do prompt; red team |
| Dependências | Tampering | Supply chain | `pnpm` lockfile; `onlyBuiltDependencies` restrito | `pnpm audit` no CI; SBOM |

## 2. Autenticação

| Fluxo | Implementação verificada |
|---|---|
| OTP | `requestOtp`: `randomInt(0, 1e6)` 6 dígitos, `sha256(code)` (HMAC com chave fixa `'velio-hash'`), `expires_at = now + OTP_TTL_SECONDS`, SMS "Seu código VÉLIO é …"; `devCode` só em `NODE_ENV=test`. `verifyOtp`: 404/400 ("já utilizado", "expirado", "inválido" com `attemptsLeft`), 429 após 5, cria usuário (`['customer']` ou `['customer','provider']`), 403 se `status ≠ ACTIVE` |
| Senha | `verifyPassword` scrypt; só `operator`/`admin`; device `web` |
| Access token | `signJwt({ sub, roles, providerId? })`, 900 s; `providerId` resolvido por `providers.providerIdForUser` (prestador precisa de refresh após onboarding) |
| Refresh | Rotação; `logout(refreshToken?)` revoga um ou todos |
| Realtime | `io.use` + `verifyJwt`; salas `user`, `provider`, `ops` automáticas |
| Papéis | `requireRole`, `requireProvider` (`providerId` obrigatório), `actorFrom` |

`lib/jwt.ts: sha256(input) = HMAC-SHA256(input, 'velio-hash')` é usado para refresh tokens (alta entropia, aceitável), códigos OTP (6 dígitos, aceitável com rate limit) e **`providers.document_hash`** (`providers/service.ts: onboard`). CPF tem 10^11 combinações: com a chave fixa pública no repositório, o hash é enumerável offline. Backlog prioritário: HMAC com segredo de ambiente (`DOCUMENT_HASH_KEY`) e migração dos hashes existentes.

## 3. Autorização por módulo (verificada)

| Módulo | Regra | Onde |
|---|---|---|
| identity | `/v1/me*` só o próprio; `devices` upsert reatribui token ao usuário atual | rotas |
| catalog/geo/assets | Leitura pública de catálogo; endereços/veículos/equipamentos filtrados por `user_id` e `deleted_at IS NULL` (`getAddress(userId, id)` → 404 se de outro) | serviços |
| providers | `requireProvider` em disponibilidade, localização, agenda, ofertas, ordens, indicadores, carteira; `ONLINE` exige `APPROVED` (403) | rotas + serviço |
| orders | Leitura: `canUserAccessOrder` (cliente, prestador atribuído, ops) → 403; transições: `actorForAction` + guards; `cancel` escolhe ator pelo vínculo; evidências: prestador atribuído ou ops; custódia/handover: prestador atribuído (403) | rotas + engine |
| dispatch | Oferta só do próprio `providerId` (403); candidatos/assign só ops | serviço |
| quotes | Criar: prestador atribuído (403); decidir: cliente da ordem (403) | serviço |
| payments | Métodos do próprio usuário (404 se de outro); intents da ordem para quem acessa a ordem (inclui prestador atribuído); criar intent só o cliente (403); webhooks por assinatura | rotas + serviço |
| wallet | Resumo/extrato/repasses do próprio `USER`/`PROVIDER` | rotas |
| communication | Mensagens: acesso à ordem **e** participação na conversa (ops dispensado) → 403; notificações do próprio | serviço |
| reputation | Avaliar: cliente da ordem ou prestador atribuído (403); `GET /v1/orders/:id/reviews` só exige autenticação (sem posse — ajustar) | serviço |
| support | Disputa: cliente da ordem (403); tickets do próprio; resolução só ops | serviço |
| concierge | Request do próprio cliente ou ops (403); aprovação de plano pelo operador só ops | serviço |
| ops/admin | `requireRole`; `audit_logs` em escritas | rotas |
| analytics | `requireAuth`; `user_id` do JWT; dashboard ops/admin | rotas |

Princípio: rota decide "quem pode chamar", engine decide "quem pode disparar esta transição", serializador decide "quais campos este papel vê" (`startPin`, `instructions`, `legal_name`, `document_masked`).

## 4. Validação e saneamento

| Camada | Implementado |
|---|---|
| Entrada | `parse(schema, input)` → 400 `details[{ path, message }]`; parser JSON customizado |
| Enums fechados | `OrderStatus`, `TransitionAction`, `EvidenceKind`, `NotificationKind`, `AnalyticsEventName`, `OfferResponse`, `DisputeStatus` |
| Formatos | `PhoneBR`, `PlateBR` (normaliza), PIN `^\d{4}$`, OTP `^\d{6}$`, cupom `^[A-Z0-9]{4,20}$`, slugs, CEP, `url()` |
| Tamanhos | notas 1000, mensagens 2000, descrição de disputa 2000, mídia ≤ 6/10, pings ≤ 60, eventos ≤ 100, tarefas ≤ 12 |
| Saída | DTOs explícitos (`toDto`, `toMe`, `toPublic`, `toIntentDto`...) como allowlist; `payload` de `order_events` sem PINs |
| SQL | Drizzle parametrizado; busca `ILIKE` com parâmetro |
| Uploads | **(previsto)**: URL pré-assinada, MIME, tamanho, bucket privado |

## 5. Segredos e ambientes

| Variável | Sensibilidade | Regra |
|---|---|---|
| `JWT_SECRET` | Crítica | ≥ 32 chars; recusa `dev-only*` em produção |
| `DATABASE_URL` | Crítica | Obrigatório em produção; TLS |
| `PAGARME_SECRET_KEY` / `PAGARME_WEBHOOK_SECRET` | Crítica | Chave lança se ausente com `pagarme`; segredo do webhook **deve** virar obrigatório |
| `ANTHROPIC_API_KEY` | Alta | Sem chave cai em `rules` |
| `SEED_ADMIN_PASSWORD` | Alta | Só no primeiro seed |
| `DOCUMENT_HASH_KEY` (**proposta**) | Crítica | HMAC do CPF/CNPJ |

## 6. Logs, auditoria e observabilidade

| Item | Implementado |
|---|---|
| Logger | `pino` JSON, `redact` de authorization/password/code/pin; `LOG_LEVEL` |
| 5xx | `req.log.error({ err })`, resposta genérica |
| OTP | `log.info({ phone: maskPhone(phone), app })`; SMS de dev com código mascarado |
| `audit_logs` | `platform.audit` em admin (`admin.{resource}.upsert/delete`, `admin.providers.{decision}`, `admin.settings.update`) e ops (`ops.assign`, `ops.cancel`, `ops.incident.resolve`, `ops.dispute.resolve`, `concierge.approve_plan`) com `before/after` e `ip`; leitura via `GET /v1/admin/audit-logs` |
| `order_events` | Append-only; `effect.failed` registra falhas de efeitos |
| Métricas/alertas | **(previsto)** (06 §9) |

## 7. Confiança operacional

| Controle | Implementação |
|---|---|
| Verificação do prestador | `provider_documents` por `kind`; `decide(APPROVE)` exige ≥ 1 documento e marca todos os `PENDING` como `VERIFIED` (checklist humano em 15 §8 cobre o que o código não força); `REJECT` devolve a `PENDING` com motivo; `SUSPEND`/`BLOCK` → `OFFLINE` |
| Limites iniciais | `provider_skills.level 0.5`; priors de aceite/cancelamento no score |
| PIN de início | `start_pin` quando `requiresStartPin`; `requiresPin` compara `payload.pin`; `start_pin` nunca no DTO do prestador; também confirma a devolução do veículo (`customerConfirmationPin`) |
| Fotos antes/depois | Guards `requiresEvidence:BEFORE/AFTER` quando `requiresBeforeAfterPhotos`; cenário A verifica os dois 409 |
| Custódia | `custody_events` com código, `from/to_party`, posição e foto; `requiresCustodyScan` em coleta, nova coleta e devolução; código errado → 422 |
| Handover de veículo | Odômetro, combustível, checklist, fotos (≥1), PIN do cliente na devolução (422 se errado) |
| Chat mascarado | Participantes por `user_id`; DTO sem telefone (cenário A verifica ausência de `+5511`); mensagens de sistema por status; operador pode escrever | Filtro de palavras-chave, fechamento em 48 h e rate limit **(previstos)** |
| Denúncia | `support_tickets(kind REPORT_USER)`; `BLOCK` por admin | Bloqueio de prestador pelo cliente **(previsto)** |
| Avaliação bilateral | `reviews(target_type CUSTOMER)` privada | |
| Localização | `acceptPing`: precisão ≤ `settings.location.maxAccuracyM` (100 m), deslocamento ≥ 5 m, velocidade ≤ 50 m/s, ordem temporal | |

## 8. Antifraude

| Sinal | Implementação |
|---|---|
| `customer_risk_signals` | `reputation.bumpRisk`: `completedOrders++` em `COMPLETED`; `lateCancellations90d++` quando `customer.cancel` gerou taxa (`afterTransition`); `disputesOpened90d++` ao abrir disputa; `disputesRejected90d++` em `REJECTED`; `risk_score_bps = customerRiskScore × 10000`. A janela de 90 dias **não é decrementada** (contadores acumulam; job de janela **previsto**) |
| Uso do score | Ainda não consumido por nenhuma regra (**previsto**: ≥ 5000 exige PIX pré-pago; ≥ 8000 revisão humana). Nunca exibido ao prestador; decisão automatizada revisável (art. 20) |
| Prestador | `cancelled_count` → `cancellationRate` → `cancellationPenalty`; `excludedProviderIds` por ordem |
| Chargeback | **(previsto)** |
| Cupom | `per_user_limit`, `usage_limit`, categoria; um por ordem (`coupon_redemptions_order_uq`) |
| Conta | Telefone único; OTP com rate limit |

## 9. LGPD by design

### 9.1 Bases legais por tratamento

| Tratamento | Base (art. 7º) | Observação |
|---|---|---|
| Cadastro, OTP, ordens, pagamento, repasse, chat, notificações transacionais | Execução de contrato (V) | |
| Documentos e selfie do prestador | Contrato (V) + legítimo interesse (IX) | Biometria facial potencial; sem reconhecimento automatizado |
| Localização do prestador em serviço | Contrato (V) | Só estados `liveLocation`; 30 dias (política) |
| Endereço do cliente | Contrato (V) | Compartilhado após aceite; bairro na oferta |
| `analytics_events`, `customer_risk_signals`, `provider_stats` | Legítimo interesse (IX) | Teste de balanceamento documentado |
| Marketing | Consentimento (I) `consents.marketing` | Padrão `false` |
| Personalização | Consentimento (I) `consents.personalization` | Hoje a home personaliza por dados contratuais (ordens, equipamentos) sem usar este consentimento; recomendações por histórico de busca devem respeitá-lo |
| Retenção financeira | Obrigação legal (II) | 5 anos |
| Evidências em disputa | Exercício regular de direitos (VI) | |
| Concierge com IA | Contrato (V) + transferência internacional (art. 33) | §12 |

Controlador: VÉLIO. Operadores: nuvem/banco, gateway, SMS/push, IA. Prestador é operador para dados do cliente que recebe.

### 9.2 Inventário (resumo; por coluna em 07)

| Tabela | Campos pessoais | Classe | Retenção-alvo |
|---|---|---|---|
| `users` | phone, email, name, avatar, consents, last_seen | P | Conta ativa; anonimização |
| `addresses`, `vehicles`, `equipments` | tudo | P/G | Conta ativa |
| `providers` | legal_name, document_hash/masked, base/last position, bio | P/PS/G | Ativo + 5 anos |
| `provider_documents` | file_url | S | Ativo + 5 anos |
| `provider_locations` | lat/lng/velocidade | G | 30 dias |
| `service_orders`/`requests` | address_summary, instructions, notes, media, lat/lng, start_pin, metadata.neighborhood | P/G/PS | 5 anos com campos livres anonimizados |
| `media_evidence`, `custody_events`, `vehicle_handovers` | fotos, posição, odômetro | P/G | 2 anos (5 em disputa) |
| Financeiro | token, last4, valores | F | 5 anos |
| `messages`, `notifications` | body, media | P | 2 anos |
| `reviews` | comment, rating | P | Conta ativa |
| `support_tickets`, `disputes`, `incidents` | descrição, evidências | P | 5 anos |
| `concierge_requests` | raw_text, audio_url, image_urls, transcript, answers | P/S | 1 ano; áudio 30 dias |
| `analytics_events` | user_id, session_id, properties | P | 13 meses |
| `audit_logs`, `order_events`, `domain_events` | ids, before/after | P indireto | 5 anos / 30 dias |
| `otp_challenges`, `refresh_tokens`, `devices` | phone, hashes, push_token | P/PS | 24 h / 30 d / ativa |

### 9.3 Minimização implementada

| Prática | Onde |
|---|---|
| Documento só em hash + máscara | `onboard`: `document_hash`, `document_masked` (`***.456.789-**`) |
| Localização aproximada na oferta | `offerSummary.approxLocation` (3 casas, bairro) |
| GPS filtrado e só em serviço | `acceptPing`; `provider.location` só com ordem ativa em `liveLocation` |
| Telefone fora do chat | DTO de mensagem sem telefone; participantes por id |
| PIN fora de eventos e do prestador | `transitionTx` remove `pin`/`customerConfirmationPin`; `toDto(viewer)` |
| IA recebe o mínimo | §12 |
| DTOs explícitos | Todos os serviços |

## 10. Direitos do titular (art. 18)

| Direito | Canal | Procedimento | Prazo |
|---|---|---|---|
| Acesso/portabilidade | Suporte (`POST /v1/support/tickets`) no MVP; `POST /v1/me/data-export` **(previsto)** | Exportação JSON de `users`, endereços, veículos, equipamentos, ordens (sem dados do prestador além do nome), reviews, intents (sem token), mensagens próprias, consents, eventos de analytics | 15 dias |
| Correção | `PATCH /v1/me`, `PATCH /v1/me/addresses/:id`, veículos/equipamentos | Imediato | — |
| Revogação de consentimento | `PATCH /v1/me { consents }` | `consents[k] = { granted: false, at }` | Imediato |
| Exclusão/anonimização | Suporte no MVP; job `privacy.erase_user` **(previsto)**; bloqueado com ordem ativa ou disputa aberta | Tabela abaixo | Imediato |
| Revisão de decisão automatizada | Suporte | Operador zera `risk_score_bps` com `audit_logs` | 15 dias |

Procedimento de exclusão por tabela (transação única):

| Tabela | Ação |
|---|---|
| `users` | `status='DELETED'`, `phone/email/avatar_url/password_hash = NULL`, `name='Usuário removido'`, `consents='{}'` |
| `refresh_tokens`, `devices`, `otp_challenges` | DELETE |
| `addresses`, `vehicles`, `equipments`, `payment_methods` | DELETE físico; tokens revogados no gateway |
| `providers` | `legal_name/document_masked/bio/base_*/last_* = NULL`, `display_name='Profissional removido'`, `status='BLOCKED'`; `document_hash` mantido 5 anos (impede recadastro fraudulento; base IX) |
| `provider_documents`, `provider_locations` | DELETE (e objetos no storage) |
| `service_orders`/`requests` | `address_summary='[removido]'`, `address_instructions/notes = NULL`, `media_urls='[]'`, `metadata` sem bairro/placa, lat/lng a 2 casas |
| `media_evidence`, `custody_events` | Objetos apagados; `url/photo_url = '[removido]'` (salvo disputa aberta) |
| `messages` | `body='[removido]'`, `media_url=NULL` do titular |
| `reviews` | `comment=NULL` |
| `concierge_requests` | `raw_text/transcript/answers` removidos; áudio/imagens apagados |
| `analytics_events` | `user_id/session_id = NULL` |
| Financeiro, `audit_logs`, `order_events` | Mantidos; `audit_logs` registra `privacy.erase_user` |

## 11. DPO, incidentes e transferência internacional

| Tema | Regra |
|---|---|
| DPO | Nomeado antes do piloto; contato na política e no app; registra pedidos |
| Incidente de segurança | Detectar → conter (revogar refresh tokens: `UPDATE refresh_tokens SET revoked_at = now()`; rotacionar `JWT_SECRET`) → avaliar dados (inventário) → comunicar ANPD e titulares em prazo razoável (orientação ANPD: 3 dias úteis, Resolução CD/ANPD nº 15/2024) → `incidents(SAFETY, URGENT)` + relatório |
| Transferência internacional | Nuvem e provedor de IA fora do Brasil: DPA/cláusulas-padrão, minimização, informação na política (art. 33) |
| Operadores | Contratos com confidencialidade e finalidade; lista pública |
| RIPD | Localização, documentos/selfie, risco do cliente, IA |
| Menores | Serviço para maiores de 18 |

## 12. Cookies, SDKs e Concierge com IA

| Item | Regra |
|---|---|
| Apps | SDKs: Expo (push), provedor de pagamento (tokenização), mapas; analytics próprio; sem anúncios |
| Web | Só cookies técnicos |
| Permissões | Localização "sempre" só com `ONLINE`; câmera para evidências; explicação em tela antes do pedido do SO |
| Concierge com IA | `ClaudePlanner.plan(text, ctx)` envia: texto do pedido (`transcript ?? rawText`) + `answers` concatenadas, `now`, `timezone`, `hasVehicle`/`hasAddress` (booleanos) e o JSON Schema de `ConciergePlan`. **Não** envia nome, telefone, endereço, placa, histórico, pagamento. Saída validada por Zod no adaptador e de novo em `runPlanner`; falha → `RuleBasedPlanner` ou plano de fallback humano. O modelo não tem ferramentas; nunca cria intent, captura ou repasse (ADR-014). `needsHumanReview` força humano para > R$ 500, > 4 tarefas, `PURCHASE`, confiança < 0,5. Operador revisa (`POST /v1/ops/concierge/:id/approve-plan`, auditado); cliente aprova plano e orçamento. Aviso ao cliente: "plano montado com apoio de IA e revisado por nossa equipe quando necessário" |
| Áudio/imagem | V1; áudio apagado 30 dias após transcrição |

## 13. Checklist de segurança para produção

| # | Item | Estado |
|---|---|---|
| 1 | `loadConfig` em produção sem adaptadores de dev, `JWT_SECRET` forte, `DATABASE_URL` TLS | Implementado |
| 2 | `PAGARME_WEBHOOK_SECRET` obrigatório com `pagarme` | **Pendente** |
| 3 | `CORS_ORIGINS` explícito | Config disponível |
| 4 | `document_hash` com segredo de ambiente | **Pendente** |
| 5 | `redact` ampliado | **Pendente** |
| 6 | `GET /v1/providers/me/orders` com viewer `provider` (sem PIN) | **Pendente** |
| 7 | `GET /v1/orders/:id/reviews` com checagem de posse | **Pendente** |
| 8 | Revogar cadeia de refresh em reuso | **Pendente** |
| 9 | Rate limits em `location.push`, mensagens, analytics | **Pendente** |
| 10 | Upload assinado + bucket privado para documentos/evidências | **Pendente** |
| 11 | Jobs de retenção (`location.purge`, OTP, refresh, outbox, analytics) | **Pendente** |
| 12 | Testes S-01..S-18 (18 §5) verdes | A criar |
| 13 | Backups PITR, segredos em gerenciador, `pnpm audit` no CI | Operacional |
| 14 | Política de privacidade, termos, DPO, RIPD | Jurídico |
| 15 | Runbook de incidente com prazo ANPD | 15 §10 |

## 14. Backlog de hardening

| Prioridade | Item | Justificativa |
|---|---|---|
| Piloto | Itens 2, 4, 5, 6, 7, 8, 9, 10, 11 do checklist | Exposição direta de dados pessoais |
| Piloto | Uso do `risk_score_bps` (PIX pré-pago ≥ 5000; revisão ≥ 8000) e janela móvel de 90 dias | Antifraude declarado |
| Piloto | Auditar leitura de PIN por ops (`ops.order.view_pin`) | Rastreabilidade |
| V1 | 2FA TOTP para ops/admin; IP allowlist | Contas com acesso a PII e dinheiro |
| V1 | WAF/CDN, HSTS, TLS 1.2+ | DoS e abuso de OTP |
| V1 | Pentest externo | Validação independente |
| V1 | `kid` e rotação de `JWT_SECRET` | Operação |
| V1 | Antivírus e validação de imagem em uploads | Malware |
| V1 | Redis adapter autenticado para Socket.IO | Escala |
| V2 | RLS (07 §14.2); `*_id` → `uuid` | Defesa em profundidade |
| V2 | Aprovação em dupla para comissão/pesos | Fraude interna |
| V2 | Criptografia de coluna (`legal_name`, `document_masked`, `address_instructions`) | Vazamento de dump |
| V2 | SIEM e anomalias (login de ops fora de hora, exportações) | Detecção |
| V2 | Antecedentes para categorias com acesso à residência (PRD 13.10) | Confiança |
