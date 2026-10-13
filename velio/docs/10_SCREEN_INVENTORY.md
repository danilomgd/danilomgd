# 10 — Inventário de telas

Inventário completo por superfície e descrição de layout das doze telas críticas. IDs são referenciados por `04_USER_FLOWS.md` e `05_INFORMATION_ARCHITECTURE.md`. Componentes em `09_DESIGN_SYSTEM.md`. Endpoints seguem os módulos de `06_SYSTEM_ARCHITECTURE.md` (prefixo `/v1`); eventos realtime são os da sala indicada.

Convenções da coluna "Estados": **V** vazio, **E** erro, **L** carregando. Toda tela com lista tem skeleton em L, `EmptyState` com uma ação em V e `Toast` ou bloco de erro com "Tentar novamente" em E; a coluna registra só o que é específico.

## 1. App do cliente (VÉLIO)

| ID | Tela | Objetivo | Ação principal | Componentes | Dados / endpoints | Estados (V / E / L) | Prio |
|---|---|---|---|---|---|---|---|
| C-01 | Boas-vindas e OTP | Entrar com telefone em dois passos | "Continuar" → "Confirmar código" | Input (telefone), OTPInput, Button, Toast | `POST /auth/otp/request`, `POST /auth/otp/verify` | E: código inválido inline; bloqueio após 5 tentativas com contador; L: botão com spinner | MVP |
| C-02 | Nome e termos | Completar perfil mínimo | "Começar" | Input, Switch (aceites), Button | `PATCH /me`, `POST /me/consents` | E: nome obrigatório | MVP |
| C-03 | Home | Contratar em três ações; ver pedidos ativos | Busca ou toque em categoria/serviço | HomeHero, OrderStatusCard, CategoryTile, ServiceCard, PlanCard, ConciergeEntry, Banner, Skeleton | `GET /catalog/home?addressId`, `GET /orders?status=active`; sala `user:{id}` | V: sem endereço → hero pede endereço; sem cobertura → EmptyState "Ainda não atendemos aqui"; L: skeleton por seção | MVP |
| C-04 | Busca | Encontrar serviço por texto | Toque no resultado | Input (busca), ListItem, Chip (recentes) | `GET /catalog/search?q&addressId` | V: "Nada encontrado para {q}" + categorias; L: lista skeleton | MVP |
| C-05 | Endereços | Gerir endereços e escolher o atual | "Salvar endereço" | MapView, Input, ListItem, Button, BottomSheet | `GET/POST/PATCH/DELETE /addresses`, `GET /geo/geocode`, `GET /geo/coverage` | V: "Adicione seu primeiro endereço"; E: fora de cobertura com "Avisar quando chegar"; geocodificação falha → pino manual | MVP |
| C-06 | Categoria | Navegar subcategorias e serviços | Toque no serviço | CategoryTile, ServiceCard, Chip (filtros) | `GET /catalog/categories/{slug}?addressId` | V: categoria sem serviço na região | MVP |
| C-07 | Detalhe do serviço | Decidir com preço e escopo claros | "Pedir agora" ou "Agendar" | ServiceCard (hero), PriceSummary (resumido), ListItem (inclui/não inclui), RatingStars (agregado), StatusPill (exigências), Button | `GET /catalog/services/{slug}?addressId` | E: serviço inativo → "Indisponível no momento"; L: skeleton de hero e preço | MVP |
| C-08 | Insumos do pedido | Capturar equipamento, veículo, itens ou janela | "Continuar" | Select, Chip, ListItem, Input, SegmentedControl (Agora/Agendar), BottomSheet (calendário) | `GET /assets/equipments`, `GET /assets/vehicles`, `GET /catalog/availability` | V: sem equipamento → "Cadastrar equipamento" inline; E: sem janela disponível → sugerir próxima data | MVP |
| C-09 | Confirmação (checkout) | Confirmar com tudo visível | "Confirmar pedido" | PriceSummary, ListItem (endereço, horário, pagamento), Input (observações), EvidenceUploader (fotos opcionais), Chip (cupom), Button | `POST /requests`, `GET /payments/methods`, `POST /coupons/validate` | E: cupom inválido inline; gateway indisponível → bloco de erro; L: botão com spinner e tela bloqueada | MVP |
| C-10 | Buscando profissional | Reduzir ansiedade da espera | "Cancelar pedido" (secundária) | MapView (raio animado), StatusPill, OrderStatusTimeline (compacta), Button (ghost) | `GET /orders/{id}`; sala `order:{id}` (`order.updated`) | E: `NO_PROVIDER_FOUND` → texto "Ainda estamos buscando" + opções; realtime caído → polling | MVP |
| C-11 | Acompanhamento | Saber onde está o pedido e o que vem | Contextual: "Ver PIN", "Chat", "Avaliar" | MapView, ProviderCard, OrderStatusTimeline, StatusPill, Button, IconButton (chat, ajuda), BottomSheet | `GET /orders/{id}`, `GET /orders/{id}/events`; sala `order:{id}` (`order.event`, `provider.location`, `quote.created`, `payment.updated`) | E: `409` → recarrega estado; sem GPS do prestador → mapa com último ponto e aviso | MVP |
| C-12 | Chat da ordem | Combinar detalhes sem expor telefone | Enviar | ListItem (mensagens), Input, IconButton (imagem), Avatar | `GET/POST /conversations/{id}/messages`; `message.created` | V: só mensagens de sistema; E: envio falhou com reenviar | MVP |
| C-13 | Custódia e confirmação | Conferir itens/veículo e assinar | "Confirmar" | EvidenceUploader (leitura), ListItem (checklist), Input (assinatura), Badge (QR) | `GET /orders/{id}/custody`, `POST /orders/{id}/custody/{eventId}/confirm` | E: divergência → "Registrar divergência" abre contestação | V1 |
| C-14 | Aprovação de orçamento | Decidir sobre custo adicional ou inicial | `[RECUSAR]` `[APROVAR]` | QuoteApprovalCard, PriceSummary, EvidenceUploader (leitura), Button ×2 | `GET /quotes/{id}`, `POST /quotes/{id}/approve`, `POST /quotes/{id}/reject`; `quote.decided` | E: expirado → "Este orçamento expirou"; já decidido → estado final | MVP |
| C-15 | Pagamento e recibo | Pagar, recuperar falha, ver recibo | "Copiar código PIX" / "Tentar novamente" / "Baixar recibo" | PriceSummary, Card (QR PIX), Button, ListItem (métodos), StatusPill | `GET /payments/intents/{id}`, `POST /payments/intents/{id}/retry`, `GET /orders/{id}/receipt`; `payment.updated` | E: PIX expirado → "Gerar novo PIX"; cartão recusado → trocar método | MVP |
| C-16 | Pedidos | Ver em andamento, agendados e histórico | Toque no pedido; "Pedir de novo" | Tabs, OrderStatusCard, ListItem, StatusPill | `GET /orders?status=` paginado | V: "Você ainda não fez pedidos" + "Explorar serviços" | MVP |
| C-17 | Avaliação | Avaliar em um toque | Estrela → "Enviar" | RatingStars, Chip (tags), Input, Avatar, Button | `POST /orders/{id}/review` | E: já avaliado → abre pedido | MVP |
| C-18 | Contestação | Relatar problema após conclusão | "Enviar contestação" | Select (motivo), Input, EvidenceUploader, Button | `POST /orders/{id}/disputes`, `GET /orders/{id}/disputes/{id}` | E: prazo de 72 h expirado → orientar suporte | MVP |
| C-19 | Mensagens | Acessar conversas de ordens e suporte | Toque na conversa | ListItem, Avatar, Badge (não lidas) | `GET /conversations` | V: "Suas conversas aparecem aqui" | MVP |
| C-20 | Planos e assinaturas | Comparar planos ou ver assinatura | "Assinar {plano}" | PlanCard, SegmentedControl, ListItem | `GET /subscriptions/plans`, `GET /subscriptions` | V: sem planos na região | V1 |
| C-21 | Assinar plano | Confirmar assinatura | "Confirmar assinatura" | PriceSummary, Select (equipamentos, endereço, dia), ListItem (pagamento), Button | `POST /subscriptions` | E: pagamento falhou → C-15 | V1 |
| C-22 | Gerir assinatura | Ver visitas, pausar, cancelar | "Confirmar visita" / "Reagendar" | OrderStatusCard, ListItem, Button, BottomSheet | `GET /subscriptions/{id}`, `PATCH /subscriptions/{id}`, `GET /subscriptions/{id}/visits` | E: `PAST_DUE` → faixa com "Atualizar pagamento" | V1 |
| C-23 | Veículos e equipamentos | Gerir bens | "Adicionar" | ListItem, Input, Select, Button | `GET/POST/PATCH/DELETE /assets/vehicles`, `/assets/equipments` | V: "Cadastre para pedir mais rápido" | MVP |
| C-24 | Concierge | Descrever tarefa em linguagem natural | "Enviar" | Input (multilinha), IconButton (áudio, foto), Chip (exemplos), Button | `POST /concierge/requests` | E: região sem Concierge; L: "Montando seu plano" skeleton | V1 |
| C-25 | Plano do Concierge | Revisar, ajustar e aprovar plano e valor | "Aprovar plano" → `[APROVAR]` orçamento | Card (tarefas), OrderStatusTimeline (filhas), QuoteApprovalCard, Button | `GET /concierge/requests/{id}`, `POST /concierge/requests/{id}/approve`, `POST /concierge/requests/{id}/changes` | E: `NEEDS_HUMAN` → "Nossa equipe está revisando" | V1 |
| C-26 | Perfil | Acessar dados e configurações | — | Avatar, ListItem, Switch | `GET /me` | — | MVP |
| C-27 | Pagamentos | Métodos, carteira, cupons | "Adicionar cartão" (SDK do gateway) | ListItem, Card, Input (cupom), Badge | `GET/POST/DELETE /payments/methods`, `GET /wallet/me`, `GET /coupons/mine` | V: sem método → "Adicione um cartão ou use PIX" | MVP |
| C-28 | Privacidade | Consentimentos, exportar, excluir | Switch por consentimento | Switch, ListItem, Button (destrutivo) | `GET/PUT /me/consents`, `POST /me/export`, `POST /me/delete` | E: pedido ativo impede exclusão | MVP |
| C-29 | Ajuda e suporte | Abrir e acompanhar atendimento | "Falar com o suporte" | ListItem (FAQ), Input, Button | `GET/POST /support/tickets`, `GET/POST /conversations/{id}/messages` | V: FAQ apenas | MVP |
| C-30 | Notificações | Ver histórico | Toque → deep link | ListItem, Badge | `GET /notifications`, `PATCH /notifications/{id}/read` | V: "Nenhuma notificação" | MVP |
| C-31 | Perfil do profissional (folha) | Confiar em quem vai atender | "Favoritar" (V1) | ProviderCard (expandido), RatingStars, Chip (especialidades), Badge (verificado) | `GET /providers/{id}/public` | — | MVP |
| C-32 | Cancelar pedido (folha) | Cancelar com custo visível | "Confirmar cancelamento" | BottomSheet, Select (motivo), PriceSummary (taxa), Button (destrutivo) | `GET /orders/{id}/cancellation-preview`, `POST /orders/{id}/cancel` | E: `IN_PROGRESS` → folha explica alternativas | MVP |
| C-33 | Reagendar (folha) | Nova janela com política visível | "Confirmar novo horário" | BottomSheet, calendário, Chip (janelas), Button | `GET /catalog/availability`, `POST /orders/{id}/reschedule` | E: limite de reagendamentos | V1 |

