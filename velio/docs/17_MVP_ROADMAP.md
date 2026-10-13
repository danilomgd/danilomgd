# 17 — Roadmap: MVP, V1, V2, V3

Baseado no que já existe em código (`packages/contracts`, `packages/domain`, schema Drizzle, adaptadores, outbox, scheduler, cliente tipado, os 17 módulos em `apps/api/src/modules/*`, o harness e os cenários A–D em `apps/api/test`) e no `03_PRODUCT_REQUIREMENTS_DOCUMENT.md §12–14`. "Fundação pronta" = domínio, contratos, schema e módulo da API já suportam; "UI" = telas em `apps/mobile`/`apps/web` (em construção). Lacunas pontuais dos módulos estão listadas em `18_TEST_PLAN.md §8`.

## 1. Escopo por release e funcionalidade

Critério de pronto (DoD) comum a toda linha marcada MVP: caminho UI → API → regra → banco → evento/realtime → retorno → erro tratado (ADR-015); teste de integração verde; sem mock em produção; textos pt-BR de `labels.ts`.

| Área | Funcionalidade | MVP | V1 | V2 | V3 | Fundação | Critério de pronto específico |
|---|---|---|---|---|---|---|---|
| Identidade | OTP por telefone (cliente e prestador), JWT 15 min + refresh rotativo | X | | | | pronta (`lib/jwt`, `otp_challenges`, `refresh_tokens`) | Login em < 30 s; `devCode` só em teste; reuso de refresh revoga cadeia |
| Identidade | Login por e-mail/senha para ops/admin (scrypt) | X | | | | pronta (`lib/password`) | Seed cria admin; `audit_logs` de login |
| Identidade | 2FA TOTP ops/admin | | X | | | — | Obrigatório para `admin` |
| Identidade | Perfil, consentimentos (`terms`, `privacy`, `marketing`, `personalization`) | X | | | | pronta (`users.consents`) | Registro com timestamp; `needsOnboarding` |
| Identidade | Exportação e exclusão de conta (LGPD) | X (manual via suporte) | X (self-service) | | | schema com `owner_user_id` | Procedimento 14 §10 executado em transação |
| Catálogo | Categorias, serviços, opções, preços por região, surge configurável | X | | | | pronta (`catalog.ts`, `estimatePrice`) | Admin cria categoria e serviço sem deploy (PRD 10.1) |
| Catálogo | Home configurável por seções e regras (hora, equipamento, ordem ativa) | X | | | | pronta (`home_sections`, seed) | `contextHint` nunca inventado |
| Catálogo | Busca textual | X (ILIKE) | X (pg_trgm) | | | `search_text` | Resultados < 300 ms |
| Catálogo | Textos de notificação administráveis | | | X | | — | |
| Cliente | Endereços, veículos, equipamentos | X | | | | pronta (`assets.ts`) | Equipamento alimenta `equipment_due` |
| Pedido | `IMMEDIATE` (encanador, eletricista, pequenos reparos, chaveiro) | X | | | | pronta (`immediateWorkflow`, módulo `orders`) | Cenário A **verde** (18 §4) |
| Pedido | `SCHEDULED` com lembretes 24 h/1 h e matching 6 h antes | X | | | | pronta (`scheduledWorkflow`, `booking.remind`, `scheduledMatchingStart`) | Cenário B **verde** |
| Pedido | Orçamento adicional em `IN_PROGRESS` com aprovação explícita | X | | | | pronta (`quotes/service.ts`, `noOpenAdditionalQuote`) | Cenário F a criar; nenhuma intent `ADDITIONAL` sem `APPROVED` |
| Pedido | `QUOTE` (visita técnica, orçamento inicial) | | X | | | pronta (`quoteWorkflow`, `quotes`) | Cenário E a criar |
| Pedido | `LOGISTICS` leva e traz com custódia e handover de veículo | | X | | | pronta (`logisticsWorkflow`, `custodyScan`, `vehicleHandover`) | Cenário G a criar |
| Pedido | `LAUNDRY` com QR por saco | | X | | | pronta (`laundryWorkflow`, `requiresCustody`) | Cenário D **verde** |
| Pedido | `CONCIERGE` com `RuleBasedPlanner` → `NEEDS_HUMAN` | X (triagem humana) | | | | pronta (`conciergeWorkflow`, `RuleBasedPlanner`, `concierge/service.ts`) | Pedidos de padrão conhecido podem sair direto em `PLAN_PROPOSED`; admin pode forçar humano com `humanReviewAboveCents = 0` |
| Pedido | `CONCIERGE` com IA (`ClaudePlanner`), ordens filhas automáticas | | X | | | pronta (`ClaudePlanner`, `needsHumanReview`, `spawnChildren`) | Cenário H a criar; IA nunca cria pagamento |
| Pedido | Workflows sobrescritos no banco (`workflow_definitions`) | | | X | | pronta (`registerWorkflow`, tabela) | Validação `validateDefinition` no upload |
| Pedido | Reagendamento pelo cliente | | X | | | `bookings` | Sem recriar ordem |
| Matching | Score ponderado, ondas, `minScore`, fallback ops, auditoria | X | | | | pronta (`score.ts`, `waves.ts`, `dispatch/service.ts`) | Cenário J a criar; `score_breakdown` em toda oferta (A verifica 3 ofertas e aceite concorrente) |
| Matching | Pesos/ondas por categoria no admin | X | | | | pronta (`matching_configs`) | Sem deploy |
| Matching | Surge automático por demanda, taxa de deslocamento | | X | | | `surge_multiplier_bps` | Teto público |
| Matching | Níveis de prestador, lista de ordens disponíveis | | X | | | `provider_stats` | |
| Matching | PostGIS, polígonos de região | | X | | | 07 §14.1 | Migração aditiva |
| Matching | Previsão de demanda, posicionamento | | | X | | `analytics_events` | |
| Matching | Aprendizado de pesos supervisionado | | | | X | auditoria completa | Humano aprova pesos |
| Execução | PIN de início, fotos antes/depois por categoria | X | | | | pronta (guards) | 409 sem evidência |
| Execução | Localização em tempo real (`LocationPolicy`, `acceptPing`) | X | | | | pronta | Só sala da ordem em `liveLocation` |
| Execução | Chat por ordem com mensagens de sistema, mascarado | X | | | | pronta (`communication.ts`) | Fecha 48 h após conclusão |
| Execução | Ligação mascarada | | X | | | — | Provedor de telefonia |
| Pagamento | Cartão tokenizado (pré-autorização → captura), PIX antecipado com QR e timeout de 15 min, sandbox determinístico | X | | | | pronta (`PaymentGateway`, `payments/service.ts`) | A **verde**; K a criar; homologação 13 §16 antes de produção; corrigir riscos 13 §17 (settle com captura falha; reembolso de PIX em cancelamento) |
| Pagamento | Taxa de cancelamento por fase, reembolso forma original | X | | | | pronta (`customerCancellation`, `chargeCancellationFee`) | Cenário I a criar; exibido = debitado |
| Pagamento | Ledger dupla entrada, comissão por regra, repasse semanal (lote `payout.batch`, pagamento manual) | X | | | | pronta (`wallet/service.ts`) | Journals balanceados (exceto `dispute_*`); lote na quarta 03:00 UTC |
| Pagamento | Cupons | X | | | | pronta (`coupons`, `couponDiscount`) | `BEMVINDO10` |
| Pagamento | Carteira do cliente (crédito em reembolso), crédito promocional | | X | | | pronta (`wallet_accounts`, `promotions`) | |
| Pagamento | Split nativo no provedor / transferência automática de repasse | | X | | | `payouts.gateway_ref` | Parecer contábil |
| Pagamento | Chargeback automatizado, antifraude com dados completos | | X | | | `customer_risk_signals` | |
| Pagamento | Nota fiscal da comissão, gorjeta | | X | | | — | |
| Assinatura | Planos Essencial/Residencial/Premium, cobrança recorrente, geração de visitas | | X (cedo) | | | pronta (`subscriptions/service.ts`) | Cenário C **verde**; no MVP ar-condicionado só avulso (PRD §12): admin desativa planos no piloto; retentativas de cobrança a implementar |
| Reputação | Avaliação bilateral pós-conclusão, média por recência, `provider_stats` | X | | | | pronta (`reputation/service.ts`) | Uma por lado (A verifica 409); janela de 7 d a implementar |
| Reputação | Ticket automático e hold para nota ≤ 2 | X | | | | não implementado | Implementar em `createReview` |
| Suporte | Tickets, disputas com matriz e reembolso, incidentes | X | | | | pronta (`support/service.ts`) | Cenário L a criar |
| Suporte | Fundo de garantia / seguro para custódia | | X | | | — | Regras públicas |
| Prestador | Onboarding com documentos, aprovação manual, disponibilidade, agenda, folgas | X | | | | pronta (`providers.ts`) | Checklist 15 §8 |
| Prestador | Indicadores, carteira, extrato, repasses | X | | | | pronta | |
| Prestador | Empresa com equipe e atribuição interna | | X | | | — | |
| Ops | Mapa, filas, SLAs, dispatch manual, cancelamento, disputas, incidentes | X | | | | pronta (rotas `ops.*`, `slaSeconds`) | 3 cliques para atribuir |
| Admin | CRUD de configuração, aprovação de prestador, settings, dashboard | X | | | | pronta (`Upsert*Input`, `PlatformSettings`, `DashboardMetrics`) | Tudo em `audit_logs` |
| Analytics | Eventos tipados, ingestão em lote, dashboard SQL | X | | | | pronta (`analytics.ts`, `analytics_events`) | Sem PII |
| Analytics | Rollup diário, CDC para warehouse, coortes | | X | | | — | |
| Analytics | Experimentação A/B | | | X | | — | |
| Plataforma | Outbox, scheduler em Postgres, PGlite para testes | X | | | | pronta | FakeClock nos testes |
| Plataforma | Redis adapter Socket.IO, BullMQ se necessário | | X | | | previsto por config | 2+ instâncias |
| Plataforma | RLS, `*_id` uuid, criptografia de coluna | | | X | | 07 §14.2 | |
| Produto | Multi-cidade, SLAs por região | | | X | | `regions` | |
| Produto | Web do cliente | | | X (avaliar) | | — | |
| Produto | Plataforma aberta a parceiros, API pública | | | | X | — | |

