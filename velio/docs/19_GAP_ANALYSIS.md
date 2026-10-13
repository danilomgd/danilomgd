# 19 — Gap Analysis

Data: 2026-10-13. Comparação entre o **produto atual** (código no branch `claude/velio-super-app`), os **padrões do benchmark** (`02_IFOOD_FUNCTIONAL_REVERSE_ENGINEERING.md`) e o **produto desejado** (briefing do fundador e `03_PRODUCT_REQUIREMENTS_DOCUMENT.md`).

Legenda: ✅ implementado e verificado · 🟡 parcial · 🔴 ausente · ⚠️ existe, mas precisa melhorar antes de produção.

"Verificado" significa: há código no repositório, `pnpm check` (lint, typecheck, testes, build) passa, e, quando indicado, há teste automatizado ou smoke test cobrindo o comportamento. Nada aqui foi classificado só por existir uma tela ou um nome de função.

## 1. Evidências usadas

| Verificação | Resultado |
|---|---|
| `pnpm lint` (Biome, 380 arquivos) | 0 erros, 1 aviso, 1 info |
| `pnpm typecheck` (7 pacotes) | 0 erros |
| `pnpm test` | 103 testes passando: domínio 57, mobile 20, API 26 (12 cenários A–L + unitários) |
| `pnpm build` | API: `dist/server.mjs` (465 kB); web: `next build` com 24 rotas; mobile: via EAS (export web verificado pelo subagente, 3,8 MB) |
| Smoke test do bundle da API | `node dist/server.mjs` com PGlite em arquivo: `/health`, catálogo (9 categorias, 28 serviços), OTP, login admin, dashboard, home contextual, 401 sem token. Nenhum aviso no log |
| Execução em dispositivo/emulador | Não realizada nesta sessão (ambiente sem emulador) |
| Postgres real (postgres-js) | Não exercitado nesta sessão (sem daemon Docker nem Postgres). Todo o teste rodou em PGlite |

## 2. Etapas do briefing

