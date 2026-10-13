# 15 — Manual de Operação e Administração

Para operadores (`/ops`) e administradores (`/admin`) do painel web. Derivado das rotas `ops.*` e `admin.*` de `packages/api-client/src/api.ts`, dos schemas `Upsert*Input`, `PlatformSettings`, `ApproveProviderInput`, `ManualAssignInput`, `ResolveDisputeInput` em `packages/contracts`, dos `states[*].slaSeconds` das `WorkflowDefinition`, das tabelas `incidents`, `disputes`, `audit_logs`, `scheduled_jobs`, `domain_events`, `webhook_events` e do seed. Procedimentos de módulos ainda em implementação estão marcados **(conforme contrato)**.

## 1. Papéis e permissões

| Capacidade | operator | admin |
|---|---|---|
| Mapa, filas, detalhe da ordem (incl. PIN com auditoria) | sim | sim |
| Dispatch manual (`assign`), cancelamento pela plataforma | sim | sim |
| Disputas (resolver), incidentes (assumir/fechar), tickets | sim | sim |
| Concierge `NEEDS_HUMAN` (ajustar plano, aprovar) | sim | sim |
| Chat da ordem (entrar como `operator`) | sim | sim |
| Dashboard de métricas | sim | sim |
| Catálogo, regiões, preços, comissão, matching, cupons, planos, home, banners | não | sim |
| Aprovar/suspender/bloquear prestador | não | sim |
| `platform_settings` | não | sim |
| Usuários (papéis, bloqueio), criar operadores | não | sim |
| Ver `audit_logs` | próprio | todos |

Autenticação por e-mail e senha (`POST /v1/auth/password/login`); 2FA em V1. Toda escrita grava `audit_logs { actor_user_id, actor_role, action, target_type, target_id, before, after, ip }`. Operador e admin viram ator `operator` nas transições (`actorFrom`), o que os faz passar pelos guards de posse (`actorIsAssignedProvider`/`actorIsOrderCustomer` aceitam `operator`).

## 2. Filas e SLAs

`GET /v1/ops/slas` agrega por estado usando `states[*].slaSeconds` das definições embutidas. Quando uma ordem fica no estado além do SLA, o job `sla.escalate` (conforme contrato) abre `incidents(kind=SLA_BREACH)` e emite `ops.order_needs_attention`.

| Workflow | Estado | SLA | O que o operador faz ao estourar |
|---|---|---|---|
| IMMEDIATE | REQUESTED | 30 s | Job `dispatch.start` não rodou: verificar scheduler (§10.1) |
| IMMEDIATE | MATCHING / OFFERED | 600 s | Ondas lentas; checar `dispatch_rounds`; considerar atribuição manual antecipada |
| IMMEDIATE | ACCEPTED | 900 s | Prestador aceitou e não saiu: ligar; se não responder, `operator.cancel` + reatribuir (cancelamento pelo prestador via app devolve a `MATCHING` automaticamente) |
| IMMEDIATE | NO_PROVIDER_FOUND | 300 s | Fila prioritária (§3) |
| SCHEDULED | SCHEDULED | 60 s | Job de agendamento do matching não criado |
| SCHEDULED | MATCHING / OFFERED | 6 h | Começa 6 h antes; se chegar a 1 h antes sem aceite, atribuição manual |
| SCHEDULED | NO_PROVIDER_FOUND | 3600 s | Propor novo horário ou atribuir |
| QUOTE | REQUESTED | 60 s | idem |
| QUOTE | MATCHING / OFFERED | 3600 s | Nenhum avaliador assumiu; atribuir |
| QUOTE | UNDER_REVIEW | 24 h | Prestador não enviou orçamento: cobrar; trocar avaliador (`provider.cancel` pelo prestador ou `operator.cancel`+recriar) |
| QUOTE | QUOTED | 48 h | Cliente não decidiu: lembrete; o orçamento expira por `quote.expire` |
| QUOTE | NO_PROVIDER_FOUND | 3600 s | Fila |
| LOGISTICS / LAUNDRY | REQUESTED | 60 s | idem |
| LOGISTICS / LAUNDRY | MATCHING / OFFERED | 1800 s | Densidade de motoristas; atribuir |
| LOGISTICS / LAUNDRY | DRIVER_ASSIGNED | 1800 s | Motorista não saiu para a coleta |
| LOGISTICS / LAUNDRY | THIRD_PARTY_DONE | 3600 s | Item pronto e ninguém buscou: acionar motorista (ou outro em V1) |
| LOGISTICS / LAUNDRY | NO_PROVIDER_FOUND | 900 s | Fila |
| CONCIERGE | SUBMITTED | 60 s | Planner não acionado |
| CONCIERGE | INTERPRETING | 120 s | Planner travou (IA sem resposta → fallback regras deveria ter ocorrido): checar incidente |
| CONCIERGE | PLAN_PROPOSED | 24 h | Cliente não aprovou: lembrete |
| CONCIERGE | NEEDS_HUMAN | 1800 s | Fila do Concierge (§5) |
| CONCIERGE | PLAN_APPROVED | 600 s | Orçamento não gerado (`concierge.quote`): verificar outbox |
| CONCIERGE | QUOTED | 24 h | Cliente não decidiu |