## 2. O que as fundações já suportam para o futuro

| Fundação | Onde | O que destrava sem reescrita |
|---|---|---|
| Workflows declarativos (`WorkflowDefinition`, guards, efeitos por nome) | `packages/domain/workflow` | Novo tipo de serviço = nova definição (código ou `workflow_definitions`); SLAs e `providerBusy`/`liveLocation` por estado; apps renderizam qualquer estado via `ORDER_STATUS_LABELS` |
| Seis definições já validadas (`IMMEDIATE`, `SCHEDULED`, `QUOTE`, `LOGISTICS`, `LAUNDRY`, `CONCIERGE`) | idem | V1 ativa QUOTE/LOGISTICS/LAUNDRY/CONCIERGE-IA sem mudar engine; só módulos e telas |
| Pesos e ondas como dados | `matching_configs`, `DEFAULT_*` | Calibração por categoria, surge e níveis entram como componentes/parametrização |
| Porta `PaymentGateway` | `adapters/ports.ts` | Troca de provedor, split nativo, novo meio (boleto, carteira digital) sem tocar no domínio |
| Ledger em dupla entrada com `journal_id` | `ledger_entries` | Carteira do cliente, gorjeta, fundo de garantia, taxa de deslocamento são novos `kind` |
| Outbox + scheduler em Postgres | `platform/*` | Novos handlers (push, e-mail, warehouse) assinam `domain_events`; jobs novos registram `kind`; migração para BullMQ muda só o transporte |
| Contratos Zod compartilhados | `packages/contracts` | Mobile, web e API evoluem juntos; campos aditivos não quebram |
| `CategoryConfig` → `flags` congeladas | `service_categories.config`, `service_orders.flags` | Novas exigências por categoria (PIN de fim, checklist obrigatório) sem migração de ordens antigas |
| Planner como porta (`ConciergePlanner`) | `rulePlanner.ts`, `claudePlanner.ts` | Troca de modelo/provedor; áudio e imagem entram antes do planner |
| `analytics_events` tipado | `contracts/analytics.ts` | Warehouse e experimentação consomem o mesmo catálogo |
| PGlite para testes | `db/client.ts` | Cenários ponta a ponta no CI em segundos; mesma SQL de produção |
| Soft delete e `owner` em toda tabela pessoal | schema | Exclusão LGPD e RLS futura |

