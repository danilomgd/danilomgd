# 03 — Product Requirements Document (PRD)

Documento de requisitos do VÉLIO. Usa o vocabulário canônico de `11_MARKETPLACE_ENGINE.md` (entidades, estados, `WorkflowKind`) e os módulos de `06_SYSTEM_ARCHITECTURE.md`. Decisões técnicas estão em `ARCHITECTURE_DECISIONS.md` e não são repetidas aqui; quando um requisito depende de uma delas, a ADR é citada.

Prioridades: **MVP** (primeira cidade, primeiras categorias), **V1** (escala em uma cidade, operação madura), **V2** (multi-cidade, novos verticais), **V3** (plataforma aberta e otimizações avançadas).

## 1. Visão

Fazer para serviços o que os marketplaces on-demand fizeram para comida e mobilidade: **pedir → acompanhar → receber → pagar → avaliar**, em cerca de três ações, com um prestador verificado, preço conhecido antes de confirmar e acompanhamento em tempo real.

O VÉLIO vende três coisas: **conveniência** (um lugar para resolver a casa e o carro), **confiança** (prestador verificado, evidências, pagamento protegido) e **tempo** (sem telefonar, negociar ou esperar sem saber). Não é um catálogo de telefones nem um classificado: a plataforma assume a ordem de serviço do início ao fim.

## 2. Problema

| Dor | Quem sente | Evidência no comportamento atual |
|---|---|---|
| Encontrar prestador é fricção: grupos de bairro, indicação, listas de telefone | Cliente | Vários contatos até alguém responder; horário incerto |
| Preço opaco e negociado na porta | Cliente | Orçamento por telefone, surpresa na hora de pagar |
| Sem acompanhamento: "ele vem ou não vem?" | Cliente | Ligações, cancelamentos silenciosos |
| Pagamento informal, sem garantia | Cliente e prestador | Transferência sem recibo; prestador sem garantia de recebimento |
| Agenda ociosa e deslocamento desperdiçado | Prestador autônomo | Dias vazios, aceite de serviço distante por falta de alternativa |
| Dependência de indicação para crescer | Prestador e pequena empresa | Sem reputação portátil, sem histórico verificável |
| Serviços recorrentes esquecidos (ar-condicionado, revisão) | Cliente | Manutenção corretiva em vez de preventiva |
| Tarefas compostas ("leve meu carro para revisão e devolva") não têm fornecedor | Cliente com veículo | Resolve pessoalmente, perde meio dia |

## 3. Público

**Clientes**: moradores de áreas urbanas, 25–55 anos, acostumados a pedir comida e transporte pelo celular, com renda que valoriza tempo acima de pequena economia. Dois recortes dominantes no MVP: residência (apartamento ou casa, frequentemente com ar-condicionado) e veículo próprio.

**Prestadores**: autônomos verificáveis (encanador, eletricista, técnico de refrigeração, diarista, lavador, motorista de leva e traz) e pequenas empresas com dois a dez profissionais (lavanderias, empresas de ar-condicionado, oficinas parceiras para o serviço de terceiro em `LOGISTICS`).

**Operação interna**: operadores de plantão (dispatch manual, incidentes, suporte) e administradores de catálogo, preço, regiões e finanças.

## 4. Proposta de valor

| Para | Promessa | Como a plataforma entrega |
|---|---|---|
| Cliente | Resolver em três ações, saber o preço antes, acompanhar tudo, pagar com segurança | Catálogo configurável com `pricingModel`, matching automático em ondas, linha do tempo por `OrderEvent`, pré-autorização e captura só em `COMPLETED` |
| Cliente com veículo | Não perder meio dia com carro | `LOGISTICS` com cadeia de custódia, odômetro, checklist e fotos |
| Cliente recorrente | Casa cuidada sem lembrar | `Subscription` → `SubscriptionVisit` → ordem `SCHEDULED` com lembrete |
| Prestador | Demanda qualificada, remuneração clara e recebimento garantido | Oferta com preço e repasse antes do aceite, ledger e `Payout` em lotes |
| Pequena empresa | Canal de aquisição com reputação acumulada | Perfil com `provider_stats`, área de atendimento e agenda |
| Operação | Controle de exceções sem código | Painel `/ops` com filas, mapa, dispatch manual e SLA |
| Negócio | Take rate sobre GMV, com custo operacional previsível | `CommissionRule` por categoria/região; nada de preço ou peso em código |

## 5. Princípios de produto

1. **Três ações para contratar.** Qualquer fluxo padrão fecha com escolha do serviço, confirmação do endereço/horário e confirmação do pedido. Tudo além disso é opcional ou pré-preenchido.
2. **Preço antes do compromisso.** O cliente vê valor (fixo, faixa ou "sob orçamento") e condições de cancelamento antes de confirmar. Nunca há cobrança sem `Quote.status = APPROVED` ou preço aceito no checkout.
3. **Estado sempre visível.** Toda ordem mostra onde está, o que vem a seguir e quem é o responsável. O rótulo pt-BR de cada status vem de `contracts`, nunca é inventado pela tela.
4. **Evidência em vez de palavra.** Fotos antes/depois, PIN, QR de custódia, odômetro e checklist quando a categoria exigir (`ServiceCategory.config`).
5. **Configuração, não código.** Categorias, serviços, preços, comissão, pesos de matching, seções da home, textos de notificação e SLAs são dados administráveis.
6. **Humano no circuito nas exceções.** `NO_PROVIDER_FOUND`, `NEEDS_HUMAN`, `DISPUTED` e incidentes sempre chegam a um operador com ação clara.
7. **Privacidade por padrão.** Telefones mascarados, localização só durante a ordem ativa, retenção definida, consentimento explícito para sugestões baseadas em dados do próprio usuário.
8. **Pouco texto, uma ação principal por tela.** Direção de design em `09_DESIGN_SYSTEM.md`.

## 6. Personas

### 6.1 Ana — cliente residencial

- 38 anos, apartamento de 3 quartos com dois aparelhos de ar-condicionado split, trabalha em regime híbrido.
- Objetivos: resolver problemas da casa sem pesquisar, não ficar presa esperando, saber quanto vai pagar.
- Frustrações: prestador que não aparece, orçamento que muda na porta, mensagens em grupo sem resposta.
- Gatilhos: vazamento na pia (imediato), ar-condicionado "cheirando mal" (agendado), plano de manutenção para não lembrar (assinatura).
- Mede sucesso por: tempo entre abrir o app e ter alguém confirmado; ausência de surpresa no valor final.

### 6.2 Bruno — cliente com veículo

- 44 anos, carro usado diariamente, agenda cheia.
- Objetivos: lavagem e revisão sem sair do trabalho; saber onde o carro está; ter registro do estado do veículo na entrega e na devolução.
- Frustrações: perder meio dia na oficina; não ter prova de arranhão prévio.
- Gatilhos: lavagem semanal (leva e traz), revisão dos 30 mil km (Concierge: "pegue meu carro amanhã às 8h, leve para revisão e devolva").
- Mede sucesso por: fotos, odômetro e checklist no `PICKED_UP` e no `DELIVERED`; aviso antes de qualquer custo extra.

### 6.3 Carlos — prestador autônomo (encanador)

- 35 anos, trabalha sozinho, agenda por mensagens, recebe por transferência.
- Objetivos: ocupar a agenda com serviços perto de casa, saber a remuneração antes de aceitar, receber sem cobrar cliente.
- Frustrações: deslocamento sem retorno, cliente que cancela na porta, esperar pagamento.
- Precisa: oferta com serviço, distância, localização aproximada, preço, repasse, duração e horário; aceite em um toque; rota; fotos e orçamento adicional simples.
- Mede sucesso por: ganhos por semana, taxa de aceite sem penalidade, repasse pontual.

