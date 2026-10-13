# 15 — Manual de Operação e Administração

Para operadores (`/ops`) e administradores (`/admin`) do painel web. Derivado de `apps/api/src/modules/ops/routes.ts`, `apps/api/src/modules/admin/{routes,platform}.ts`, `apps/api/src/modules/{dispatch,support,concierge,providers,orders}/service.ts`, `apps/api/src/modules/registry.ts`, `apps/api/src/platform/{scheduler,outbox}.ts`, dos `states[*].slaSeconds` das `WorkflowDefinition` e do seed. "**previsto**" = ainda não implementado.

## 1. Papéis e permissões

| Capacidade | operator | admin | Rota |
|---|---|---|---|
| Mapa, filas, detalhe da ordem (inclui PIN e `dispatch.rounds/offers`), SLAs | sim | sim | `GET /v1/ops/map`, `/orders`, `/orders/:id`, `/slas` |
| Candidatos e dispatch manual | sim | sim | `GET /v1/ops/orders/:id/candidates`, `POST .../assign` |
| Cancelamento pela plataforma | sim | sim | `POST /v1/ops/orders/:id/cancel` |
| Incidentes (listar, resolver) | sim | sim | `GET /v1/ops/incidents`, `POST /v1/ops/incidents/:id/resolve` |
| Disputas (listar, resolver) | sim | sim | `GET /v1/ops/disputes`, `POST /v1/ops/disputes/:id/resolve` |
| Concierge `NEEDS_HUMAN` (editar e aprovar plano) | sim | sim | `POST /v1/ops/concierge/:id/approve-plan` |
| Chat de qualquer ordem (como `operator`) | sim | sim | `GET/POST /v1/orders/:id/messages` |
| Transições de sistema/operador em qualquer ordem | sim | sim | `POST /v1/orders/:id/transition` (`actorForAction`) |
| Dashboard | sim | sim | `GET /v1/admin/analytics/dashboard` |
| Catálogo, regiões, preços, comissão, matching, cupons, planos, home, banners, papéis de usuários | não | sim | `GET/PUT/DELETE /v1/admin/:resource` |
| Aprovar/rejeitar/suspender/bloquear prestador | não | sim | `POST /v1/admin/providers/:id/decision` |
| `platform_settings`, workflows, `audit_logs` | não | sim | `/v1/admin/settings`, `/workflows`, `/audit-logs` |

Login por e-mail/senha (`POST /v1/auth/password/login`; 10 tentativas/min por IP). Operador e admin viram ator `operator` nas transições e passam pelos guards de posse. Toda escrita grava `audit_logs { actor_user_id, actor_role, action, target_type, target_id, before, after, ip }`.

## 2. Filas e SLAs

`GET /v1/ops/slas` → `{ generatedAt, breached, byStatus: { [status]: { breached, total, slaSeconds, orderIds } } }`, comparando `now − updated_at` com `states[status].slaSeconds` da definição da ordem. Escalonamento automático em incidente (`sla.escalate`) é **previsto**; hoje o painel consulta a rota.