## 2. App do prestador (VÉLIO Pro)

| ID | Tela | Objetivo | Ação principal | Componentes | Dados / endpoints | Estados (V / E / L) | Prio |
|---|---|---|---|---|---|---|---|
| P-01 | OTP | Entrar | "Continuar" | Input, OTPInput, Button | `POST /auth/otp/request`, `/verify` | idem C-01 | MVP |
| P-02 | Tipo de prestador | Autônomo ou empresa | Seleção → "Continuar" | Card (seleção), Button | `POST /providers/me` | — | MVP |
| P-03 | Dados pessoais | Identificação | "Continuar" | Input ×5, Button | `PATCH /providers/me` | E: CPF inválido inline | MVP |
| P-04 | Documentos e selfie | Verificação | "Enviar documentos" | EvidenceUploader (câmera guiada), StatusPill por documento, Button | `POST /providers/me/documents` (URL assinada), `GET /providers/me/documents` | E: recusado com motivo e "Enviar novamente"; L: barra de upload | MVP |
| P-05 | Especialidades | Escolher categorias e serviços | "Continuar" | Chip (multi), ListItem, Badge (certificação) | `GET /catalog/categories`, `PUT /providers/me/skills` | V: nenhuma selecionada → botão desabilitado | MVP |
| P-06 | Área de atendimento | Definir regiões ou raio | "Salvar área" | MapView (polígonos), Chip (bairros), Select (raio), Button | `GET /geo/regions`, `PUT /providers/me/service-areas` | E: área sem cobertura ativa | MVP |
| P-07 | Disponibilidade | Janelas semanais e folgas | "Salvar" | SegmentedControl (dias), ListItem (janelas), Switch, Button | `GET/PUT /providers/me/schedule`, `GET/POST/DELETE /providers/me/time-off` | E: folga conflita com ordem aceita → aviso com opções | MVP |
| P-08 | Dados de recebimento | Chave PIX ou conta | "Verificar e salvar" | Input, Select, Button, StatusPill (verificação) | `PUT /wallet/me/payout-account`, `POST /wallet/me/payout-account/verify` | E: chave inválida | MVP |
| P-09 | Em análise / recusado | Informar status do cadastro | "Reenviar documento" quando recusado | EmptyState (ilustração), StatusPill, ListItem (pendências) | `GET /providers/me` | E: `BLOCKED` → contato com suporte | MVP |
| P-10 | Home | Ficar online e ver o dia | Switch Online/Offline | Switch (grande), OrderStatusCard (ordem ativa), Card (ganhos do dia, próximos agendamentos), Badge | `GET /providers/me`, `PUT /providers/me/availability`, `GET /orders?mine&status=active`, `GET /wallet/me/summary?period=today`; sala `provider:{id}` | V: sem ordens → "Fique online para receber ofertas"; E: permissão de localização negada → folha | MVP |
| P-11 | Oferta recebida | Decidir em segundos | "Aceitar" | Card (tela cheia), StatusPill (contagem), PriceSummary (remuneração), MapView (mini, bairro), Button, Button (ghost "Recusar") | `GET /offers/{id}`, `POST /offers/{id}/accept`, `POST /offers/{id}/decline`; `offer.expired` | E: `409` aceita por outro → mensagem 2 s; expirada → fecha | MVP |
| P-12 | Ordem aceita | Preparar deslocamento | "Saí para o atendimento" | ProviderCard (cliente: nome, sem telefone), ListItem (endereço, instruções, horário), Button, IconButton (chat, rota) | `GET /orders/{id}`, `POST /orders/{id}/en-route` | E: pagamento pendente → botão desabilitado com "Aguardando pagamento" | MVP |
| P-13 | Execução | Um botão por etapa | "Cheguei" → "Iniciar" (PIN) → "Concluir" | OrderStatusTimeline (compacta), Button (grande), OTPInput (PIN), MapView (rota), IconButton (chat, orçamento, cancelar) | `POST /orders/{id}/arrived`, `/start` (pin), `/complete`; `POST /providers/me/location` | E: `409` recarrega; PIN errado inline; guard de evidência → vai para P-14 | MVP |
| P-14 | Evidências | Fotos, checklist, odômetro, QR, assinatura | "Salvar evidências" | EvidenceUploader (câmera, guias de enquadramento), ListItem (checklist), Input (odômetro), leitor de QR, Input (assinatura do cliente) | `POST /orders/{id}/evidence`, `POST /orders/{id}/custody`, `GET /orders/{id}/evidence-requirements` | E: foto obrigatória faltando → lista do que falta; offline → fila local | MVP |
| P-15 | Orçamento | Criar orçamento adicional ou inicial | "Enviar ao cliente" | Input (itens, valor), EvidenceUploader, PriceSummary (novo total), Button, StatusPill (aguardando) | `POST /orders/{id}/quotes`, `DELETE /quotes/{id}`; `quote.decided` | E: orçamento aberto impede novo; expirado → reenviar | MVP |
| P-16 | Conclusão | Encerrar e avaliar cliente | "Concluir serviço" → "Enviar" | PriceSummary (final: base, adicionais, repasse), RatingStars, Button | `POST /orders/{id}/complete`, `POST /orders/{id}/review-customer` | E: guard `noOpenAdditionalQuote` → aviso | MVP |
| P-17 | Agenda | Ver dia/semana e folgas | Toque na ordem | SegmentedControl (dia/semana), ListItem (ordens), Chip (folga) | `GET /orders?mine&from&to`, `GET /providers/me/time-off` | V: "Sem agendamentos" | MVP |
| P-18 | Chat com cliente | Combinar detalhes | Enviar; atalhos | ListItem, Input, Chip (atalhos), IconButton | `GET/POST /conversations/{id}/messages` | idem C-12 | MVP |
| P-19 | Cancelar atendimento (folha) | Cancelar com aviso de penalidade | "Confirmar cancelamento" | BottomSheet, Select (motivo), Button (destrutivo) | `POST /orders/{id}/cancel` | E: custódia ativa → bloqueado | MVP |
| P-20 | Saldo e extrato | Entender ganhos | "Ver repasses" | Card (disponível, a liberar), ListItem (lançamentos: bruto, comissão, líquido), Tabs (período) | `GET /wallet/me`, `GET /wallet/me/ledger?from&to` | V: "Seus ganhos aparecem aqui após o primeiro serviço" | MVP |
| P-21 | Repasses | Acompanhar pagamentos recebidos | Toque → comprovante | ListItem, StatusPill, Card (comprovante) | `GET /payouts?mine`, `GET /payouts/{id}` | E: `FAILED` → "Verificar dados de recebimento" | MVP |
| P-22 | Avaliações recebidas | Ver e responder | "Responder" (V1) | RatingStars, ListItem, Input | `GET /reputation/me/reviews`, `POST /reviews/{id}/reply` | V: "Nenhuma avaliação ainda" | MVP (resposta V1) |
| P-23 | Indicadores | Acompanhar desempenho | — | Card (KPIs), gráfico simples, Tabs (período) | `GET /reputation/me/stats` | V: dados insuficientes | MVP |
| P-24 | Perfil | Editar dados, skills, área, agenda | — | Avatar, ListItem, StatusPill (status do perfil) | `GET /providers/me` | — | MVP |
| P-25 | Notificações | Histórico | Toque → deep link | ListItem, Badge | `GET /notifications` | V | MVP |
| P-26 | Suporte | Ajuda e contestação de penalidade | "Falar com o suporte" | ListItem, Input | `GET/POST /support/tickets` | V | MVP |
| P-27 | Privacidade | Consentimentos (localização em segundo plano) | Switch | Switch, ListItem | `GET/PUT /me/consents` | E: desligar localização impede `ONLINE` | MVP |
| P-28 | Responder contestação | Defender-se com evidências | "Enviar resposta" | Card (motivo do cliente), EvidenceUploader (leitura + novas), Input, Button | `GET /disputes/{id}`, `POST /disputes/{id}/response` | E: prazo de 24 h expirado | MVP |