### 6.4 Dona Rute — pequena empresa prestadora (lavanderia de bairro)

- Lavanderia com três funcionários e um motoboy; quer volume previsível.
- Objetivos: receber coletas da região, rastrear itens para não trocar peças de clientes, repasse consolidado.
- Frustrações: perda de peça, discussão sobre quantidade de itens, inadimplência.
- Precisa: cadeia de custódia por QR (`CustodyEvent`), múltiplos profissionais sob um perfil de empresa (V1), relatório de repasses.

### 6.5 Fernanda — operadora de plantão

- Turnos de 8 h no painel `/ops`.
- Objetivos: zero pedido parado em `NO_PROVIDER_FOUND` por mais de 10 min, incidentes resolvidos dentro do SLA, dispatch manual rápido.
- Precisa: mapa com pedidos e prestadores ONLINE, filas por prioridade, atribuição manual em três cliques, histórico (`order_events`) e chat de suporte.

### 6.6 Marcos — administrador

- Responsável por catálogo, preço, comissão, regiões e aprovação de prestadores.
- Objetivos: abrir uma nova categoria ou cidade sem deploy; calibrar pesos de matching e comissão por região; auditar quem mudou o quê (`audit_logs`).
- Precisa: editores de categoria/serviço com `workflowKind` e `pricingModel`, tabela de preços por região, `matching_configs`, `commission_rules`, planos e cupons.

## 7. Jornadas-chave

Detalhe passo a passo em `04_USER_FLOWS.md`. Aqui, a jornada em uma linha com o `WorkflowKind` e o critério de sucesso.

| Jornada | Kind | Sucesso |
|---|---|---|
| Encanador agora | `IMMEDIATE` | Prestador `ACCEPTED` em menos de 3 min (p50) e `ARRIVED` em menos de 45 min (p50) |
| Limpeza de ar-condicionado amanhã às 14h | `SCHEDULED` | Confirmação em menos de 2 h; lembretes 24 h e 1 h; chegada na janela |
| Assinar plano Residencial | `SCHEDULED` (via `Subscription`) | Primeira visita gerada e confirmada; cobrança recorrente sem falha |
| Coleta de lavanderia | `LAUNDRY` | Nenhum item sem `CustodyEvent`; devolução dentro do prazo |
| Leva e traz do carro para lavagem ou revisão | `LOGISTICS` | Fotos, odômetro e checklist em `PICKED_UP` e `DELIVERED`; aprovação explícita de qualquer adicional do terceiro |
| Concierge "pegue meu carro amanhã às 8h…" | `CONCIERGE` | Plano aprovado pelo cliente; ordens filhas concluídas; uma única cobrança consolidada |
| Orçamento adicional em execução | qualquer com `IN_PROGRESS` | Decisão do cliente em menos de 5 min; prestador nunca executa escopo não aprovado |
| Disputa pós-conclusão | qualquer `COMPLETED` | `Payout` congelado; resolução em menos de 48 h; reembolso quando devido |
| Prestador do cadastro ao primeiro repasse | — | Aprovação em menos de 48 h; primeiro `Payout` no primeiro lote após a primeira ordem |

### 7.1 Jornada 1 — Ana chama um encanador agora (`IMMEDIATE`)

| Etapa | O que Ana faz | O que a plataforma faz | Estado | Sentimento esperado |
|---|---|---|---|---|
| Descoberta | Abre o app, digita "vazamento" na busca | Retorna "Vazamento urgente" com preço fixo da região e tempo estimado | — | "Achei em segundos" |
| Decisão | Toca no serviço, confere o que inclui, toca em "Pedir agora" | Pré-preenche endereço atual e método de pagamento padrão | — | "Já sei quanto custa" |
| Confirmação | Revê o resumo e toca em "Confirmar pedido" | Cria `ServiceRequest` e `ServiceOrder`; inicia `dispatch.start` | `REQUESTED` → `MATCHING` | "Pronto, agora é esperar" |
| Espera curta | Vê a tela "Procurando um profissional" com tempo estimado | Ondas de oferta aos N melhores (`dispatch_offers`) | `OFFERED` | "Está acontecendo algo" |
| Confirmação do prestador | Recebe push "Carlos aceitou seu pedido" | Pré-autoriza cartão ou gera PIX; libera chat | `ACCEPTED` | Alívio |
| Acompanhamento | Vê o mapa com Carlos se aproximando e ETA | Localização pela sala `order:{id}`, push "chegando" | `EN_ROUTE` → `ARRIVED` | Controle |
| Início | Informa o PIN a Carlos | Valida PIN, exige fotos `BEFORE` se a categoria exigir | `IN_PROGRESS` | Segurança |
| Adicional | Recebe "Orçamento disponível: troca de sifão, R$ 60"; aprova | `Quote ADDITIONAL APPROVED` → `PaymentIntent ADDITIONAL` | `IN_PROGRESS` | "Ninguém me surpreendeu" |
| Conclusão | Vê fotos `AFTER` e o total; recebe recibo | Captura; ledger; push "Avalie" | `COMPLETED` | Satisfação |
| Avaliação | Dá 5 estrelas e marca "Pontual" | `REVIEWED`; `reputation.recompute`; oferece "Pedir de novo" | `REVIEWED` | Fecho |

### 7.2 Jornada 2 — Bruno manda o carro para revisão (`LOGISTICS` via Concierge)

| Etapa | O que Bruno faz | O que a plataforma faz | Estado |
|---|---|---|---|
| Pedido | Digita no Concierge "Pegue meu carro amanhã às 8h, leve para revisão e devolva" | `ConciergePlanner` devolve plano: retirada 8h, revisão na oficina parceira, devolução até 18h, estimativa | `SUBMITTED` → `INTERPRETING` → `PLAN_PROPOSED` |
| Aprovação do plano | Ajusta a devolução para "até 17h"; aprova | Recalcula; se acima do limiar, operador revisa (`NEEDS_HUMAN`) | `PLAN_APPROVED` → `QUOTED` |
| Aprovação do valor | Aprova o orçamento consolidado | Pré-autoriza; cria ordem filha `LOGISTICS` | `QUOTE_APPROVED` → `IN_EXECUTION` |
| Retirada | Entrega a chave ao motorista, confere fotos e odômetro no app do motorista e confirma digitalmente | `CustodyEvent` + `MediaEvidence` (fotos, odômetro, checklist) | filha: `PICKED_UP` |
| Terceiro | Recebe "A oficina sugere troca de pastilhas, R$ 380" e aprova | `Quote ADDITIONAL` na ordem filha; `PaymentIntent ADDITIONAL` | filha: `THIRD_PARTY_IN_PROGRESS` |
| Devolução | Recebe o carro, confere fotos, odômetro e checklist; confirma | `CustodyEvent`; `DELIVERED` → `COMPLETED`; captura consolidada | filha `COMPLETED`; pai `COMPLETED` |
| Avaliação | Avalia motorista e experiência | `REVIEWED` nas duas ordens | `REVIEWED` |

### 7.3 Jornada 3 — Carlos do cadastro ao primeiro repasse