| Workflow | Estado | SLA | Ação do operador ao estourar |
|---|---|---|---|
| IMMEDIATE | REQUESTED | 30 s | `dispatch.start` não rodou: scheduler (§10.1) |
| IMMEDIATE | MATCHING / OFFERED | 600 s | Ondas lentas; ver `dispatch.rounds`; antecipar atribuição manual |
| IMMEDIATE | ACCEPTED | 900 s | Prestador não saiu: ligar; sem resposta → `POST /v1/orders/:id/transition { operator.cancel }` ou pedir ao prestador para cancelar no app (volta a `MATCHING` sem o prestador) |
| IMMEDIATE | NO_PROVIDER_FOUND | 300 s | §3 |
| SCHEDULED | SCHEDULED | 60 s | Job de matching não agendado |
| SCHEDULED | MATCHING / OFFERED | 6 h | Começa 6 h antes; a 1 h, atribuir |
| SCHEDULED | NO_PROVIDER_FOUND | 3600 s | Reagendar ou atribuir |
| QUOTE | REQUESTED | 60 s | |
| QUOTE | MATCHING / OFFERED | 3600 s | Atribuir avaliador |
| QUOTE | UNDER_REVIEW | 24 h | Cobrar orçamento; trocar avaliador |
| QUOTE | QUOTED | 48 h | Lembrar o cliente (`quote.expire` expira o orçamento) |
| QUOTE | NO_PROVIDER_FOUND | 3600 s | |
| LOGISTICS / LAUNDRY | REQUESTED | 60 s | |
| LOGISTICS / LAUNDRY | MATCHING / OFFERED | 1800 s | |
| LOGISTICS / LAUNDRY | DRIVER_ASSIGNED | 1800 s | Motorista não saiu |
| LOGISTICS / LAUNDRY | THIRD_PARTY_DONE | 3600 s | Item pronto sem coleta |
| LOGISTICS / LAUNDRY | NO_PROVIDER_FOUND | 900 s | |
| CONCIERGE | SUBMITTED | 60 s | Job `concierge.plan` não rodou |
| CONCIERGE | INTERPRETING | 120 s | Planner travou (fallback deveria ter acontecido) |
| CONCIERGE | PLAN_PROPOSED | 24 h | Cliente não aprovou |
| CONCIERGE | NEEDS_HUMAN | 1800 s | §5 |
| CONCIERGE | PLAN_APPROVED | 600 s | `concierge.quote` não gerou orçamento: ver `effect.failed` em `order_events` |
| CONCIERGE | QUOTED | 24 h | |

Fila `attention` (`GET /v1/ops/orders?attention=true`): `NO_PROVIDER_FOUND`, `NEEDS_HUMAN`, `DISPUTED` e agendados com `scheduled_for` já passado ainda em estado pré-execução. Prioridade sugerida: 1) imediatos sem prestador; 2) incidentes `HIGH`/`URGENT` abertos (`PAYMENT`, `DISPUTE`); 3) `NEEDS_HUMAN`; 4) sem prestador logística/agendados; 5) `DISPUTED`; 6) tickets `HIGH`; 7) prestadores `PENDING` (admin).

## 3. Dispatch manual (`NO_PROVIDER_FOUND`)

1. Abrir a fila; ordenar pela entrada em `NO_PROVIDER_FOUND` (`updated_at`).
2. `GET /v1/ops/orders/:id`: serviço, bairro, janela, notas, `dispatch.rounds` (ondas, raio, `candidates_count`/`eligible_count`, `outcome`, `snapshot.ranked` com `ineligibleReason`) e `dispatch.offers` (quem recebeu, `response`, tempo de resposta).
3. `GET /v1/ops/orders/:id/candidates`: ranking com o raio da última onda (20 km), `score`, `breakdown`, `eligible`, `ineligibleReason`, `displayName`, `availability`, `alreadyOffered`, `location`. Só prestadores `APPROVED` e `ONLINE`/`BUSY` aparecem; para quem está offline use `GET /v1/admin/providers` (admin) ou a lista de contatos da operação (**previsto**: incluir offline na rota).
4. Contato fora do app (telefone da operação) com os primeiros da lista.
5. Aceite por telefone → `POST /v1/ops/orders/:id/assign { providerId, note: "Aceitou por telefone às 15:42" }`: 422 se o prestador não está `APPROVED`; a API retira ofertas pendentes, executa `operator.assign` (mesmos efeitos do aceite: pré-autorização, `BUSY`, notificação, mensagem de sistema), registra `offers_received/accepted` do prestador e `audit_logs(ops.assign)`. Conflito de agenda não é verificado: confirme pelo telefone.
6. Sem prestador agora: propor novo horário pelo chat da ordem; cliente cancela sem custo (ainda `NO_PROVIDER_FOUND`) e cria agendado; ou operador cancela.
7. Nada possível: `POST /v1/ops/orders/:id/cancel { reason }` → `CANCELLED_BY_PLATFORM`, reembolso integral (`payments.refund`), notificação aos dois, `audit_logs(ops.cancel)`.
8. Resolver o incidente `NO_PROVIDER` (`POST /v1/ops/incidents/:id/resolve`) registrando a causa em `details` (**previsto**: campo de nota).

