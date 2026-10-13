# 02 — Engenharia reversa funcional do iFood como benchmark para o VÉLIO

Data: 2026-10-13. Documento de produto. Complementa `01_CURRENT_STATE_AUDIT.md` e `ARCHITECTURE_DECISIONS.md` (ADR-005 a ADR-007, ADR-009, ADR-014). Não contém código nem decisão técnica nova; propõe o que o VÉLIO herda, adapta ou descarta do modelo de marketplace de comida mais maduro do Brasil.

---

## 1. Objetivo e método

### 1.1 Objetivo

O iFood é o marketplace on-demand de maior escala no Brasil e, portanto, o produto que já educou o consumidor brasileiro sobre o que esperar de um app que "manda alguém até a sua casa". O VÉLIO não compete com o iFood, mas herda as expectativas que ele criou: acompanhamento em tempo real, previsão de chegada, cupom no checkout, PIX, chat com quem está a caminho, cancelamento com reembolso rápido. Este documento mapeia, funcionalidade por funcionalidade, como esse modelo funciona do ponto de vista de um usuário, de um parceiro, de um entregador e da operação, e traduz cada item para o domínio do VÉLIO (serviços executados na casa do cliente ou em bens do cliente, com orçamento, agendamento, recorrência e cadeia de custódia).

Perguntas que o documento responde:

1. Que mecanismos de confiança, velocidade e conveniência o consumidor já considera "padrão" por causa do iFood?
2. Quais desses mecanismos se transferem diretamente para serviços e quais mudam de natureza?
3. Que vocabulário de estados, janelas de tempo, penalidades e repasses o VÉLIO deve adotar para não reinventar o que o mercado já validou?
4. O que, no modelo de comida, é ruído para um marketplace de serviços e deve ficar de fora para não inflar o MVP?

### 1.2 O que foi observado

- Comportamento público dos aplicativos do consumidor, do parceiro (restaurante) e do entregador, descrito pela imprensa especializada e por materiais de integradores (Saipos, Bling) e de educação financeira (Serasa).
- Políticas públicas de cancelamento, reembolso, comissão e repasse conforme divulgadas por terceiros; quando a central de ajuda oficial é referenciada, é apenas apontada como fonte primária a consultar.
- Lançamentos de produto noticiados entre 2019 e abril de 2026: retirada no restaurante, agendamento de pedido, acompanhamento em tela bloqueada e relógio, escolha de rotas pelo entregador.

### 1.3 Limites éticos e legais

- Nenhuma informação foi obtida por acesso autenticado, interceptação de tráfego, descompilação de aplicativo ou raspagem de dados protegidos. Só comportamento visível a qualquer usuário ou noticiado publicamente.
- Nenhum texto de interface, imagem, layout ou marca do iFood é reproduzido ou sugerido como ativo do VÉLIO. O que se extrai são padrões de produto e de operação, que não são protegidos por direito autoral nem por marca.
- Trechos de artigos foram parafraseados, nunca transcritos. Dados numéricos (comissão, taxa mínima, prazos) são de fonte pública, citados com link e data aproximada, e podem estar desatualizados no momento da leitura. Antes de qualquer decisão comercial, confirmar na fonte primária.
- Nenhuma métrica interna do iFood (conversão, tempo médio de entrega, taxa de cancelamento, GMV por cidade) é estimada ou inventada. Onde a empresa divulgou um número em comunicado, ele é marcado como "informado pela empresa".

### 1.4 Como ler as tabelas

As seções 3.1 a 3.4 trazem uma tabela por perspectiva (CONSUMIDOR, PARCEIRO, LOGÍSTICA/ENTREGA, PLATAFORMA). Cada linha é uma funcionalidade, com sete colunas fixas:

| Coluna | Significado |
|---|---|
| FUNCIONALIDADE | Nome curto da capacidade, no vocabulário do usuário |
| PROBLEMA QUE RESOLVE | A fricção ou o risco que a funcionalidade elimina para quem a usa |
| COMO FUNCIONA NO MODELO DE MARKETPLACE | Descrição do comportamento observado no marketplace de comida, sem citar texto de interface |
| COMO ADAPTAR AO VÉLIO | Tradução para o domínio de serviços, usando o vocabulário canônico do projeto (ServiceRequest, ServiceOrder, OrderEvent, Quote, Booking, Subscription, Provider, ProviderAvailability, ProviderMatchScore, Wallet/Payout/Commission, MediaEvidence, Dispute, SupportTicket, Concierge) e os estados de ordem em UPPER_SNAKE |
| PRIORIDADE | MVP (necessário para operar a primeira cidade), V1 (primeiros 6 meses após o lançamento), V2 (escala e eficiência), V3 (diferenciação de longo prazo) |
| COMPLEXIDADE | Baixa, Média ou Alta, considerando produto, operação e integração, não só código |
| DEPENDÊNCIAS | Outras funcionalidades, módulos (ADR-003) ou decisões que precisam existir antes |

Convenções de estados usadas na coluna "COMO ADAPTAR AO VÉLIO" (todas em inglês, UPPER_SNAKE, conforme ADR-005):

| Grupo | Estados |
|---|---|
| Entrada | REQUESTED, MATCHING, OFFERED, ACCEPTED, NO_PROVIDER_FOUND |
| Orçamento | QUOTED, QUOTE_APPROVED |
| Execução no local | EN_ROUTE, ARRIVED, IN_PROGRESS, COMPLETED, REVIEWED |
| Logística de bens | PICKED_UP, IN_TRANSIT, DELIVERED |
| Exceções | CANCELLED_BY_CUSTOMER, CANCELLED_BY_PROVIDER, CANCELLED_BY_PLATFORM, CANCELLED_NO_SHOW, DISPUTED |

Estados de disponibilidade do prestador (ProviderAvailability): OFFLINE, ONLINE, BUSY, UNAVAILABLE.

A prioridade é a do VÉLIO, não a do iFood. Uma funcionalidade pode ser central no iFood e irrelevante no MVP do VÉLIO (carrinho multi-item) ou inexistente no iFood e obrigatória no VÉLIO (orçamento aprovado antes da cobrança).

---

## 2. Diferenças estruturais entre marketplace de comida e marketplace de serviços

Antes das tabelas, é preciso fixar por que o VÉLIO não pode ser "um iFood de serviços". As diferenças abaixo mudam a natureza de quase toda funcionalidade herdada.

| Dimensão | Marketplace de comida | Marketplace de serviços (VÉLIO) | Consequência de produto |
|---|---|---|---|
| Unidade de venda | Item de cardápio com preço fixo, quantidade e opcionais; a transação é um "pedido" com vários itens | Um serviço (ou uma visita) com escopo, duração estimada e preço que pode ser fixo, por faixa ou por orçamento | O "carrinho" perde centralidade; a unidade é a ServiceOrder, quase sempre com um único serviço principal e adicionais via Quote |
| Duração da transação | 20 a 60 minutos entre pedido e entrega; o restaurante prepara em paralelo ao deslocamento | De 30 minutos (pequena entrega) a dias (revisão de veículo, lavanderia); a execução acontece depois da chegada, não antes | Linha do tempo com fases distintas (deslocamento, execução, devolução); a previsão não é um único horário de chegada |
| Local de execução | Cozinha do parceiro; o cliente só recebe o produto final na porta | Casa do cliente, ou bem do cliente (carro, roupa) levado para fora e trazido de volta | Segurança física, identidade verificada do prestador, OTP de início e fim, evidência fotográfica; o prestador entra no espaço privado do cliente |
| Variabilidade de preço | Baixa; o preço do item está no cardápio e muda raramente | Alta; o problema real só é conhecido no local (vazamento, defeito do compressor, tipo de tecido) | Estimativa em faixa no checkout, Quote formal antes de qualquer cobrança adicional, aprovação explícita do cliente |
| Necessidade de orçamento | Inexistente | Frequente em encanador, eletricista, ar-condicionado, revisão | Estados QUOTED e QUOTE_APPROVED no workflow; segunda intenção de pagamento só após aprovação (ADR-007) |
| Confiança e segurança | Confiança na marca do restaurante e na nota; risco limitado a qualidade do alimento | Confiança na pessoa que entra na casa; risco de dano, furto, acidente, serviço mal executado com consequência duradoura | Verificação documental e de antecedentes, seguro ou fundo de garantia, prova de execução, Dispute estruturada |
| Agendamento | Exceção (pedido agendado existe, mas a maioria é imediata) | Regra para a maioria das categorias; imediato é exceção (emergência hidráulica, pequena entrega) | Booking como entidade de primeira classe, com janelas de horário, lembretes e confirmação do prestador no dia anterior |
| Recorrência | Recompra espontânea; o app sugere "pedir de novo" | Assinatura formal (limpeza de ar-condicionado trimestral, lavanderia semanal, lavagem de carro quinzenal) | Subscription gera Bookings futuros automaticamente; cobrança recorrente; preferência por manter o mesmo Provider |
| Logística | Um sentido: parceiro → cliente, uma perna, sem retorno | Ida e volta: coleta → execução externa → devolução (lavanderia, carro, revisão); ou prestador vai e volta sem bem | Dois trechos logísticos por ordem, com estados PICKED_UP, IN_TRANSIT, DELIVERED em cada perna, e janela de devolução prometida |
| Cadeia de custódia de bens | Inexistente (o bem é consumível, entregue uma vez) | Central em lavanderia e veículos: o VÉLIO fica responsável por um bem do cliente durante horas ou dias | QR Code por item ou lote, fotos no recebimento e na devolução, quilometragem registrada, checklist assinado por OTP em cada transferência de posse |
| Papel do parceiro | Pessoa jurídica com estabelecimento, equipe e cardápio | Majoritariamente pessoa física ou MEI, muitas vezes sozinho, que se desloca | Onboarding com verificação individual, agenda pessoal, ProviderAvailability por pessoa e não por loja |
| Papel do entregador | Terceiro independente do restaurante, escolhido pela plataforma | Frequentemente a mesma pessoa que executa o serviço; em lavanderia e veículos, um motorista separado | Dispatch precisa tratar "prestador que se desloca" e "logística separada" como dois perfis distintos |
| Falha típica | Atraso, item faltando, comida fria | Prestador não aparece, diagnóstico errado, dano ao imóvel ou ao bem, serviço incompleto | Penalidades por no-show, janela de garantia pós-conclusão, DISPUTED como estado de ordem e não só como ticket |
| Densidade de oferta | Milhares de parceiros por cidade; sempre há alguém aberto | Dezenas de prestadores por categoria por cidade no início; é comum não haver ninguém | NO_PROVIDER_FOUND é um estado esperado, com fallback para operador humano e proposta de novo horário |
| Pico de demanda | Horário de refeição, previsível diariamente | Pico por evento (chuva, calor, fim de mês) e por dia da semana; menos previsível | Precificação dinâmica de deslocamento com teto, incentivo a prestador em janela de alta demanda |

### 2.1 Implicações diretas para o VÉLIO

1. A ServiceRequest é a entrada; a ServiceOrder é o contrato. No iFood a entrada e o contrato são o mesmo objeto porque o preço é conhecido. No VÉLIO, a ServiceRequest descreve o problema (texto, fotos, categoria, endereço, janela) e só vira ServiceOrder com preço fechado após matching ou após Quote aprovada.
2. O tempo não é um número único. O iFood promete um horário de chegada. O VÉLIO promete uma janela de chegada (Booking) e, separadamente, uma duração estimada de execução e, quando houver bem levado, uma janela de devolução.
3. A pessoa é o produto. O cliente do iFood escolhe o restaurante; o prestador é fungível. No VÉLIO, o cliente aceita que a plataforma escolha o Provider, mas precisa ver quem é antes de abrir a porta: nome, foto, documento verificado, nota, número de serviços na categoria.
4. A plataforma assume custódia. Em lavanderia, lavagem e revisão, o VÉLIO toma posse temporária de um bem. Isso exige MediaEvidence obrigatória e QR Code em cada transferência, algo que o modelo de comida nunca precisou.
5. A ausência de oferta é um caso de uso. Em uma cidade nova, NO_PROVIDER_FOUND será frequente. O produto precisa tratar isso com dignidade: oferecer horários alternativos, abrir chamado para o operador, avisar quando alguém aceitar.

---

### 2.2 O que o consumidor brasileiro já considera padrão por causa do marketplace de comida

Expectativas que o VÉLIO não pode deixar de atender, porque o usuário as traz prontas de outro app:

1. Saber em quanto tempo alguém chega, como faixa, e ver essa faixa mudar conforme o pedido avança.
2. Ver no mapa quem está vindo, com nome e foto, antes de abrir a porta.
3. Pagar com PIX e com cartão salvo, sem digitar dados a cada compra.
4. Aplicar cupom no checkout e ver o desconto antes de confirmar.
5. Falar com quem está a caminho por chat dentro do app, sem trocar telefone.
6. Cancelar pelo próprio app, saber na hora se há custo e quando o dinheiro volta.
7. Receber reembolso em PIX em minutos e ter a opção de crédito imediato.
8. Avaliar com um toque e motivos prontos, sem ser obrigado a escrever.
9. Encontrar o histórico com recibo e repetir uma compra em dois toques.
10. Abrir ajuda a partir do pedido, com o problema já classificado, e não de um menu genérico.
11. Agendar escolhendo entre horários prontos, e filtrar quem aceita agendamento.
12. Ser avisado proativamente de atraso, em vez de descobrir sozinho.

O que o consumidor ainda não espera, e o VÉLIO precisa ensinar com clareza no primeiro uso: que o preço pode ser uma faixa até o diagnóstico; que ele vai aprovar um orçamento antes de qualquer cobrança extra; que vai informar um código para o serviço começar e outro para encerrar; que, quando o bem sai de casa, cada passagem de mão é registrada com fotos e QR Code.

## 3. Mapeamento funcional por perspectiva

### 3.1 CONSUMIDOR

Contexto observado: o aplicativo do consumidor é otimizado para decisão rápida em uma sessão curta. A home mostra categorias, destaques e promoções; a busca cobre estabelecimentos e itens; a página do estabelecimento concentra cardápio, nota, tempo e taxa; o checkout reúne endereço, pagamento, cupom e observações; o acompanhamento mostra fases do pedido e, quando há entregador, posição no mapa. O cancelamento, o reembolso e o atendimento vivem dentro do próprio pedido.