| Etapa | O que Carlos faz | O que a plataforma faz | Estado do `Provider` |
|---|---|---|---|
| Cadastro | OTP, dados, documento, selfie, especialidades, área, agenda, dados de PIX | Armazena documentos em storage privado; abre item na fila de aprovação do admin | `PENDING` |
| Aprovação | Recebe push "Seu cadastro foi aprovado" | Admin aprova com `audit_logs`; perfil habilitado para matching | `APPROVED` / `OFFLINE` |
| Primeira oferta | Fica `ONLINE`; recebe oferta com distância, preço e remuneração; aceita | Guarda de concorrência; `ACCEPTED`; endereço completo liberado | `BUSY` |
| Execução | Saí → Cheguei → PIN → fotos → Concluir | Transições com guards; `COMPLETED`; ledger: bruto, comissão, líquido | `ONLINE` |
| Saldo | Vê "A liberar: R$ 128,00" e a data do próximo lote | `payout.batch` gera `Payout` no período | — |
| Repasse | Recebe push "Repasse de R$ 128,00 enviado" com comprovante | `Payout` pago via gateway; ledger movido para `paid_out` | — |

## 8. Requisitos funcionais

Formato: ID, requisito, detalhe/regra, prioridade. Requisitos marcados com (ADR-n) dependem da decisão citada.

### 8.1 App do cliente (VÉLIO) — RF-C

| ID | Requisito | Detalhe | Prio |
|---|---|---|---|
| RF-C-001 | Cadastro e login por telefone com OTP | `POST /v1/auth/otp/request` e `/verify`; código de 6 dígitos, validade 5 min, 5 tentativas; JWT 15 min + refresh rotativo (ADR-008) | MVP |
| RF-C-002 | Perfil mínimo | Nome, e-mail opcional, foto opcional, fuso horário (ADR-017), aceite de termos e política de privacidade com versão e data | MVP |
| RF-C-003 | Login sem senha em novo dispositivo | Novo OTP; dispositivos listados em `devices`; revogação remota de sessão | MVP |
| RF-C-004 | Exclusão de conta | Solicitação in-app; anonimização em 30 dias; retenção fiscal do que a lei exigir | MVP |
| RF-C-010 | Endereços | CRUD de `Address` com geocodificação, apelido (Casa, Trabalho), complemento, instruções de acesso; seleção de endereço atual na home | MVP |
| RF-C-011 | Endereço fora de área de cobertura | Mensagem clara com opção de ser avisado quando a região abrir (`regions`) | MVP |
| RF-C-012 | Veículos e equipamentos | CRUD de `Vehicle` (placa, modelo, cor, porte) e `Equipment` (tipo, BTU, marca, `lastMaintenanceAt`) | MVP |
| RF-C-020 | Home configurável | Seções vindas de `GET /v1/catalog/home` (`home_sections`), ordenadas pelo backend; nenhum tipo de seção ou categoria hardcoded | MVP |
| RF-C-021 | Home contextual por hora do dia e por dados do usuário | Regras no servidor: período do dia, ordens em andamento, equipamento sem manutenção há N meses, assinaturas; só com consentimento `personalization` ativo; nunca inferir contexto sem fonte registrada | V1 |
| RF-C-022 | Busca "O que você precisa?" | Busca por nome, sinônimos e tags de `services`; sugestões ao digitar; resultado em menos de 300 ms (p95) | MVP |
| RF-C-023 | Navegação por categorias | Árvore de `service_categories` com ícone, ordem e subcategorias | MVP |
| RF-C-024 | Detalhe do serviço | Descrição curta, o que inclui, o que não inclui, `pricingModel` e valor/faixa para a região, duração estimada, exigências (PIN, fotos), avaliações agregadas | MVP |
| RF-C-025 | Banners e conteúdos | Seção `banner` com link para serviço, categoria, plano ou conteúdo (`banners`) | V1 |
| RF-C-030 | Solicitar serviço imediato | Janela `NOW`; endereço, observações, fotos opcionais; `POST /v1/requests` cria `ServiceRequest` + `ServiceOrder` em `REQUESTED` | MVP |
| RF-C-031 | Agendar serviço | Janela com data e faixa horária disponível por região e categoria; cria ordem `SCHEDULED` com `Booking` | MVP |
| RF-C-032 | Solicitar orçamento | `QUOTE`: descrição + fotos obrigatórias; recebe `Quote(kind=INITIAL)` para aprovar ou recusar | V1 |
| RF-C-033 | Leva e traz de veículo | `LOGISTICS`: escolher veículo, local de retirada e devolução, janela, serviço de terceiro; termos de custódia | V1 |
| RF-C-034 | Coleta de lavanderia | `LAUNDRY`: quantidade estimada de itens/sacos, preferências, janela de coleta e devolução | V1 |
| RF-C-035 | Concierge em linguagem natural | Texto, áudio ou imagem; `ConciergePlan` com tarefas, janelas e estimativa; aprovar, editar ou recusar (ADR-014) | V1 |
| RF-C-036 | Resumo antes de confirmar | Serviço, endereço, horário, preço ou faixa, forma de pagamento, política de cancelamento, cupom; um botão principal "Confirmar pedido" | MVP |
| RF-C-037 | Observações e mídia na solicitação | Até 5 fotos e 1 vídeo curto; texto até 500 caracteres | MVP |
| RF-C-040 | Acompanhamento em tempo real | Linha do tempo a partir de `order_events` via sala `order:{id}`; mapa com posição do prestador em `EN_ROUTE`/`ARRIVED` (ADR-009) | MVP |
| RF-C-041 | Perfil do prestador atribuído | Nome, foto, nota, quantidade de serviços, selo de verificação; sem telefone | MVP |
| RF-C-042 | PIN de início | Exibição do PIN de 4 dígitos quando `ServiceCategory.config.requiresPin`; prestador informa para `IN_PROGRESS` | MVP |
| RF-C-043 | PIN de conclusão | Segundo PIN para `COMPLETED` quando a categoria exigir (ver pergunta aberta 13.3) | V1 |
| RF-C-044 | Aprovação de orçamento adicional | Tela com itens, valor, justificativa e fotos; ações `[RECUSAR]` `[APROVAR]`; `APPROVED` cria `PaymentIntent(kind=ADDITIONAL)` | MVP |
| RF-C-045 | Chat com prestador | Texto e imagem, mascarado, disponível de `ACCEPTED` até 24 h após `COMPLETED`; mensagens automáticas de status | MVP |
| RF-C-046 | Chat com suporte | Vinculado ou não a ordem; cria `SupportTicket` | MVP |
| RF-C-047 | Cancelamento com política visível | Antes de cancelar, mostrar custo conforme fase (`platform_settings.cancellation`); confirmar em duas etapas | MVP |
| RF-C-048 | Reagendamento | Para `SCHEDULED` antes de `EN_ROUTE`, sem custo até N horas antes (configurável) | V1 |
| RF-C-049 | Cadeia de custódia visível | Para `LOGISTICS`/`LAUNDRY`: cada `CustodyEvent` com foto, horário e responsável; QR por item | V1 |
| RF-C-050 | Métodos de pagamento | PIX, cartão tokenizado pelo SDK do gateway (nunca PAN no servidor, ADR-007), carteira, cupom, crédito promocional | MVP |
| RF-C-051 | Pré-autorização e captura | Cartão pré-autorizado em `ACCEPTED`, capturado em `COMPLETED` pelo valor final; PIX com expiração e reconciliação por webhook | MVP |
| RF-C-052 | Recuperação de pagamento falho | PIX expirado: gerar novo; cartão recusado: trocar método; prazo configurável antes de cancelar a ordem | MVP |
| RF-C-053 | Recibo e histórico financeiro | Recibo por ordem com base, adicionais, descontos, total; exportar PDF | V1 |
| RF-C-054 | Carteira do cliente | Saldo de créditos promocionais e reembolsos em carteira; uso automático no checkout com opção de desligar | V1 |
| RF-C-055 | Cupons | Campo de cupom no checkout; elegibilidade e limites validados no servidor | MVP |
| RF-C-060 | Avaliação | Nota 1–5 e comentário opcional após `COMPLETED`; tags rápidas; só uma por ordem; transição para `REVIEWED` | MVP |
| RF-C-061 | Disputa | Abrir `Dispute` até 72 h após `COMPLETED` com motivo e fotos; congela `Payout` | MVP |
| RF-C-062 | Denúncia e bloqueio de prestador | Denunciar com motivo; bloquear impede matching futuro com aquele prestador | MVP |
| RF-C-063 | Recompra do histórico | "Pedir de novo" a partir de ordem anterior: pré-preenche serviço, endereço, equipamento e, se disponível, o mesmo prestador como preferido | MVP |
| RF-C-064 | Prestadores favoritos | Marcar favorito; peso extra no matching quando ONLINE e elegível | V1 |
| RF-C-070 | Assinaturas | Listar planos (`subscription_plans`), assinar, ver próximas visitas, pausar, cancelar; visitas viram ordens `SCHEDULED` | V1 |
| RF-C-071 | Gestão de visita de assinatura | Confirmar, reagendar ou pular visita gerada por `subscription.generate_visit` | V1 |
| RF-C-080 | Notificações push e in-app | Eventos: prestador encontrado, saiu para atendimento, chegando, serviço iniciado, orçamento disponível, pagamento aprovado, serviço concluído, avalie; central de notificações com `readAt` | MVP |
| RF-C-081 | Preferências de notificação | Canal por tipo (push, SMS, in-app); transacionais não desligáveis | V1 |
| RF-C-082 | Deep links | Abrir ordem, orçamento, chat e avaliação a partir da notificação (`05_INFORMATION_ARCHITECTURE.md`) | MVP |
| RF-C-090 | Privacidade e consentimentos | Tela de consentimentos (personalização, marketing, localização em segundo plano), exportação de dados, histórico de aceites | MVP |
| RF-C-091 | Acessibilidade | Leitores de tela, tamanhos dinâmicos de fonte, contraste AA (seção 9) | MVP |
| RF-C-092 | Offline parcial | Ver últimas ordens, endereços e linha do tempo em cache; ações bloqueadas com aviso | V1 |