Meta do PRD: atribuição em 3 cliques a partir da fila.

## 4. Diagnóstico de `NO_PROVIDER_FOUND` recorrente

| Sintoma (`dispatch.rounds`) | Causa | Ação |
|---|---|---|
| `candidates_count = 0` em todas as ondas | Nenhum `APPROVED` + `ONLINE/BUSY` com `provider_skills` da categoria na bbox | Recrutar/aprovar; conferir `categoryIds` do onboarding |
| `candidates_count > 0`, `eligible_count = 0` | `snapshot.ranked[].ineligibleReason`: "Fora do raio" (raio do prestador < distância), "Conflito de agenda", "Prestador ocupado" | Pedir aumento de `serviceRadiusKm`; revisar ondas |
| Ofertas `EXPIRED` | Push não chega (`devices.active`, `notifications.status = FAILED`), timeout curto | Verificar `notifications`; ajustar `timeoutSeconds` da categoria |
| Ofertas `REJECTED` | Repasse baixo (prévia = 80 % do total), bairro | Revisar `price-rules`/`commission-rules` |
| Score < 0,2 | `minScore` | Revisar pesos/`minScore` em `matching-configs` |
| `outcome = EMPTY` em sequência por região | Buraco de cobertura | Recrutamento direcionado |

## 5. Concierge `NEEDS_HUMAN`

Entra aqui quando `needsHumanReview` exige (planner pediu humano, estimativa > R$ 500, > 4 tarefas, `PURCHASE`, confiança < 0,5), quando o planner falhou (plano de fallback) ou quando o cliente recusou o orçamento (`QUOTE_REJECTED → NEEDS_HUMAN`). Incidente `NEEDS_HUMAN` (MEDIUM) abre e o `ops` recebe `ops.order_needs_attention`.

1. `GET /v1/concierge/requests/:orderId` (aceita id da ordem): `rawText`, `plan` (tarefas, `dependsOnSeq`, `estimateCents`, `serviceSlug`), `requiresHumanReasons`, `clarifications`, `plannerName`.
2. Falta informação: perguntar pelo chat da ordem; respostas do cliente também podem vir por `POST /v1/concierge/requests/:id/answers` (ficam em `answers`; replanejamento automático **previsto**).
3. Ajustar o plano no editor e enviar `POST /v1/ops/concierge/:id/approve-plan { plan }` (ou sem `plan` para aprovar como está). A API zera `requiresHuman`, grava `operator_user_id`, executa `operator.approve_plan` (`NEEDS_HUMAN → PLAN_PROPOSED`) e `audit_logs(concierge.approve_plan, after.edited)`.
4. Cliente aprova o plano no app → `PLAN_APPROVED` → `concierge.quote` cria `quotes(INITIAL, provider 'platform', 24 h)` com `Σ estimateCents` (ou `estimateMaxCents`) e a ordem vai a `QUOTED`.
5. Cliente aprova o orçamento → `QUOTE_APPROVED` + `payments.authorize` com o método padrão → `customer.authorize_payment` pelo sistema → `IN_EXECUTION` → `concierge.spawnChildren` cria ordens filhas (`billedViaParent`) para tarefas com `serviceSlug` ativo e `order_tasks`. Tarefas sem serviço da plataforma (ex.: `THIRD_PARTY_SERVICE` na oficina) ficam `PENDING` e são acompanhadas pelo operador.
6. Filhas terminam → `onChildTerminal` marca tarefas `DONE`/`SKIPPED`; todas terminadas → `system.children_completed` → `COMPLETED` → captura e liquidação do pai (filhas liquidam com `provider_payout_funding` saindo de `revenue`).
7. Inviável: `POST /v1/ops/orders/:id/cancel` (nada foi cobrado antes de `QUOTE_APPROVED`).