| FUNCIONALIDADE | PROBLEMA QUE RESOLVE | COMO FUNCIONA NO MODELO DE MARKETPLACE | COMO ADAPTAR AO VÉLIO | PRIORIDADE | COMPLEXIDADE | DEPENDÊNCIAS |
|---|---|---|---|---|---|---|
| Onboarding | Levar o usuário novo até o primeiro pedido com o mínimo de fricção | Cadastro curto por telefone ou conta social; endereço pedido logo após; permissões de localização e notificação solicitadas no contexto de uso, não no primeiro acesso | Cadastro por telefone + OTP (ADR-008); primeira tela pergunta "o que você precisa" e já aceita texto livre para o Concierge; endereço só na hora de pedir; permissões no contexto | MVP | Baixa | identity, geo |
| Login | Voltar ao app sem senha e sem perder histórico | Código por SMS ou link mágico; sessão longa; reautenticação só para ações sensíveis | OTP por telefone; refresh token rotativo de 30 dias; reautenticação para trocar telefone, adicionar cartão ou ver dados de pagamento | MVP | Baixa | identity, SmsSender |
| Localização | Mostrar só o que pode ser atendido onde o usuário está | GPS para sugerir endereço; a oferta visível muda com o endereço escolhido; fora da área de cobertura aparece aviso | Geo define a área de cobertura por categoria (um encanador cobre mais que uma lavanderia com coleta); fora de cobertura, o app aceita a ServiceRequest em lista de espera e avisa quando a categoria abrir na região | MVP | Média | geo, catalog |
| Endereço | Garantir que o prestador chegue ao lugar certo | Busca por CEP ou texto, ajuste de pino no mapa, complemento, ponto de referência, apelido (casa, trabalho); múltiplos endereços salvos | Mesmo padrão, mais campos próprios de serviço: tipo de imóvel, andar, portaria, estacionamento, acesso para carro (lavagem), horário em que o condomínio permite obra; endereço é cópia imutável dentro da ServiceOrder | MVP | Baixa | geo |
| Home | Reduzir o tempo até a intenção de compra | Blocos de categoria, destaques pagos, "pedir de novo", promoções do dia, busca no topo | Home orientada a intenção: campo de linguagem natural (Concierge) no topo, categorias de serviço abaixo, "agendar de novo" e próximas visitas de Subscription em destaque; nada de vitrine de itens | MVP | Média | catalog, concierge, subscriptions |
| Categorias | Permitir navegação quando o usuário não sabe o nome exato do que quer | Grade de categorias de culinária e de tipo de loja; cada categoria filtra a lista de estabelecimentos | Categorias por problema e não por profissão ("vazamento", "sem energia em um cômodo", "ar não gela") mapeadas para categorias de Provider; cada categoria define fluxo (imediato, agendado, orçamento, logístico) via WorkflowDefinition (ADR-005) | MVP | Média | catalog, workflow |
| Busca | Encontrar algo específico rapidamente | Busca textual por loja e por item com autocompletar, correção e histórico | Busca textual sobre catálogo de serviços e sinônimos populares; resultado leva à ServiceRequest da categoria, não a um prestador; busca por nome de prestador favorito em V1 | V1 | Média | catalog |
| Recomendações | Aumentar frequência sugerindo o que o usuário tende a querer | Blocos personalizados por histórico, horário e localização | Sugestões por sazonalidade e histórico (limpeza de ar-condicionado antes do verão, revisão perto da quilometragem informada), e recomendação de Subscription após a segunda compra avulsa da mesma categoria | V2 | Média | analytics, subscriptions |
| Ranking | Decidir a ordem de exibição entre centenas de opções | Mistura de relevância, distância, nota, tempo estimado, taxa de entrega e patrocínio | O cliente não escolhe o Provider na maioria dos fluxos; o ranking vira ProviderMatchScore com pesos configuráveis por categoria (ADR-006); quando a categoria permite escolha (V1), a lista é ordenada pelo mesmo score, sem patrocínio no MVP | MVP | Alta | dispatch, reputation |
| Filtros | Restringir a lista por critérios objetivos | Filtros por entrega grátis, tempo, nota, aceita agendamento, retirada, forma de pagamento, tipo de culinária | No MVP os filtros são do pedido, não da lista: "hoje", "amanhã", "esta semana", "orçamento primeiro", "mesmo prestador da última vez"; filtros sobre lista de prestadores só em V1 nas categorias com escolha | V1 | Baixa | catalog, booking |
| Página do estabelecimento | Dar confiança e informação antes de comprar | Nota, número de avaliações, tempo e taxa estimados, distância, cardápio por seções, informações da loja, horário de funcionamento | Página da categoria de serviço (o que inclui, o que não inclui, faixa de preço, duração típica, o que preparar) e, após matching, cartão do Provider com foto, nome, documento verificado, nota, serviços concluídos na categoria, selo de verificação de antecedentes | MVP | Média | catalog, reputation, identity |
| Catálogo | Mostrar o que pode ser comprado e por quanto | Cardápio com seções, itens, fotos, descrição, opcionais obrigatórios e opcionais, indisponibilidade em tempo real | Catálogo de serviços por categoria com escopo padrão, itens adicionais previsíveis (metro de cano, gás, higienização extra) com preço de referência, e marcação explícita de "sujeito a orçamento"; versionado para que a ServiceOrder guarde o preço vigente | MVP | Média | catalog |
| Preço | Permitir decidir antes de confirmar | Preço por item, taxa de entrega, taxa de serviço da plataforma, total; promoções já aplicadas | Preço de visita ou preço fechado quando possível; faixa (mínimo e máximo) quando o escopo depende de diagnóstico; taxa de deslocamento separada; total máximo autorizado no cartão como pré-autorização; qualquer valor acima exige Quote aprovada | MVP | Alta | catalog, payments, quotes |
| Disponibilidade | Evitar frustração com loja fechada ou item esgotado | Loja fechada aparece com aviso e opção de agendar; item esgotado fica desabilitado | Disponibilidade é de janela de horário por categoria e região, calculada a partir de ProviderAvailability e agendas; o app mostra as próximas janelas com vagas e, se não houver, oferece lista de espera com aviso | MVP | Alta | dispatch, booking, geo |
| Carrinho | Reunir vários itens em uma compra | Carrinho por loja, com quantidade, observações por item, cálculo de total em tempo real | Não existe carrinho como centro; existe um resumo da ServiceRequest (categoria, descrição, fotos, endereço, janela, forma de pagamento); combinação de serviços só via Concierge, que gera várias ServiceOrders ligadas | MVP (resumo) | Baixa | orders |
| Checkout | Fechar a compra com o mínimo de campos | Tela única com endereço, horário, pagamento, cupom, CPF na nota, observações, troco; confirmação com um toque | Tela única com endereço, janela de Booking, descrição do problema com fotos, forma de pagamento, cupom, aceite de termos de orçamento ("você aprova antes de qualquer cobrança extra") e aceite de política de cancelamento; gera ServiceRequest em REQUESTED | MVP | Média | orders, payments, booking |
| Cupom | Aquisição e reativação a baixo custo | Campo de cupom no checkout, cupons automáticos, cupons de primeira compra, restrições por loja e valor mínimo | Cupom de primeira ServiceOrder, cupom por categoria, cupom de reativação, cupom de desculpas após incidente; sempre com valor mínimo e validade; aplicado sobre o valor do serviço, nunca sobre a taxa de deslocamento do Provider | MVP | Baixa | payments, promotions |
| Pagamento | Receber sem fricção e com segurança | Cartão salvo com token, PIX com QR e cópia-e-cola e prazo de expiração, vale-refeição, saldo em carteira, pagamento na entrega | Cartão tokenizado com pré-autorização do teto estimado e captura após COMPLETED; PIX para preço fechado e para Quote aprovada; Wallet com créditos de reembolso e promoção; sem dinheiro no MVP; adicional de Quote gera segunda intenção de pagamento (ADR-007) | MVP | Alta | payments, wallet, PaymentGateway |
| Confirmação | Tranquilizar o usuário de que o pedido existe e está sendo tratado | Tela de sucesso com número do pedido, previsão e estado inicial; e-mail ou push de confirmação | Tela com número da ServiceOrder, janela confirmada, estado MATCHING e expectativa realista ("procurando um profissional, até X minutos"); push ao entrar em ACCEPTED com cartão do Provider | MVP | Baixa | orders, notifications |
| Acompanhamento | Reduzir ansiedade e chamadas ao suporte | Linha do tempo com fases (recebido, em preparo, saiu, chegou), atualização automática, acesso pela home enquanto o pedido estiver ativo; acompanhamento em tela bloqueada no iOS desde 2022 e no Android e no relógio desde o início de 2025 (fonte: acontecendoaqui.com.br, fev/2025; macmagazine.com.br, nov/2022) | Linha do tempo gerada a partir de OrderEvents; fases distintas por tipo de fluxo (deslocamento, execução, coleta, devolução); cartão fixo na home enquanto houver ordem ativa; atividades ao vivo em tela bloqueada em V1 | MVP | Média | orders, realtime (ADR-009) |
| Mapa | Dar a sensação de controle sobre a chegada | Posição do entregador em tempo real a partir da coleta, rota e destino, atualização a cada poucos segundos | Posição do Provider apenas em EN_ROUTE e, para logística de bens, em IN_TRANSIT; política de frequência adaptativa (ADR-009); mapa escondido fora dessas fases para não gerar ansiedade durante a execução | MVP | Média | realtime, geo |
| Previsão | Alinhar expectativa e reduzir cancelamento por atraso | Horário estimado de chegada em faixa curta, recalculado conforme o pedido avança; atraso gera aviso proativo | Três previsões distintas: chegada (faixa de 20 a 40 minutos no imediato; janela de Booking no agendado), duração de execução (faixa), devolução (data e janela, para bens); recálculo a cada OrderEvent relevante; atraso previsto dispara aviso e opção de remarcar sem custo | MVP | Alta | orders, geo, booking |
| Status do pedido | Comunicar de forma inequívoca onde o pedido está | Conjunto fixo de estados visíveis ao cliente, com texto curto e ícone; estados internos não aparecem | Estados internos UPPER_SNAKE traduzidos para rótulos de cliente (MATCHING → "procurando profissional"; QUOTED → "orçamento aguardando sua aprovação"); nunca expor OFFERED nem rodadas de dispatch ao cliente | MVP | Baixa | orders |
| Chat | Resolver dúvidas sem telefone e sem expor número | Chat com o entregador e com a loja dentro do pedido, com mensagens rápidas prontas, disponível só enquanto o pedido está ativo; números mascarados | Chat por ServiceOrder entre cliente e Provider, ativo de ACCEPTED até 48 horas após COMPLETED; mensagens rápidas por fase ("estou chegando", "preciso de acesso à caixa d'água"); fotos no chat viram MediaEvidence; ligação mascarada por telefonia em V1; operador pode entrar na conversa | MVP | Média | communication, realtime |
| Notificações | Trazer o usuário de volta no momento certo | Push por mudança de estado, SMS como reserva, promoções segmentadas com frequência controlada | Push para cada transição relevante (ACCEPTED, EN_ROUTE, ARRIVED, QUOTED, COMPLETED), lembrete de Booking na véspera e uma hora antes, SMS de reserva para ARRIVED e QUOTED; promocionais só com opt-in e no máximo semanais | MVP | Média | communication, scheduled_jobs (ADR-012) |
| Cancelamento | Permitir desistir sem gerar conflito | Gratuito antes de a loja confirmar; depois da confirmação a loja pode aceitar ou recusar; atraso além de um limite (noticiado como 15 minutos para restaurantes e 30 para mercados) libera cancelamento com reembolso (fonte: canaltech.com.br, data não precisa; pode ter mudado) | Janelas por fluxo: grátis até ACCEPTED e até X horas antes do Booking; taxa parcial de deslocamento quando o Provider já está EN_ROUTE; taxa de visita quando ARRIVED; não cancelável em IN_PROGRESS (vira Dispute); atraso do Provider além da janela libera cancelamento sem custo; cada cancelamento gera CANCELLED_* com motivo | MVP | Média | orders, payments, policies |
| Atendimento | Resolver problemas sem o usuário sair do app | Central de ajuda dentro do pedido com motivos pré-classificados, autoatendimento para casos simples (item faltando, reembolso parcial) e escalada para humano | SupportTicket aberto a partir da ServiceOrder com motivo estruturado; resolução automática para casos de baixo valor e baixo risco; fila do operador no painel ops com SLA por gravidade; Concierge pode abrir e acompanhar tickets em linguagem natural | MVP | Média | support, ops |
| Reembolso | Devolver o dinheiro rápido e com previsibilidade | Reembolso para a forma original; PIX volta em minutos ou horas; cartão depende do emissor e pode levar um ou dois ciclos de fatura; alternativa de crédito em saldo do app para uso imediato (fonte: tecnoblog.net e saipos.com, datas diversas; prazos podem variar) | Reembolso para a forma original por padrão; oferta de crédito em Wallet como alternativa imediata, com bônus pequeno opcional; reembolso parcial ligado a item da Quote; toda devolução é lançamento no ledger (ADR-007) e OrderEvent | MVP | Média | payments, wallet |
| Avaliação | Alimentar a reputação e detectar problemas | Nota de 1 a 5 para loja e para entregador, só após a entrega, com motivos pré-definidos e comentário opcional; avaliação da loja é pública, do entregador é interna | Avaliação do Provider pelo cliente e do cliente pelo Provider, ambas só após COMPLETED e dentro de 7 dias, com motivos estruturados por categoria; nota baixa abre SupportTicket automático; estado REVIEWED fecha a ordem; avaliação do cliente é privada e alimenta o matching | MVP | Baixa | reputation |
| Histórico | Permitir consulta, recibo e repetição | Lista de pedidos com estado, valor, loja, recibo e opção de repetir ou pedir ajuda | Lista de ServiceOrders com estado, Provider, valor final, Quote aprovada, MediaEvidence (fotos antes e depois), recibo e nota fiscal quando houver; filtro por imóvel e por veículo | MVP | Baixa | orders, media |
| Recompra | Aumentar frequência com um toque | "Pedir de novo" repete o último pedido da loja; sugestão na home | "Agendar de novo" cria ServiceRequest pré-preenchida com a mesma categoria, endereço e preferência pelo mesmo Provider; após duas recompras, sugere Subscription | V1 | Baixa | orders, subscriptions |
| Favoritos | Reduzir busca e aumentar fidelidade a lojas | Marcar lojas favoritas, acessíveis em aba própria | Favoritar Provider; o favorito ganha peso no ProviderMatchScore para aquele cliente e recebe a oferta primeiro quando disponível; favoritar imóvel e veículo também, como "ativos" do cliente | V1 | Baixa | reputation, dispatch |

#### 3.1.1 Notas de adaptação do lado do consumidor

1. Retirada no estabelecimento, lançada publicamente em 2019 e expandida em 2020 (fonte: canaltech.com.br e consumidormoderno.com.br, 2019; startupi.com.br, 2020), é o análogo funcional do "leve e traga" invertido: o cliente vai até o parceiro. Para o VÉLIO isso corresponde a uma opção em lavanderia e lavagem de carro: "eu levo e busco" com desconto da taxa logística. Prioridade V2; não muda o domínio, só zera uma perna logística.
2. Pedido agendado, com horários pré-definidos e filtro para lojas que aceitam agendamento (fonte: tecnoblog.net e canaltech.com.br, datas diversas), mostra que o consumidor brasileiro já aceita escolher uma janela entre opções fixas. O VÉLIO deve oferecer janelas discretas (por exemplo, blocos de 2 horas) em vez de horário livre, porque isso simplifica a agenda do Provider e o dispatch.
3. A experiência de acompanhamento em tela bloqueada e no relógio é um sinal de que o acompanhamento virou produto em si. No VÉLIO, a fase em que isso mais importa é EN_ROUTE (o cliente precisa estar em casa). Vale investir em V1.
4. A regra de que a avaliação só é possível após a entrega deve ser mantida à risca: avaliação antes de COMPLETED gera viés e abre espaço para pressão do Provider sobre o cliente.

### 3.2 PARCEIRO

Contexto observado: o parceiro opera um aplicativo ou painel de gestão com recebimento de pedidos, aceite, controle de preparo, cardápio, horários, promoções, indicadores e financeiro. A plataforma oferece planos distintos com e sem logística própria; a comissão e a mensalidade variam por plano; o repasse ocorre em ciclos semanais com periodicidade escolhida pelo parceiro. Dados públicos de referência (podem estar desatualizados; confirmar na fonte primária antes de uso comercial):