### 8.2 App do prestador (VÉLIO Pro) — RF-P

| ID | Requisito | Detalhe | Prio |
|---|---|---|---|
| RF-P-001 | Cadastro por OTP e escolha de tipo | Autônomo ou empresa (CNPJ); mesmo `User` pode ter perfil cliente (ADR-008) | MVP |
| RF-P-002 | Onboarding em etapas com progresso salvo | Dados pessoais, documento com foto, selfie, comprovante de endereço, dados bancários/PIX, especialidades, área, disponibilidade, termos | MVP |
| RF-P-003 | Upload de documentos para storage privado | URL assinada; status por documento (pendente, aprovado, recusado com motivo) | MVP |
| RF-P-004 | Status do perfil | `PENDING`, `APPROVED`, `SUSPENDED`, `BLOCKED`; tela de espera com previsão e motivo de recusa | MVP |
| RF-P-005 | Especialidades | Seleção de categorias/serviços habilitados; certificações opcionais por categoria | MVP |
| RF-P-006 | Área de atendimento | Regiões/bairros ou raio a partir de base; usada como filtro de candidatos | MVP |
| RF-P-007 | Disponibilidade | Alternar `OFFLINE`/`ONLINE`; `BUSY` automático com ordem ativa; `UNAVAILABLE` por folga agendada (`provider_time_off`) | MVP |
| RF-P-008 | Agenda semanal | Janelas por dia (`provider_schedules`); bloqueios por ordem aceita; visão diária e semanal | MVP |
| RF-P-010 | Receber oferta | Tela em destaque com serviço, distância, localização aproximada (bairro), preço ao cliente, remuneração, tempo estimado, horário; contagem regressiva da expiração | MVP |
| RF-P-011 | Aceitar ou recusar | `POST /v1/offers/:id/accept`; primeiro aceite vence; recusa com motivo opcional; recusas não penalizam, cancelamento após aceite sim | MVP |
| RF-P-012 | Ordem aceita | Endereço completo só após `ACCEPTED`; instruções de acesso; botão de rota para app de navegação externo | MVP |
| RF-P-013 | Transições de execução | Botões sequenciais: "Saí para o atendimento" (`EN_ROUTE`), "Cheguei" (`ARRIVED`), "Iniciar" com PIN (`IN_PROGRESS`), "Concluir" (`COMPLETED`) | MVP |
| RF-P-014 | Localização em segundo plano com política adaptativa | `LocationPolicy` (ADR-009); indicador visível; desligada fora de ordem ativa e em `OFFLINE` | MVP |
| RF-P-015 | Evidências | Fotos `BEFORE` (obrigatórias antes de `IN_PROGRESS` quando a categoria exigir) e `AFTER` (guard `requiresEvidence:AFTER` para `COMPLETED`); checklist; odômetro; assinatura digital | MVP |
| RF-P-016 | Orçamento adicional | Criar `Quote(kind=ADDITIONAL)` com itens, valor e fotos; aguardar decisão; mensagem clara de "não executar antes da aprovação" | MVP |
| RF-P-017 | Orçamento inicial (`QUOTE`) | Após `UNDER_REVIEW`, enviar `Quote(kind=INITIAL)` com validade; cliente aprova ou recusa | V1 |
| RF-P-018 | Chat com cliente | Mascarado; imagem e texto; atalhos ("Estou chegando", "Preciso de acesso ao registro") | MVP |
| RF-P-019 | Cancelamento pelo prestador | Motivo obrigatório; aviso de penalidade reputacional; ordem volta a `MATCHING` | MVP |
| RF-P-020 | Fluxo logístico | Etapas `EN_ROUTE_PICKUP` → `PICKED_UP` (QR + foto; veículo: odômetro + checklist) → `IN_TRANSIT` → `AT_DESTINATION` → `THIRD_PARTY_IN_PROGRESS` → `THIRD_PARTY_DONE` → `RETURN_PICKUP` → `RETURNING` → `DELIVERED` (QR + foto; veículo: odômetro + checklist + confirmação digital do cliente) | V1 |
| RF-P-021 | Lavanderia | Geração e leitura de QR por saco/item; contagem conferida com o cliente na coleta e na entrega | V1 |
| RF-P-022 | Ordens de assinatura | Visitas recorrentes aparecem na agenda com antecedência; preferência pelo mesmo prestador | V1 |
| RF-P-030 | Saldo e extrato | `wallet_accounts` do prestador; lançamentos (`ledger_entries`) por ordem: bruto, comissão, líquido; saldo disponível vs. a liberar | MVP |
| RF-P-031 | Repasses | Lista de `payouts` com período, valor, status e comprovante; conta de destino editável com verificação | MVP |
| RF-P-032 | Indicadores | Nota média, taxa de aceite, taxa de conclusão, cancelamentos, tempo de resposta, ganhos por período (`provider_stats`) | MVP |
| RF-P-033 | Avaliações recebidas | Lista com nota, comentário e ordem; resposta pública curta | V1 |
| RF-P-034 | Avaliar cliente | Nota interna após `COMPLETED` (uma por lado por ordem); não exibida ao cliente | V1 |
| RF-P-040 | Notificações | Nova oferta (som e vibração distintos), oferta expirada, ordem cancelada, orçamento decidido, pagamento confirmado, repasse efetuado, documento aprovado/recusado | MVP |
| RF-P-041 | Modo economia de bateria | Reduz frequência de localização quando bateria < 20 %, respeitando mínimo da `LocationPolicy` em `EN_ROUTE` | V1 |
| RF-P-042 | Offline parcial | Fila local de transições e fotos com reenvio idempotente; aviso de pendência | V1 |
| RF-P-050 | Perfil de empresa com equipe | Empresa cadastra profissionais; oferta chega à empresa e é atribuída internamente | V1 |
| RF-P-051 | Suporte ao prestador | Chat com suporte; FAQ; contestação de penalidade | MVP |