## 3. Painel operacional (/ops)

| ID | Tela | Objetivo | Ação principal | Componentes (web) | Dados / endpoints | Estados (V / E / L) | Prio |
|---|---|---|---|---|---|---|---|
| W-00 | Login | Entrar com e-mail e senha; 2FA (V1) | "Entrar" | Input, Button | `POST /auth/password/login`, `POST /auth/2fa/verify` | E: credenciais inválidas; bloqueio progressivo | MVP |
| O-01 | Visão geral | Estado do turno em um olhar | Clique em alerta → fila | Card (KPIs), Badge, ListItem (alertas) | `GET /ops/overview`; sala `ops` | L: skeleton de KPIs | MVP |
| O-02 | Mapa operacional | Ver ordens e prestadores ao vivo | Clique em pino → painel lateral | MapView (web), StatusPill, Chip (filtros), ListItem (filas laterais) | `GET /ops/map?bbox&status&category`, `GET /ops/providers/online`; sala `ops` (`order.updated`, `provider.location`) | V: região sem atividade; E: realtime caído → polling 15 s com aviso | MVP |
| O-03 | Filas | Trabalhar exceções por prioridade | Abrir ordem | Tabs (filas com contadores), tabela, StatusPill (SLA), Badge | `GET /ops/queues/{queue}?sort=waiting` | V: "Fila vazia" | MVP |
| O-04 | Ordens | Buscar e filtrar qualquer ordem | Abrir | Input (busca), Chip (filtros), tabela paginada | `GET /ops/orders?q&status&from&to` | V: sem resultado | MVP |
| O-05 | Detalhe da ordem | Entender e agir | Ações por estado (atribuir, reabrir, cancelar, nota) | OrderStatusTimeline (completa), ProviderCard, PriceSummary, Tabs (eventos, pagamentos, orçamentos, evidências, custódia, chat), Button | `GET /ops/orders/{id}`, `GET /orders/{id}/events`, `POST /ops/orders/{id}/{action}`; sala `order:{id}` | E: ação inválida `409` → recarrega e mostra transições permitidas | MVP |
| O-06 | Dispatch manual | Escolher e atribuir prestador | "Atribuir" | tabela de candidatos (score por componente, distância, status), MapView (mini), Select (motivo), SegmentedControl (oferta/direta), Button | `GET /ops/orders/{id}/candidates?includeExcluded`, `POST /ops/orders/{id}/assign` | V: nenhum candidato → "Propor novo horário" / "Cancelar pela plataforma" | MVP |
| O-07 | Incidentes | Gerir ocorrências e SLA | "Assumir" → "Resolver" | tabela, StatusPill (severidade), Select, Input, Button | `GET /ops/incidents`, `POST /ops/incidents`, `PATCH /ops/incidents/{id}` | V | MVP |
| O-08 | Disputas | Decidir contestações | "Resolver" | Card (dois lados), EvidenceUploader (leitura), PriceSummary, Select (decisão), Input (justificativa), Button | `GET /ops/disputes`, `GET /disputes/{id}`, `POST /disputes/{id}/resolve` | V | MVP |
| O-09 | Suporte | Atender tickets | Responder | ListItem (tickets), chat, Chip (macros), Select (status) | `GET /support/tickets?status`, `POST /conversations/{id}/messages`, `PATCH /support/tickets/{id}` | V | MVP |
| O-10 | Concierge humano | Revisar planos `NEEDS_HUMAN` | "Devolver ao cliente" | Card (tarefas editáveis), PriceSummary, Button | `GET /ops/concierge?status=NEEDS_HUMAN`, `PATCH /concierge/requests/{id}/plan` | V | V1 |
| O-11 | Prestadores | Ver disponibilidade e agir | "Suspender temporariamente" | tabela, StatusPill (availability), ProviderCard, Button | `GET /ops/providers?availability&region`, `GET /ops/providers/{id}`, `POST /ops/providers/{id}/suspend` | V | MVP |
| O-12 | Pagamentos | Tratar falhas e reembolsos | "Reprocessar webhook" / "Reembolsar" | tabela, StatusPill, Button, Input (motivo) | `GET /ops/payments/intents?status`, `POST /payments/intents/{id}/reconcile`, `POST /payments/intents/{id}/refund` | V | MVP |
| O-13 | SLA e alertas | Acompanhar metas por estado e região | Clique → fila | Card (KPIs), tabela, Badge | `GET /ops/sla?region`, `GET /ops/alerts` | V | MVP |