Estados sem SLA (`EN_ROUTE`, `IN_PROGRESS`, `COMPLETED`...) são acompanhados por indicadores (§9) e pela fila `attention` (`DISPUTED`, incidentes abertos).

Filas do painel (`GET /v1/ops/orders?attention=true` + `GET /v1/ops/incidents` + `GET /v1/ops/disputes`), em ordem de prioridade:

1. `NO_PROVIDER_FOUND` imediatos (SLA 300 s)
2. `incidents` `CRITICAL`/`HIGH` abertos (pagamento, segurança, SLA)
3. `NEEDS_HUMAN` (Concierge)
4. `NO_PROVIDER_FOUND` logística e agendados
5. `DISPUTED`
6. Tickets `URGENT`/`HIGH`
7. Prestadores `PENDING` (admin)

## 3. Dispatch manual passo a passo (`NO_PROVIDER_FOUND`)

1. Abrir a fila `attention` ordenada por tempo em `NO_PROVIDER_FOUND` (`matching_started_at` mais antigo primeiro).
2. Abrir a ordem: ler serviço, endereço (bairro), janela, notas, `dispatch_rounds` (quantas ondas, raio, `eligible_count`, motivo dos inelegíveis no `snapshot`).
3. `GET /v1/ops/orders/:id/candidates`: lista ranqueada com raio dobrado, incluindo `BUSY`, `OFFLINE` e fora do raio, com `score`, `distanceKm`, `ineligibleReason`, telefone mascarado e última posição.
4. Contato fora do app (telefone/WhatsApp da operação) com os 2–3 primeiros: confirmar disponibilidade e horário.
5. Se o prestador aceitar por telefone: `POST /v1/ops/orders/:id/assign { providerId, note: "Aceitou por telefone às 15:42" }`. A transição `operator.assign` executa os mesmos efeitos do aceite (pré-autorização do pagamento, `BUSY`, notificação ao cliente, mensagem de sistema no chat); se o prestador tiver conflito de agenda ou não estiver `APPROVED`, a API devolve 409 — resolver antes (ou `force` com justificativa em `note`, conforme contrato).
6. Se ninguém puder atender agora: propor horário no chat da ordem (o operador é participante). Cliente aceita → cancelar a ordem imediata sem custo (`customer.cancel` pelo próprio cliente ou `POST /v1/ops/orders/:id/cancel` com motivo `reagendamento`) e orientá-lo a criar `SCHEDULED`; V1: botão "reagendar" converte a ordem.
7. Se nada for possível: `POST /v1/ops/orders/:id/cancel { reason }` → `CANCELLED_BY_PLATFORM`, reembolso integral automático, notificação; opcionalmente crédito de cortesia (`promotions`, V1).
8. Registrar no incidente (`NO_PROVIDER`) a causa: sem prestador na região, horário, categoria. Esse dado alimenta recrutamento (§9).