Regra inviolável (ADR-014): a IA não cria pagamento; o operador não aprova em nome do cliente.

## 6. Disputas

Abertura pelo cliente em `COMPLETED`/`REVIEWED` (`POST /v1/orders/:id/disputes`); ordem → `DISPUTED`; `wallet.hold` move `provider_payout_cents` para `held_cents`; incidente `DISPUTE` (HIGH); prestador notificado.

### 6.1 Triagem (meta interna 48 h úteis)

1. `GET /v1/ops/orders/:id`: `events` (horários, PIN usado em `provider.start`, `evidence.added`, `custody.scanned`, `vehicle.handover`), `quotes` (adicional aprovado?), `dispatch`.
2. `GET /v1/ops/disputes`: `reason`, `description`, `evidenceUrls`.
3. Evidências do prestador: `media_evidence`, `custody_events`, `vehicle_handovers`, chat (`GET /v1/orders/:id/messages`), trilha `provider_locations` da ordem (consulta direta).
4. Ouvir o prestador pelo chat (operador entra como `operator`).

### 6.2 Matriz de decisão

| Motivo | Evidência decisiva | Decisão típica | `outcome` / `refundCents` |
|---|---|---|---|
| `NOT_DONE` | Sem `AFTER`, sem `provider.start` com PIN, trilha não chegou | Cliente | `RESOLVED_CUSTOMER` (reembolso = total cobrado quando `refundCents = 0`) |
| `NOT_DONE` com PIN e fotos coerentes | Prova de execução | Prestador | `REJECTED` |
| `POOR_QUALITY` | Fotos vs reclamação; chat | Divisão | `RESOLVED_SPLIT`, 30–50 % |
| `DAMAGE` | `BEFORE`/checklist mostram estado anterior | Cliente + incidente `SAFETY` (**previsto** no enum) | `RESOLVED_CUSTOMER` |
| `OVERCHARGE` | Existe `quotes(ADDITIONAL, APPROVED)`? | Aprovado: prestador; sem quote: diferença ao cliente | `REJECTED` ou `RESOLVED_SPLIT` |
| `OTHER` | Caso a caso | | |

### 6.3 Resolução (`POST /v1/ops/disputes/:id/resolve { outcome, refundCents, note }`)

| outcome | Reembolso efetivo | Repasse final ao prestador | Reputação |
|---|---|---|---|
| `RESOLVED_CUSTOMER` | `refundCents > 0 ? min(refundCents, cobrado) : cobrado` | `max(0, repasse original − reembolso)` (normalmente 0) | Disputa perdida pelo prestador (sem efeito automático no score além do histórico) |
| `RESOLVED_SPLIT` | `min(refundCents, cobrado)` | `repasse original − reembolso` | Neutro |
| `RESOLVED_PROVIDER` / `REJECTED` | 0 | Integral (hold liberado) | `REJECTED` → `disputesRejected90d++` do cliente |

A transição `operator.resolve_dispute` (`DISPUTED → CLOSED`) executa `payments.refund(refundCents)` (gateway ou carteira; `refunds`), `wallet.settle` em modo disputa (`releaseHold`: libera `min(held, finalPayout)` ao prestador e manda a diferença para `revenue` como `dispute_adjustment`), `reputation.recompute`; notificações `dispute_update` aos dois; incidente `DISPUTE` da ordem resolvido; `audit_logs(ops.dispute.resolve)`. `note` (3–1000) é visível às partes: neutra e factual. 409 "Contestação já resolvida" em repetição.

## 7. Incidentes (`incidents`)