## 4. Painel administrativo (/admin)

| ID | Tela | Objetivo | Ação principal | Componentes (web) | Dados / endpoints | Estados (V / E / L) | Prio |
|---|---|---|---|---|---|---|---|
| A-00 | Visão geral | Saúde do negócio | — | Card (KPIs), gráfico | `GET /analytics/overview` | L | MVP |
| A-01 | Categorias | Árvore configurável | "Nova categoria" / "Salvar" | árvore arrastável, Input, Select (ícone), Switch (config), Button | `GET/POST/PATCH /admin/catalog/categories`, `POST /admin/catalog/categories/reorder` | E: slug duplicado inline; desativar com serviços ativos → confirmação | MVP |
| A-02 | Serviços | Editor de serviço | "Salvar" / "Ativar" | Input, Select (`workflowKind`, `pricingModel`), Chip (tags, atributos), EvidenceUploader (capa), Switch, Button, "Ver como cliente" | `GET/POST/PATCH /admin/catalog/services`, `GET /admin/catalog/services/{id}/preview` | E: sem regra de preço na região → aviso ao ativar | MVP |
| A-03 | Preços | Regras por serviço × região × vigência | "Nova regra" | tabela editável, Select, Input (centavos), calendário | `GET/POST/PATCH /admin/pricing/rules` | E: vigências sobrepostas | MVP |
| A-04 | Regiões | Cidades, regiões, bairros, horários | "Salvar" | MapView (polígono), tabela, Switch (ativa) | `GET/POST/PATCH /admin/geo/regions` | E: polígono inválido | MVP |
| A-05 | Comissão | `commission_rules` com simulação | "Salvar" | tabela, Input (bps, fixo, mín, máx), Card (simulador) | `GET/POST/PATCH /admin/wallet/commission-rules`, `POST /admin/wallet/commission-rules/simulate` | E: mín > máx | MVP |
| A-06 | Matching | Pesos, ondas, raios por categoria | "Salvar" / "Testar com ordem real" | sliders com soma, Input (N, T, raios), Card (teste de score) | `GET/PUT /admin/dispatch/matching-configs/{categoryId}`, `POST /admin/dispatch/matching-configs/test` | E: pesos não somam 100 % | MVP |
| A-07 | Prestadores | Aprovação, skills, áreas, status | "Aprovar" / "Recusar" | fila, visualizador de documentos (URL assinada), Select (motivo), Chip (skills), Button | `GET /admin/providers?status=PENDING`, `GET /admin/providers/{id}`, `POST /admin/providers/{id}/documents/{docId}/review`, `POST /admin/providers/{id}/status` | V: fila vazia | MVP |
| A-08 | Usuários e papéis | Operadores e admins | "Criar usuário" | tabela, Input, Select (papéis), Switch | `GET/POST/PATCH /admin/users` | — | MVP |
| A-09 | Home | Seções, ordem, regras, vigência | "Publicar" / "Pré-visualizar" | lista arrastável, Select (tipo), Input, regra (região, horário, segmento), pré-visualização | `GET/PUT /admin/catalog/home-sections`, `GET /catalog/home?preview` | E: seção sem itens | MVP |
| A-10 | Banners | Imagem, destino, vigência | "Salvar" | EvidenceUploader (imagem), Select (destino), calendário | `GET/POST/PATCH /admin/catalog/banners` | — | V1 |
| A-11 | Planos e assinaturas | Planos e lista de assinantes | "Novo plano" | tabela, Input, Select (serviços incluídos) | `GET/POST/PATCH /admin/subscriptions/plans`, `GET /admin/subscriptions` | — | V1 |
| A-12 | Cupons e promoções | Regras de incentivo | "Novo cupom" | tabela, Input, Select (elegibilidade), calendário | `GET/POST/PATCH /admin/payments/coupons`, `/promotions` | E: código duplicado | MVP |
| A-13 | SLAs | Tempo-alvo por estado e região | "Salvar" | tabela editável | `GET/PUT /admin/sla` | — | V1 |
| A-14 | Política de cancelamento | Janelas e taxas | "Salvar" | Input, Card (exemplos calculados) | `GET/PUT /admin/settings/cancellation` | — | MVP |
| A-15 | Workflows | Ver definições; sobrescrever (V2) | "Validar" | visualizador de grafo, JSON com validação Zod | `GET /admin/workflows`, `POST /admin/workflows/validate`, `PUT /admin/workflows/{kind}` (V2) | E: definição inválida com erros por linha | V2 |
| A-16 | Pagamentos e repasses | Intenções, reembolsos, lotes | "Aprovar lote" | tabela, StatusPill, Button, exportar | `GET /admin/payments/intents`, `GET /admin/wallet/payouts/batches`, `POST /admin/wallet/payouts/batches/{id}/approve` | V | MVP |
| A-17 | Textos de notificação | Modelos por evento e canal | "Salvar" / "Pré-visualizar" | editor com variáveis, pré-visualização | `GET/PUT /admin/communication/templates` | E: variável desconhecida | V1 |
| A-18 | Flags e settings | `platform_settings` com histórico | "Salvar" | tabela chave/valor, Switch, histórico | `GET/PUT /admin/settings`, `GET /admin/settings/history` | — | MVP |
| A-19 | Auditoria | Consultar `audit_logs` | Filtrar | tabela, Chip (filtros), diff antes/depois | `GET /admin/audit?actor&entity&from&to` | V | MVP |
| A-20 | Analytics | Dashboard de negócio | Filtrar período/região | Card (KPIs), gráficos (GMV, pedidos, take rate, matching, cancelamentos, NPS) | `GET /analytics/dashboard?from&to&region` | L | MVP |

## 5. Layout das doze telas críticas

Descrições de cima para baixo. "Zona" é uma faixa horizontal da tela; hierarquia indica o peso visual (1 = maior). Microcopy entre aspas, curta, sem exclamação. Tokens e componentes em `09_DESIGN_SYSTEM.md`.