Meta do PRD: atribuição em até 3 cliques a partir da fila.

## 4. `NO_PROVIDER_FOUND` recorrente: diagnóstico

| Sintoma em `dispatch_rounds` | Causa provável | Ação |
|---|---|---|
| `candidates_count = 0` em todas as ondas | Nenhum prestador `APPROVED` + `ONLINE` com a skill na bbox | Recrutar/aprovar prestadores na região; conferir `provider_skills` da categoria |
| `candidates_count > 0`, `eligible_count = 0` | Motivos no `snapshot`: "Fora do raio" (raio do prestador menor que a distância), "Conflito de agenda", "Prestador ocupado" | Sugerir aumento de `service_radius_km`; revisar ondas da categoria |
| `eligible_count > 0`, ofertas `EXPIRED` | Prestadores não respondem | Verificar push (`devices.active`, `notifications.status`); `avg_response_seconds`; `timeoutSeconds` curto demais para a categoria |
| Ofertas `REJECTED` em massa | Preço/repasse baixo, bairro evitado | Revisar `service_price_rules`, comissão da categoria, `providerPayoutCents` exibido |
| `minScore` cortando | Prestadores com score < 0,2 | Rever pesos ou `minScore` da categoria em `matching_configs` |

## 5. Concierge `NEEDS_HUMAN`

Chega aqui quando `needsHumanReview` retorna `required`: planner pediu humano (ex.: oficina/concessionária), estimativa > `concierge.humanReviewAboveCents` (R$ 500), mais de `humanReviewAboveTasks` (4) tarefas, tarefa `PURCHASE` (`alwaysHumanForKinds`), confiança < 0,5, ou cliente recusou o orçamento (`QUOTE_REJECTED → NEEDS_HUMAN`).

1. Abrir `concierge_requests` da ordem: `raw_text`, `plan` (tarefas, dependências, estimativas), `requiresHumanReasons`, `clarifications`, `answers`, `planner_name`.
2. Se faltar informação: enviar perguntas pelo chat da ordem (ou o app já coletou `clarifications` via `POST .../answers`).
3. Ajustar o plano no editor do painel (tarefas, horários, `estimateMin/Max`, `serviceSlug` de cada tarefa) — grava `plan` e `operator_user_id` (conforme contrato).
4. Cotar terceiros quando houver (oficina, lavanderia parceira): o custo do terceiro entra como item do orçamento com nota "cobrado pela oficina; a plataforma acompanha" ou é pago diretamente pelo cliente ao terceiro (decisão por caso; PRD 13.7).
5. `operator.approve_plan` (`NEEDS_HUMAN → PLAN_PROPOSED`): o cliente recebe `plan_proposed` e aprova no app (`customer.approve_plan`), o sistema gera `quotes(INITIAL)` (`concierge.quote`) e envia (`QUOTED`).
6. Cliente aprova o orçamento → pré-autorização → `IN_EXECUTION` cria ordens filhas por tarefa (`concierge.spawnChildren`); cada filha segue seu workflow (LOGISTICS, SCHEDULED...). O operador acompanha a ordem pai pela aba "Tarefas" (`order_tasks` com `child_order_id`).
7. Se não for viável: `POST /v1/ops/orders/:id/cancel` com explicação; nada foi cobrado.

Regra inviolável (ADR-014): a IA não cria pagamento; só o cliente aprova plano e orçamento; o operador nunca aprova em nome do cliente.

## 6. Disputas

Abertura pelo cliente (`POST /v1/orders/:id/disputes`) em até 7 dias após `COMPLETED`; a ordem vai a `DISPUTED`, `wallet.hold` congela o repasse do prestador, `incidents`/realtime avisam a fila.