| kind | Origem | Severidade | Ação |
|---|---|---|---|
| `NO_PROVIDER` | efeito `ops.alert:no_provider` | HIGH | §3 |
| `NEEDS_HUMAN` | `ops.alert:needs_human` | MEDIUM | §5 |
| `DISPUTE` | `ops.alert:dispute` | HIGH | §6 (resolvido automaticamente com a disputa) |
| `PAYMENT` | `payments/service.ts`: "Ordem concluída sem pagamento autorizado", "Falha na captura do pagamento", "Falha no reembolso" (HIGH), "Taxa de cancelamento não cobrada" (MEDIUM) | HIGH/MEDIUM | Verificar `payment_intents.failure_*`; contatar cliente para novo método; **não** marcar resolvido sem `CAPTURED` ou perda registrada; segurar o repasse manualmente antes do `payout.batch` (ver 13 §17) |
| `SLA_BREACH`, `WEBHOOK_FAILURE`, `JOB_BACKLOG`, `SAFETY` | **previstos** | | Protocolo de segurança: contato imediato, `SUSPEND` preventivo, relato, jurídico/seguro, DPO se houver dado exposto |

Ciclo: `OPEN → RESOLVED` (`POST /v1/ops/incidents/:id/resolve`, grava `assignee_user_id`). Métrica: tempo até `RESOLVED` por `kind`.

## 8. Prestadores (admin)

### 8.1 Decisão (`POST /v1/admin/providers/:id/decision { decision, reason? }`)

| Decisão | Efeito no código | Checklist humano antes de decidir |
|---|---|---|
| `APPROVE` | 422 sem nenhum documento; todos os `PENDING` → `VERIFIED`; `status = APPROVED`, `verified_at` | `ID_FRONT` + `ID_BACK` legíveis e no nome de `legal_name`; `SELFIE` compatível; `document_masked` coerente; `PROOF_OF_ADDRESS` na cidade; `CNPJ_CARD` ativo quando CNPJ; `DRIVER_LICENSE` válida para `automotivo`/`entregas`; `CERTIFICATE` (NR-10, PMOC) eleva `provider_skills.level` para 0,8/1,0 (ajuste manual no banco até existir rota); entrevista curta para categorias com acesso à residência. O código não distingue tipos de documento: a conferência é responsabilidade do admin |
| `REJECT` | `PENDING` → `REJECTED` com `reason`; status permanece `PENDING`; prestador reenvia | Motivo claro |
| `SUSPEND` | `status = SUSPENDED`, `availability = OFFLINE` | 3 cancelamentos pós-aceite em 30 d; nota < 4,0 com ≥ 10 avaliações; disputa `DAMAGE` perdida. Ofertas pendentes **não** são retiradas automaticamente (**previsto**): verificar `dispatch_offers PENDING` do prestador |
| `BLOCK` | `status = BLOCKED`, `OFFLINE` | Fraude, segurança, contato fora do app reiterado |

Auditoria: `admin.providers.{approve|reject|suspend|block}` com `before.status`/`after.status`.

### 8.2 Listas

`GET /v1/admin/providers` (200 mais recentes com documentos e saldo) para a fila `PENDING`; `GET /v1/admin/users` (papéis, status, `lastSeenAt`); `PUT /v1/admin/users { id, roles }` para criar operadores (o usuário precisa existir: criado via seed ou OTP; senha só via seed hoje — rota de definição de senha **prevista**).

## 9. Configuração sem código (admin)

`PUT /v1/admin/:resource` com validação Zod; efeito imediato; `audit_logs(admin.{resource}.upsert)`.