### 5.1 C-03 — Home do cliente

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Barra superior (área segura) | Endereço atual com chevron à esquerda; IconButton de notificações com Badge à direita | 3 | "Rua das Acácias, 120" |
| Hero | Saudação por período em `display-sm`; campo de busca em Card elevado, altura 52 | 1 | "Boa tarde, Ana" / "O que você precisa?" |
| Em andamento (condicional) | OrderStatusCard com foto do prestador, StatusPill, frase de status, ETA; toque abre C-11 | 1 quando existe | "A caminho · chega em 12 min" |
| Categorias | Grade 4 colunas de CategoryTile (ícone 28, rótulo 12); última célula "Ver todas" | 2 | "Hidráulica", "Elétrica", "Ar-condicionado", "Limpeza" |
| Serviços rápidos | Carrossel horizontal de ServiceCard (capa 3:2, nome, preço "a partir de", duração) | 2 | "Agora, perto de você" |
| Agendados | ServiceCard em lista compacta + próximos agendamentos do usuário | 3 | "Para agendar" |
| Assinaturas | PlanCard único com destaque do plano recomendado ou "Sua próxima visita" | 3 | "Casa em dia, sem lembrar" |
| Concierge | ConciergeEntry: Card com campo "Descreva o que precisa" e ícone de microfone | 2 | "Peça qualquer coisa" |
| Recomendações (condicional) | ServiceCard com legenda da razão em `caption` | 3 | "Seu split da sala está há 6 meses sem limpeza" |
| Banner | Banner 16:9 com vigência | 4 | — |
| Barra inferior | Tabs: Início, Pedidos, Mensagens, Perfil | — | — |

Regras: a primeira ação possível fica a um toque do topo; nada acima da dobra exige rolagem para contratar um serviço rápido; seções chegam ordenadas pelo servidor.

### 5.2 C-07 — Detalhe do serviço

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Capa | Imagem 3:2 com IconButton voltar e compartilhar sobrepostos | 3 | — |
| Título | Nome do serviço `title-lg`; categoria em `caption`; RatingStars agregado com contagem | 1 | "Limpeza de split" / "4,8 · 1.240 serviços" |
| Preço | PriceSummary resumido: valor ou faixa, unidade, "a partir de" quando por atributo; duração estimada ao lado | 1 | "R$ 150 · 9.000 BTU" / "cerca de 1h30" |
| Exigências | StatusPill informativos: "PIN de início", "Fotos antes e depois", "Precisa do equipamento" | 3 | — |
| O que inclui | Lista com ícone de check; "Não inclui" em lista com ícone neutro, colapsada | 2 | "Limpeza de filtros e evaporadora" |
| Como funciona | Três passos em linha: Agendar → Profissional confirma → Avalie | 3 | — |
| Avaliações | Duas avaliações recentes com tags; "Ver todas" | 3 | — |
| Barra fixa inferior | Preço à esquerda; Button primário à direita; para serviços `IMMEDIATE` com agendamento possível, SegmentedControl "Agora / Agendar" acima | 1 | "Pedir agora" / "Agendar" |

### 5.3 C-09 — Confirmação (checkout)

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Cabeçalho | Título; IconButton fechar | 3 | "Confirmar pedido" |
| Resumo do serviço | ServiceCard compacto (capa 56, nome, atributo escolhido) | 2 | "Limpeza de split · 9.000 BTU" |
| Onde e quando | Dois ListItem editáveis: endereço com complemento; horário ("Agora" ou data e janela) | 2 | "Casa · Rua das Acácias, 120" / "Amanhã, 14h–16h" |
| Observações e fotos | Input multilinha colapsado em "Adicionar observações"; EvidenceUploader opcional | 4 | "Algo que o profissional precisa saber?" |
| Pagamento | ListItem com método padrão e chevron; Chip "Cupom" que expande Input | 2 | "Cartão final 1234" / "Adicionar cupom" |
| Valores | PriceSummary completo: base, atributos, desconto, total; nota de pré-autorização | 1 | "Total R$ 150,00" / "Cobramos só quando o serviço terminar" |
| Política | Linha em `caption` com link | 3 | "Cancelamento grátis até o profissional aceitar" |
| Barra fixa inferior | Button primário largura total | 1 | "Confirmar pedido" |

### 5.4 C-11 — Acompanhamento com mapa

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Mapa (55 % da altura) | MapView com pino do endereço, marcador do prestador, rota; IconButton voltar sobreposto | 1 em `EN_ROUTE`/`ARRIVED` | — |
| Folha de status (BottomSheet ancorada, arrastável) | StatusPill + frase de status `title-md` + ETA | 1 | "A caminho" / "Carlos chega em 12 min" |
| Prestador | ProviderCard: Avatar 48, nome, RatingStars compacto, selo "Verificado"; IconButton chat e ajuda | 2 | "Carlos M. · 4,9 · 312 serviços" |
| Ação contextual | Card de PIN em `ARRIVED` (dígitos grandes, `mono`); QuoteApprovalCard inline quando houver `Quote SENT`; Button "Avaliar" em `COMPLETED` | 1 quando presente | "Informe este PIN ao profissional" / "4 8 2 1" |
| Linha do tempo | OrderStatusTimeline vertical com eventos de `order_events` (hora, rótulo, mídia quando houver) | 3 | "14:02 Pedido confirmado" |
| Detalhes | ListItem colapsáveis: serviço, endereço, pagamento, política | 4 | — |
| Rodapé da folha | Button ghost "Cancelar pedido" (até `ARRIVED`) ou "Preciso de ajuda" | 4 | — |

Fora de `EN_ROUTE`/`ARRIVED`, o mapa reduz para 30 % e a folha sobe; em `IN_PROGRESS` o mapa é substituído pelas fotos `BEFORE`.

### 5.5 C-14 — Aprovação de orçamento adicional

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Cabeçalho | Título; contagem regressiva da validade em StatusPill | 2 | "Orçamento adicional" / "Expira em 24 min" |
| Contexto | Avatar e nome do prestador; frase curta | 3 | "Carlos encontrou algo além do combinado" |
| Justificativa | Texto do prestador em Card; fotos em miniatura (toque amplia) | 2 | — |
| Itens | QuoteApprovalCard: lista de itens com quantidade e valor | 1 | "Troca de sifão · R$ 60,00" |
| Impacto | PriceSummary: "Já combinado R$ 150,00" + "Adicional R$ 60,00" = "Novo total R$ 210,00"; nota sobre cobrança | 1 | "Cobrado só na conclusão" |
| Ações fixas | Dois Button lado a lado: secundário destrutivo-suave `[RECUSAR]`, primário `[APROVAR]` | 1 | "Recusar" / "Aprovar R$ 60,00" |
| Rodapé | Link para chat | 4 | "Tirar dúvida com Carlos" |

### 5.6 C-17 — Avaliação

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Cabeçalho | IconButton fechar; sem título | 4 | — |
| Prestador | Avatar 72 centralizado; nome; serviço e data em `caption` | 2 | "Como foi com Carlos?" |
| Estrelas | RatingStars tamanho 44, centralizadas; rótulo dinâmico abaixo | 1 | "Toque para avaliar" → "Excelente" |
| Tags | Chips por nota (aparecem após a nota) | 2 | "Pontual", "Caprichoso", "Explicou bem" |
| Comentário | Input multilinha opcional | 3 | "Quer contar mais? (opcional)" |
| Ação fixa | Button primário; habilitado após a nota | 1 | "Enviar avaliação" |
| Pós-envio | Estado de sucesso inline com "Pedir de novo com Carlos" (nota ≥ 4) | 2 | "Obrigado. Sua avaliação ajuda outros clientes" |

### 5.7 P-11 — Oferta recebida pelo prestador

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Faixa superior | Barra de progresso do tempo restante (cor primária → alerta nos últimos 10 s) e contagem | 2 | "0:38" |
| Remuneração | Valor líquido estimado em `display-lg`; preço ao cliente em `caption` abaixo | 1 | "R$ 128,00" / "Cliente paga R$ 160,00" |
| Serviço | Nome do serviço `title-md`; categoria; exigências em StatusPill | 2 | "Vazamento urgente" / "PIN · Fotos" |
| Logística | Três colunas: distância e tempo até o local; bairro; horário | 2 | "3,2 km · 12 min" / "Vila Mariana" / "Agora" |
| Mini mapa | MapView estático com círculo aproximado (sem endereço) | 3 | — |
| Duração | Linha única | 3 | "Cerca de 1h" |
| Ações fixas | Button primário grande (altura 64) "Aceitar"; Button ghost "Recusar" abaixo | 1 | "Aceitar" / "Recusar" |