### 6.1 Triagem (48 h úteis, meta interna)

1. Ler `disputes.reason` e `description`, `evidence_urls` do cliente; `media_evidence` (antes/depois, checklist, custódia), `custody_events`, `vehicle_handovers`, `order_events` (horários, PIN usado), `messages` do chat, `provider_locations` da ordem (trilha).
2. Ouvir o prestador pelo chat da ordem (reaberto para operador) ou telefone; prazo de 24 h para resposta.
3. Decidir pela matriz.

### 6.2 Matriz de decisão

| Motivo | Evidência decisiva | Decisão típica | `outcome` / `refundCents` |
|---|---|---|---|
| `NOT_DONE` (não executado) | Sem `AFTER`, sem PIN de início, trilha GPS não chegou ao endereço | Cliente | `RESOLVED_CUSTOMER`, reembolso integral |
| `NOT_DONE` com PIN e fotos `AFTER` coerentes | Prova de execução | Prestador | `REJECTED`, 0 |
| `POOR_QUALITY` | Fotos `AFTER` vs reclamação; chat | Divisão (retrabalho ou parcial) | `RESOLVED_SPLIT`, 30–50 % |
| `DAMAGE` | Fotos `BEFORE` mostram estado anterior; `vehicle_handovers.checklist` | Se dano não constava antes: cliente, com acionamento do fundo/seguro (V1) acima do limite do prestador | `RESOLVED_CUSTOMER` + incidente `SAFETY` |
| `OVERCHARGE` | `quotes(ADDITIONAL)` aprovado pelo cliente existe? | Se aprovado: prestador; se cobrança sem quote: cliente pela diferença | `REJECTED` ou `RESOLVED_SPLIT` (diferença) |
| `OTHER` | Caso a caso | | |

### 6.3 Resolução

`POST /v1/ops/disputes/:id/resolve { outcome, refundCents, note }` → `operator.resolve_dispute` (`DISPUTED → CLOSED`) com efeitos `payments.refund(refundCents)`, `wallet.settle` (recalcula repasse e libera `held_cents`), `reputation.recompute`; notificação `dispute_update` para ambos; `audit_logs`. `note` (3–1000 chars) é exibida às partes: escrever de forma neutra e factual.

| outcome | Reembolso | Repasse ao prestador | Reputação |
|---|---|---|---|
| `RESOLVED_CUSTOMER` | `refundCents` (geralmente total) | 0 (estorno do `PROVIDER_EARNING`) | Conta como ordem com disputa perdida; 2 em 90 d → revisão de `SUSPEND` |
| `RESOLVED_PROVIDER` / `REJECTED` | 0 | Integral, liberado no próximo lote | `disputes_rejected_90d++` do cliente (alimenta `customerRiskScore`) |
| `RESOLVED_SPLIT` | parcial | `total − refund` recalculado por `settle` | Neutro |

Reembolso em crédito de carteira só se o cliente pedir (02 §4.4). Reincidência: cliente com 3 disputas em 90 d → `risk_score` alto → pré-pagamento obrigatório.

## 7. Incidentes operacionais (`incidents`)

| kind | Origem | Severidade padrão | Ação |
|---|---|---|---|
| `NO_PROVIDER` | `ops.alert:no_provider` | MEDIUM | §3 |
| `SLA_BREACH` | `sla.escalate` | MEDIUM/HIGH | §2 |
| `PAYMENT_FAILURE` | Captura falhou após `COMPLETED`; repasse falhou | HIGH | Verificar `payment_intents.failure_*`; aguardar `payment.reconcile` (3 tentativas); contatar cliente para novo método; nunca marcar como resolvido sem `CAPTURED` ou decisão de perda registrada |
| `WEBHOOK_FAILURE` | `webhook_events.error` | HIGH | §10.2 |
| `JOB_BACKLOG` | Monitor do scheduler | HIGH | §10.1 |
| `SAFETY` | Denúncia, dano, acidente, conflito | CRITICAL | Protocolo: contato imediato com as partes, suspender prestador preventivamente (`SUSPEND`), registrar relato, acionar jurídico/seguro; comunicar DPO se houver dado pessoal exposto |
| `OTHER` | Manual | — | |