| Etapa | Estado | Evidência / lacuna |
|---|---|---|
| 1 Auditoria do estado atual | ✅ | `01_CURRENT_STATE_AUDIT.md` |
| 2 Engenharia reversa funcional do iFood | ✅ | `02_…md`, 905 linhas, 72 funcionalidades em 4 tabelas com fontes e lacunas de fato marcadas |
| 3 Pedido → Ordem de Serviço com engine flexível | ✅ | `packages/domain/src/workflow/*`: 6 definições declarativas, guards, efeitos; `engine.test.ts` cobre os 6 fluxos; `workflow_definitions` no banco permite sobrescrita sem deploy |
| 4 Quatro superfícies | 🟡 | App cliente e app prestador (Expo, 46 arquivos de tela), `/ops` e `/admin` (Next.js, 23 páginas) existem e compilam. Nenhum deles foi executado contra a API num dispositivo ou navegador com sessão real nesta sessão; a verificação foi typecheck, build e testes de lógica |
| 5 Marketplace Engine | ✅ | 26 entidades solicitadas mapeadas em `apps/api/src/db/schema/*` (48 tabelas) e em `11_MARKETPLACE_ENGINE.md` |
| 6 Matching e dispatch | ✅ | `ProviderMatchScore` com 7 componentes, pesos por categoria em `matching_configs`, ondas, fallback para ops; cenário G cobre esgotamento e atribuição manual |
| 7 Localização | 🟡 | Lat/lng, bbox, Haversine, ETA simples, raio, política de intervalo de GPS, filtro de pings, Socket.IO por ordem. Falta: geocodificação de endereço (app usa posição atual), rotas/ETA por provedor de mapas, PostGIS |
| 8 Pagamentos | 🟡 | Porta + sandbox + Pagar.me v5; PIX, cartão tokenizado, carteira, cupom, pré-autorização → adicional aprovado → captura; ledger em dupla entrada; repasses. Cenários A, I, J, K, L. Falta: homologação com credenciais reais do provedor; crédito promocional como tabela própria (hoje via carteira do cliente) |
| 9 Lavanderia | ✅ | Workflow LAUNDRY com custódia obrigatória por `custodyCode`; cenário D verifica 4 `custody_events` e bloqueio sem scan |
| 10 Veículos | ✅ | Cadastro, handover com odômetro/checklist/fotos/PIN de confirmação, custódia pela placa; cenário E |
| 11 Ar-condicionado | ✅ | Equipamentos com intervalo de manutenção, 3 planos, visita gerada por job, home contextual `equipment_due`; cenário C |
| 12 Concierge | 🟡 | Planejador por regras (testado) e adaptador Claude com validação Zod e fallback; humano no circuito por limiares; ordens filhas; cenário F. Falta: entrada por áudio (sem endpoint de upload/transcrição), adaptador Claude não exercitado com chave real |
| 13 Segurança e confiança | 🟡 | OTP com hash e limite, JWT curto + refresh rotativo, scrypt, RBAC, posse por guards, PIN de início, fotos antes/depois, custódia, documentos do prestador com aprovação, chat sem telefone, disputas, `audit_logs`, logs com redação, sinais de risco do cliente. Falta: 2FA para ops, storage privado com URL assinada para documentos, retenção automática de localização (job), rate limit distribuído, pentest |
| 14 UX/UI | 🟡 | Design system próprio "Trilho" (tokens em `packages/ui`), 28 componentes nativos e 17 web; telas seguem o inventário. Não houve validação visual em dispositivo |
| 15 Home inteligente | ✅ | Seções configuráveis em `home_sections` com regras por hora, equipamento vencido, ordem ativa; `contextHint` só com fonte real; smoke test retornou "Boa noite" e 7 seções |
| 16 Reputação | ✅ | Reviews só após conclusão, uma por lado, média ponderada por recência, taxas de aceite/cancelamento, sinais internos do cliente não exibidos |
| 17 Comunicação | 🟡 | Chat por ordem, mensagens de sistema, suporte via conversa `CUSTOMER_SUPPORT`. Falta: anexos de imagem com upload real (hoje por URL) |
| 18 Notificações | 🟡 | 16 tipos, in-app persistido, porta de push com adaptador de memória testado. Falta: adaptador Expo Push real e SMS real (Twilio) |
| 19 Analytics | ✅ | 36 eventos tipados, ingestão em lote, track por transição, dashboard com GMV, pedidos, ticket médio, take rate, cancelamentos, matching, chegada, rating, repeat rate |
| 20 Arquitetura | ✅ | Modular monolith, TypeScript ponta a ponta, 17 ADRs, fronteiras por módulo (serviços, não tabelas) |
| 21 Documentação | ✅ | 19 documentos numerados + ADRs (7 mil linhas) |
| 22 Implementação incremental com lint/typecheck/tests/build | ✅ | Ordem seguida: fundações → auth → banco → engine → catálogo → solicitação → matching → ordem → pagamentos → realtime → mapas → chat → notificações → prestadores → ops → avaliações → assinaturas → concierge. `pnpm check` verde |
| 23 MVP / V1 / V2 / V3 | ✅ | `17_MVP_ROADMAP.md` |
| 24 Cenários A–L | ✅ | `apps/api/test/scenarios/*.test.ts`, 12 arquivos, validando estados, eventos, notificações, pagamentos e ledger. Frontend coberto por typecheck/build, não por teste de interface |
| 25 Gap analysis | ✅ | Este documento |

## 3. Funcionalidades do benchmark (top 15 do MVP, `02_…md` §6) versus produto atual

| # | Padrão herdado do benchmark | Estado | Observação |
|---|---|---|---|
| 1 | Matching automático com dispatch em ondas e fallback humano | ✅ | Cenários A e G |
| 2 | Checkout com faixa de preço e aceite de orçamento | ✅ | `PriceEstimate` com FIXED/HOURLY/RANGE/QUOTE; cenário J |
| 3 | Orçamento aprovado antes de qualquer cobrança adicional | ✅ | Guard `noOpenAdditionalQuote`; intent ADDITIONAL só após `APPROVED` |
| 4 | Pré-autorização e captura após conclusão | ✅ | Cenário A verifica captura e ledger |
| 5 | PIN de início e evidência fotográfica | ✅ | Guards `requiresPin`, `requiresEvidence:*`; cenário A testa PIN errado |
| 6 | Acompanhamento ao vivo com mapa e ETA | 🟡 | Realtime e política de GPS prontos; ETA por velocidade média, sem rotas reais |
| 7 | Cancelamento com janelas e penalidades graduais | ✅ | `customerCancellation`; cenário I cobre 4 fases |
| 8 | Reembolso para a forma original com crédito em carteira | 🟡 | Reembolso via gateway e ledger prontos; crédito em carteira como opção do cliente ainda não é oferecido na UI |
| 9 | Avaliação só após serviço realizado | ✅ | Transição `customer.review` só de `COMPLETED` |
| 10 | Comunicação mascarada | ✅ | Chat sem telefone; oferta mostra bairro, não endereço |
| 11 | Reputação com taxas de aceite e cancelamento | ✅ | `provider_stats`, penalidade no cancelamento; cenário H |
| 12 | Painel operacional com filas e atribuição manual | ✅ | `/ops` com mapa, filas e drawer de candidatos; endpoint `assign` testado |
| 13 | Configuração sem código (categorias, preços, comissão, pesos) | ✅ | `/admin` com 12 recursos validados por Zod; seed demonstra |
| 14 | Agendamento com lembretes e confirmação | ✅ | Cenário B: matching 6 h antes, lembretes 24 h e 1 h |
| 15 | Assinaturas com visitas recorrentes | ✅ | Cenário C |