### 8.3 Painel operacional (/ops) — RF-O

| ID | Requisito | Detalhe | Prio |
|---|---|---|---|
| RF-O-001 | Login com e-mail e senha; 2FA | Argon2id; segundo fator em V1 (ADR-008); RBAC `operator` | MVP |
| RF-O-002 | Mapa operacional ao vivo | Ordens ativas por status, prestadores `ONLINE`/`BUSY`, filtros por região e categoria; sala `ops` do Socket.IO | MVP |
| RF-O-003 | Filas por exceção | `NO_PROVIDER_FOUND`, atrasos (SLA por estado), cancelamentos recentes, `DISPUTED`, pagamentos com falha, `NEEDS_HUMAN`, incidentes abertos | MVP |
| RF-O-004 | Dispatch manual | Abrir ordem → ver candidatos com score e distância (`domain/matching`) → atribuir → `ACCEPTED`; registrar motivo; prestador notificado e pode recusar em N segundos | MVP |
| RF-O-005 | Detalhe da ordem | Linha do tempo (`order_events`), participantes, pagamentos, orçamentos, evidências, custódia, chat (leitura), ações permitidas por estado | MVP |
| RF-O-006 | Ações de exceção | Cancelar pela plataforma com reembolso e crédito de cortesia; reabrir matching; estender SLA; marcar incidente | MVP |
| RF-O-007 | Incidentes | Criar `incidents` vinculados a ordem, prestador ou cliente; severidade; responsável; resolução; SLA próprio | MVP |
| RF-O-008 | Disputas | Ver evidências dos dois lados; decidir reembolso parcial/total ou manter; liberar `Payout` | MVP |
| RF-O-009 | Suporte | Fila de `support_tickets`; responder no chat; vincular a ordem; macros | MVP |
| RF-O-010 | Concierge humano no circuito | Fila `NEEDS_HUMAN` e planos acima do limiar; editar `ConciergePlan`; devolver ao cliente para aprovação | V1 |
| RF-O-011 | Prestadores | Lista com disponibilidade, ordem atual, última localização (apenas em ordem ativa), métricas; suspensão temporária com motivo | MVP |
| RF-O-012 | Pagamentos | Intenções por status; reprocessar webhook; reembolso manual com motivo; conciliação do dia | MVP |
| RF-O-013 | SLAs e alertas | Painel de SLA por estado e região; alertas: `NO_PROVIDER_FOUND` > 10 min, webhook com falha, fila de jobs atrasada | MVP |
| RF-O-014 | Auditoria | Toda ação de operador gera `audit_logs` com antes/depois | MVP |
| RF-O-015 | Comunicação em massa | Aviso para prestadores de uma região (chuva, evento) | V2 |

### 8.4 Painel administrativo (/admin) — RF-A

| ID | Requisito | Detalhe | Prio |
|---|---|---|---|
| RF-A-001 | Categorias | Árvore com slug, nome, ícone, ordem, ativo, `config` (requiresPin, requiresBeforeAfterPhotos, requiresVehicle, requiresEquipment, custody) | MVP |
| RF-A-002 | Serviços | Nome, slug, categoria, `workflowKind`, `pricingModel`, duração estimada, flags, descrição, inclui/não inclui, mídia | MVP |
| RF-A-003 | Regras de preço por região | `service_price_rules`: base, por hora, faixa, adicionais por atributo (BTU, porte do veículo, kg), vigência | MVP |
| RF-A-004 | Cidades, regiões, bairros | `regions` com polígono ou lista de bairros; ativar/desativar; horários de operação | MVP |
| RF-A-005 | Comissão | `commission_rules` por categoria/região: bps, fixo, mínimo, máximo, vigência; simulação de exemplo | MVP |
| RF-A-006 | Pesos do matching | `matching_configs` por categoria: pesos de proximidade, qualificação, reputação, disponibilidade, compatibilidade, aceite, cancelamentos; N por onda, T por onda, raios | MVP |
| RF-A-007 | Prestadores | Fila de aprovação com documentos, decisão com motivo; editar especialidades e áreas; suspender/bloquear | MVP |
| RF-A-008 | Usuários e papéis | Criar operador/admin; redefinir senha; desativar; papéis acumuláveis | MVP |
| RF-A-009 | Home configurável | `home_sections`: tipo, título, ordem, conteúdo, regra de exibição (horário, região, segmento), vigência | MVP |
| RF-A-010 | Banners e conteúdos | `banners` com imagem, destino, vigência, região | V1 |
| RF-A-011 | Planos e assinaturas | `subscription_plans` (Essencial, Residencial, Premium): preço, frequência, serviços incluídos, equipamentos cobertos; lista de `subscriptions` | V1 |
| RF-A-012 | Cupons e promoções | `coupons`, `promotions`: tipo, valor, elegibilidade, limites, vigência, região, categoria | MVP |
| RF-A-013 | SLAs | Por estado do workflow e região: tempo-alvo e escalonamento (`states[].sla`) | V1 |
| RF-A-014 | Política de cancelamento | `platform_settings.cancellation`: janela sem custo, taxa fixa, percentual de deslocamento, mínimos | MVP |
| RF-A-015 | Workflows | Visualizar definições embutidas; sobrescrever versão em `workflow_definitions` com validação (ADR-005) | V2 |
| RF-A-016 | Pagamentos e repasses | Visão de intenções, reembolsos, lotes de `payouts`; aprovar lote; exportar | MVP |
| RF-A-017 | Textos de notificação | Modelos por evento e canal com variáveis; pré-visualização | V1 |
| RF-A-018 | Feature flags e settings | `platform_settings` com histórico | MVP |
| RF-A-019 | Auditoria | Consulta a `audit_logs` por ator, entidade e período | MVP |
| RF-A-020 | Analytics | Dashboard com views SQL (ADR-013): GMV, pedidos, take rate, matching, cancelamentos, NPS | MVP |

### 8.5 Regras de negócio transversais — RN

Regras que valem em todas as superfícies e são implementadas em `packages/domain`, nunca em telas.