Ciclo: `OPEN → ACK (assignee) → RESOLVED` com `details` atualizados; incidentes `CRITICAL` exigem nota de encerramento. Métrica: tempo até `ACK` e até `RESOLVED` por severidade.

## 8. Prestadores: aprovação e gestão (admin)

### 8.1 Checklist de aprovação (`POST /v1/admin/providers/:id/decision`)

| Item | Verificação | Bloqueante |
|---|---|---|
| `ID_FRONT` + `ID_BACK` | Documento legível, não vencido, nome = `legal_name` | sim |
| `SELFIE` | Rosto compatível com o documento | sim |
| CPF/CNPJ | `document_masked` coerente; unicidade garantida por `providers_document_uq` | sim |
| `PROOF_OF_ADDRESS` | Cidade/UF coerentes com `base_city/base_state` | recomendado |
| `CNPJ_CARD` | Situação ativa (consulta externa) quando CNPJ | se CNPJ |
| `DRIVER_LICENSE` | Obrigatório para categorias `automotivo`/`entregas` (leva e traz); validade e categoria | se automotivo |
| `CERTIFICATE` | NR-10 (elétrica), PMOC/refrigeração (ar-condicionado) quando exigido pela categoria | eleva `provider_skills.level` para 0,8/1,0 |
| Entrevista/vídeo | Chamada curta para categorias com acesso à residência (recomendado no lançamento) | política |
| Antecedentes | V1 (PRD 13.10) | não |

Decisões: `APPROVE` (exige identidade `VERIFIED`; grava `verified_at`), `REJECT` (`status_reason` obrigatório, prestador pode reenviar documentos), `SUSPEND` (temporário: 3 cancelamentos pós-aceite em 30 d, nota média < 4,0 com ≥ 10 avaliações, disputa `DAMAGE` perdida), `BLOCK` (definitivo: fraude, violação de segurança, contato fora do app reiterado). `SUSPEND/BLOCK` forçam `OFFLINE`, retiram ofertas pendentes e, se houver ordem ativa, o operador reatribui.

### 8.2 Níveis e limites (V1)

Três níveis públicos por score composto (02 §4.12) com teto de orçamento, ordens simultâneas, acesso a assinaturas e prioridade na onda 0. No MVP: `provider_skills.level` (0,5/0,8/1,0) é o único "nível" e é ajustado pelo admin ao verificar certificados.

## 9. Configuração sem código (admin)

Todas via `PUT /v1/admin/:resource` com validação Zod e `audit_logs`; efeito imediato (sem deploy). O app consome tudo pela API (`/v1/catalog/*`, `/v1/catalog/home`).