| Dado | Valor noticiado | Fonte e data aproximada |
|---|---|---|
| Comissão do plano sem logística da plataforma | Cerca de 12% sobre o valor do pedido | serasa.com.br/blog/abrir-loja-no-ifood, consultado em out/2026; saipos.com, blog.bling.com.br |
| Comissão do plano com logística da plataforma | Cerca de 23% | Mesmas fontes |
| Taxa de pagamento online | Cerca de 3,2% adicional quando o cliente paga pelo app | Mesmas fontes; fontes mais antigas (2021) citavam 3% a 3,5% |
| Mensalidade | Cerca de R$ 110 (plano básico) e R$ 150 (plano com logística), cobrada só de lojas com faturamento acima de R$ 1.800 por mês | serasa.com.br, saipos.com; fontes antigas citam R$ 100 ou R$ 130 |
| Taxa de serviço cobrada do cliente | Entre R$ 0,99 e R$ 2,49 por pedido | serasa.com.br |
| Ciclo de apuração e repasse | Vendas apuradas em ciclos de 7 dias; pagamento em dia fixo da semana; parceiro escolhe periodicidade semanal, quinzenal ou mensal | saipos.com/integracoes/ifood/como-funciona-o-repasse-do-ifood, data não precisa |

| FUNCIONALIDADE | PROBLEMA QUE RESOLVE | COMO FUNCIONA NO MODELO DE MARKETPLACE | COMO ADAPTAR AO VÉLIO | PRIORIDADE | COMPLEXIDADE | DEPENDÊNCIAS |
|---|---|---|---|---|---|---|
| Cadastro | Trazer oferta para a plataforma com dados suficientes para operar e pagar | Cadastro por CNPJ com dados fiscais, endereço, conta bancária, categoria, horários, cardápio inicial; pode ser feito pelo próprio parceiro em autoatendimento | Cadastro do Provider por telefone + OTP, CPF ou CNPJ (MEI), documento com foto, selfie, comprovante de endereço, categorias pretendidas, certificações quando aplicável (NR-10 para eletricista, credenciamento para gás), veículo e CNH para quem se desloca ou transporta bens, conta bancária ou chave PIX | MVP | Média | identity, assets |
| Aprovação | Impedir oferta inadequada ou fraudulenta | Validação documental e fiscal; ativação após conferência; algumas categorias exigem documentação adicional | Fila de aprovação no painel ops com checklist por categoria; verificação de antecedentes via terceiro em V1; entrevista por vídeo ou teste prático para categorias de risco; Provider aprovado começa com limite de ordens simultâneas e de valor de Quote até acumular reputação | MVP | Média | ops, identity |
| Catálogo | Definir o que o parceiro vende | Cardápio editável pelo parceiro: seções, itens, fotos, descrições, opcionais, pausa de item | O catálogo é da plataforma por categoria (padroniza escopo e preço de referência); o Provider habilita subcategorias e adicionais que domina e informa equipamentos que possui (escada, máquina de pressão, manifold); não há catálogo livre por Provider no MVP | MVP | Baixa | catalog |
| Preços | Permitir ao parceiro controlar margem | Preço por item definido pelo parceiro; promoções e cupons co-financiados; a plataforma sugere preços | Preço de referência por categoria definido pela plataforma e exibido ao Provider antes do aceite com o valor líquido que ele receberá; Provider pode compor Quote dentro de tabela de referência por item; em V2, Provider com reputação alta pode ter faixa própria | MVP | Média | catalog, commission |
| Disponibilidade | Evitar pedidos que o parceiro não pode atender | Horário de funcionamento por dia, pausa imediata da loja, pausa de item, limite de pedidos simultâneos | ProviderAvailability com estados OFFLINE, ONLINE, BUSY, UNAVAILABLE; agenda semanal recorrente com exceções; raio de atuação por categoria; capacidade de ordens no mesmo dia; BUSY é automático em IN_PROGRESS; UNAVAILABLE para folga, férias ou bloqueio pela operação | MVP | Média | dispatch, booking |
| Pedidos | Dar visibilidade do que entrou e do que está em andamento | Lista de pedidos por estado com alerta sonoro, detalhe de itens e observações, impressão de comanda | Lista de ServiceOrders por estado com detalhe da ServiceRequest (descrição, fotos, endereço, janela, preço líquido), agenda do dia e da semana, próximas visitas de Subscription | MVP | Baixa | orders |
| Aceite | Garantir compromisso explícito antes de prometer ao cliente | Novo pedido exige confirmação em poucos minutos; sem resposta, o pedido pode ser cancelado automaticamente; aceite automático é configurável | Oferta (OFFERED) com expiração curta (60 a 120 segundos no imediato; alguns minutos no agendado); aceite muda para ACCEPTED e cria o compromisso; recusa com motivo alimenta o ProviderMatchScore; não responder conta como recusa leve; aceite automático só para Subscription com Provider fixo | MVP | Média | dispatch, realtime |
| Execução | Conduzir o pedido até a conclusão com registro | Parceiro avança o pedido entre fases (em preparo, pronto, saiu para entrega) por botões; em alguns casos a transição é automática | Provider avança EN_ROUTE → ARRIVED (com geofence) → IN_PROGRESS (com OTP/PIN do cliente) → COMPLETED (com OTP/PIN final e MediaEvidence obrigatória por categoria); se precisar de adicional, cria Quote e aguarda QUOTE_APPROVED; cada avanço é OrderEvent | MVP | Alta | orders, media, geo |
| Cancelamento | Permitir ao parceiro recusar o que não consegue cumprir, com consequência | Parceiro pode cancelar com motivo; cancelamentos frequentes afetam reputação e visibilidade; cancelamento após aceite pode gerar penalidade | CANCELLED_BY_PROVIDER com motivo estruturado; grátis em janela curta após ACCEPTED; a partir daí, penalidade gradual (redução de score, bloqueio temporário, multa descontada do Payout após reincidência); no-show do Provider gera CANCELLED_NO_SHOW e crédito ao cliente | MVP | Média | orders, reputation, wallet |
| Indicadores | Ajudar o parceiro a melhorar a operação | Painel com vendas, ticket médio, tempo de preparo, taxa de aceite, cancelamentos, avaliação, comparação com similares | Painel do Provider com ganhos por período, taxa de aceite, tempo de resposta a ofertas, pontualidade, nota média, taxa de Quote aprovada, cancelamentos; metas para subir de nível | V1 | Média | analytics, reputation |
| Reputação | Ordenar oferta por qualidade e dar incentivo a melhorar | Nota pública da loja, selo de destaque para quem cumpre critérios de qualidade, penalidades por descumprimento | Score interno de Provider com componentes (nota, pontualidade, aceite, cancelamento, disputas) e nível público (por exemplo, três faixas) que destrava limite de Quote, acesso a Subscriptions e prioridade no dispatch; nunca expor o score bruto | MVP | Média | reputation, dispatch |
| Avaliações | Dar retorno sobre a qualidade percebida | Parceiro vê notas e comentários por pedido e pode responder | Provider vê nota e motivos por ServiceOrder; resposta pública em V1; avaliação do cliente feita pelo Provider alimenta sinalização para a operação (cliente agressivo, endereço perigoso) | MVP | Baixa | reputation |
| Pagamentos | Dar transparência sobre o que foi vendido e o que foi retido | Extrato por pedido com valor bruto, comissão, taxa de pagamento, promoções co-financiadas e valor líquido | Extrato por ServiceOrder com valor bruto, Commission, taxa de pagamento, ajustes de Dispute, bônus de incentivo e líquido; ledger de dupla entrada (ADR-007); tudo em centavos | MVP | Média | wallet, commission |
| Repasses | Levar o dinheiro ao parceiro de forma previsível | Apuração em ciclos de 7 dias, pagamento em dia fixo, periodicidade escolhida pelo parceiro, antecipação com custo | Payout em lote com ciclo semanal padrão e opção de quinzenal; Provider novo recebe após período de carência curto; antecipação mediante taxa em V1; retenção parcial enquanto houver Dispute aberta na ordem | MVP | Média | wallet, payouts, scheduled_jobs |
| Suporte | Resolver problemas operacionais do parceiro | Central de ajuda, chat com atendimento, canais por assunto (pedido, financeiro, cadastro) | SupportTicket do Provider por assunto, chat com operador no painel ops, botão de emergência durante IN_PROGRESS (situação de risco no local) com prioridade máxima | MVP | Média | support, ops |

#### 3.2.1 Notas de adaptação do lado do parceiro

1. Dois planos com e sem logística própria é a decisão comercial mais relevante a herdar. No VÉLIO, a logística é parte do serviço em lavanderia, lavagem e revisão, e é a própria pessoa em encanador e eletricista. A tabela de Commission por categoria deve, portanto, refletir quem faz o deslocamento e quem assume a custódia, não um plano único.
2. Mensalidade só acima de um piso de faturamento é um mecanismo de proteção ao parceiro pequeno que o VÉLIO deve copiar em espírito: nenhum custo fixo para o Provider enquanto ele não atingir um volume mínimo mensal.
3. Repasse em ciclos semanais com escolha de periodicidade é padrão de mercado; o VÉLIO não deve prometer repasse diário no MVP, porque isso elimina a janela de retenção para Dispute.
4. O parceiro de comida controla o próprio cardápio; o Provider do VÉLIO não. Isso é deliberado: escopo padronizado é o que permite estimar preço antes do matching e comparar prestadores.

### 3.3 LOGÍSTICA / ENTREGA

Contexto observado: o entregador usa um aplicativo próprio, fica disponível em uma região, recebe ofertas de rota com valor e distância, aceita ou recusa, navega até o parceiro, confirma a coleta, navega até o cliente, confirma a entrega (às vezes com código), e vê ganhos por rota e acumulados. Em 2025 a plataforma anunciou escolha de região de destino e, em abril de 2026, um recurso que mostra lista de rotas disponíveis com valores para o entregador escolher (fonte: tiinside.com.br, 08/04/2026; gironews.com, 2025). Dados públicos de remuneração (podem estar desatualizados):

| Dado | Valor noticiado | Fonte e data aproximada |
|---|---|---|
| Taxa mínima por rota | R$ 7,00 para bicicleta e R$ 7,50 para moto e carro, em vigor desde 01/06/2025 (antes, R$ 6,50 para ambos) | mercadoeconsumo.com.br, 29/04/2025; economicnewsbrasil.com.br, 30/04/2025; brasildefato.com.br, 29/04/2025 |
| Valor por quilômetro | Cerca de R$ 1,50, sem reajuste no mesmo anúncio | economicnewsbrasil.com.br, 30/04/2025 |
| Escolha de rotas | Lista de pedidos próximos com valores para o entregador escolher; algoritmo considera proximidade, modal e necessidade de maquininha; piloto em 29 cidades; a empresa informou redução de 7% no tempo de alocação nos testes iniciais | tiinside.com.br e canaltech.com.br, 08/04/2026 |

| FUNCIONALIDADE | PROBLEMA QUE RESOLVE | COMO FUNCIONA NO MODELO DE MARKETPLACE | COMO ADAPTAR AO VÉLIO | PRIORIDADE | COMPLEXIDADE | DEPENDÊNCIAS |
|---|---|---|---|---|---|---|
| Disponibilidade | Saber quem pode receber uma rota agora | Entregador fica online em uma região; pode indicar região de destino preferida; offline não recebe ofertas | ProviderAvailability (ONLINE, BUSY, OFFLINE, UNAVAILABLE) por pessoa, com posição e raio; para motoristas de logística de bens, disponibilidade por turno e capacidade de carga (sacos de lavanderia, veículo em reboque ou condução) | MVP | Média | dispatch, geo |
| Dispatch | Decidir quem recebe a oferta | Oferta direcionada pelo sistema a um entregador por vez, com expiração; em 2026, lista de rotas disponíveis para escolha em cidades piloto | Dispatch em ondas: oferta aos N melhores por ProviderMatchScore por T segundos, ampliação de raio e de grupo nas ondas seguintes, fallback para fila do operador em NO_PROVIDER_FOUND (ADR-006); modo "lista de ordens disponíveis" para Providers verificados em V1, mantendo o score como ordem de exibição | MVP | Alta | dispatch, realtime, ops |
| Proximidade | Reduzir tempo e custo de deslocamento | Algoritmo prioriza entregador próximo ao parceiro e compatível com o modal | Distância é um componente do score, com peso configurável por categoria (alto para imediato, baixo para agendado em que a agenda importa mais); pré-filtro por bounding box e Haversine no MVP, PostGIS em V1 (ADR-004) | MVP | Média | geo, dispatch |
| Aceite | Garantir compromisso e medir confiabilidade | Oferta com valor, distância e tempo estimado; aceitar ou recusar em segundos; recusas afetam prioridade futura | OFFERED com expiração; o Provider vê categoria, distância, janela, valor líquido e observações do cliente antes de aceitar; recusa com motivo; três não-respostas seguidas levam a OFFLINE automático para proteger o cliente | MVP | Média | dispatch |
| Deslocamento | Dar ao cliente e à operação visibilidade de que alguém está vindo | Entregador segue para o parceiro e depois para o cliente; posição enviada continuamente; atrasos detectados pela plataforma | EN_ROUTE com telemetria por LocationPolicy (ADR-009); desvio de rota ou parada longa gera alerta na ops; previsão de chegada recalculada; cliente avisado se a chegada extrapolar a janela | MVP | Média | realtime, geo |
| Coleta | Registrar que o item saiu do parceiro | Confirmação de retirada no app; às vezes conferência de código do pedido | PICKED_UP com leitura de QR Code do lote (lavanderia) ou do veículo (etiqueta no para-brisa ou chave), fotos obrigatórias (MediaEvidence) do estado do bem, quilometragem e nível de combustível para veículos, checklist assinado por OTP do cliente | MVP (lavanderia e veículos) | Alta | media, orders |
| Localização | Permitir acompanhamento e auditoria | Posição do entregador em tempo real para cliente e operação; histórico por rota | Posição retransmitida apenas para a sala da ordem ativa; precisão pior que 100 m descartada; histórico de trajeto guardado por ordem para resolução de Dispute e cálculo de deslocamento | MVP | Média | realtime, geo |
| Navegação | Levar ao destino certo sem o entregador alternar entre apps | Botão que abre o navegador de preferência com o destino; instruções de acesso do cliente visíveis | Mesmo padrão: deep link para o app de navegação do Provider com endereço e complemento; observações de acesso (portaria, bloco, vaga) destacadas; nenhuma navegação própria no MVP | MVP | Baixa | geo |
| Conclusão | Encerrar a rota com confirmação do destinatário | Entrega confirmada pelo entregador; em alguns casos, código fornecido pelo cliente; sem contato, protocolo de tentativa e devolução | Para serviço no local: COMPLETED exige OTP/PIN do cliente e MediaEvidence de "depois"; para devolução de bens: DELIVERED exige OTP/PIN, fotos do bem devolvido e leitura do QR Code; ausência do cliente abre protocolo com tentativas e cobrança de nova visita | MVP | Alta | orders, media |
| Prova de entrega | Resolver contestações | Foto na entrega, código de confirmação, registro de horário e posição | Pacote de evidência por ordem: fotos antes e depois, checklist, quilometragem inicial e final, OTPs com horário e posição, QR Code lido em cada transferência de posse; disponível para cliente, Provider e operador na Dispute | MVP | Média | media, orders |
| Remuneração | Pagar de forma justa e previsível por rota | Valor por rota com piso mínimo e componente por quilômetro, com adicionais por chuva, horário ou alta demanda; valor exibido antes do aceite | Valor líquido exibido na oferta; taxa de deslocamento com piso por categoria e componente por quilômetro acima de uma franquia; adicional por janela de alta demanda com teto; para logística de bens, valor por perna | MVP | Média | commission, wallet |
| Histórico | Permitir conferência de ganhos e contestação | Lista de rotas com valor, distância, horário e estado; extrato diário e semanal | Lista de ServiceOrders executadas com valor líquido, distância percorrida, duração e eventuais ajustes; extrato por ciclo de Payout; exportação em V1 | MVP | Baixa | wallet |