| Recurso | Schema | Campos-chave | Efeito / cuidados |
|---|---|---|---|
| `categories` | `UpsertCategoryInput` | `slug`, `name`, `icon`, `parentId`, `sortOrder`, `active`, `config { requiresStartPin, requiresBeforeAfterPhotos, requiresVehicle, requiresEquipment, requiresCustody, allowsAdditionalQuote, defaultServiceRadiusKm }` | `config` vira `flags` das ordens **novas**; DELETE desativa |
| `services` | `UpsertServiceInput` | `categoryId`, `slug`, `workflowKind`, `pricingModel`, preços, duração, `allowsImmediate/Scheduling`, `requires*`, `options[]`, `imageUrl`, `active`, `sortOrder` | `search_text` recalculado; aparece na home/busca na hora; DELETE desativa |
| `regions` | `UpsertRegionInput` | `name`, `city`, `state`, `bbox`, `neighborhoods`, `active` | Só influencia `price-rules` por região (endereço fora de região não é recusado) |
| `price-rules` | `UpsertPriceRuleInput` | `serviceId`, `regionId` (null = global do serviço), preços, `surgeMultiplierBps` 10000–30000, `active` | Prioridade: região > global do serviço > `services`; DELETE físico |
| `commission-rules` | `UpsertCommissionRuleInput` | `categoryId`, `regionId`, `percentBps`, `fixedCents`, `minCents`, `maxCents`, `passPaymentFeeToProvider`, `activeFrom` | **Inserir nova regra não fecha a anterior**: faça `DELETE /v1/admin/commission-rules/:id` (define `active_until = now`) antes de criar a substituta no mesmo escopo; ordens já concluídas não mudam |
| `matching-configs` | `UpsertMatchingConfigInput` | `categoryId` (null = global), `weights` (7 × 0..1), `waves` (1–6: `radiusKm`, `offerCount` 1–20, `timeoutSeconds` 15–900; `escalateToOps`; `minScore`) | Lido a cada onda; vale para a próxima onda de ordens em curso; DELETE desativa |
| `coupons` | `UpsertCouponInput` | `code`, `kind`, `value`, `minOrderCents`, `maxDiscountCents`, `validFrom/Until`, `usageLimit`, `perUserLimit`, `categoryId`, `active` | `used_count` incrementa na criação da ordem (cancelamento não devolve) |
| `plans` | `UpsertPlanInput` | `slug`, `name`, `serviceId`, `intervalMonths`, `visitsPerCycle`, `priceCents`, `benefits`, `active` | Assinaturas existentes continuam cobrando `plan.price_cents` atual na renovação (congelar preço: **previsto**) |
| `home-sections` | `UpsertHomeSectionInput` | `id`, `kind`, `title`, `subtitle`, `sortOrder`, `active`, `rules { hoursOfDay, requiresEquipmentDue, requiresActiveOrder, requiresSubscription }`, `config { serviceSlugs }` | Avaliada a cada `GET /v1/catalog/home`; seções `morning`/`today`/`evening` alternam por hora local; DELETE físico |
| `banners` | `UpsertBannerInput` (local) | `title`, `subtitle`, `imageUrl`, `deepLink`, `sortOrder`, `active` | Sem vigência por data (colunas existem, schema do admin não as expõe) |
| `settings` | `PlatformSettings` completo | `cancellation`, `offers`, `quotes`, `payouts`, `concierge`, `location`, `reviews` | Uma linha por chave; cache de 2 s; `before/after` auditados. `offers.defaultTimeoutSeconds` e `reviews.windowDays` ainda não são lidos por nenhum fluxo (ondas usam `matching_configs`; `windowDays` só define o `order.auto_close`) |
| `workflows` | `GET` | `describeWorkflow` das definições | Sobrescrita por banco (V2) |

Receita "nova categoria sem deploy": `categories` → `services` → (`price-rules`, `commission-rules`, `matching-configs` opcionais) → `home-sections.config.serviceSlugs` → aprovar prestadores com a categoria em `provider_skills`.

## 10. Runbooks técnicos

### 10.1 Jobs atrasados (`scheduled_jobs`)

Sintoma: lembretes não chegam, ofertas não expiram, matching não começa.