| Recurso | Schema | Campos-chave | Efeito |
|---|---|---|---|
| `categories` | `UpsertCategoryInput` | `slug`, `name`, `icon`, `parentId`, `sortOrder`, `active`, `config { requiresStartPin, requiresBeforeAfterPhotos, requiresVehicle, requiresEquipment, requiresCustody, allowsAdditionalQuote, defaultServiceRadiusKm }` | `config` vira `flags` das ordens **novas** da categoria (ordens em andamento mantêm as flags congeladas) |
| `services` | `UpsertServiceInput` | `categoryId`, `slug`, `workflowKind`, `pricingModel`, preços, `estimatedDurationMinutes`, `allowsImmediate/Scheduling`, `requires*`, `options[]`, `imageUrl`, `active` | Aparece na home/busca na hora; `options` com `priceDeltaCents`/`unitPriceCents` entram em `estimatePrice` |
| `regions` | `UpsertRegionInput` | `name`, `city`, `state`, `bbox`, `neighborhoods`, `active` | Endereços fora de região ativa recebem 422 na criação de ordem (lista de espera) |
| `price-rules` | `UpsertPriceRuleInput` | `serviceId`, `regionId` (null = global), preços, `surgeMultiplierBps` 10000–30000, `active` | Sobrescreve `services` para a região; surge aparece como "Ajuste de demanda" no breakdown |
| `commission-rules` | `UpsertCommissionRuleInput` | `categoryId`, `regionId`, `percentBps` 0–10000, `fixedCents`, `minCents`, `maxCents`, `passPaymentFeeToProvider`, `activeFrom` | Nova regra fecha a anterior do mesmo escopo (`active_until`); ordens já concluídas não mudam |
| `matching-configs` | `UpsertMatchingConfigInput` | `categoryId` (null = global), `weights` (7 × 0..1), `waves` (1–6 ondas: `radiusKm`, `offerCount` 1–20, `timeoutSeconds` 15–900; `escalateToOps`; `minScore`) | Vale para a próxima onda de qualquer ordem; `snapshot` da onda registra o que foi usado |
| `coupons` | `UpsertCouponInput` | `code` A–Z0–9 4–20, `kind`, `value`, `minOrderCents`, `maxDiscountCents`, `validFrom/Until`, `usageLimit`, `perUserLimit`, `categoryId`, `active` | Custo contabilizado em `PLATFORM:promo` |
| `plans` | `UpsertPlanInput` | `slug`, `name`, `serviceId`, `intervalMonths`, `visitsPerCycle`, `priceCents`, `benefits[]`, `active` | Assinaturas existentes mantêm o preço contratado (conforme contrato) |
| `home-sections` | `UpsertHomeSectionInput` | `id`, `kind`, `title`, `subtitle`, `sortOrder`, `active`, `rules { hoursOfDay[], requiresEquipmentDue, requiresActiveOrder, requiresSubscription }`, `config { serviceSlugs[] ... }` | Home muda na próxima abertura; seções com mesmo `sortOrder` e regras de hora excludentes alternam ao longo do dia (seed: `morning`/`today`/`evening`) |
| `banners` | (conforme contrato) | `title`, `subtitle`, `imageUrl`, `deepLink`, `startsAt/endsAt`, `sortOrder`, `active` | Seção `banner` da home |
| `settings` | `PlatformSettings` | `cancellation { freeMinutesAfterAccept 10, lateFeeCents 1500, enRouteFeeBps 2000, enRouteFeeMinCents 2000 }`, `offers.defaultTimeoutSeconds 90`, `quotes.additionalQuoteExpiresMinutes 60`, `payouts { cadence WEEKLY, weekday 3 }`, `concierge { humanReviewAboveCents 50000, humanReviewAboveTasks 4, alwaysHumanForKinds ['PURCHASE'] }`, `location { maxAccuracyM 100, retentionDays 30 }`, `reviews.windowDays 7` | Lido a cada uso (sem cache longo); mudanças de cancelamento valem para cancelamentos futuros |
| `workflows` | `GET` apenas no MVP | `describeWorkflow` das definições | Sobrescrita por `workflow_definitions` no banco em V2 |

Receita para "nova categoria em 10 minutos" (PRD 10.1): criar categoria (`config` conforme risco) → criar serviços com `workflowKind` existente → (opcional) `price-rules` por região e `commission-rules` → (opcional) `matching-configs` da categoria → adicionar slugs em uma `home-section` → aprovar `provider_skills` dos prestadores da categoria. Nenhum deploy.

## 10. Runbooks técnicos

### 10.1 Fila de jobs atrasada (`scheduled_jobs`)

Sintoma: lembretes não chegam, ofertas não expiram, `dispatch.start` não roda; `GET /health` ok.