#### 3.3.1 Notas de adaptação da logística

1. O movimento recente de mostrar ao entregador uma lista de rotas com valores para escolha, em vez de só empurrar uma oferta por vez, é a evolução natural do dispatch quando a oferta de mão de obra amadurece. O VÉLIO deve nascer com dispatch direcionado em ondas (controle de qualidade e de SLA) e abrir o modo "lista" só para Providers com reputação consolidada, em V1.
2. A taxa mínima por rota com componente por quilômetro é o modelo certo para o deslocamento do Provider, mas no VÉLIO ela é uma parcela do preço do serviço, visível ao cliente como "taxa de deslocamento", e não um valor negociado à parte.
3. A coleta, no modelo de comida, é trivial (pegar uma sacola). No VÉLIO ela é o momento de maior risco jurídico quando há bem envolvido. Por isso a coleta é a funcionalidade de maior complexidade da seção: QR Code, fotos, checklist, OTP, quilometragem.
4. Conclusão com código do cliente é, no modelo de comida, uma exceção para pedidos de alto valor. No VÉLIO é regra: nenhum IN_PROGRESS começa e nenhum COMPLETED acontece sem OTP/PIN do cliente ou de quem ele indicar.

### 3.4 PLATAFORMA

Contexto observado: por trás dos três aplicativos, a plataforma mantém matching e dispatch, reputação, pagamentos com múltiplos meios, comissão por plano, repasse em ciclos, atendimento em camadas (autoatendimento, chatbot, humano), promoções co-financiadas, antifraude em cadastro e pagamento, política de cancelamento por fase, SLAs de tempo e analytics para todos os lados. Em 2020 a empresa anunciou publicamente um fundo de assistência para restaurantes pequenos durante a pandemia (fonte: investnews.com.br e olhardigital.com.br, mar/2020), mostrando que fundos de proteção já fazem parte do repertório do setor.

| FUNCIONALIDADE | PROBLEMA QUE RESOLVE | COMO FUNCIONA NO MODELO DE MARKETPLACE | COMO ADAPTAR AO VÉLIO | PRIORIDADE | COMPLEXIDADE | DEPENDÊNCIAS |
|---|---|---|---|---|---|---|
| Matching | Escolher o melhor parceiro ou entregador para cada pedido | Combinação de distância, modal, disponibilidade, carga atual e histórico, com regras por cidade; o cliente escolhe a loja, a plataforma escolhe o entregador | ProviderMatchScore = soma ponderada de proximidade, qualificação na categoria, reputação, disponibilidade na janela, compatibilidade de preço, taxa de aceite, cancelamentos, favorito do cliente; pesos por categoria em `matching_configs`, nunca em código (ADR-006); toda rodada registrada | MVP | Alta | dispatch, reputation, geo |
| Dispatch | Transformar matching em compromisso real | Oferta sequencial com expiração e re-oferta automática; ampliação de busca quando ninguém aceita; intervenção manual rara | Ondas: N melhores por T segundos → ampliação de raio e de grupo → fila do operador (NO_PROVIDER_FOUND) com atribuição manual e proposta de novo horário ao cliente; parâmetros por categoria e por hora do dia | MVP | Alta | dispatch, ops, scheduled_jobs |
| Reputação | Manter qualidade sem supervisão direta | Notas de cliente, cumprimento de tempo, cancelamentos e reclamações compõem indicadores; parceiros abaixo do padrão perdem visibilidade ou são desligados | Score composto por Provider e por cliente; níveis públicos; ações automáticas por limiar (aviso, limite de ordens, suspensão) com revisão humana; sinalização de cliente de risco para proteger Providers | MVP | Média | reputation, ops |
| Pagamentos | Receber e distribuir dinheiro com segurança | Múltiplos meios (cartão, PIX, vale, saldo), antifraude no checkout, estorno automatizado, tokenização | Porta PaymentGateway com adaptadores (ADR-007); pré-autorização no cartão para o teto estimado, captura após COMPLETED, PIX para Quote aprovada; ledger próprio; nenhum dado de cartão no banco | MVP | Alta | payments, wallet |
| Comissão | Remunerar a plataforma de forma proporcional ao valor gerado | Percentual por plano (com e sem logística) mais taxa de pagamento online e taxa de serviço ao cliente; mensalidade condicionada a faturamento | `commission_rules` por categoria e por tipo de fluxo (quem desloca, quem custodia), com percentual, piso e teto; taxa de serviço ao cliente fixa e pequena; sem mensalidade no MVP; arredondamento a favor do Provider (ADR-016) | MVP | Média | commission, wallet |
| Repasse | Pagar parceiros e entregadores em prazos previsíveis | Ciclos de 7 dias para parceiros, pagamento em dia fixo, periodicidade escolhida; entregadores com ciclos mais curtos | Payout em lotes semanais para Providers, com saldo retido por Dispute; motoristas de logística em ciclo semanal também no MVP; antecipação paga em V1; conciliação por lote | MVP | Média | payouts, scheduled_jobs |
| Atendimento | Resolver em escala sem custo proporcional | Autoatendimento por motivo dentro do pedido, bot para triagem, humano para exceções; SLA por canal | SupportTicket com triagem por motivo e valor; resolução automática para casos de baixo risco; Concierge com IA faz triagem em linguagem natural e passa para operador quando o caso excede limiares (ADR-014); painel ops com filas por gravidade | MVP | Média | support, concierge, ops |
| Resolução de conflitos | Decidir quem paga quando algo dá errado | Fluxos de reembolso parcial e total, reclamação do parceiro contra cancelamento indevido, evidências do entregador; decisões em grande parte automatizadas por regra | Dispute como entidade ligada à ServiceOrder, com partes, evidências (MediaEvidence, OrderEvents, telemetria), prazo de resposta, decisão com justificativa e efeito financeiro no ledger; fundo de garantia para cobrir dano acima do que o Provider pode arcar | MVP | Alta | support, wallet, media |
| Promoções | Aquisição, frequência e escoamento de oferta | Cupons da plataforma, cupons co-financiados pelo parceiro, frete grátis, destaques pagos, programas de assinatura com benefício | Cupons de primeira ordem e de reativação; desconto em deslocamento em janelas de baixa demanda; desconto progressivo em Subscription; sem destaque pago no MVP para não distorcer o matching | MVP (cupons) | Baixa | promotions, payments |
| Antifraude | Proteger a plataforma e os usuários de abuso | Verificação de cadastro, análise de risco no pagamento, detecção de contas duplicadas e de conluio entre parceiro e entregador, bloqueio de cupom abusivo | Verificação de identidade do Provider com documento e selfie; limites para conta nova (valor de Quote, ordens simultâneas); detecção de padrões (mesmo cliente e Provider com cancelamentos repetidos, cupons em série); análise de risco do gateway no cartão; revisão humana | MVP (básico) | Alta | identity, payments, ops |
| Cancelamento | Equilibrar liberdade do cliente e proteção do parceiro | Regras por fase: gratuito antes da confirmação, condicionado após, liberado em atraso; parceiro penalizado por cancelar; reembolso automático conforme a fase | Política de cancelamento como dado configurável por categoria: janelas, taxas, quem absorve; aplicada pela engine de workflow (ADR-005); CANCELLED_* sempre com motivo e efeito financeiro automático | MVP | Média | orders, payments, policies |
| SLA | Dar previsibilidade e permitir cobrança interna | Tempos-alvo de aceite, preparo, coleta e entrega; alertas de risco de atraso; compensação quando o SLA é violado | SLAs por categoria: tempo até ACCEPTED, pontualidade de chegada na janela, prazo de devolução de bens, tempo de resposta a Dispute; alerta na ops ao aproximar do limite; compensação automática ao cliente (crédito em Wallet) em violação grave | V1 | Média | ops, analytics |
| Analytics | Medir e calibrar a operação | Funil de conversão, tempo por fase, taxa de aceite, cancelamento, nota, GMV, take rate, por cidade e categoria; painéis para operação e para parceiros | Eventos tipados desde o MVP (ADR-013): funil ServiceRequest → MATCHING → ACCEPTED → COMPLETED, tempo por fase, taxa de NO_PROVIDER_FOUND, taxa de Quote aprovada, GMV, take rate, custo de cupom; views SQL para o painel ops; warehouse em V1 | MVP | Média | analytics |
| Aquisição e retenção | Crescer com custo sustentável | Cupom de primeira compra, indicação, notificações segmentadas, programa de assinatura com frete grátis, parcerias com bancos e operadoras | Indicação com crédito em Wallet para ambos; cupom de primeira ordem por categoria; Subscription como principal alavanca de retenção; comunicação pós-serviço com lembrete de manutenção (ar-condicionado, revisão) baseada em histórico | V1 | Média | promotions, subscriptions, analytics |

#### 3.4.1 Notas de adaptação da plataforma

1. Matching e dispatch são o coração do VÉLIO, e não um detalhe de logística como no modelo de comida. Lá, o cliente já escolheu a loja e o dispatch só precisa achar um entregador. No VÉLIO, o dispatch escolhe quem vai entrar na casa do cliente. Por isso a complexidade é Alta e a prioridade é MVP.
2. A combinação comissão percentual + taxa de pagamento + taxa de serviço ao cliente é um modelo de três fontes de receita que o VÉLIO pode adotar, mas com uma restrição: a taxa de deslocamento do Provider não entra na base de cálculo da comissão, para não desincentivar atendimento em áreas mais distantes.
3. A existência pública de um fundo para parceiros em 2020 valida a ideia de um fundo de garantia para incidentes no VÉLIO. A diferença é que no VÉLIO o fundo é operacional desde o primeiro dia, financiado por uma fração da comissão, porque o risco de dano ao imóvel ou ao bem é inerente ao serviço.
4. SLA é V1 porque exige dados históricos para calibrar. No MVP, o que existe são alertas operacionais e compensação manual pelo operador.

---

## 4. Padrões operacionais transversais que o VÉLIO deve herdar

Os padrões abaixo atravessam as quatro perspectivas. Cada um é descrito em quatro partes: o que se observa no marketplace de comida, por que funciona, a regra que o VÉLIO adota e os parâmetros que ficam configuráveis na operação (nunca em código, conforme ADR-006 e ADR-015).

### 4.1 Tempo de aceite com expiração

- Observado: toda oferta ao parceiro ou ao entregador tem um relógio visível. Sem resposta no prazo, a oferta expira e o sistema segue para a próxima opção ou cancela o pedido. O parceiro pode configurar aceite automático.
- Por que funciona: elimina o limbo em que o cliente espera sem saber se alguém vai atender; transforma silêncio em decisão; produz um sinal de confiabilidade (taxa de resposta) sem precisar perguntar nada.
- Regra do VÉLIO: todo estado OFFERED tem `expires_at`. Ao expirar, gera OrderEvent `OFFER_EXPIRED`, a oferta vai para o próximo Provider da onda e a não-resposta conta como recusa leve no ProviderMatchScore. Aceite automático só para Subscription com Provider fixo que já aceitou a recorrência.
- Parâmetros configuráveis: duração da oferta por categoria e tipo de fluxo (imediato 60 a 120 segundos; agendado 5 a 15 minutos; Subscription até 24 horas antes), número de Providers por onda, número de ondas antes de NO_PROVIDER_FOUND, peso da não-resposta no score.

### 4.2 Estimativa com faixa, não valor único

- Observado: o tempo de entrega aparece como intervalo (por exemplo, "30 a 40 minutos") e a previsão de chegada é ajustada ao longo do pedido. O preço é único porque é conhecido.
- Por que funciona: uma faixa honesta reduz a sensação de atraso; o cliente compara contra o limite superior e fica satisfeito quando a chegada ocorre antes dele.
- Regra do VÉLIO: aplica-se a tempo e a preço. Toda ServiceRequest exibe faixa de chegada (ou janela de Booking), faixa de duração de execução e faixa de preço quando houver dependência de diagnóstico. O limite superior da faixa de preço é o valor pré-autorizado no cartão. O valor único só aparece em COMPLETED ou em QUOTE_APPROVED.
- Parâmetros configuráveis: largura da faixa por categoria, regra de arredondamento, valor acima do qual a faixa exige Quote formal em vez de estimativa.

### 4.3 Cancelamento com janelas e penalidades graduais

- Observado: o cliente cancela sem custo antes da confirmação da loja; depois disso, depende de aceite da loja; se o pedido atrasa além de um limite, o cancelamento com reembolso é liberado. O parceiro que cancela com frequência perde visibilidade. (Fonte: canaltech.com.br e idec.org.br, datas diversas; as janelas podem ter mudado.)
- Por que funciona: cada fase do pedido representa um custo já incorrido por alguém; a penalidade acompanha o custo, o que é percebido como justo pelos dois lados.
- Regra do VÉLIO: matriz de cancelamento por categoria e por estado, aplicada pela engine de workflow:

| Estado no momento do cancelamento | Cliente cancela | Provider cancela | Efeito financeiro padrão |
|---|---|---|---|
| REQUESTED, MATCHING | Grátis | Não se aplica | Nenhum; pré-autorização liberada |
| OFFERED, ACCEPTED (imediato) | Grátis nos primeiros minutos; depois taxa simbólica | Grátis em janela curta; depois penalidade de score | Taxa, se houver, vai ao Provider |
| ACCEPTED (agendado), mais de X horas antes da janela | Grátis | Penalidade de score leve | Nenhum |
| ACCEPTED (agendado), menos de X horas antes da janela | Taxa de remarcação | Penalidade de score média; multa em reincidência | Taxa vai ao Provider |
| EN_ROUTE | Taxa de deslocamento | Penalidade de score alta; crédito ao cliente | Deslocamento ao Provider; crédito pago pelo fundo |
| ARRIVED | Taxa de visita | CANCELLED_NO_SHOW se o Provider não comparece; penalidade máxima | Visita ao Provider; crédito ao cliente |
| QUOTED | Cliente recusa a Quote: paga só a visita | Não se aplica | Visita ao Provider |
| IN_PROGRESS | Não cancelável; vira DISPUTED | Não cancelável; vira DISPUTED | Decidido na Dispute |
| PICKED_UP, IN_TRANSIT | Não cancelável; devolução obrigatória do bem; vira DISPUTED se contestado | Não cancelável | Decidido na Dispute |

- Parâmetros configuráveis: X horas por categoria, valores de taxa de remarcação, deslocamento e visita, limiares de reincidência do Provider, valor do crédito de desculpas ao cliente.

### 4.4 Reembolso para a forma original com crédito em carteira como alternativa mais rápida

- Observado: o reembolso padrão volta para a forma de pagamento original; PIX retorna em minutos ou horas; cartão depende do emissor e pode levar um ou dois ciclos de fatura; o app oferece crédito em saldo como alternativa de uso imediato. (Fonte: tecnoblog.net, saipos.com; a central de ajuda oficial é a fonte primária.)
- Por que funciona: respeita o direito do consumidor e, ao mesmo tempo, dá uma opção mais rápida que também aumenta a chance de recompra.
- Regra do VÉLIO: todo reembolso é lançamento no ledger com origem na ServiceOrder. O padrão é a forma original. Na tela de confirmação do reembolso, o cliente pode optar por crédito imediato em Wallet; a operação pode configurar bônus pequeno para essa opção. Reembolso parcial sempre referencia item da Quote ou motivo estruturado.
- Parâmetros configuráveis: bônus de crédito em Wallet (zero por padrão), prazo máximo de validade do crédito, valor acima do qual o reembolso em crédito exige aprovação do operador.