| ID | Regra | Fonte |
|---|---|---|
| RN-001 | Preço final = base ou orçamento aprovado + adicionais aprovados − cupom − crédito promocional; nunca negativo | 11 §5 |
| RN-002 | Comissão = `max(min, min(max, round_half_up(final × bps/10000) + fixo))`, regra mais específica vence (categoria+região > categoria > global) | 11 §5 |
| RN-003 | Repasse = final − comissão − taxa de pagamento quando configurado; centavo de divisão a favor do prestador | ADR-016 |
| RN-004 | Nenhuma cobrança adicional sem `Quote.status = APPROVED` pelo cliente | ADR-007, 11 §2.6 |
| RN-005 | Captura só em `COMPLETED`, pelo valor final; pré-autorização em `ACCEPTED` (cartão) ou PIX gerado em `ACCEPTED` | 06 §4 |
| RN-006 | `Review` só após `COMPLETED`; uma por lado por ordem | 11 §1 |
| RN-007 | `Dispute` congela `Payout` da ordem até resolução | 11 §5 |
| RN-008 | Cancelamento segue a tabela de `platform_settings.cancellation`; o cliente vê o custo antes de confirmar | 11 §4 |
| RN-009 | Cancelamento pelo prestador após `ACCEPTED` penaliza reputação e devolve a ordem a `MATCHING` automaticamente | 11 §4 |
| RN-010 | Endereço completo e chat só após `ACCEPTED`; antes, apenas bairro e distância | RNF-014 |
| RN-011 | Localização do prestador retransmitida apenas para a sala da ordem ativa; pontos com precisão > 100 m descartados | ADR-009 |
| RN-012 | Primeiro aceite vence; ofertas restantes da onda expiram | 06 §4 |
| RN-013 | Após as ondas configuradas sem aceite, a ordem vai para `NO_PROVIDER_FOUND` e aparece na fila de ops | ADR-006 |
| RN-014 | `PICKED_UP`, `AT_DESTINATION`, `RETURN_PICKUP` e `DELIVERED` exigem `CustodyEvent`; veículos exigem também odômetro e checklist em `PICKED_UP` e `DELIVERED` | 11 §2.4 |
| RN-015 | `COMPLETED` exige `MediaEvidence(AFTER)` quando a categoria exigir (`requiresEvidence:AFTER`) | 11 §3 |
| RN-016 | `IN_PROGRESS` exige PIN quando `ServiceCategory.config.requiresPin` | 06 §4 |
| RN-017 | A IA do Concierge nunca cria pagamento, captura ou repasse; planos acima de limiar exigem operador | ADR-014 |
| RN-018 | Ordem pai de Concierge conclui quando todas as filhas concluem ou são canceladas com aprovação | 11 §2.5 |
| RN-019 | Visita de assinatura gera ordem `SCHEDULED` com antecedência configurável e preferência pelo mesmo prestador | 11 §1 |
| RN-020 | Toda transição gera `OrderEvent` imutável com `seq` monotônico; o `status` materializado é derivado | ADR-005 |
| RN-021 | Pesos de matching, comissão, preços, SLAs e textos são dados; mudar qualquer um não exige deploy | ADR-006, 11 §7 |
| RN-022 | Dinheiro em centavos inteiros, BRL | ADR-016 |
| RN-023 | Sinais internos de risco do cliente só podem exigir pré-pagamento ou revisão humana; nunca negam serviço automaticamente nem são exibidos | 11 §6 |
| RN-024 | Prestador com `status` diferente de `APPROVED` nunca entra em matching; `availability` diferente de `ONLINE` idem | 11 §1 |

### 8.6 Requisitos de comunicação e notificação — RF-N

Transversais ao módulo `communication`. Canal padrão: push com cópia in-app (`notifications`); SMS apenas quando o push falha em eventos críticos.

| ID | Evento de domínio | Destinatário | Título curto | Deep link | Crítico (SMS fallback) | Prio |
|---|---|---|---|---|---|---|
| RF-N-001 | `OfferCreated` | Prestador | Nova oferta perto de você | `velio-pro://offers/{id}` | Não | MVP |
| RF-N-002 | `OrderAccepted` | Cliente | Profissional encontrado | `velio://orders/{id}` | Não | MVP |
| RF-N-003 | `OrderEnRoute` | Cliente | Saiu para o atendimento | `velio://orders/{id}` | Não | MVP |
| RF-N-004 | `ProviderNearby` (< 500 m) | Cliente | Chegando | `velio://orders/{id}` | Não | MVP |
| RF-N-005 | `OrderStarted` | Cliente | Serviço iniciado | `velio://orders/{id}` | Não | MVP |
| RF-N-006 | `QuoteCreated(ADDITIONAL)` | Cliente | Orçamento disponível | `velio://orders/{id}/quotes/{quoteId}` | Sim | MVP |
| RF-N-007 | `PaymentUpdated(PAID)` | Cliente | Pagamento aprovado | `velio://orders/{id}/receipt` | Não | MVP |
| RF-N-008 | `PaymentUpdated(FAILED)` | Cliente | Não conseguimos cobrar | `velio://orders/{id}/payment` | Sim | MVP |
| RF-N-009 | `OrderCompleted` | Cliente | Serviço concluído | `velio://orders/{id}` | Não | MVP |
| RF-N-010 | `OrderCompleted` + 30 min | Cliente | Avalie o atendimento | `velio://orders/{id}/review` | Não | MVP |
| RF-N-011 | `QuoteDecided` | Prestador | Orçamento aprovado / recusado | `velio-pro://orders/{id}` | Não | MVP |
| RF-N-012 | `OrderCancelled` | Ambos | Pedido cancelado | `velio://orders/{id}` | Sim | MVP |
| RF-N-013 | `BookingReminder` (24 h / 1 h) | Ambos | Lembrete do agendamento | `velio://orders/{id}` | Não | MVP |
| RF-N-014 | `PayoutPaid` | Prestador | Repasse enviado | `velio-pro://wallet/payouts/{id}` | Não | MVP |
| RF-N-015 | `ProviderDocumentReviewed` | Prestador | Documento aprovado / recusado | `velio-pro://onboarding/documents` | Não | MVP |
| RF-N-016 | `MessageCreated` | Destinatário | Nova mensagem | `velio://orders/{id}/chat` | Não | MVP |
| RF-N-017 | `CustodyEventRecorded` | Cliente | Item retirado / entregue | `velio://orders/{id}/custody` | Não | V1 |
| RF-N-018 | `ConciergePlanProposed` | Cliente | Seu plano está pronto | `velio://concierge/{id}` | Não | V1 |
| RF-N-019 | `SubscriptionVisitScheduled` | Cliente | Próxima visita agendada | `velio://subscriptions/{id}` | Não | V1 |
| RF-N-020 | `DisputeResolved` | Ambos | Contestação resolvida | `velio://orders/{id}/dispute` | Sim | MVP |

Regras: mensagens automáticas de status também entram no chat da ordem como mensagens de sistema (sem notificação separada); textos administráveis em V1 (RF-A-017); nenhuma notificação de marketing sem consentimento `marketing`.

## 9. Requisitos não funcionais

| ID | Área | Requisito | Meta |
|---|---|---|---|
| RNF-001 | Desempenho API | Latência de leitura | p95 < 300 ms; escrita de transição p95 < 500 ms |
| RNF-002 | Desempenho mobile | Cold start até home interativa | < 2,5 s em dispositivo intermediário; skeletons em menos de 100 ms |
| RNF-003 | Realtime | Latência evento → tela | < 2 s (p95) via outbox + Socket.IO (ADR-009) |
| RNF-004 | Matching | `dispatch.start` após `REQUESTED` | < 5 s para primeira onda |
| RNF-005 | Disponibilidade | API e realtime | 99,5 % mensal no MVP; 99,9 % em V1 com 2+ instâncias e Redis adapter |
| RNF-006 | Durabilidade | Banco | Backups PITR em produção (06 §8); nenhuma perda de `order_events` |
| RNF-007 | Consistência | Transições | Idempotência por `Idempotency-Key`; concorrência de aceite resolvida no banco; `409` com estado atual |
| RNF-008 | Segurança | Autenticação e autorização | JWT curto, refresh com hash, RBAC por papel e posse, rate limit por IP e usuário (06 §7) |
| RNF-009 | Segurança | Dados de pagamento | Nenhum PAN, CVV ou validade no servidor; tokenização no app (ADR-007) |
| RNF-010 | Segurança | Documentos de prestador | Storage privado, URL assinada com expiração < 15 min, acesso auditado |
| RNF-011 | LGPD | Base legal e consentimento | Consentimentos versionados; finalidade por dado; personalização só com opt-in |
| RNF-012 | LGPD | Minimização e retenção | `ProviderLocation` 30 dias; chat 12 meses após `CLOSED`; documentos conforme obrigação legal; anonimização em exclusão de conta |
| RNF-013 | LGPD | Direitos do titular | Exportação em até 15 dias; exclusão em até 30; registro de atendimento |
| RNF-014 | Privacidade | Mascaramento | Telefone nunca exposto entre cliente e prestador; endereço completo só após `ACCEPTED`; localização do prestador só em `EN_ROUTE`/`ARRIVED` para a ordem ativa |
| RNF-015 | Acessibilidade | Padrão | WCAG 2.1 AA: contraste, rótulos de leitor de tela, alvos de 44 pt, tamanhos dinâmicos até 200 % sem quebra |
| RNF-016 | Offline parcial | Cliente | Leitura de cache de ordens, endereços e perfil; fila de ações impossível, com aviso |
| RNF-017 | Offline parcial | Prestador | Fila local de transições e evidências com reenvio idempotente e ordenação por `seq` |
| RNF-018 | Bateria e GPS | Prestador | `LocationPolicy`: 3 s < 500 m do destino, 10 s em deslocamento, 60 s ocioso ONLINE, nada OFFLINE; consumo alvo < 5 %/h em deslocamento |
| RNF-019 | Precisão de localização | Servidor | Descartar pontos com precisão > 100 m; deduplicar < 5 m |
| RNF-020 | Observabilidade | Logs e métricas | Logs estruturados sem PII sensível; métricas por endpoint e job; alertas iniciais (06 §9) |
| RNF-021 | Auditoria | Ops e admin | `audit_logs` com ator, entidade, antes/depois, IP |
| RNF-022 | Internacionalização | Idioma e moeda | pt-BR e BRL únicos no MVP; strings centralizadas para V2 |
| RNF-023 | Compatibilidade | Mobile | iOS 15+ e Android 9+; web `/ops` e `/admin` em Chrome, Edge, Safari e Firefox atuais |
| RNF-024 | Testabilidade | Automação | Testes de domínio (workflow, matching, pricing) sem I/O; integração em PGlite (ADR-004); e2e por fluxo crítico |
| RNF-025 | Sem mock em produção | Adaptadores | ADR-015: adaptadores de desenvolvimento abortam com `NODE_ENV=production` |