```sql
SELECT kind, status, count(*), min(run_at) FROM scheduled_jobs
WHERE status IN ('PENDING','RUNNING') AND run_at < now() - interval '1 minute'
GROUP BY kind, status ORDER BY min(run_at);
SELECT id, kind, attempts, last_error, locked_by, locked_at FROM scheduled_jobs WHERE status = 'FAILED' ORDER BY updated_at DESC LIMIT 50;
```

1. `SCHEDULER_ENABLED=true` na instância que deve processar? (réplicas podem estar com `false`). Intervalo `SCHEDULER_INTERVAL_MS` (2000).
2. Jobs `RUNNING` com `locked_at` antigo (> 10 min) = instância morreu no meio: `UPDATE scheduled_jobs SET status='PENDING', locked_by=NULL WHERE status='RUNNING' AND locked_at < now() - interval '10 minutes'` (o lock é otimista; reprocessar é seguro porque handlers são idempotentes por `dedupe_key`/estado).
3. `FAILED` com `last_error` recorrente: corrigir causa; reabrir com `UPDATE ... SET status='PENDING', attempts=0` para os afetados.
4. Volume: `runDue(limit=50)` por tick; se o backlog cresce, aumentar instâncias com scheduler ou reduzir intervalo; V1 BullMQ (ADR-012).
5. Abrir `incidents(JOB_BACKLOG)` se > 100 jobs atrasados por > 5 min; alerta automático em V1.

### 10.2 Webhooks de pagamento falhando (`webhook_events`)

```sql
SELECT gateway, event_type, error, count(*) FROM webhook_events
WHERE processed_at IS NULL OR error IS NOT NULL GROUP BY 1,2,3 ORDER BY 4 DESC;
```

| `error` | Causa | Ação |
|---|---|---|
| (401 no provedor, nada na tabela) | Assinatura inválida: segredo diferente ou cabeçalho renomeado | Conferir `PAGARME_WEBHOOK_SECRET` e o nome do header; testar reenvio pelo painel do provedor |
| `intent_not_found` | `gateway_ref` sem intent (ordem criada em outro ambiente, ou corrida) | `payment.reconcile` reprocessa em 10 min; se persistir, verificar ambiente do webhook (sandbox apontando para produção) |
| erro de handler | Bug ou banco indisponível | Corrigir; `UPDATE webhook_events SET error=NULL WHERE id=...` e deixar `payment.reconcile` reprocessar |
| Duplicados crescentes | Provedor reenviando porque respondemos 5xx | Ver logs 5xx da rota; duplicatas são inofensivas |

Nunca marcar intent como `CAPTURED` manualmente sem confirmação no painel do provedor; se necessário, registrar em `audit_logs` com o id da transação.

### 10.3 Outbox acumulando (`domain_events`)

```sql
SELECT type, count(*), min(created_at) FROM domain_events WHERE dispatched_at IS NULL GROUP BY type ORDER BY 3;
SELECT id, type, attempts, last_error FROM domain_events WHERE dispatched_at IS NULL AND attempts >= 5 ORDER BY created_at LIMIT 50;
```

1. Loop do outbox roda a cada `OUTBOX_INTERVAL_MS` (500 ms), 100 eventos por rodada, até 20 rodadas por `drain`. Se `pending` cresce, verificar logs `outbox handler failed`.
2. Eventos com `attempts >= 5` e `last_error` são abandonados pelo loop (consulta exclui-os). Após corrigir o handler: `UPDATE domain_events SET attempts = 0, last_error = NULL WHERE id IN (...)`.
3. Handler lento (push externo) bloqueia o lote: handlers devem enfileirar trabalho pesado em `scheduled_jobs`, não executar inline.
4. Realtime sem eventos mas banco ok: a instância do Socket.IO pode não ser a que drena o outbox (múltiplas instâncias sem Redis adapter): ver 06 §8.

### 10.4 Outros