### 4.5 Avaliação apenas após conclusão, com motivos estruturados

- Observado: a avaliação só é oferecida após a entrega, com nota e motivos pré-definidos; a nota do parceiro é pública e a do entregador é interna.
- Por que funciona: evita avaliação por ansiedade durante o pedido; motivos estruturados permitem agir (um motivo "atrasou" é acionável, um comentário livre nem sempre).
- Regra do VÉLIO: avaliação em dois sentidos (cliente avalia Provider; Provider avalia cliente), ambas só após COMPLETED ou DELIVERED e dentro de 7 dias. Motivos por categoria (pontualidade, limpeza do local, explicação do serviço, respeito à Quote, cuidado com o bem). Nota 1 ou 2 abre SupportTicket automático e segura o Payout da ordem até triagem. A avaliação do cliente é privada e alimenta o matching e a proteção do Provider.
- Parâmetros configuráveis: prazo para avaliar, nota de corte para ticket automático, pesos de cada motivo no score.

### 4.6 Comunicação mascarada e limitada ao ciclo de vida da ordem

- Observado: chat e ligação entre cliente, loja e entregador acontecem dentro do app, sem troca de número; o canal fecha quando o pedido termina.
- Por que funciona: protege a privacidade dos dois lados, evita negociação fora da plataforma e cria registro para resolver conflitos.
- Regra do VÉLIO: chat por ServiceOrder de ACCEPTED até 48 horas após COMPLETED; ligação por número mascarado em V1; mensagens e fotos ficam vinculadas à ordem como evidência; o operador pode ler e intervir; Provider que insistir em contato externo recebe advertência e perda de score.
- Parâmetros configuráveis: janela pós-conclusão, palavras-chave que disparam revisão (telefone, PIX direto, "fora do app"), limite de mensagens por minuto.

### 4.7 Fundo ou garantia para incidentes

- Observado: em 2020 a plataforma anunciou publicamente um fundo para auxiliar restaurantes pequenos e injeção de capital de giro (fonte: investnews.com.br, olhardigital.com.br, mar/2020). A logística própria é divulgada com seguro contra fraude em entregas (fonte: serasa.com.br).
- Por que funciona: a plataforma assume parte do risco sistêmico que nenhum parceiro individual consegue carregar, o que sustenta a confiança dos dois lados.
- Regra do VÉLIO: fundo de garantia alimentado por fração da Commission de cada ServiceOrder, com regras públicas de cobertura (dano ao imóvel, dano ou perda de bem em custódia, serviço não executado), teto por incidente e processo via Dispute. O Provider responde até um limite; acima dele o fundo cobre e a plataforma avalia desligamento. Seguro de terceiro em V1 para veículos em custódia.
- Parâmetros configuráveis: percentual da comissão destinado ao fundo, teto por incidente e por categoria, franquia do Provider.

### 4.8 Prova de execução como pré-requisito de pagamento

- Observado: a entrega é confirmada pelo entregador e, em casos de maior valor, por código do cliente; a plataforma guarda horário e posição. Sem confirmação, o pagamento ao entregador fica pendente.
- Regra do VÉLIO: Payout de uma ServiceOrder só é elegível quando a ordem está em COMPLETED ou DELIVERED com OTP/PIN válido e MediaEvidence mínima da categoria. Ordens sem evidência completa entram em fila de revisão da ops antes do lote de Payout.
- Parâmetros configuráveis: lista de evidências obrigatórias por categoria (fotos antes e depois, checklist, quilometragem, QR Code), tempo máximo para completar a evidência após COMPLETED.

### 4.9 Estado único de verdade com linha do tempo imutável

- Observado: o cliente, o parceiro e o entregador veem o mesmo pedido em fases consistentes; a central de ajuda consulta o histórico de eventos para decidir.
- Regra do VÉLIO: OrderEvent append-only (ADR-005); o estado atual é derivado e materializado; nenhum ator altera o passado; correções geram eventos de ajuste com autor e justificativa.

### 4.10 Operação humana como fallback explícito, não como exceção envergonhada

- Observado: a plataforma de comida automatiza quase tudo e usa humanos em casos residuais; em cidades pequenas ou em horários de baixa oferta, o sistema simplesmente informa indisponibilidade.
- Regra do VÉLIO: enquanto a densidade de Providers for baixa, o operador humano é parte do fluxo normal. NO_PROVIDER_FOUND leva a uma fila com SLA de resposta; o operador liga para Providers fora do app, propõe horário alternativo ao cliente e registra a atribuição manual. O Concierge com IA faz o mesmo em linguagem natural para o cliente, sempre com human-in-the-loop acima de limiares (ADR-014).
- Parâmetros configuráveis: SLA da fila, limiares que exigem operador (valor, número de tarefas, categoria de risco), horário de cobertura humana.

### 4.11 Precificação de deslocamento com piso e componente variável

- Observado: a remuneração do entregador tem piso por rota e componente por quilômetro, com adicionais por condições adversas (fonte: economicnewsbrasil.com.br, 30/04/2025; valores podem ter mudado).
- Regra do VÉLIO: taxa de deslocamento = piso por categoria + valor por quilômetro acima de uma franquia + adicional de janela de alta demanda (com teto público). Exibida ao cliente antes da confirmação e ao Provider antes do aceite. Fora da base de cálculo da Commission.
- Parâmetros configuráveis: piso, franquia, valor por quilômetro, multiplicador máximo de alta demanda, horários e condições que disparam o adicional.

### 4.12 Níveis de parceiro com benefícios progressivos

- Observado: parceiros com desempenho acima de critérios ganham destaque e benefícios; os abaixo perdem visibilidade.
- Regra do VÉLIO: três níveis públicos de Provider definidos por score composto; cada nível destrava limite de Quote, ordens simultâneas, acesso a Subscriptions, modo "lista de ordens disponíveis" e prioridade nas ondas de dispatch. A descida de nível é comunicada com motivo e caminho de recuperação.

---

## 5. O que NÃO importar do modelo de comida e por quê

| Padrão do marketplace de comida | Por que não importar | O que o VÉLIO faz em vez disso |
|---|---|---|
| Carrinho multi-item como centro da experiência | O cliente de serviços raramente combina vários serviços em uma compra; quando combina, as ordens têm prestadores, horários e fluxos distintos; o carrinho criaria a ilusão de uma única transação quando há várias | Resumo da ServiceRequest com um serviço principal; combinações via Concierge, que gera ServiceOrders ligadas por um identificador de "plano" e as acompanha juntas |
| Cardápio extenso com centenas de itens | Volume de opções em serviços gera dúvida, não desejo; o cliente quer que alguém resolva o problema, não escolher entre 40 variações | Catálogo curto por categoria, orientado a problema, com escopo padrão e adicionais previsíveis; o detalhe fino vai para a Quote |
| Foto do produto como gatilho de compra | Não há produto a fotografar antes da execução; fotos de "antes e depois" de outros clientes levantam questões de privacidade de imóvel | Fotos enviadas pelo cliente para descrever o problema (entrada) e MediaEvidence do Provider (saída); nenhuma vitrine fotográfica |
| Pressão por entrega em minutos | A maior parte dos serviços é agendável; prometer "em 30 minutos" cria custo de disponibilidade que inflaciona o preço e penaliza o Provider | Imediato só em emergência hidráulica, elétrica e pequena entrega; o padrão é janela de Booking; a métrica é pontualidade na janela, não minutos até a chegada |
| Escolha da loja pelo cliente como etapa obrigatória | Em serviços, comparar 30 perfis de encanador é fricção sem ganho; o cliente não tem critério técnico para escolher | Plataforma escolhe pelo ProviderMatchScore; o cliente vê quem foi designado e pode recusar uma vez sem custo; escolha direta só por favorito ou em categorias específicas em V1 |
| Destaque pago na lista | Distorce um matching que precisa ser percebido como meritocrático; em serviços o custo de um prestador ruim é alto (dano ao imóvel) | Nenhum destaque pago no MVP; receita vem de Commission, taxa de serviço e Subscription |
| Programa de assinatura centrado em frete grátis | O valor da Subscription em serviços não é desconto de deslocamento, é continuidade (mesmo Provider, histórico do equipamento, lembrete automático) | Subscription por categoria com visitas geradas automaticamente, Provider preferencial e desconto progressivo |
| Taxa de entrega variável por loja | O cliente de comida aceita porque compara lojas; em serviços a comparação não existe e a variação parece arbitrária | Taxa de deslocamento com fórmula pública por categoria (piso + quilômetro + alta demanda com teto) |
| Pedido sem contato, "deixar na porta" | O serviço exige a presença do cliente ou de alguém autorizado; a ausência é falha, não opção | Confirmação de presença na véspera; OTP/PIN de início; protocolo de ausência com nova visita cobrada |
| Dependência de impressora e comanda no parceiro | Operação de cozinha; nada equivalente | Checklist digital e MediaEvidence no app do Provider |
| Entregador como terceiro anônimo | Em comida, o cliente nem lembra quem entregou; em serviços, a pessoa que entra na casa é o produto | Cartão do Provider com identidade verificada antes da chegada; o mesmo Provider nas visitas de Subscription |
| Horário de funcionamento por loja como fonte de disponibilidade | A oferta em serviços é de pessoas com agendas individuais e capacidade de uma ordem por vez | ProviderAvailability por pessoa, agenda com janelas discretas, capacidade diária, BUSY automático |
| Avaliação pública do estabelecimento com comentários abertos | Comentários livres sobre uma pessoa física expõem o Provider a assédio e a plataforma a risco jurídico | Nota e motivos estruturados; comentário livre visível só para a operação; resposta pública do Provider em V1 restrita a texto moderado |
| Cancelamento por "mudei de ideia" após confirmação sem custo | Em comida o custo afundado é pequeno; em serviço agendado, o Provider reservou meio dia | Janelas de cancelamento com taxa de remarcação; crédito ao Provider pelo tempo reservado |
| Métrica central de "tempo até a entrega" | Para serviços, velocidade não é qualidade; um conserto rápido e mal feito é pior que um lento e correto | Métricas centrais: pontualidade na janela, taxa de Quote aprovada, taxa de retorno por defeito, nota por motivo |

---

## 6. Síntese: as 15 funcionalidades que mais movem a agulha no MVP

Ordenadas por impacto na primeira cidade, considerando conversão, confiança e capacidade de operar sem equipe grande.

1. Matching por ProviderMatchScore com dispatch em ondas e fallback para operador. Sem isso não existe produto; é o que transforma uma ServiceRequest em alguém na porta do cliente, e o fallback humano é o que permite lançar com poucos Providers.
2. Checkout em tela única com faixa de preço, janela de Booking e aceite da política de orçamento. É onde o cliente decide; faixa honesta e regra clara de "nada é cobrado sem sua aprovação" removem a principal objeção a contratar serviço por app.
3. Quote com aprovação explícita antes de qualquer cobrança adicional. Elimina a maior fonte de conflito em serviços (o "deu mais caro do que disseram") e protege o Provider de inadimplência.
4. Pré-autorização no cartão com captura após COMPLETED e PIX para valores fechados. Garante que o Provider será pago e que o cliente só paga pelo que foi concluído.
5. OTP/PIN de início e fim de serviço. Prova barata, universal e compreensível de que o Provider esteve lá e de que o cliente deu o serviço por encerrado.
6. MediaEvidence obrigatória por categoria (fotos antes e depois, checklist, quilometragem). Reduz Disputes a uma fração e é pré-requisito do Payout.
7. Cadeia de custódia com QR Code para lavanderia e veículos. Sem isso, as categorias com bem em custódia não podem ser lançadas com segurança jurídica.
8. Acompanhamento por linha do tempo com previsão em faixa e mapa em EN_ROUTE. É a expectativa que o consumidor brasileiro já tem; sem ela o produto parece amador.
9. Cadastro e aprovação de Provider com identidade verificada e limites iniciais. A confiança do cliente em abrir a porta depende disso mais do que de qualquer tela bonita.
10. Matriz de cancelamento por estado com efeito financeiro automático. Evita que cada cancelamento vire um atendimento humano e dá previsibilidade aos dois lados.
11. Chat por ordem com mensagens rápidas e fotos como evidência. Resolve a maioria das dúvidas operacionais (acesso, material, horário) sem telefone e sem suporte.
12. Reembolso para a forma original com crédito em Wallet como alternativa imediata. Transforma um incidente em chance de recompra e reduz chamadas de "onde está meu dinheiro".
13. Ledger de dupla entrada com Commission por categoria e Payout semanal. Sem conciliação por construção, a operação financeira não escala além de dezenas de Providers.
14. Avaliação bilateral só após conclusão, com motivos estruturados e ticket automático para nota baixa. Alimenta o matching e detecta problema antes de virar reclamação pública.
15. Concierge em linguagem natural com IA e operador humano. É o diferencial do VÉLIO e, no MVP, dobra como camada de triagem de atendimento; a IA nunca cria pagamento, só propõe.

Fora da lista, mas próximas: Subscription (V1 cedo, porque é a alavanca de retenção), SLA com compensação automática (V1), modo "lista de ordens disponíveis" para Providers consolidados (V1), ligação mascarada (V1).

---

## 7. Fontes

Todas as fontes são públicas e foram consultadas em outubro de 2026. Valores, prazos e janelas podem ter mudado desde a publicação de cada matéria; a central de ajuda e a página de parceiros da própria empresa são as fontes primárias a confirmar antes de qualquer decisão comercial.

Retirada no estabelecimento
- https://consumidormoderno.com.br/depois-de-uber-eats-ifood-anuncia-opcao-de-retirar-pedido-no-restaurante/ (2019)
- https://canaltech.com.br/apps/ifood-lanca-o-praretirar-solucao-para-retirar-pedidos-do-app-no-restaurante-141855/ (2019)
- https://startupi.com.br/?p=186773 (2020, expansão da retirada)

Pedido agendado
- https://tecnoblog.net/responde/como-agendar-um-pedido-no-ifood/ (data não precisa)
- https://canaltech.com.br/apps/como-agendar-pedidos-ifood/ (data não precisa)
- https://www.tecmundo.com.br/software/232499-ifood-veja-agendar-pedidos.htm (data não precisa)

Escolha de rotas e benefícios ao entregador
- https://tiinside.com.br/08/04/2026/ifood-lanca-recurso-para-escolha-de-rotas/ (08/04/2026)
- https://canaltech.com.br/apps/ifood-lanca-funcao-que-deixa-entregador-escolher-a-propria-rota/ (abr/2026)
- https://gironews.com/varejo-digital/ifood-cria-pacote-de-vantagens-destinadas-aos-entregadores/ (2025, escolha de região de destino)

Planos, comissões e mensalidade do parceiro
- https://www.serasa.com.br/blog/abrir-loja-no-ifood/ (consultado em out/2026)
- https://saipos.com/integracoes/ifood/planos-ifood (data não precisa)
- https://blog.bling.com.br/como-vender-ifood/ (data não precisa)

Repasse ao parceiro
- https://saipos.com/integracoes/ifood/como-funciona-o-repasse-do-ifood (data não precisa)

Taxa mínima do entregador
- mercadoeconsumo.com.br (29/04/2025, matéria sobre o reajuste da taxa mínima; link exato não recuperado nesta sessão)
- https://economicnewsbrasil.com.br/2025/04/30/ifood-reajusta-taxa-minima-para-entregadores-a-partir-de-junho/ (30/04/2025)
- https://www.brasildefato.com.br/2025/04/29/ifood-anuncia-aumento-entregadores-acham-valor-patetico-e-exigem-negociacao-ate-1o-de-maio/ (29/04/2025)