## 3. Plano de lançamento

### 3.1 Cidade e categorias

| Onda | Cidade / área | Categorias | Prestadores | Critério para avançar |
|---|---|---|---|---|
| 0 — piloto fechado (semanas 1–4) | São Paulo: Pinheiros, Vila Madalena, Perdizes (bbox da região seed) | `hidraulica` (visita e desentupimento), `eletrica` (visita, chuveiro), `residencial` (pequenos reparos por hora) — todas `IMMEDIATE`/`SCHEDULED` | 30 verificados manualmente (entrevista + documentos), convidados | 100 ordens concluídas, `NO_PROVIDER_FOUND` < 15 %, rating > 4,5, zero incidente `SAFETY` |
| 1 — piloto aberto (semanas 5–12) | + Vila Mariana, Moema, Itaim Bibi, Brooklin | + `ar-condicionado` avulso (`ac-limpeza`, `ac-manutencao`), `assistencia` (chaveiro, dedetização) | 80 ativos | Métricas MVP do PRD §10 (GMV R$ 150 mil/mês, matching p50 3 min) |
| 2 — V1 (meses 4–9) | São Paulo capital inteira | + `lavanderia`, `automotivo` (lavagem, leva e traz), `entregas`, `concierge` com IA, assinaturas de ar-condicionado | 500 ativos | Métricas V1 |
| 3 — V2 (meses 10–18) | + 2 cidades (Campinas, Rio de Janeiro ou Belo Horizonte, por densidade de MEI e demanda) | Todas por configuração | — | 3 cidades |