| Situação | Ação |
|---|---|
| API em `production` não sobe: "Configuração inválida para produção" | Falta `DATABASE_URL`, `JWT_SECRET` forte ou adaptadores de dev ativos (ADR-015). Corrigir variáveis; nunca contornar |
| Migração falhou no deploy | `drizzle` registra em `__drizzle_migrations`; corrigir SQL, não editar migração já aplicada em produção; restaurar PITR se necessário |
| Prestador não recebe ofertas | `providers.status/availability`, `provider_skills` da categoria, `last_location_at` recente, `devices.active`, `notifications.status=FAILED` |
| Cliente diz que pagou PIX e nada mudou | `payment_intents.status`, `webhook_events` por `gateway_ref`; consultar provedor; se pago e webhook perdido, reenviar pelo painel do provedor |
| Ordem presa em `COMPLETED` sem repasse | `payment_intents` `AUTHORIZED` (captura falhou) → incidente `PAYMENT_FAILURE`; ou `held_cents` por disputa |

## 11. Indicadores operacionais diários

| Indicador | Fonte | Alvo MVP | Ação se fora |
|---|---|---|---|
| Ordens criadas / concluídas / canceladas (por ator) | `service_orders` | conclusão > 80 % | Investigar fase de cancelamento (16 §5) |
| `NO_PROVIDER_FOUND` (% e tempo médio na fila) | `order_events` | < 10 %; < 5 min | Recrutamento por região/categoria |
| Tempo de matching p50/p90 | `accepted_at − matching_started_at` | 3 / 10 min | Pesos, ondas, densidade |
| Taxa de aceite onda 0 | `dispatch_offers` | > 30 % | Preço/repasse, timeout |
| Pontualidade agendada | `ARRIVED` dentro da janela | > 85 % | Lembretes, buffer de agenda |
| Prestadores online por hora e região | `providers.availability` + `provider_locations` | cobertura por bairro | Incentivos de horário |
| Incidentes abertos por severidade e idade | `incidents` | 0 `CRITICAL` > 1 h | Escalar |
| Disputas abertas e tempo até resolução | `disputes` | < 2 % das concluídas; < 48 h | Reforço de triagem |
| Falhas de pagamento (autorização, captura, PIX expirado) | `payment_intents.failure_code` | < 5 % | Provedor, UX de PIX |
| Jobs atrasados, outbox pendente, webhooks com erro | §10 | 0 | Runbooks |
| Prestadores `PENDING` e tempo até decisão | `providers` | < 48 h (p50) | Capacidade de aprovação |
| Tickets por tipo e SLA de primeira resposta | `support_tickets` | < 4 h úteis | Equipe |

## 12. Trilha de auditoria

| Pergunta | Consulta |
|---|---|
| Quem alterou a comissão da categoria X? | `SELECT * FROM audit_logs WHERE target_type='commission_rules' AND action LIKE 'admin.%' ORDER BY created_at DESC` (compara `before`/`after`) |
| Quem atribuiu manualmente a ordem Y e por quê? | `audit_logs WHERE action='ops.order.assign' AND target_id=Y` + `order_events WHERE order_id=Y AND action='operator.assign'` (payload.note) |
| Quem viu o PIN da ordem Y? | `audit_logs WHERE action='ops.order.view_pin' AND target_id=Y` |
| Histórico completo de uma ordem | `order_events WHERE order_id=Y ORDER BY seq` (imutável) + `dispatch_rounds`/`dispatch_offers` + `payment_intents` + `ledger_entries WHERE order_id=Y` |
| Decisões sobre um prestador | `audit_logs WHERE target_type='providers' AND target_id=P` |
| Mudanças de settings | `audit_logs WHERE target_type='platform_settings'` e `platform_settings.updated_by_user_id` |

Regras: `audit_logs` e `order_events` nunca são editados ou apagados; acesso aos `before/after` (podem conter PII) é restrito a admin; exportações de auditoria para terceiros passam pelo DPO.