Regra: tela cheia modal, sem navegação; som e vibração ao abrir; ao expirar, fecha sozinha com Toast.

### 5.8 P-13 / P-14 — Execução pelo prestador com evidências

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Cabeçalho | Nome do cliente (primeiro nome), serviço, IconButton chat e menu (cancelar, ajuda) | 3 | "Ana · Vazamento urgente" |
| Estado atual | StatusPill + frase para o prestador; endereço com botão de rota em `EN_ROUTE` | 2 | "Você está a caminho" / "Abrir rota" |
| Linha do tempo compacta | OrderStatusTimeline horizontal com etapas: Saí → Cheguei → Iniciar → Concluir; etapa atual destacada | 2 | — |
| Área de tarefa | Varia por etapa: em `ARRIVED`, OTPInput do PIN e lista do que falta ("2 fotos antes"); em `IN_PROGRESS`, EvidenceUploader com grade de fotos `BEFORE`/`AFTER`, checklist, botão "Orçamento adicional"; em `LOGISTICS`, leitor de QR, Input de odômetro, checklist, assinatura do cliente | 1 | "Peça o PIN ao cliente" / "Fotos antes (2 de 2)" / "Odômetro" |
| Valor | PriceSummary compacto com repasse estimado e adicionais aprovados | 3 | "Seu repasse: R$ 128,00" |
| Ação fixa | Um único Button primário com o verbo da próxima transição; desabilitado com motivo visível quando guard não satisfeito | 1 | "Cheguei" / "Iniciar serviço" / "Concluir serviço" / "Faltam 2 fotos depois" |

### 5.9 P-20 / P-21 — Saldo e repasses

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Cabeçalho | Título; Tabs de período (Hoje, Semana, Mês) | 3 | "Ganhos" |
| Saldo | Card com dois valores: disponível e a liberar, cada um com legenda; data do próximo repasse | 1 | "Disponível R$ 0,00" / "A liberar R$ 384,00 · repasse sexta" |
| Resumo do período | Três KPIs em linha: serviços, bruto, líquido | 2 | "6 serviços · R$ 480 · R$ 384" |
| Extrato | ListItem por ordem: serviço, data, bruto riscado em `caption`, comissão, líquido em destaque; StatusPill (a liberar, pago, congelado por contestação) | 2 | "Vazamento urgente · 12/10" / "R$ 160 − R$ 32 = R$ 128" |
| Repasses | Seção com últimos `Payout`: período, valor, StatusPill; toque abre comprovante | 2 | "04–10/10 · R$ 912,00 · Pago" |
| Dados de recebimento | ListItem com chave mascarada e chevron | 4 | "PIX ···1234" |

### 5.10 O-02 — Mapa operacional

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Navegação lateral (240) | Itens: Visão geral, Mapa, Filas (contadores), Ordens, Prestadores, Incidentes, Suporte, SLA | 3 | — |
| Barra superior | Filtros: região, categoria, status (Chips), busca; indicador de conexão realtime | 3 | "Zona Sul · Todas as categorias" |
| Mapa (área principal) | Pinos de ordens coloridos por `tone` do status, marcadores de prestadores (ONLINE verde, BUSY âmbar), agrupamento por zoom; legenda fixa | 1 | — |
| Painel lateral direito (380) | Tabs: "Sem profissional (3)", "Atrasos (2)", "Cancelamentos", "Pagamentos"; cada item com tempo em espera, SLA em StatusPill, botão "Abrir" | 1 | "Vazamento urgente · 11 min esperando" |
| Detalhe rápido (ao clicar no pino) | Card flutuante: serviço, status, prestador ou "sem profissional", botões "Abrir ordem" e "Atribuir" | 2 | — |
| Rodapé | KPIs do turno: ordens ativas, prestadores online, tempo médio de matching | 4 | "42 ativas · 118 online · matching 2m10s" |

### 5.11 O-06 — Dispatch manual

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Cabeçalho | Breadcrumb Ordens › #A1B2 › Atribuir; StatusPill da ordem; tempo em espera | 3 | "Sem profissional há 11 min" |
| Resumo da ordem (esquerda, 320) | Serviço, janela, endereço, preço, cliente (nome, bairro), histórico de ondas: quem recebeu, recusou, expirou | 2 | "Onda 1: 5 ofertas · 2 recusas · 3 expiradas" |
| Candidatos (centro) | Tabela ordenada por score: nome, nota, distância e ETA, disponibilidade, ordens hoje, taxa de aceite, score por componente em barras finas, motivo de exclusão em StatusPill cinza; Switch "Incluir excluídos" | 1 | "Fora da área" / "Em atendimento até 15h" |
| Mini mapa (direita, 320) | Posições dos candidatos selecionáveis e do endereço | 2 | — |
| Painel de atribuição (fixo inferior) | Prestador escolhido, SegmentedControl "Enviar oferta (60 s) / Atribuir direto", Select motivo, Button primário | 1 | "Atribuir a Carlos M." |
| Alternativas | Links: "Propor novo horário ao cliente", "Cancelar pela plataforma" | 4 | — |

### 5.12 A-01 / A-02 — Editor de categorias e serviços

| Zona | Conteúdo | Hierarquia | Microcopy |
|---|---|---|---|
| Navegação lateral | Seção Catálogo expandida: Categorias, Serviços | 3 | — |
| Árvore (esquerda, 320) | Categorias arrastáveis com ícone, nome, contagem de serviços, StatusPill ativa/inativa; botão "Nova categoria"; busca | 2 | — |
| Editor (centro) | Formulário em grupos: Identidade (nome, slug com validação, descrição, ícone com seletor visual), Hierarquia (pai, ordem), Regras (`config` como Switches com explicação em uma linha), Regiões | 1 | "Exige PIN de início" / "Fotos antes e depois obrigatórias" |
| Serviços da categoria (aba) | Tabela: nome, `workflowKind`, `pricingModel`, duração, regiões com preço, status; "Novo serviço" | 1 | — |
| Editor de serviço (drawer, 560) | Identidade; Fluxo (`workflowKind` com descrição de um parágrafo do fluxo escolhido e miniatura do diagrama de estados); Preço (`pricingModel`, atributos, link para regras por região com aviso quando faltar); Conteúdo (inclui, não inclui, tags, capa); Publicação (ativo, destaque) | 1 | "Imediato: o cliente pede agora e um profissional é acionado em ondas" |
| Pré-visualização (direita, 360, colapsável) | Render do detalhe do serviço como o cliente vê, por região escolhida | 2 | "Ver como cliente · Zona Sul" |
| Barra fixa inferior | "Descartar", "Salvar como inativo", Button primário "Publicar"; aviso de impacto | 1 | "Publicar torna o serviço visível na home em até 60 s" |

## 6. Padrões de estado por classe de tela

Aplicados a todas as telas da classe, salvo exceção registrada na coluna "Estados" do inventário.