## 10. Métricas de sucesso

| Métrica | Definição | Meta MVP (mês 3) | Meta V1 (mês 9) |
|---|---|---|---|
| GMV | Soma do preço final de ordens `COMPLETED` no período, em centavos BRL | R$ 150 mil/mês | R$ 1 milhão/mês |
| Pedidos | Ordens criadas (`REQUESTED`/`SCHEDULED`/`SUBMITTED`) | 1.200/mês | 8.000/mês |
| Taxa de conclusão | `COMPLETED` / ordens criadas | > 80 % | > 88 % |
| Ticket médio | GMV / ordens `COMPLETED` | R$ 150 | R$ 170 |
| Take rate | Comissão / GMV | 18–22 % | 18–22 % |
| Repeat rate | Clientes com 2+ ordens em 90 dias / clientes com 1+ | > 35 % | > 45 % |
| Tempo de matching | `REQUESTED` → `ACCEPTED` (p50 / p90) | 3 min / 10 min | 2 min / 6 min |
| Tempo até chegada | `ACCEPTED` → `ARRIVED` para `IMMEDIATE` (p50) | 45 min | 35 min |
| Pontualidade agendada | `ARRIVED` dentro da janela em `SCHEDULED` | > 85 % | > 92 % |
| `NO_PROVIDER_FOUND` | Ordens que caíram para ops / ordens | < 10 % | < 4 % |
| Cancelamento pelo prestador após aceite | Ordens `CANCELLED_BY_PROVIDER` / `ACCEPTED` | < 5 % | < 2 % |
| Cancelamento pelo cliente após aceite | `CANCELLED_BY_CUSTOMER` após `ACCEPTED` / `ACCEPTED` | < 8 % | < 5 % |
| Disputas | `DISPUTED` / `COMPLETED` | < 2 % | < 1 % |
| Rating médio | Média de `reviews` do período | > 4,6 | > 4,7 |
| NPS cliente | Pesquisa trimestral in-app | > 50 | > 60 |
| NPS prestador | Pesquisa trimestral no VÉLIO Pro | > 40 | > 50 |
| Taxa de aceite de oferta | Ofertas aceitas / ofertas enviadas (onda 1) | > 30 % | > 40 % |
| Aprovação de orçamento adicional | `Quote ADDITIONAL APPROVED` / enviados | > 60 % | > 65 % |
| Prestadores ativos | Prestadores com 1+ ordem `COMPLETED` no mês | 80 | 500 |
| Tempo de aprovação de prestador | Cadastro completo → `APPROVED` (p50) | < 48 h | < 24 h |

Instrumentação por eventos tipados em `packages/contracts/analytics` (ADR-013): `home_view`, `search_performed`, `service_viewed`, `service_request_started`, `checkout_viewed`, `order_created`, `provider_matched`, `offer_accepted`, `quote_sent`, `quote_decided`, `order_completed`, `review_submitted`, `payment_failed`, `payment_recovered`.

### 10.1 Critérios de aceite por jornada (MVP)

| Jornada | Critério verificável | Como medir |
|---|---|---|
| Encanador agora | Do toque em "Confirmar pedido" até `OFFERED`: < 5 s em 95 % dos casos | `order_events` (`REQUESTED` → `OFFERED`) |
| Encanador agora | Cliente nunca vê telefone do prestador; prestador nunca vê endereço completo antes de `ACCEPTED` | Teste e2e + revisão de payloads |
| Agendamento | Lembretes 24 h e 1 h antes entregues; transição `REMINDED` idempotente | `scheduled_jobs` + `notifications` |
| Orçamento adicional | Nenhuma `PaymentIntent(kind=ADDITIONAL)` sem `Quote.status = APPROVED` | Teste de domínio + constraint no banco |
| Conclusão | `COMPLETED` sem `MediaEvidence(AFTER)` rejeitado com `409` quando a categoria exige | Teste de integração |
| Cancelamento | Custo exibido ao cliente igual ao debitado | Comparar tela vs. `ledger_entries` |
| Pagamento falho | PIX expirado permite novo PIX sem recriar a ordem | Teste e2e |
| Disputa | `Payout` da ordem permanece congelado até decisão do operador | Teste de integração |
| Dispatch manual | Operador atribui em até 3 cliques a partir da fila `NO_PROVIDER_FOUND` | Teste de usabilidade com operador |
| Nova categoria | Admin cria categoria e serviço; aparece na home e é contratável sem deploy | Teste e2e em staging |
| Prestador | Fluxo de execução completo com um botão principal por tela e sem digitação além do PIN | Revisão de telas P-10 a P-16 em `10_SCREEN_INVENTORY.md` |
| Acessibilidade | Todas as telas MVP passam em contraste AA e leitura por leitor de tela | Auditoria por tela |

## 11. Riscos de produto e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Oferta insuficiente de prestadores na abertura | Matching lento, `NO_PROVIDER_FOUND` alto | Lançar por bairro e categoria; recrutamento antes da abertura; garantia mínima de ganhos no primeiro mês; dispatch manual como rede de segurança |
| Prestador contorna a plataforma após o primeiro contato | Perda de GMV e confiança | Mascaramento de telefone; valor para o prestador (agenda, pagamento garantido, reputação); recompra em um toque; benefícios por volume |
| Qualidade inconsistente | Rating baixo, churn | Verificação, evidências obrigatórias, rating ponderado por recência, suspensão automática abaixo de limiar |
| Orçamento adicional usado como aumento abusivo | Desconfiança | Aprovação explícita; justificativa e foto obrigatórias; limite de adicional sem revisão humana; indicador por prestador |
| Fraude em pagamentos (chargeback) | Perda financeira | Pré-autorização; sinais internos de risco (`customer_risk_signals`); exigir PIX para clientes de alto risco; 3DS quando o gateway oferecer |
| Dano ou perda em `LOGISTICS` | Disputa de alto valor | Fotos, odômetro e checklist obrigatórios em `PICKED_UP` e `DELIVERED`; termos de custódia; seguro em V1 |
| Concierge gera plano inviável ou caro | Frustração e custo operacional | Aprovação do cliente; `NEEDS_HUMAN` acima de limiares; planner por regras como fallback; a IA nunca cria pagamento |
| Complexidade do app do prestador afastar autônomos | Baixa adesão | Onboarding em etapas; fluxo de execução com um botão por vez; suporte por chat |
| Dependência do gateway | Indisponibilidade de pagamento | Porta `PaymentGateway`; segundo adaptador em V1; fila de reconciliação |
| Operação não escala com volume | SLAs furados | Filas priorizadas, alertas, automações (reabrir matching, lembretes); métricas de ops por operador |
| Exposição de dados pessoais | Multa e reputação | LGPD by design, RLS pronto no schema, auditoria, retenção definida |