```sql
SELECT kind, status, count(*), min(run_at) FROM scheduled_jobs
WHERE status IN ('PENDING','RUNNING') AND run_at < now() - interval '1 minute' GROUP BY 1,2 ORDER BY 4;
SELECT id, kind, attempts, max_attempts, last_error, locked_by, locked_at FROM scheduled_jobs WHERE status = 'FAILED' ORDER BY updated_at DESC LIMIT 50;
```

1. `SCHEDULER_ENABLED=true` na instância; `SCHEDULER_INTERVAL_MS` (2000); `runDue` processa até 50 por tick.
2. `RUNNING` com `locked_at` > 10 min = instância caiu: `UPDATE scheduled_jobs SET status='PENDING', locked_by=NULL WHERE status='RUNNING' AND locked_at < now() - interval '10 minutes'`. Handlers são idempotentes (`dispatch.start` checa status; `booking.remind` checa `reminder_*_sent_at`; `payout.batch` dedupe por dia).
3. `FAILED` após `max_attempts` (5): corrigir a causa e `UPDATE ... SET status='PENDING', attempts=0`.
4. Kinds válidos: `dispatch.start`, `dispatch.wave_timeout`, `offer.expire`, `booking.remind`, `order.auto_close`, `payment.pix_timeout`, `quote.expire`, `concierge.plan`, `subscription.generate_visit`, `subscription.charge`, `payout.batch`. "Sem handler para job X" indica deploy desalinhado.
5. Backlog > 100 por > 5 min: mais instâncias com scheduler ou BullMQ (ADR-012).

### 10.2 Webhooks de pagamento (`webhook_events`)

```sql
SELECT gateway, event_type, error, count(*) FROM webhook_events WHERE processed_at IS NULL OR error IS NOT NULL GROUP BY 1,2,3 ORDER BY 4 DESC;
```

| Observação | Causa | Ação |
|---|---|---|
| 400 "Webhook inválido" nos logs, nada na tabela | Assinatura inválida ou corpo não JSON | Conferir `PAGARME_WEBHOOK_SECRET` e cabeçalho `X-Hub-Signature`; reenviar pelo painel do provedor |
| 404 "Gateway" | Provedor apontando para `/webhooks/sandbox` em produção (ou vice-versa) | Corrigir URL |
| `error = 'intent não encontrada'` | `gateway_ref` sem intent (outro ambiente, ou charge criada fora do fluxo) | Verificar ambiente; `payment.reconcile` (**previsto**) |
| `error` de handler | Bug/indisponibilidade | Corrigir; `UPDATE webhook_events SET error = NULL, processed_at = NULL WHERE id = ...` e reenviar pelo provedor (o `ON CONFLICT` absorve: apagar a linha antes) |
| Duplicados | Respondemos 5xx e o provedor reenviou | Ver 5xx da rota; duplicatas são inofensivas |

Nunca marcar intent `CAPTURED` sem confirmação no provedor; se necessário, registrar em `audit_logs`.

### 10.3 Outbox (`domain_events`)

```sql
SELECT type, count(*), min(created_at) FROM domain_events WHERE dispatched_at IS NULL GROUP BY type ORDER BY 3;
SELECT id, type, attempts, last_error FROM domain_events WHERE dispatched_at IS NULL AND attempts >= 5 ORDER BY created_at LIMIT 50;
```

1. Loop a cada `OUTBOX_INTERVAL_MS` (500 ms), 100 por rodada, 20 rodadas por `drain`. Pendentes crescendo: ver `outbox handler failed`.
2. `attempts >= 5` com `last_error` saem da varredura: corrigir e `UPDATE domain_events SET attempts = 0, last_error = NULL WHERE id IN (...)`.
3. Handlers só emitem Socket.IO (leves); trabalho pesado vai em `scheduled_jobs`.
4. Realtime sem eventos com banco ok: múltiplas instâncias sem Redis adapter (06 §8).

### 10.4 Outros