Justificativas: São Paulo concentra demanda e oferta de MEI; três categorias de alta frequência e baixo risco de custódia permitem validar matching, pagamento e operação antes de bens em custódia; verificação manual (checklist 15 §8 + entrevista) compensa a ausência de antecedentes automatizados no MVP.

### 3.2 Marcos e dependências

| Marco | Entregas | Depende de | Semana (estimativa) |
|---|---|---|---|
| M0 Fundações | Monorepo, contracts, domain testado, schema + migração 0000, adaptadores, outbox/scheduler (**feito**) | — | 0 |
| M1 API núcleo | 17 módulos registrados (`registry.ts`), efeitos, jobs, harness e cenários A–D (**feito**); restam cenários E–L, testes de segurança S-01..S-18, correções de 18 §8 (PIN em `/providers/me/orders`, settle condicionado à captura, reembolso de PIX em cancelamento, webhook secret obrigatório, `document_hash` com segredo) | M0 | 1–6 |
| M2 Apps | VÉLIO (cliente): onboarding, home, pedido, acompanhamento, pagamento, chat, avaliação; VÉLIO Pro: onboarding, ofertas, execução (PIN, fotos), carteira; web `/ops` e `/admin` | M1 (contratos estáveis) | 4–10 (paralelo a M1 a partir da semana 4) |
| M3 Homologação de pagamento | Pagar.me sandbox do provedor (13 §16), webhook assinado obrigatório, repasse CSV | M1 | 7–9 |
| M4 Segurança e LGPD | Checklist 14 §13, política de privacidade, DPO, RIPD, redação de logs, serializadores por papel testados | M1 | 8–10 |
| M5 Piloto fechado | 30 prestadores aprovados, 3 bairros, suporte em horário comercial | M2, M3, M4 | 11–14 |
| M6 Piloto aberto | Lojas (EAS Submit), métricas MVP, operação 7 dias | M5 + correções | 15–22 |
| M7 V1 | QUOTE, LOGISTICS, LAUNDRY, CONCIERGE-IA, assinaturas, carteira, Redis adapter, 2FA, pentest | M6 | 23–40 |

## 4. Riscos e mitigação

| Risco | Prob. | Impacto | Mitigação | Gatilho de revisão |
|---|---|---|---|---|
| Densidade insuficiente de prestadores (frio dos dois lados) | Alta | `NO_PROVIDER_FOUND` alto, churn de cliente | Piloto fechado em 3 bairros; recrutamento antes da demanda; operador no fluxo normal; incentivo de garantia mínima semanal para os 30 primeiros | `noProviderRatePct` > 15 % por 2 semanas |
| Qualidade/segurança do prestador na residência | Média | Incidente grave, reputação | Verificação manual + entrevista; PIN; fotos; chat gravado; suspensão rápida; seguro em V1 | 1 incidente `SAFETY` |
| Homologação de pagamento atrasa | Média | Lançamento sem cartão real | Começar M3 cedo; PIX como fallback principal no piloto; adaptador já escrito | Sandbox do provedor não aprovado até semana 9 |
| Classificação fiscal da intermediação e repasse a PF | Alta | Autuação, retrabalho de ledger | Parecer contábil antes do primeiro repasse; priorizar prestadores MEI/CNPJ; split nativo em V1 | Primeiro repasse |
| Chargebacks e fraude de cliente | Média | Perda | Evidências obrigatórias; `customerRiskScore` com pré-pagamento; limite de valor para novatos | Chargeback > 1 % |
| Escopo do app (duas variantes + web) estourar prazo | Alta | Atraso M2 | Um botão principal por tela; design system pronto; `/ops` e `/admin` em tabelas simples; cortar telas não-MVP (favoritos, histórico avançado) | Burn-down semanal |
| Scheduler/outbox em processo com uma instância | Baixa | Jobs atrasados em pico | Monitor 15 §10; `SCHEDULER_INTERVAL_MS`; BullMQ/Redis em V1 | Backlog > 100 jobs |
| Dependência de IA no Concierge | Baixa (MVP sem IA) | Planos ruins | MVP: tudo em `NEEDS_HUMAN`; V1: `needsHumanReview` + fallback regras | Confiança média < 0,6 |
| LGPD (localização, documentos) | Média | Sanção, confiança | Minimização por construção; retenção 30 d; RIPD; DPO | Pedido de titular não atendido em 15 d |
| Divergências doc × código (ex.: nomes de eventos no PRD, Argon2id vs scrypt) | Média | Confusão de equipe | Esta série de documentos deriva do código; revisar 03/06/11 nos pontos listados em 18 §8 | A cada release |