Acompanhamento em tela bloqueada e relógio
- https://acontecendoaqui.com.br/inovacao/ifood-lanca-novas-funcionalidades-para-facilitar-experiencia-do-usuario/ (fev/2025)
- https://macmagazine.com.br/post/2022/11/16/ifood-agora-mostra-informacoes-do-pedido-na-tela-bloqueada/ (nov/2022)

Cancelamento e reembolso
- https://canaltech.com.br/apps/ifood-como-cancelar-pedido-andamento/ (data não precisa)
- https://idec.org.br/dicas-e-direitos/cancelar-pedido-ifood (data não precisa)
- https://tecnoblog.net/responde/como-pedir-reembolso-no-ifood/ (data não precisa)
- https://saipos.com/integracoes/ifood/como-pedir-reembolso-no-ifood (data não precisa)
- Fonte primária indicada pelas matérias: institucional.ifood.com.br/ajuda/reembolsos-e-estornos/ (não consultada diretamente)

Fundo de assistência a parceiros
- https://investnews.com.br/negocios/ifood-cria-fundo-de-r-50-mi-para-restaurantes/amp/ (mar/2020)
- https://olhardigital.com.br/noticia/ifood-anuncia-fundo-de-r-50-milhoes-para-restaurantes-parceiros/98255 (mar/2020)
---

## Apêndice A — Mapa de estados por tipo de fluxo

A engine de workflow (ADR-005) carrega uma WorkflowDefinition por tipo de fluxo. As tabelas abaixo são a especificação de produto de cada definição: estado de origem, evento de negócio, estado de destino, quem pode disparar, evidência exigida e o que o cliente vê. O marketplace de comida tem um único fluxo; o VÉLIO nasce com oito.

### A.1 Fluxo IMMEDIATE (encanador ou eletricista em emergência, assistência residencial urgente)

| De | Evento | Para | Quem dispara | Evidência exigida | Rótulo para o cliente |
|---|---|---|---|---|---|
| — | ServiceRequest confirmada no checkout | REQUESTED | Cliente | Pré-autorização do teto estimado | Pedido recebido |
| REQUESTED | Início da primeira onda | MATCHING | Sistema | — | Procurando profissional |
| MATCHING | Oferta enviada | OFFERED | Sistema | `expires_at` registrado | Procurando profissional |
| OFFERED | Oferta expirada ou recusada | MATCHING | Sistema ou Provider | Motivo da recusa | Procurando profissional |
| MATCHING | Ondas esgotadas | NO_PROVIDER_FOUND | Sistema | Registro das rodadas | Ainda não encontramos; estamos tentando por outros meios |
| NO_PROVIDER_FOUND | Atribuição manual | ACCEPTED | Operador | Identificação do operador | Profissional confirmado |
| NO_PROVIDER_FOUND | Cliente desiste ou aceita remarcar | CANCELLED_BY_PLATFORM ou REQUESTED (nova janela) | Cliente ou Operador | — | Pedido cancelado sem custo / Remarcado |
| OFFERED | Aceite | ACCEPTED | Provider | — | Profissional confirmado |
| ACCEPTED | Provider inicia deslocamento | EN_ROUTE | Provider | Posição inicial | A caminho |
| EN_ROUTE | Chegada por geofence ou toque | ARRIVED | Provider ou Sistema | Posição dentro do raio | Chegou |
| ARRIVED | Cliente informa OTP de início | IN_PROGRESS | Provider com OTP do cliente | OTP válido, fotos de "antes" | Serviço em andamento |
| IN_PROGRESS | Provider identifica escopo adicional | QUOTED | Provider | Itens da Quote com preço de referência | Orçamento aguardando sua aprovação |
| QUOTED | Cliente aprova | QUOTE_APPROVED → IN_PROGRESS | Cliente | Nova intenção de pagamento | Orçamento aprovado; serviço em andamento |
| QUOTED | Cliente recusa | IN_PROGRESS (escopo original) ou COMPLETED (só visita) | Cliente | Motivo da recusa | Orçamento recusado |
| IN_PROGRESS | Provider encerra com OTP final | COMPLETED | Provider com OTP do cliente | OTP, fotos de "depois", checklist | Serviço concluído |
| COMPLETED | Captura do pagamento | COMPLETED (evento financeiro) | Sistema | Captura ou cobrança PIX | Pagamento confirmado |
| COMPLETED | Avaliação enviada ou prazo de 7 dias | REVIEWED | Cliente ou Sistema | Nota e motivos | Avaliado |
| COMPLETED ou REVIEWED | Contestação em até 7 dias | DISPUTED | Cliente ou Provider | Dispute aberta | Em análise |
| Qualquer estado antes de IN_PROGRESS | Cancelamento | CANCELLED_* | Cliente, Provider, Operador ou Sistema | Motivo; efeito financeiro da matriz 4.3 | Cancelado |
| ARRIVED | Cliente ausente após protocolo | CANCELLED_NO_SHOW (cliente) | Provider com validação do Operador | Tentativas registradas, foto da fachada | Não foi possível realizar a visita |

### A.2 Fluxo SCHEDULED (ar-condicionado avulso, assistência residencial, instalação)

Igual ao IMMEDIATE, com as diferenças abaixo.

| De | Evento | Para | Quem dispara | Evidência exigida | Rótulo para o cliente |
|---|---|---|---|---|---|
| REQUESTED | Booking criado com janela | MATCHING | Sistema | Janela discreta (por exemplo, 2 horas) | Agendado; confirmando profissional |
| OFFERED | Oferta com expiração longa (minutos a horas) | ACCEPTED | Provider | — | Profissional confirmado para a janela |
| ACCEPTED | Lembrete na véspera com pedido de confirmação | ACCEPTED (evento `CUSTOMER_CONFIRMED` ou `PROVIDER_CONFIRMED`) | Cliente e Provider | Resposta ao lembrete | Confirmado para amanhã |
| ACCEPTED | Provider não confirma até limite | MATCHING (reoferta) | Sistema | Registro | Confirmando profissional |
| ACCEPTED | Cliente remarca fora da janela de taxa | REQUESTED (novo Booking) | Cliente | — | Remarcado |
| ACCEPTED | Cliente remarca dentro da janela de taxa | REQUESTED (novo Booking) + lançamento de taxa | Cliente | Taxa de remarcação | Remarcado com taxa |
| ACCEPTED | Hora de saída calculada | EN_ROUTE | Provider | Posição | A caminho |

### A.3 Fluxo QUOTE_FIRST (revisão de veículo complexa, reforma pequena, instalação com visita técnica)

| De | Evento | Para | Quem dispara | Evidência exigida | Rótulo para o cliente |
|---|---|---|---|---|---|
| REQUESTED | Cliente aceita visita técnica com preço fechado | MATCHING | Sistema | Pré-autorização só da visita | Visita técnica agendada |
| ACCEPTED → ARRIVED → IN_PROGRESS | Como nos fluxos anteriores | — | — | — | — |
| IN_PROGRESS (visita) | Provider emite Quote completa | QUOTED | Provider | Itens, fotos do diagnóstico, prazo de validade da Quote | Orçamento aguardando sua aprovação |
| QUOTED | Cliente aprova dentro da validade | QUOTE_APPROVED | Cliente | Nova pré-autorização ou PIX | Orçamento aprovado |
| QUOTE_APPROVED | Novo Booking para a execução | ACCEPTED (mesma ordem, nova janela) | Sistema com Provider | Janela | Execução agendada |
| QUOTED | Validade expira sem resposta | COMPLETED (só visita) | Sistema | — | Orçamento expirado; visita encerrada |
| QUOTED | Cliente recusa | COMPLETED (só visita) | Cliente | Motivo | Orçamento recusado |

### A.4 Fluxo PICKUP_RETURN para bens leves (lavanderia com coleta e entrega)

| De | Evento | Para | Quem dispara | Evidência exigida | Rótulo para o cliente |
|---|---|---|---|---|---|
| REQUESTED | Booking de coleta criado | MATCHING | Sistema | Janela de coleta | Coleta agendada |
| OFFERED | Aceite por Provider logístico ou pela lavanderia parceira | ACCEPTED | Provider | — | Coleta confirmada |
| ACCEPTED | Saída para coleta | EN_ROUTE | Provider | Posição | A caminho para coletar |
| EN_ROUTE | Chegada | ARRIVED | Provider ou Sistema | Posição | Chegou para coletar |
| ARRIVED | Recebimento dos itens | PICKED_UP | Provider com OTP do cliente | QR Code do lote gerado e lido, fotos dos itens, contagem, OTP | Itens coletados |
| PICKED_UP | Saída rumo à lavanderia | IN_TRANSIT | Provider | Posição | A caminho da lavanderia |
| IN_TRANSIT | Entrada na lavanderia | IN_PROGRESS | Lavanderia parceira com leitura do QR Code | QR Code lido, contagem conferida; divergência abre Dispute | Em processamento |
| IN_PROGRESS | Peça com dano prévio ou pedido de serviço extra | QUOTED | Lavanderia | Foto da peça, item adicional | Orçamento aguardando sua aprovação |
| IN_PROGRESS | Processamento concluído | COMPLETED (etapa interna) e Booking de devolução | Lavanderia | QR Code, fotos dos itens prontos | Pronto; devolução agendada |
| Booking de devolução | Saída para devolução | IN_TRANSIT (perna 2) | Provider | QR Code lido na saída | A caminho para devolver |
| IN_TRANSIT (perna 2) | Entrega ao cliente | DELIVERED | Provider com OTP do cliente | OTP, fotos da entrega, contagem conferida | Entregue |
| DELIVERED | Captura e avaliação | REVIEWED | Sistema e Cliente | — | Concluído |
| DELIVERED | Contestação em até 7 dias (peça faltando, dano) | DISPUTED | Cliente | Fotos; comparação com MediaEvidence da coleta | Em análise |

### A.5 Fluxo PICKUP_RETURN para veículos (lavagem com retirada e devolução; revisão com leva e traz)

| De | Evento | Para | Quem dispara | Evidência exigida | Rótulo para o cliente |
|---|---|---|---|---|---|
| REQUESTED | Booking de retirada criado; veículo do cliente identificado | MATCHING | Sistema | Placa, modelo, documento do veículo | Retirada agendada |
| OFFERED | Aceite por motorista verificado (CNH válida, categoria compatível) | ACCEPTED | Provider | — | Motorista confirmado |
| ARRIVED | Vistoria de retirada | PICKED_UP | Provider com OTP do cliente | Fotos padronizadas (frente, traseira, laterais, interior, painel), quilometragem, nível de combustível, avarias marcadas em diagrama, QR Code da ordem fixado, OTP | Veículo retirado |
| PICKED_UP | Condução até a oficina ou lava-rápido | IN_TRANSIT | Provider | Telemetria contínua; desvio de rota gera alerta | A caminho da oficina |
| IN_TRANSIT | Entrada no parceiro | IN_PROGRESS | Parceiro com leitura do QR Code | Quilometragem de chegada; divergência acima de tolerância gera alerta | Em serviço |
| IN_PROGRESS | Itens adicionais identificados na revisão | QUOTED | Parceiro | Fotos, itens com preço de referência, validade | Orçamento aguardando sua aprovação |
| QUOTED | Aprovação ou recusa | QUOTE_APPROVED ou IN_PROGRESS (escopo original) | Cliente | Pagamento | Orçamento aprovado / recusado |
| IN_PROGRESS | Serviço concluído | COMPLETED (etapa interna) e Booking de devolução | Parceiro | Fotos do serviço, checklist, nota fiscal quando houver | Pronto; devolução agendada |
| Booking de devolução | Saída do parceiro | IN_TRANSIT (perna 2) | Provider | Quilometragem de saída, QR Code | A caminho para devolver |
| IN_TRANSIT (perna 2) | Entrega com vistoria de devolução | DELIVERED | Provider com OTP do cliente | Fotos no mesmo padrão da retirada, quilometragem final, combustível, OTP | Veículo devolvido |
| DELIVERED | Contestação (avaria nova, quilometragem incompatível) | DISPUTED | Cliente | Comparação automática das duas vistorias | Em análise |

### A.6 Fluxo DELIVERY (pequenas entregas ponto a ponto)

| De | Evento | Para | Quem dispara | Evidência exigida | Rótulo para o cliente |
|---|---|---|---|---|---|
| REQUESTED | Origem, destino, descrição e valor declarado | MATCHING | Sistema | Valor declarado define teto de cobertura | Procurando entregador |
| ACCEPTED → EN_ROUTE → ARRIVED | Até a origem | — | Provider | Posição | A caminho da coleta |
| ARRIVED | Coleta | PICKED_UP | Provider com OTP do remetente | Foto do volume, OTP | Coletado |
| PICKED_UP | Em deslocamento | IN_TRANSIT | Provider | Posição | A caminho do destino |
| IN_TRANSIT | Entrega | DELIVERED | Provider com OTP do destinatário | Foto, OTP | Entregue |
| IN_TRANSIT | Destinatário ausente | Protocolo de tentativa; retorno à origem | Provider com Operador | Tentativas, foto | Não foi possível entregar; retornando |

### A.7 Fluxo SUBSCRIPTION (ar-condicionado por assinatura, lavanderia semanal, lavagem quinzenal)

| De | Evento | Para | Quem dispara | Evidência exigida | Rótulo para o cliente |
|---|---|---|---|---|---|
| Subscription ativa | Job agendado gera a próxima visita (ADR-012) | ServiceOrder em REQUESTED com Booking | Sistema | Plano, periodicidade, Provider preferencial | Próxima visita agendada |
| REQUESTED | Oferta primeiro ao Provider preferencial | OFFERED | Sistema | Expiração longa (até 24 horas antes) | Confirmando seu profissional |
| OFFERED | Preferencial indisponível | MATCHING (ondas normais) | Sistema | — | Confirmando profissional |
| ACCEPTED em diante | Igual ao fluxo de origem (SCHEDULED ou PICKUP_RETURN) | — | — | — | — |
| Subscription | Cobrança recorrente falha | Subscription PAST_DUE; visitas futuras suspensas | Sistema | Tentativas de cobrança | Problema no pagamento |
| Subscription | Cliente pausa ou cancela | PAUSED ou CANCELLED | Cliente | Regra de aviso prévio por plano | Assinatura pausada / cancelada |

### A.8 Fluxo CONCIERGE (pedido em linguagem natural que vira várias ordens)

| De | Evento | Para | Quem dispara | Evidência exigida | Rótulo para o cliente |
|---|---|---|---|---|---|
| Mensagem do cliente (texto, áudio, imagem) | ConciergePlanner devolve ConciergePlan validado (ADR-014) | Plano em DRAFT | IA | Tarefas, dependências, janelas, estimativa em faixa | Aqui está o que entendi; confirma? |
| DRAFT | Plano excede limiares (valor, número de tarefas, categoria de risco) | Plano em OPERATOR_REVIEW | Sistema | Limiar atingido registrado | Um atendente vai revisar e te responde em até X minutos |
| DRAFT ou OPERATOR_REVIEW | Cliente aprova | Uma ServiceOrder por tarefa, cada uma em REQUESTED com o fluxo da sua categoria, ligadas pelo identificador do plano | Cliente | Aceite do plano | Tudo certo; acompanhe cada serviço aqui |
| Qualquer ordem do plano | Mudança de estado | Resumo consolidado atualizado | Sistema | — | Visão única do plano |
| Qualquer ordem do plano | Falha (NO_PROVIDER_FOUND, cancelamento) | Replanejamento proposto pela IA com revisão humana | IA e Operador | Nova proposta | Precisamos ajustar uma parte; veja a sugestão |