| Classe | Carregando (L) | Vazio (V) | Erro de rede (E) | Erro de regra (`409`, `422`) | Sem permissão (`401`, `403`) |
|---|---|---|---|---|---|
| Lista (C-16, C-19, P-17, P-21, O-03, O-04, A-*) | Skeleton de 6 linhas com a altura do ListItem real | EmptyState com ilustração do conjunto, título de até 6 palavras, uma ação | Bloco inline no topo com "Tentar novamente"; dados em cache permanecem visíveis | Toast com a mensagem do servidor traduzida por `contracts/errors` | Volta ao login preservando a rota |
| Detalhe (C-07, C-11, P-12, P-13, O-05) | Skeleton das zonas 1 e 2; zonas 3+ aparecem ao carregar | Não se aplica; recurso inexistente → EmptyState "Pedido não encontrado" | Tela cheia com "Tentar novamente" apenas se não houver cache | Recarrega o recurso, destaca o que mudou, mostra transições permitidas | Idem |
| Formulário (C-05, C-09, C-18, P-03 a P-08, A-01 a A-14) | Botão primário com spinner, campos bloqueados, sem skeleton | Não se aplica | Toast persistente + manter dados preenchidos | Erro por campo inline em `error`; foco vai ao primeiro campo com erro | Idem |
| Mapa (C-10, C-11, O-02, P-06) | Mapa com placeholder neutro e Skeleton dos cartões | Mapa centrado no endereço sem marcadores | Faixa "Sem conexão. Mostrando última posição" | — | Idem |
| Modal de decisão (C-14, C-32, P-11, P-19) | Botões bloqueados até carregar a decisão | — | Toast; decisão não enviada permanece disponível | Decisão já tomada ou expirada → estado final com rótulo e botão "Fechar" | Idem |
| Realtime (C-10, C-11, P-10, P-13, O-02) | Indicador discreto de conexão no cabeçalho | — | Fallback para polling de 15 s; indicador muda para "Atualizando" | — | Reautentica o socket com o novo JWT |

## 7. Transições de navegação principais

| De | Para | Gatilho | Tipo | Observação |
|---|---|---|---|---|
| C-01 | C-02 ou C-03 | OTP válido | Substituição de pilha | Usuário novo vai a C-02 |
| C-03 | C-04 | Toque no campo de busca | Push com transição compartilhada do campo | Teclado aberto ao chegar |
| C-03 | C-06 / C-07 | Toque em CategoryTile / ServiceCard | Push | |
| C-03 | C-11 | Toque em OrderStatusCard | Push modal (pilha de pedido) | Acessível de qualquer aba |
| C-07 | C-08 | "Pedir agora"/"Agendar" em serviço com insumos | Push | Pulado se não há insumos (vai a C-09) |
| C-08 | C-09 | "Continuar" | Push | |
| C-09 | C-10 | `POST /requests` com sucesso | Substituição da pilha de pedido | Impede voltar ao checkout |
| C-10 | C-11 | `order.updated` para `ACCEPTED` | Transição in-place (mesma rota) | Animação do mapa |
| C-11 | C-12 | IconButton chat | Push | |
| C-11 | C-14 | `quote.created` ou toque no cartão inline | Push modal | Também por deep link |
| C-11 | C-15 | `payment.updated(FAILED/EXPIRED)` | Push modal | Também por deep link |
| C-11 | C-17 | `COMPLETED` + "Avaliar" | Push modal | Push RF-N-010 abre direto aqui |
| C-11 | C-32 | "Cancelar pedido" | BottomSheet | |
| C-16 | C-09 | "Pedir de novo" | Push com dados pré-preenchidos | |
| C-20 | C-21 | "Assinar {plano}" | Push | |
| C-24 | C-25 | `POST /concierge/requests` | Substituição | Skeleton até `PLAN_PROPOSED` |
| P-01 | P-02 ou P-09 ou P-10 | OTP válido | Substituição | Conforme `Provider.status` e progresso do onboarding |
| P-10 | P-11 | `offer.created` | Modal de tela cheia sobre qualquer rota | Também pela notificação |
| P-11 | P-12 | "Aceitar" com `200` | Substituição | `409` fecha o modal |
| P-12 | P-13 | "Saí para o atendimento" | Transição in-place | Mesma rota `orders/[id]` |
| P-13 | P-14 | Guard de evidência pendente ou toque em "Evidências" | Push | Volta a P-13 ao salvar |
| P-13 | P-15 | "Orçamento adicional" | Push | |
| P-13 | P-16 | "Concluir serviço" com guards satisfeitos | Substituição | |
| P-16 | P-10 | "Enviar" | Volta à raiz | Toast "Serviço concluído. Repasse previsto: sexta" |
| O-03 | O-05 | Clique na linha | Página | Painel lateral quando vindo de O-02 |
| O-05 | O-06 | "Atribuir profissional" | Página | |
| O-06 | O-05 | "Atribuir" com sucesso | Volta | Toast com confirmação |
| A-01 | A-02 | Aba "Serviços" ou "Novo serviço" | Drawer | Mantém a árvore visível |

## 8. Eventos de analytics por tela

Nomes em `packages/contracts/analytics` (ADR-013). Propriedades mínimas: `screenId`, `userId` (hash), `orderId?`, `serviceSlug?`, `regionId?`.

| Tela | Eventos | Propriedades específicas |
|---|---|---|
| C-01 | `otp_requested`, `otp_verified`, `otp_failed`, `login_completed`, `signup_completed` | `attempt`, `reason` |
| C-03 | `home_view`, `home_section_impression`, `home_section_click` | `sectionType`, `sectionId`, `position`, `reason` (recomendações) |
| C-04 | `search_performed`, `search_result_click`, `search_empty` | `query`, `resultsCount`, `position` |
| C-06 / C-07 | `category_viewed`, `service_viewed`, `service_cta_click` | `pricingModel`, `workflowKind`, `cta` (now/schedule) |
| C-08 / C-09 | `service_request_started`, `checkout_viewed`, `coupon_applied`, `coupon_rejected`, `order_created`, `order_create_failed` | `hasPhotos`, `paymentMethodType`, `windowType`, `errorCode` |
| C-10 / C-11 | `order_tracking_viewed`, `provider_matched`, `pin_viewed`, `chat_opened`, `cancel_started`, `cancel_confirmed`, `cancel_abandoned` | `status`, `phase`, `feeCents` |
| C-14 | `quote_viewed`, `quote_decided` | `quoteKind`, `decision`, `amountCents`, `secondsToDecide` |
| C-15 | `payment_viewed`, `payment_failed`, `payment_recovered`, `pix_copied` | `method`, `reason`, `attempt` |
| C-17 | `review_started`, `review_submitted`, `reorder_started` | `rating`, `tags[]`, `hasComment` |
| C-18 | `dispute_opened` | `reason` |
| C-20 a C-22 | `plan_viewed`, `subscription_started`, `subscription_paused`, `subscription_cancelled`, `visit_confirmed`, `visit_rescheduled` | `planSlug` |
| C-24 / C-25 | `concierge_submitted`, `concierge_plan_viewed`, `concierge_plan_approved`, `concierge_plan_changes_requested` | `inputType`, `tasksCount`, `needsHuman` |
| P-02 a P-09 | `onboarding_step_completed`, `document_uploaded`, `onboarding_submitted` | `step`, `docType` |
| P-10 | `availability_changed` | `from`, `to` |
| P-11 | `offer_viewed`, `offer_accepted`, `offer_declined`, `offer_expired` | `secondsToDecide`, `distanceM`, `netCents`, `wave` |
| P-13 / P-14 | `transition_attempted`, `transition_succeeded`, `transition_rejected`, `evidence_uploaded`, `custody_recorded` | `action`, `reason`, `evidenceKind`, `offlineQueued` |
| P-15 | `quote_sent`, `quote_cancelled` | `itemsCount`, `amountCents` |
| P-20 / P-21 | `earnings_viewed`, `payout_viewed` | `period` |
| O-02 / O-03 | `ops_queue_viewed`, `ops_order_opened` | `queue`, `waitingSeconds` |
| O-06 | `ops_assign_started`, `ops_assign_completed` | `mode`, `candidatesCount`, `includedExcluded` |
| O-08 | `dispute_resolved` | `decision`, `refundCents` |
| A-01 / A-02 | `admin_category_saved`, `admin_service_saved`, `admin_service_published`, `admin_preview_opened` | `workflowKind`, `pricingModel` |
| A-06 | `admin_matching_saved`, `admin_matching_tested` | `categoryId` |