## 12. Fora de escopo do MVP

- Multi-cidade e multi-moeda (V2); i18n além de pt-BR.
- Perfil de empresa com equipe e atribuição interna (V1).
- Seguro para `LOGISTICS` e lavanderia (V1).
- Planos de assinatura e visitas recorrentes (V1); no MVP a categoria de ar-condicionado opera com serviços avulsos `SCHEDULED`.
- Concierge por IA (V1); no MVP, Concierge recebe o texto e cai direto em `NEEDS_HUMAN` com `RuleBasedPlanner`.
- Programa de fidelidade, indicação com recompensa, gamificação do prestador.
- Marketplace aberto para terceiros publicarem serviços (V3).
- Chamada de voz/vídeo no chat; apenas texto e imagem.
- Pagamento em dinheiro na entrega.
- Avaliação pública do cliente pelo prestador (a nota do prestador ao cliente existe em V1, mas é interna).
- Agendamento com escolha manual de prestador pelo cliente (o cliente pode favoritar; a escolha é do matching).
- Aplicativo web para o cliente (apenas mobile no MVP; o deep link abre a loja).

## 13. Perguntas abertas

| # | Pergunta | Impacto | Responsável sugerido |
|---|---|---|---|
| 13.1 | PIX em ordem `IMMEDIATE`: a cobrança nasce em `ACCEPTED` (06 §4). O prestador deve sair antes da confirmação do PIX ou esperar o webhook? Proposta: `EN_ROUTE` bloqueado até `payment.updated=PAID` com limite de 5 min; depois volta a `MATCHING` ou cancela | Fluxo de pagamento e UX de espera | Produto + Pagamentos |
| 13.2 | Em `QUOTE`, quem assume `UNDER_REVIEW`? Não há `MATCHING` no diagrama 2.3. Proposta: matching reduzido para "prestador avaliador" ou triagem por ops | Workflow e dispatch | Arquitetura |
| 13.3 | PIN de conclusão: a visão pede OTP/PIN de início e fim; a engine prevê só `start` com PIN. Adicionar guard `requiresPin:END` em `complete`? | Segurança e fluxo do prestador | Arquitetura |
| 13.4 | Chat cliente↔suporte vive em `communication` (conversations) ou em `support` (ticket_messages)? Proposta: conversa em `communication` com `kind=SUPPORT` e ticket referenciando a conversa | Modelo de dados | Arquitetura |
| 13.5 | Quando uma ordem vai para `CLOSED`? Proposta: `order.auto_complete_check` fecha `COMPLETED` sem avaliação após 7 dias | Métricas e retenção | Produto |
| 13.6 | Taxa de cancelamento após `ACCEPTED` para `SCHEDULED` deve seguir a regra de 10 min do `IMMEDIATE` ou uma janela em horas antes do `startsAt`? | Política de cancelamento | Produto + Operação |
| 13.7 | Serviço de terceiro em `LOGISTICS` (oficina, lavanderia parceira): o terceiro é um `Provider` da plataforma ou fornecedor externo com orçamento repassado? | Modelo de prestador e repasse | Produto + Finanças |
| 13.8 | Limiares do Concierge para `NEEDS_HUMAN` (valor, número de tarefas, categorias de risco): valores iniciais | Operação | Operação |
| 13.9 | Gorjeta ao prestador no app: entra em V1? Impacta ledger e tela de avaliação | Finanças e UX | Produto |
| 13.10 | Verificação de antecedentes além de documento e selfie para categorias com acesso à residência | Confiança e custo | Jurídico + Produto |

## 14. Roadmap por release

| Release | Escopo de produto | Categorias | Superfícies | Critério de saída |
|---|---|---|---|---|
| MVP | `IMMEDIATE` e `SCHEDULED`; orçamento adicional; PIX e cartão; chat; avaliação; disputa; dispatch manual; admin de catálogo, preço, comissão, matching, cupons | Hidráulica, Elétrica, Ar-condicionado (avulso), Limpeza, Montagem e instalação, Assistência residencial | VÉLIO, VÉLIO Pro, /ops, /admin | 1 cidade, 3 bairros, 80 prestadores ativos, métricas MVP da seção 10 |
| V1 | `QUOTE`, `LOGISTICS`, `LAUNDRY`, `CONCIERGE` com IA; assinaturas (Essencial, Residencial, Premium); carteira do cliente; empresa com equipe; favoritos; 2FA em ops/admin; offline parcial; Redis adapter | + Lavanderia, Automotivo, Entregas rápidas, Concierge | idem | Cidade inteira; métricas V1 |
| V2 | Multi-cidade; SLAs por região; workflows sobrescritos no banco; textos de notificação administráveis; comunicação em massa; exportação para warehouse; seguro para custódia | Novas categorias por configuração | idem + web do cliente (avaliar) | 3 cidades |
| V3 | Plataforma aberta a parceiros; otimização de matching por aprendizado; precificação dinâmica supervisionada; API pública | — | — | Decisão de negócio |

## 15. Glossário operacional

Termos como aparecem nas telas (pt-BR) e seu equivalente canônico em `contracts`.

| Termo na interface | Entidade ou estado canônico | Observação |
|---|---|---|
| Pedido | `ServiceOrder` | O cliente nunca vê "ordem de serviço" |
| Solicitação | `ServiceRequest` | Interno; a interface fala em pedido |
| Profissional | `Provider` | "Prestador" é termo interno e do VÉLIO Pro |
| Oferta | `DispatchOffer` (`dispatch_offers`) | Só no VÉLIO Pro |
| Orçamento | `Quote` | "Orçamento adicional" para `kind=ADDITIONAL` |
| Plano | `SubscriptionPlan` | Essencial, Residencial, Premium |
| Assinatura | `Subscription` | |
| Visita | `SubscriptionVisit` | Gera pedido agendado |
| Agendamento | `Booking` | |
| Etapa | `OrderTask` | `LOGISTICS` e `CONCIERGE` |
| Registro de custódia | `CustodyEvent` | Exibido na linha do tempo com foto |
| Evidência | `MediaEvidence` | Fotos antes/depois, checklist, odômetro, assinatura |
| Contestação | `Dispute` | Termo exibido ao cliente; "disputa" é interno |
| Atendimento | `SupportTicket` | |
| Ocorrência | `Incident` | Só em /ops |
| Repasse | `Payout` | |
| Saldo a liberar | `ledger_entries` pendentes | Saldo de ordens `COMPLETED` ainda não pagas em lote |
| Cupom | `Coupon` | |
| Crédito | Saldo em `wallet_accounts` do cliente | Promocional ou reembolso |
| Concierge | `ConciergeRequest` + ordem pai `CONCIERGE` | |
| Verificado | `Provider.status = APPROVED` com documentos aprovados | Selo no perfil |