Regra invariável: a IA nunca cria pagamento, captura, reembolso ou Payout. Ela propõe; o cliente aprova; a engine executa.

---

## Apêndice B — Matriz de notificações por estado e papel

Herdada do padrão de comida: uma notificação por transição relevante, com canal principal e canal de reserva. O que muda no VÉLIO é a existência de lembretes de Booking e de notificações de Quote.

| Evento | Cliente (push) | Cliente (SMS reserva) | Provider (push) | Operador (painel) |
|---|---|---|---|---|
| REQUESTED | Confirmação com número e expectativa | — | — | — |
| ACCEPTED | Cartão do Provider (nome, foto, nota, verificação) | — | Resumo da ordem e horário | — |
| NO_PROVIDER_FOUND | Aviso honesto e opção de remarcar | Sim | — | Alerta na fila com SLA |
| Lembrete de Booking (véspera) | Pedido de confirmação de presença | Sim, se não respondeu ao push em 2 horas | Pedido de confirmação | Lista de não confirmados |
| Lembrete de Booking (1 hora antes) | Horário e nome do Provider | — | Hora de sair calculada | — |
| EN_ROUTE | Mapa e previsão em faixa | — | — | — |
| Atraso previsto além da janela | Aviso com nova previsão e opção de remarcar sem custo | Sim | — | Alerta |
| ARRIVED | OTP de início em destaque | Sim | — | — |
| IN_PROGRESS | Confirmação silenciosa (sem push) | — | — | — |
| QUOTED | Orçamento aguardando aprovação, com itens e total | Sim | — | — |
| QUOTE_APPROVED | Confirmação | — | Liberado para executar | — |
| PICKED_UP | Itens ou veículo coletados, com fotos | — | — | — |
| DELIVERED | Devolvido; pedido de conferência | — | — | — |
| COMPLETED | Resumo, valor final, recibo, convite para avaliar | — | Valor líquido creditado na Wallet | — |
| CANCELLED_* | Motivo, efeito financeiro, prazo de reembolso | Sim quando houver cobrança | Motivo e efeito | Reincidências |
| DISPUTED | Dispute aberta, próximo passo e prazo | — | Dispute aberta e prazo para responder | Fila por gravidade |
| Payout executado | — | — | Valor e previsão de crédito | Lote conciliado |
| Promocional | Só com opt-in; no máximo semanal | Nunca | Incentivos de janela de alta demanda | — |

---

## Apêndice C — Matriz de evidência (MediaEvidence) por categoria

No modelo de comida, a prova de entrega é opcional e tardia. No VÉLIO, a evidência é condição de Payout. A tabela define o mínimo por categoria; a operação pode exigir mais por configuração.

| Categoria | Antes (obrigatório) | Durante (opcional) | Depois (obrigatório) | Custódia |
|---|---|---|---|---|
| Encanador | Foto do ponto com problema | Foto da peça substituída | Foto do ponto reparado, teste de vazamento em vídeo curto | — |
| Eletricista | Foto do quadro ou ponto, leitura de tensão quando aplicável | Foto da fiação exposta | Foto do ponto finalizado, teste de funcionamento | — |
| Ar-condicionado avulso | Foto da evaporadora e condensadora, modelo e etiqueta | Foto do filtro sujo | Foto limpo, medição de temperatura de saída, checklist de higienização | — |
| Ar-condicionado por assinatura | Igual ao avulso, mais comparação com a visita anterior | — | Igual, mais registro de peças com desgaste para próxima visita | — |
| Lavanderia | Fotos dos itens na coleta, contagem, etiquetas de cuidado | Foto de dano prévio identificado | Fotos dos itens prontos, contagem na devolução | QR Code por lote; leitura em coleta, entrada, saída e devolução |
| Lavagem de carro | Vistoria padronizada de retirada (8 fotos), quilometragem, combustível | — | Vistoria padronizada de devolução, quilometragem, combustível | QR Code da ordem no veículo; telemetria contínua em trânsito |
| Revisão de veículo | Igual à lavagem, mais foto do painel com avisos acesos | Fotos das peças substituídas e da nota fiscal | Igual à lavagem, mais checklist da revisão e nota fiscal | Igual à lavagem |
| Pequena entrega | Foto do volume lacrado | — | Foto da entrega no destino | OTP de remetente e destinatário |
| Assistência residencial | Foto do item ou ambiente | — | Foto do resultado, checklist | — |
| Concierge | Herdado de cada ordem do plano | — | Herdado | Herdado |

Regras comuns: toda foto recebe carimbo de horário, posição e identificador da ordem no servidor; fotos do cliente e do Provider ficam separadas; nenhuma foto é visível publicamente; a vistoria de devolução de veículo é comparada automaticamente com a de retirada e qualquer divergência marca a ordem para revisão antes do Payout.

---

## Apêndice D — Jornadas comparadas passo a passo

Três cenários do VÉLIO lado a lado com a jornada de um pedido de comida, para evidenciar onde o padrão se mantém e onde muda.

### D.1 Vazamento sob a pia (IMMEDIATE)

| Passo | Pedido de comida | VÉLIO |
|---|---|---|
| 1 | Abre o app, vê a home com lojas | Abre o app, escreve ou fala "vazamento embaixo da pia da cozinha" |
| 2 | Escolhe a loja, monta o carrinho | Concierge classifica em "encanador, vazamento", pede uma foto e confirma o endereço |
| 3 | Checkout: endereço, pagamento, cupom | Checkout: janela "agora" ou "hoje à tarde", faixa de preço da visita e do reparo típico, cartão com pré-autorização do teto, aceite da política de orçamento |
| 4 | Loja confirma em minutos | Dispatch em ondas; em 3 a 10 minutos um Provider aceita; cliente vê nome, foto, verificação e nota |
| 5 | Preparo; entregador designado | Provider EN_ROUTE; mapa e previsão em faixa |
| 6 | Entregador chega, entrega | Provider ARRIVED; cliente informa OTP; IN_PROGRESS; fotos de antes |
| 7 | — | Provider identifica sifão trincado; emite Quote com peça e mão de obra; cliente aprova no app; QUOTE_APPROVED |
| 8 | — | Reparo; fotos de depois; OTP final; COMPLETED |
| 9 | Pagamento já capturado | Captura do valor final (visita + Quote aprovada) |
| 10 | Avaliação | Avaliação com motivos; recibo; chat aberto por 48 horas |

### D.2 Lavanderia com coleta e entrega (PICKUP_RETURN leve)

| Passo | Pedido de comida | VÉLIO |
|---|---|---|
| 1 | Escolhe a loja | Escolhe "lavanderia com coleta" e o plano (por peso, por peça, por cesto) |
| 2 | Monta o carrinho | Informa quantidade aproximada, cuidados especiais, janela de coleta e janela de devolução desejada |
| 3 | Checkout | Faixa de preço (fecha após pesagem na lavanderia), pré-autorização do teto, aceite de termos de custódia |
| 4 | Loja confirma | Provider logístico aceita a coleta; lavanderia parceira confirma capacidade |
| 5 | Entregador coleta na loja | Provider ARRIVED na casa do cliente; fotos dos itens, contagem, QR Code do lote, OTP; PICKED_UP |
| 6 | Entrega | IN_TRANSIT até a lavanderia; leitura do QR Code na entrada; IN_PROGRESS |
| 7 | — | Pesagem fecha o preço dentro da faixa; se houver peça com dano prévio, Quote ou aviso |
| 8 | — | Pronto; Booking de devolução; perna 2 em IN_TRANSIT; DELIVERED com OTP e contagem |
| 9 | Pagamento | Captura do valor fechado |
| 10 | Avaliação | Avaliação; janela de 7 dias para contestar peça faltando com base nas fotos da coleta |

### D.3 Revisão de veículo com leva e traz (PICKUP_RETURN veículo + QUOTE_FIRST)

| Passo | Pedido de comida | VÉLIO |
|---|---|---|
| 1 | Escolhe a loja | Seleciona o veículo salvo (placa, modelo, quilometragem informada) e "revisão" |
| 2 | Carrinho | Escolhe pacote de revisão por quilometragem ou "diagnóstico primeiro"; janela de retirada |
| 3 | Checkout | Preço do pacote ou da visita diagnóstica; pré-autorização; aceite de termos de custódia e de condução por terceiro |
| 4 | Loja confirma | Motorista verificado aceita; oficina parceira confirma vaga |
| 5 | Coleta na loja | Vistoria de retirada: 8 fotos, quilometragem, combustível, avarias em diagrama; QR Code; OTP; PICKED_UP |
| 6 | Entrega | IN_TRANSIT com telemetria; entrada na oficina com leitura de QR Code e quilometragem; IN_PROGRESS |
| 7 | — | Oficina emite Quote com itens adicionais e fotos; cliente aprova, recusa ou aprova parcialmente por item |
| 8 | — | Serviço concluído; checklist e nota fiscal; Booking de devolução; perna 2; vistoria de devolução; DELIVERED com OTP |
| 9 | Pagamento | Captura do pacote + itens aprovados |
| 10 | Avaliação | Avaliação da oficina e do motorista separadamente; comparação automática das vistorias; lembrete de próxima revisão por quilometragem |

---

## Apêndice E — Parâmetros operacionais configuráveis consolidados

Tudo o que o marketplace de comida calibra por cidade e o VÉLIO precisa calibrar por categoria e por região, sem deploy (ADR-006, ADR-015). Valores iniciais são sugestões de produto para a primeira cidade, a validar com dados.

| Parâmetro | Escopo | Valor inicial sugerido | Observação |
|---|---|---|---|
| Duração da oferta (imediato) | Categoria | 90 segundos | Entre 60 e 120; menor que isso penaliza Provider em deslocamento |
| Duração da oferta (agendado) | Categoria | 10 minutos | Ofertas feitas com antecedência de horas ou dias |
| Duração da oferta (Subscription, Provider preferencial) | Plano | Até 24 horas antes da visita | Depois cai para ondas normais |
| Providers por onda | Categoria | 3 | Evita que vários aceitem; o primeiro aceite vence |
| Ondas antes de NO_PROVIDER_FOUND | Categoria | 3 | Com ampliação de raio a cada onda |
| Raio inicial e incremento | Categoria e região | 5 km, +5 km por onda | Lavanderia e veículos com raio menor por custo logístico |
| Largura da janela de Booking | Categoria | 2 horas | Blocos discretos; manhã, tarde, noite |
| Tolerância de pontualidade | Categoria | 15 minutos após o fim da janela | Além disso, aviso ao cliente e opção de remarcar sem custo |
| Janela de cancelamento grátis (agendado) | Categoria | Até 12 horas antes | Depois, taxa de remarcação |
| Taxa de remarcação | Categoria | Percentual pequeno do preço da visita | Vai ao Provider |
| Taxa de deslocamento (piso) | Categoria e região | Definida por categoria; público | Fora da base da Commission |
| Franquia de quilometragem | Categoria | 5 km | Acima disso, valor por quilômetro |
| Multiplicador máximo de alta demanda | Região | 1,5x | Teto público |
| Validade da Quote | Categoria | 24 horas (no local, 30 minutos) | Expirada, a ordem fecha só com a visita |
| Limite de Quote para Provider novo | Nível de Provider | Valor baixo nas primeiras ordens | Sobe com o nível |
| Ordens simultâneas por Provider | Nível | 1 no nível inicial | Logística de bens pode ter mais |
| Janela de avaliação | Global | 7 dias após COMPLETED ou DELIVERED | Depois, REVIEWED automático sem nota |
| Nota de corte para ticket automático | Global | 2 | Segura o Payout da ordem até triagem |
| Janela de chat pós-conclusão | Global | 48 horas | Operador pode estender |
| Janela de contestação | Categoria | 7 dias (serviços); 7 dias (bens) | Inicia em COMPLETED ou DELIVERED |
| Ciclo de Payout | Global | Semanal, dia fixo | Opção quinzenal para o Provider |
| Carência do primeiro Payout | Global | 7 dias | Permite verificar as primeiras ordens |
| Retenção por Dispute | Global | Valor da ordem em disputa | Liberado ou ajustado na decisão |
| Fração da Commission para o fundo de garantia | Global | Pequena fração fixa | Revisada trimestralmente |
| Teto do fundo por incidente | Categoria | Maior para veículos | Acima do teto, seguro de terceiro em V1 |
| Limiares do Concierge para revisão humana | Global | Valor total, número de tarefas, categorias de risco | ADR-014 |
| SLA da fila de NO_PROVIDER_FOUND | Região | 15 minutos (imediato), 2 horas (agendado) | Operador deve responder ao cliente nesse prazo |
| Frequência de posição | Global | 3 s perto do destino, 10 s em deslocamento, 60 s ocioso | ADR-009 |
| Precisão mínima de posição | Global | 100 m | Pontos piores são descartados |

---

## Apêndice F — Mapeamento entre funcionalidades e módulos do monólito modular

Relaciona as tabelas da seção 3 aos módulos definidos no ADR-003, para que o planejamento de implementação saiba onde cada funcionalidade vive.

| Módulo | Funcionalidades das tabelas da seção 3 |
|---|---|
| identity | Onboarding, login, cadastro de Provider, aprovação (verificação), antifraude de cadastro |
| catalog | Categorias, busca, página da categoria, catálogo, preço de referência, filtros do pedido |
| geo | Localização, endereço, proximidade, cobertura por categoria, navegação (deep link), telemetria de posição |
| orders | ServiceRequest, ServiceOrder, OrderEvent, status, acompanhamento, cancelamento, histórico, recompra, engine de workflow |
| dispatch | Matching, dispatch em ondas, aceite, ProviderAvailability, ProviderMatchScore, fallback para operador |
| quotes | Quote, QUOTED, QUOTE_APPROVED, itens adicionais, validade |
| payments | Checkout, pagamento, pré-autorização, captura, PIX, reembolso, antifraude de pagamento |
| wallet | Wallet, ledger, Commission, Payout, extrato do Provider, crédito de reembolso |
| subscriptions | Subscription, geração de visitas, Provider preferencial, cobrança recorrente |
| assets | Veículos e imóveis do cliente, equipamentos do Provider |
| communication | Chat, notificações, SMS de reserva, ligação mascarada (V1) |
| reputation | Avaliação bilateral, score, níveis, favoritos, sinalização de cliente de risco |
| support | SupportTicket, Dispute, fundo de garantia, resolução de conflitos |
| concierge | ConciergePlanner, ConciergePlan, revisão humana, triagem de atendimento |
| ops | Fila de NO_PROVIDER_FOUND, aprovação de Providers, filas de tickets e disputas, revisão de evidência antes do Payout |
| admin | commission_rules, matching_configs, políticas de cancelamento, feature flags, catálogo |
| analytics | Funil, tempo por fase, SLA, GMV, take rate, aquisição e retenção |

---

## Apêndice G — Perguntas abertas e riscos de produto

Pontos que o benchmark não resolve e que precisam de decisão do autor ou de validação em campo.