## 9. Comportamentos e gestos das telas críticas

| Tela | Comportamento | Regra |
|---|---|---|
| C-03 | Puxar para atualizar recarrega `GET /catalog/home`; cartão "Em andamento" persiste acima das Tabs em todas as abas | Atualização automática ao voltar ao primeiro plano após 60 s |
| C-07 | Barra inferior fixa some ao rolar para baixo e volta ao rolar para cima | Preço sempre visível na barra |
| C-09 | Botão primário fica desabilitado enquanto o cupom valida; duplo toque é ignorado (`Idempotency-Key`) | Confirmação não pode ser repetida por voltar |
| C-11 | BottomSheet com três paradas (30 %, 55 %, 90 %); mapa segue o prestador até o usuário arrastar; botão "Recentralizar" aparece então | Em `IN_PROGRESS` a parada padrão sobe para 55 % |
| C-14 | Aprovar exige toque único; recusar pede motivo opcional em folha; sem gesto de deslizar para evitar aprovação acidental | Decisão dispara haptic leve |
| C-17 | Estrelas respondem a toque e arraste; nota pode ser alterada até enviar | Enviar fecha a tela e volta ao pedido |
| P-11 | Nenhum gesto de voltar; aceitar com toque único; tela fecha sozinha ao expirar | Som e vibração ao abrir mesmo em modo silencioso quando permitido |
| P-13 | Botão principal exige toque único; etapas irreversíveis (Concluir) pedem confirmação em folha de uma linha | `409` recarrega sem repetir a ação |
| P-14 | Câmera abre com guia de enquadramento por tipo de foto; fotos ficam na fila local até confirmar envio | Metadados de localização removidos |
| P-20 | Alternar período anima os valores; extrato pagina por rolagem | Lançamentos congelados por contestação têm ícone e explicação ao toque |
| O-02 | Teclas: F foca filtros, 1–4 alternam filas; clique com botão direito em pino abre menu de ações | Atualização em tempo real sem reposicionar o mapa |
| O-06 | Ordenação por coluna; Enter atribui o selecionado; Esc volta | Linha excluída só é selecionável com "Incluir excluídos" ativo |
| A-01 / A-02 | Arrastar reordena com salvamento explícito; sair com alterações pendentes pede confirmação | Pré-visualização atualiza ao salvar, não a cada tecla |

## 10. Checklist de acessibilidade por tela crítica

| Verificação | C-03 | C-07 | C-09 | C-11 | C-14 | C-17 | P-11 | P-13 | P-20 | O-02 | O-06 | A-01 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ordem de foco segue a hierarquia visual | sim | sim | sim | sim | sim | sim | sim | sim | sim | sim | sim | sim |
| Ação principal anunciada com verbo e objeto | sim | sim | sim | sim | sim | sim | sim | sim | n/a | n/a | sim | sim |
| Status anunciado ao mudar (live region) | sim | n/a | n/a | sim | sim | n/a | sim | sim | n/a | sim | n/a | n/a |
| Mapa tem alternativa textual (ETA, distância) | n/a | n/a | n/a | sim | n/a | n/a | sim | sim | n/a | sim | sim | n/a |
| Contagem regressiva não é a única indicação | n/a | n/a | n/a | n/a | sim | n/a | sim | n/a | n/a | n/a | n/a | n/a |
| Tamanho dinâmico até 200 % sem corte | sim | sim | sim | sim | sim | sim | sim | sim | sim | n/a | n/a | n/a |
| Alvos de toque ≥ 44 pt | sim | sim | sim | sim | sim | sim | sim | sim | sim | n/a | n/a | n/a |
| Operável só por teclado | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | sim | sim | sim |
| Cor nunca é a única diferença de estado | sim | sim | sim | sim | sim | sim | sim | sim | sim | sim | sim | sim |

## 11. Variantes de C-11 e P-13 por `workflowKind`

As rotas são as mesmas; a tela muda apenas o que renderiza a partir de `order_events`, dos guards declarados na `WorkflowDefinition` e de `ServiceCategory.config`.

| `workflowKind` | C-11: zona de mapa | C-11: ação contextual | P-13: etapas na linha do tempo | P-14: evidências exigidas |
|---|---|---|---|---|
| `IMMEDIATE` | Prestador em movimento em `EN_ROUTE`/`ARRIVED` | PIN em `ARRIVED`; orçamento inline; avaliar | Saí → Cheguei → Iniciar → Concluir | Fotos `BEFORE`/`AFTER` conforme categoria |
| `SCHEDULED` | Estático até `EN_ROUTE`; contagem até a janela | "Reagendar" até `REMINDED`; PIN; avaliar | Idem, com data e janela no cabeçalho | Idem |
| `QUOTE` | Estático | `[RECUSAR]` `[APROVAR]` do orçamento inicial em `QUOTED` | Analisar → Enviar orçamento → (após aprovação) Saí → Cheguei → Iniciar → Concluir | Fotos do diagnóstico em `UNDER_REVIEW` |
| `LOGISTICS` | Dois destinos (retirada e devolução); veículo em trânsito | Confirmação digital em `PICKED_UP` e `DELIVERED`; aprovar adicional do terceiro | Saí → Retirei → Em trânsito → No destino → Pronto → Retirei → Voltando → Entreguei | QR, fotos, odômetro, checklist, assinatura |
| `LAUNDRY` | Idem `LOGISTICS` | Conferir contagem de itens | Idem `LOGISTICS` com contagem por QR | QR por saco, fotos, contagem |
| `CONCIERGE` | Sem mapa no pai; filhas abrem o próprio C-11 | Aprovar plano; aprovar orçamento; ver filhas | Não há P-13 para o pai; cada filha tem o seu | Conforme filha |

## 12. Ordem de implementação sugerida das telas MVP

| Onda | Telas | Motivo |
|---|---|---|
| 1 | C-01, C-02, C-03 (seções `hero`, `categories`, `quick_services`, `in_progress`), C-05, C-06, C-07, C-09, C-10, C-11 (sem mapa), P-01 a P-10, P-11, P-12, P-13, P-16, W-00, O-03, O-05, O-06, A-01, A-02, A-03, A-07 | Caminho feliz completo UI → API → regra → banco → evento (ADR-015) com dispatch manual como rede de segurança |
| 2 | C-11 (mapa e localização), C-12, P-14, P-15, C-14, P-18, C-15, C-16, C-17, P-20, P-21, O-02, O-12, A-05, A-06, A-14 | Acompanhamento, evidências, orçamento adicional, pagamento e repasse |
| 3 | C-18, P-28, O-07, O-08, O-09, C-29, P-26, C-30, P-25, C-26 a C-28, P-22 a P-24, P-27, A-08, A-09, A-12, A-16, A-18, A-19, A-20, O-01, O-04, O-11, O-13 | Exceções, suporte, configuração e observabilidade de negócio |
| 4 (V1) | C-08 (veículo, itens), C-13, C-20 a C-25, C-31, C-33, P-17 (folgas), O-10, A-04 (polígonos), A-10, A-11, A-13, A-17 | Workflows `QUOTE`, `LOGISTICS`, `LAUNDRY`, `CONCIERGE`, assinaturas |