## 4. Requisitos funcionais do PRD por superfície (resumo)

| Superfície | ✅ | 🟡 | 🔴 | Principais lacunas |
|---|---|---|---|---|
| Cliente (RF-C, 62) | 48 | 10 | 4 | Áudio no Concierge, upload de fotos com URL assinada, geocodificação de endereço, favoritos de prestador, compartilhar acompanhamento |
| Prestador (RF-P, 36) | 30 | 5 | 1 | Documentos com URL assinada, navegação embutida (hoje abre Waze/Google/Apple), relatório fiscal |
| Operação (RF-O, 15) | 14 | 1 | 0 | Polígonos de região (hoje bbox) |
| Admin (RF-A, 20) | 19 | 1 | 0 | Ordenação da home por arrastar (hoje subir/descer) |

Contagens feitas a partir do inventário de rotas, telas e testes; detalhe por requisito no PRD, coluna "Status" a ser mantida pelo time.

## 5. ⚠️ Pontos que existem mas precisam melhorar antes de produção

| Item | Risco | Ação recomendada |
|---|---|---|
| Caminho Postgres real (`postgres-js`, `for update`) nunca executado | Alto: diferenças entre PGlite e Postgres em locks, `returning` e tipos | Subir Postgres 16 em staging, rodar `pnpm test` com `DATABASE_URL` apontando para um banco de teste, antes de qualquer deploy |
| Efeitos pós-commit sem compensação | Médio: uma transição pode ser gravada e um efeito (ex.: captura) falhar; gera `effect.failed`, não desfaz | Criar job de reprocessamento de `effect.failed` e alerta no painel ops; documentar em runbook |
| Adaptador Pagar.me não homologado | Alto para receita | Homologação completa em sandbox do provedor (`13_PAYMENT_ARCHITECTURE.md`, checklist) |
| Push e SMS reais ausentes | Alto para operação | Adaptadores Expo Push e Twilio (portas já existem) |
| Uploads de mídia | Médio | Endpoint de URL assinada (S3/R2/Supabase Storage) e migração do app para enviar arquivo em vez de URL |
| Socket.IO em processo único | Médio ao escalar | Adaptador Redis quando houver 2+ instâncias |
| Retenção de `provider_locations` (30 dias) não automatizada | LGPD | Job diário de expurgo |
| `offer.expire` registrado mas não usado (fluxo usa `dispatch.wave_timeout`) | Baixo | Remover ou usar |
| Fontes Inter/JetBrains não embutidas no app | Baixo | `expo-font` com arquivos OFL |
| Testes de interface inexistentes (web e mobile) | Médio | Playwright no web (login, dispatch manual) e Detox/Maestro no mobile para os 3 fluxos críticos |
| Sem teste de carga | Médio | k6 para criação de pedido e aceite concorrente (`18_TEST_PLAN.md`) |

## 6. 🔴 Ausente (consciente, fora do MVP)

| Item | Versão planejada |
|---|---|
| Entrada por áudio no Concierge com transcrição | V1 |
| Geocodificação e autocompletar de endereço | V1 |
| Rotas e ETA por provedor de mapas | V1 |
| Terceiros (oficina, lavanderia) como prestadores parceiros com agenda e preço | V2 |
| Polígonos de região e zonas | V1 |
| 2FA para operação e administração | V1 |
| Nota fiscal / integração fiscal do prestador | V2 |
| Programa de fidelidade e crédito promocional como produto | V2 |
| Multi-moeda e multi-país | V3 |
| App web do cliente | V2 |

## 7. Conclusão

As fundações pedidas estão de pé e verificadas por testes: engine de workflow declarativa, matching configurável, pagamentos por porta com ledger, outbox e scheduler, quatro superfícies compilando contra um único contrato tipado. O MVP operacional (cliente + prestador + ordem + matching + pagamento + acompanhamento + avaliação + admin) está implementado em código real, sem mocks de produção, com os 12 cenários automatizados.

O que separa este estado de um lançamento é integração com o mundo externo, não arquitetura: Postgres real em staging, homologação do gateway, push e SMS reais, uploads com URL assinada e validação em dispositivo. Esses itens estão em ⚠️ e §6, com versão alvo definida no `17_MVP_ROADMAP.md`.