| Tema | Pergunta | Risco se ficar sem resposta | Sugestão de encaminhamento |
|---|---|---|---|
| Escolha do Provider pelo cliente | Em quais categorias o cliente deve poder escolher entre perfis, se em alguma? | Escolha livre reduz a eficiência do matching e expõe Providers novos a nunca serem escolhidos | MVP sem escolha; V1 com escolha só entre favoritos e em categorias de relação longa (ar-condicionado por assinatura) |
| Lavanderia: Provider único ou dois? | A lavanderia parceira faz a coleta ou um Provider logístico separado? | Dois atores dobram a cadeia de custódia e o custo | MVP com lavanderia parceira fazendo a própria coleta quando possível; logística separada só onde a lavanderia não cobre |
| Condução de veículo por terceiro | Qual a cobertura de seguro mínima para o MVP e quem a contrata? | Sinistro sem cobertura pode encerrar o produto | Lançar veículos apenas quando houver seguro de terceiro contratado; até então, somente lavagem no local do cliente |
| Preço de referência versus preço do Provider | O Provider aceita tabela fixa da plataforma em todas as categorias? | Tabela baixa afasta os melhores; tabela alta afasta clientes | Tabela por nível de Provider; Provider de nível alto pode ter faixa própria em V2 |
| Taxa de serviço ao cliente | Cobrar taxa fixa pequena por ordem desde o MVP? | Receita adicional contra fricção no checkout | Testar com e sem nas primeiras semanas; a decisão fica em `platform_settings` |
| Operação humana fora do horário | Quem atende NO_PROVIDER_FOUND e Dispute à noite e no fim de semana? | SLA quebrado justamente nos picos de emergência | Horário de cobertura humana público; fora dele, só fluxo imediato de emergência com Providers de plantão |
| Reembolso em crédito com bônus | O bônus de crédito em Wallet é percebido como justo ou como manipulação? | Reputação | Começar com bônus zero e medir aceitação da opção |
| Dados de telemetria do veículo | Até onde guardar o trajeto completo da condução por terceiro? | Privacidade do Provider versus prova em Dispute | Guardar por ordem, com retenção limitada e acesso só em Dispute |

---

## Apêndice H — Glossário canônico usado neste documento

| Termo | Definição operacional |
|---|---|
| ServiceRequest | Intenção do cliente com categoria, descrição, fotos, endereço, janela e forma de pagamento; ainda sem Provider nem preço fechado |
| ServiceOrder | Contrato entre cliente, Provider e plataforma; nasce da ServiceRequest em REQUESTED e percorre a WorkflowDefinition da categoria |
| OrderEvent | Registro imutável de cada transição ou fato relevante da ServiceOrder, com autor, horário, posição e dados anexos |
| Quote | Orçamento emitido pelo Provider ou parceiro, com itens, preços de referência, fotos e validade; cobrado só após aprovação do cliente |
| Booking | Janela de horário reservada para uma etapa da ordem (visita, coleta, devolução) |
| Subscription | Plano recorrente que gera Bookings e ServiceOrders automaticamente, com Provider preferencial e cobrança recorrente |
| Provider | Pessoa física ou jurídica que executa o serviço ou a logística; pode ter mais de uma categoria habilitada |
| ProviderAvailability | Estado de disponibilidade do Provider: OFFLINE, ONLINE, BUSY, UNAVAILABLE, combinado com agenda e raio |
| ProviderMatchScore | Pontuação ponderada usada para ordenar Providers em cada onda de dispatch; pesos por categoria em configuração |
| Dispatch em ondas | Oferta sequencial a grupos de Providers com expiração, ampliação de raio e fallback para operador |
| Wallet | Conta de saldo de cliente ou Provider no ledger interno |
| Payout | Transferência em lote do saldo do Provider para sua conta bancária ou chave PIX |
| Commission | Parcela da plataforma sobre o valor do serviço, por regra de categoria e fluxo |
| MediaEvidence | Fotos, vídeos curtos, checklists e leituras (quilometragem, QR Code) ligados à ordem como prova |
| Cadeia de custódia | Sequência de transferências de posse de um bem do cliente, cada uma com QR Code, fotos e OTP |
| OTP/PIN | Código de uso único mostrado ao cliente e informado pelo Provider para iniciar e encerrar o serviço ou confirmar entrega |
| Dispute | Processo estruturado de contestação ligado à ordem, com partes, evidências, prazos e decisão com efeito financeiro |
| SupportTicket | Solicitação de ajuda de cliente ou Provider, com motivo estruturado e fila por gravidade |
| Concierge | Entrada em linguagem natural que, com IA e revisão humana, gera um plano de várias ordens |
| Human-in-the-loop | Regra de que decisões acima de limiares passam por operador antes de valer |
| NO_PROVIDER_FOUND | Estado esperado quando as ondas se esgotam; abre fila operacional, não é erro |
| Fundo de garantia | Reserva financiada por fração da Commission para cobrir incidentes acima da capacidade do Provider |

---

## Apêndice I — Consolidação por prioridade

Contagem e lista das funcionalidades das quatro tabelas da seção 3 por prioridade. Serve de insumo para o backlog; a ordem interna de cada bloco é a ordem de dependência sugerida.

| Prioridade | Quantidade | Critério |
|---|---|---|
| MVP | 65 | Necessário para operar a primeira cidade com segurança jurídica e sem equipe de suporte grande |
| V1 | 7 linhas de tabela, mais 4 subfuncionalidades citadas dentro de linhas MVP | Primeiros seis meses; depende de dados ou de densidade de Providers |
| V2 | 1 linha de tabela, mais 1 subfuncionalidade citada em nota | Eficiência e personalização com base em histórico |
| V3 | 0 | Nenhuma funcionalidade do benchmark de comida cai em V3; o que seria V3 (precificação própria por Provider, destaque pago) foi deliberadamente excluído na seção 5 |

### I.1 MVP, em ordem de dependência

| Ordem | Bloco | Funcionalidades |
|---|---|---|
| 1 | Identidade e geografia | Onboarding, login, localização, endereço, cadastro de Provider, aprovação de Provider |
| 2 | Catálogo e preço | Categorias, página da categoria, catálogo, preço com faixa, disponibilidade por janela |
| 3 | Ordem e workflow | Resumo da ServiceRequest, checkout, confirmação, status, histórico, execução pelo Provider, cancelamento (cliente, Provider e plataforma), política de cancelamento |
| 4 | Matching e dispatch | Ranking (ProviderMatchScore), matching, dispatch em ondas, aceite com expiração, ProviderAvailability, proximidade, fila de NO_PROVIDER_FOUND |
| 5 | Pagamentos e ledger | Pagamento com pré-autorização e PIX, cupom, Commission, Wallet, Payout, extrato do Provider, reembolso |
| 6 | Execução e evidência | OTP/PIN, MediaEvidence, coleta e conclusão com QR Code, prova de entrega, remuneração de deslocamento, histórico do Provider |
| 7 | Comunicação | Acompanhamento por linha do tempo, mapa em EN_ROUTE, previsão em faixa, chat, notificações |
| 8 | Qualidade e suporte | Avaliação bilateral, reputação e níveis, avaliações visíveis ao Provider, SupportTicket, Dispute, antifraude básico, fundo de garantia |
| 9 | Operação e dados | Painel ops (filas), analytics com funil e tempo por fase, promoções básicas (cupons) |
| 10 | Concierge | Entrada em linguagem natural com ConciergePlanner e revisão humana acima de limiares |

### I.2 V1

| Funcionalidade | Por que não está no MVP |
|---|---|
| Busca textual sobre o catálogo | As categorias cobrem o MVP; busca ganha valor com catálogo maior |
| Filtros sobre lista de Providers | Só faz sentido quando houver escolha pelo cliente em alguma categoria |
| Recompra com um toque e sugestão de Subscription | Exige histórico |
| Favoritos de Provider com peso no matching | Exige histórico e densidade |
| Indicadores do Provider | Exige dados acumulados para serem úteis |
| SLA com compensação automática | Exige calibração com dados reais |
| Aquisição e retenção (indicação, lembretes de manutenção) | Primeiro é preciso ter retenção orgânica para medir |
| Modo "lista de ordens disponíveis" para Providers consolidados | Exige níveis de reputação populados |
| Ligação mascarada | Chat resolve a maioria dos casos no início; telefonia tem custo e integração |
| Atividades ao vivo em tela bloqueada | Refinamento de acompanhamento |
| Antecipação de Payout com taxa | Exige fluxo de caixa e conciliação maduros |

### I.3 V2

| Funcionalidade | Por que depois |
|---|---|
| Recomendações por sazonalidade e histórico | Depende de volume e de modelo de propensão |
| Opção "eu levo e busco" em lavanderia e lavagem | Zera uma perna logística; só vale quando houver parceiros com balcão |

---

## Apêndice J — Métricas de produto a instrumentar desde o MVP

Derivadas do que o marketplace de comida mede publicamente (tempo, aceite, cancelamento, nota) e do que o VÉLIO precisa medir a mais (orçamento, custódia, operador humano). Todas são eventos tipados conforme ADR-013; nenhuma é métrica interna do iFood.

| Métrica | Definição | Fase do funil | Por que importa no VÉLIO |
|---|---|---|---|
| Taxa de conclusão de checkout | ServiceRequests confirmadas / checkouts iniciados | Entrada | Mede se faixa de preço e termos de orçamento assustam |
| Tempo até ACCEPTED | Mediana e p90 entre REQUESTED e ACCEPTED | Matching | Principal indicador de densidade de oferta |
| Taxa de NO_PROVIDER_FOUND | Ordens que esgotaram as ondas / ordens em MATCHING | Matching | Define onde recrutar Providers e quando abrir categoria |
| Taxa de resolução pelo operador | NO_PROVIDER_FOUND que viraram ACCEPTED por atribuição manual | Matching | Mede o valor do fallback humano e seu custo |
| Taxa de aceite por Provider | Aceites / ofertas recebidas | Matching | Componente do score; identifica Providers que só aceitam o fácil |
| Tempo de resposta à oferta | Mediana entre OFFERED e resposta | Matching | Calibra a duração da oferta |
| Pontualidade na janela | Ordens com ARRIVED dentro da janela de Booking / agendadas | Execução | Substitui "minutos até a entrega" como métrica central |
| Taxa de Quote | Ordens que passaram por QUOTED / ordens IN_PROGRESS | Execução | Indica se o catálogo estima mal o escopo |
| Taxa de aprovação de Quote | QUOTE_APPROVED / QUOTED | Execução | Mede confiança no Provider e justeza dos preços de referência |
| Desvio entre estimativa e valor final | Valor final / limite superior da faixa | Execução | Faixa mal calibrada gera Dispute |
| Taxa de evidência completa | Ordens COMPLETED com MediaEvidence mínima / COMPLETED | Execução | Pré-requisito de Payout; mede adesão do Provider |
| Taxa de divergência de custódia | Lotes ou veículos com divergência entre vistorias / total | Custódia | Risco direto do fundo de garantia |
| Taxa de cancelamento por fase | CANCELLED_* por estado de origem / ordens | Exceções | Mostra onde a política de cancelamento está mal calibrada |
| Taxa de no-show (cliente e Provider) | CANCELLED_NO_SHOW / ordens agendadas | Exceções | Custo de confiança dos dois lados |
| Taxa de Dispute | DISPUTED / COMPLETED+DELIVERED | Exceções | Qualidade e justeza percebida |
| Tempo de resolução de Dispute | Mediana entre abertura e decisão | Exceções | SLA operacional |
| Nota média por motivo | Distribuição de motivos estruturados por categoria | Qualidade | Acionável, diferente da nota agregada |
| Taxa de recompra em 60 dias | Clientes com segunda ordem / clientes com primeira | Retenção | Validação do produto |
| Conversão para Subscription | Subscriptions ativas / clientes com duas ordens na mesma categoria | Retenção | Principal alavanca de retenção |
| GMV, take rate e custo de cupom | Soma de valores finais; Commission / GMV; cupons / GMV | Financeiro | Sustentabilidade |
| Payout no prazo | Lotes executados no dia previsto / lotes | Financeiro | Confiança do Provider |
| Taxa de intervenção humana no Concierge | Planos que passaram por OPERATOR_REVIEW / planos | Concierge | Calibra limiares e mede custo do human-in-the-loop |
| Taxa de aprovação do plano do Concierge | Planos aprovados pelo cliente / planos propostos | Concierge | Qualidade do planejador |

---

## Apêndice K — Esboço de SLA e compensação (V1)

Baseado no padrão de comida de liberar cancelamento e reembolso quando o atraso excede um limite (fonte: canaltech.com.br, data não precisa; valores do iFood podem ter mudado e não são os do VÉLIO). O VÉLIO só ativa compensação automática em V1, após calibrar com os dados do Apêndice J; no MVP a compensação é manual pelo operador.

| Compromisso | Medida | Limite sugerido | Compensação automática sugerida |
|---|---|---|---|
| Encontrar um Provider (imediato) | Tempo até ACCEPTED | 15 minutos | Cupom de desculpas se o cliente remarcar; cancelamento sem custo sempre |
| Encontrar um Provider (agendado) | Confirmação até a véspera | 18 horas antes da janela | Aviso proativo e prioridade na fila do operador |
| Pontualidade | ARRIVED dentro da janela de Booking | Até 15 minutos após o fim da janela | Desconto fixo na taxa de deslocamento; acima de 45 minutos, cancelamento sem custo e crédito em Wallet |
| Devolução de bens | DELIVERED dentro da janela prometida | Até 2 horas após a janela | Desconto fixo; acima de 24 horas, crédito em Wallet e revisão da ordem |
| Resposta a Dispute | Primeira resposta do operador | 24 horas | — (compromisso operacional, sem compensação financeira) |
| Decisão de Dispute | Decisão com justificativa | 5 dias úteis | — |
| Reembolso | Lançamento no ledger e ordem ao gateway | 24 horas após a decisão | Crédito em Wallet imediato oferecido como alternativa |
| Payout | Lote executado | Dia fixo da semana | Comunicação proativa em caso de atraso; juros simples a partir de V2 |

---

## Apêndice L — Checklist de verificação de Provider por categoria

O marketplace de comida valida CNPJ e dados fiscais do estabelecimento. O VÉLIO verifica pessoas que entram em casas e conduzem bens alheios, por isso o checklist é individual e varia por categoria. Itens marcados como V1 dependem de integração com terceiros.

| Item | Encanador | Eletricista | Ar-condicionado | Lavanderia (parceiro) | Motorista (veículos) | Pequena entrega | Assistência residencial |
|---|---|---|---|---|---|---|---|
| Documento com foto e selfie com prova de vida | Sim | Sim | Sim | Responsável legal | Sim | Sim | Sim |
| CPF ou CNPJ válido e ativo | Sim | Sim | Sim | CNPJ | Sim | Sim | Sim |
| Comprovante de endereço | Sim | Sim | Sim | Sim | Sim | Sim | Sim |
| Conta bancária ou chave PIX no mesmo titular | Sim | Sim | Sim | Sim | Sim | Sim | Sim |
| Verificação de antecedentes (V1) | Sim | Sim | Sim | Responsável e equipe | Sim | Sim | Sim |
| Certificação técnica | Desejável | NR-10 obrigatória | Desejável; obrigatória para instalação | Alvará | — | — | — |
| CNH válida e categoria compatível | — | — | — | — | Obrigatória, sem suspensão | Conforme modal | — |
| Documento e seguro do veículo próprio | — | — | — | — | Quando usar veículo próprio | Conforme modal | — |
| Equipamentos declarados | Sim | Sim | Sim (escada, manifold, lavadora) | Capacidade diária | — | Bag ou baú | Sim |
| Entrevista ou teste prático | Recomendado | Obrigatório | Obrigatório | Visita ao local | Avaliação de direção (V1) | — | Recomendado |
| Aceite de termos de custódia | — | — | — | Sim | Sim | Sim | — |
| Limite inicial de Quote e de ordens simultâneas | Sim | Sim | Sim | Por capacidade | Uma ordem por vez | Uma por vez | Sim |
| Período de observação com revisão de evidência em todas as ordens | 10 ordens | 10 ordens | 10 ordens | 20 lotes | 10 ordens | 20 entregas | 10 ordens |