## 5. Equipe mínima

| Papel | Dedicação MVP | Responsabilidades |
|---|---|---|
| Tech lead / backend (TypeScript, Postgres) | 1 integral | Módulos da API, pagamentos, dispatch, testes de cenário, deploy |
| Mobile (Expo/React Native) | 1 integral | VÉLIO e VÉLIO Pro a partir do design system; realtime; câmera/GPS |
| Full-stack web (Next.js) | 1 meio período (pode ser o backend após M1) | `/ops` e `/admin` |
| Design de produto | 1 meio período | Telas MVP (10_SCREEN_INVENTORY), textos, acessibilidade AA |
| Operação / supply | 1 integral | Recrutar, entrevistar e aprovar prestadores; plantão de dispatch manual e disputas; suporte |
| Produto (fundador) | 1 integral | Prioridade, métricas, piloto, jurídico/contábil |
| Contábil/jurídico | consultoria pontual | Fiscal da intermediação, termos, política de privacidade, DPO (pode ser externo) |

V1 adiciona: 1 backend (pagamentos/split, assinaturas), 1 mobile, 1 operador, QA.

## 6. Custos de infraestrutura estimados (mensal, faixas)

| Item | MVP piloto (≤ 2 mil ordens/mês) | V1 (≤ 20 mil ordens/mês) | Observações |
|---|---|---|---|
| Postgres gerenciado (Supabase/Neon/RDS) com PITR | R$ 150–600 | R$ 800–2.500 | Volume de `analytics_events` e `provider_locations` domina; retenção 30 d ajuda |
| API (container Node 22; Fly.io/Railway/Render) | R$ 100–400 (1–2 instâncias pequenas) | R$ 600–2.000 (2–4 instâncias) + Redis R$ 100–300 | Socket.IO exige Redis adapter com 2+ instâncias |
| Web (Vercel ou junto da API) | R$ 0–150 | R$ 150–500 | Painéis internos, tráfego baixo |
| Storage de mídia (S3/R2) + CDN | R$ 50–200 | R$ 300–1.000 | Fotos antes/depois e documentos; URLs assinadas |
| SMS OTP (Twilio/Zenvia) | R$ 150–500 (~R$ 0,10–0,25/SMS) | R$ 1.500–4.000 | Reduzir com login persistente e push |
| Push (Expo) | R$ 0 | R$ 0–300 | |
| Gateway de pagamento | % por transação (PIX ~R$ 0,50–1,00 ou ~1 %; cartão ~3–4 % + antifraude) | idem | Custo variável sobre GMV, não infra; modelar em `paymentFeeBps` |
| IA (Concierge, V1) | R$ 0 (regras) | R$ 200–1.000 | ~1–3 mil planos/mês com `max_tokens 2000` |
| Mapas/geocodificação | R$ 0–200 | R$ 300–1.500 | Geocodificação no app; rotas em V1 |
| Observabilidade (logs, métricas, erros) | R$ 0–300 | R$ 500–1.500 | |
| Lojas e EAS Build | R$ 60–150 (Apple US$ 99/ano, Google US$ 25 único) + EAS R$ 0–500 | idem | |
| Domínio, e-mail transacional, DNS/WAF (Cloudflare) | R$ 50–200 | R$ 200–800 | WAF em V1 |
| **Total aproximado** | **R$ 600–2.700/mês** | **R$ 4.700–15.000/mês** | Excluindo taxas de pagamento proporcionais ao GMV e pessoas |

Premissas: câmbio e tabelas de 2026 podem variar; reservar 20 % de margem; custos de SMS e banco são os primeiros a otimizar (login persistente, particionamento/expurgo).