| Situação | Ação |
|---|---|
| API não sobe em produção ("Configuração inválida para produção") | Variáveis de produção (ADR-015); nunca contornar |
| Migração falhou | Corrigir SQL novo; não editar migração aplicada; PITR se necessário |
| Prestador não recebe ofertas | `status`, `availability`, `provider_skills` da categoria, `last_lat/last_lng` dentro da bbox, `service_radius_km`, `devices.active`, `notifications(FAILED)` |
| Cliente pagou PIX e nada mudou | `payment_intents` (`REQUIRES_ACTION`?), `webhook_events` por `gateway_ref`; se o provedor confirma, reenviar webhook; se passou de 15 min a ordem já foi cancelada (`pix_timeout`): orientar nova ordem e reembolso manual |
| Ordem `COMPLETED` sem repasse correto | `payment_intents` (`FAILED capture_failed`?) → incidente `PAYMENT`; `held_cents` por disputa; `wallet.settle` já lançou (13 §17): segurar o `payout.batch` do prestador até a captura |
| Efeito falhou (`order_events.type = 'effect.failed'`) | Ler `payload.effect/error`; reexecutar manualmente (ex.: notificação, `dispatch.start`) |

## 11. Indicadores operacionais diários

| Indicador | Fonte | Alvo MVP | Ação se fora |
|---|---|---|---|
| Ordens criadas / concluídas / canceladas por ator | `service_orders`, `order_events` | conclusão > 80 % | 16 §5 |
| `NO_PROVIDER_FOUND` (%, tempo na fila) | `order_events` | < 10 %; < 5 min | Recrutamento |
| Matching p50/p90 | `accepted_at − matching_started_at` | 3 / 10 min | Pesos, ondas |
| Aceite onda 1 | `dispatch_offers` | > 30 % | Preço/repasse, timeout |
| Pontualidade agendada | `ARRIVED` na janela | > 85 % | Lembretes |
| Prestadores online por hora/região | `providers`, `provider_locations` | cobertura | Incentivos |
| Incidentes abertos por `kind` e idade | `incidents` | 0 `PAYMENT` > 24 h | Escalar |
| Disputas abertas e tempo até `CLOSED` | `disputes` | < 2 %; < 48 h | Triagem |
| Falhas de pagamento por `failure_code` | `payment_intents` | < 5 % | Provedor/UX |
| Jobs atrasados, outbox pendente, webhooks com erro | §10 | 0 | Runbooks |
| Prestadores `PENDING` e tempo até decisão | `providers` | < 48 h | Capacidade |
| Tickets por tipo | `support_tickets` | < 4 h úteis 1ª resposta | Equipe |

## 12. Trilha de auditoria

| Pergunta | Consulta |
|---|---|
| Quem alterou a comissão? | `audit_logs WHERE action IN ('admin.commission-rules.upsert','admin.commission-rules.delete')` (`after`) |
| Quem atribuiu a ordem Y? | `audit_logs WHERE action='ops.assign' AND target_id=Y` + `order_events WHERE order_id=Y AND action='operator.assign'` (`payload.providerId/note`) |
| Quem cancelou pela plataforma? | `audit_logs WHERE action='ops.cancel'`; `service_orders.cancelled_by='operator'`, `cancel_reason` |
| Quem decidiu a disputa? | `disputes.resolved_by_user_id`, `audit_logs(ops.dispute.resolve)` |
| Histórico completo da ordem | `order_events ORDER BY seq` + `dispatch_rounds/offers` + `payment_intents` + `ledger_entries WHERE order_id` |
| Decisões sobre um prestador | `audit_logs WHERE target_type='provider' AND target_id=P` |
| Settings | `audit_logs(admin.settings.update)` com `before/after`; `platform_settings.updated_by_user_id` |
| Leitura de PIN por ops | **previsto** (`ops.order.view_pin`) |

`audit_logs` e `order_events` nunca são editados; `before/after` podem conter PII (acesso só admin); exportações passam pelo DPO.
