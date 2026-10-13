# 05 — Arquitetura de Informação

Mapa de navegação das quatro superfícies, estrutura da home configurável, modelo e taxonomia de categorias, rótulos pt-BR de status, notificações e deep links. Vocabulário canônico de `11_MARKETPLACE_ENGINE.md`; módulos e rotas de `06_SYSTEM_ARCHITECTURE.md`; telas em `10_SCREEN_INVENTORY.md`.

## 1. Princípios de navegação

1. Uma barra inferior com no máximo quatro destinos por app; tudo o mais é pilha (stack) ou folha (bottom sheet).
2. O acompanhamento de pedido é uma pilha modal acessível de qualquer aba enquanto houver ordem ativa (cartão fixo "Em andamento").
3. Rotas espelham entidades: `/orders/[id]`, `/quotes/[id]`, `/providers/[id]`. Nenhuma rota depende de `workflowKind`: a tela de pedido renderiza a linha do tempo a partir de `order_events` e do mapa de rótulos.
4. Web: `/ops` e `/admin` compartilham `/login`, layout com navegação lateral e RBAC por papel (ADR-011).
5. Deep links e URLs web são estáveis e versionados com o `contracts`.

## 2. App do cliente (VÉLIO) — Expo Router `(customer)`

```
app/
  _layout.tsx                       raiz: providers (auth, query, socket, tema)
  (auth)/
    welcome.tsx                     C-01 boas-vindas + telefone
    otp.tsx                         C-01 código
    profile-setup.tsx               C-02 nome e termos
  (customer)/
    _layout.tsx                     tabs: Início, Pedidos, Mensagens, Perfil
    (tabs)/
      index.tsx                     C-03 home configurável
      orders/
        index.tsx                   C-16 pedidos (em andamento, agendados, histórico)
      messages/
        index.tsx                   C-19 conversas (ordens e suporte)
      profile/
        index.tsx                   C-26 perfil
    search.tsx                      C-04 busca "O que você precisa?"
    address/
      index.tsx                     C-05 endereços salvos
      new.tsx                       C-05 novo endereço (mapa + formulário)
      [id].tsx                      C-05 editar
    categories/
      [slug].tsx                    C-06 categoria (subcategorias + serviços)
    services/
      [slug].tsx                    C-07 detalhe do serviço
      [slug]/configure.tsx          C-08 insumos (equipamento, veículo, itens, janela)
      [slug]/checkout.tsx           C-09 resumo e confirmação
    orders/
      [id]/
        index.tsx                   C-10/C-11 acompanhamento (busca, mapa, linha do tempo)
        chat.tsx                    C-12 chat da ordem
        custody.tsx                 C-13 cadeia de custódia e confirmação digital
        quotes/[quoteId].tsx        C-14 aprovação de orçamento (inicial ou adicional)
        payment.tsx                 C-15 pagamento e recuperação (PIX, cartão)
        receipt.tsx                 C-15 recibo
        review.tsx                  C-17 avaliação
        dispute.tsx                 C-18 contestação
        cancel.tsx                  folha de cancelamento com política
        reschedule.tsx              folha de reagendamento
    subscriptions/
      index.tsx                     C-20 planos e minhas assinaturas
      [planSlug]/checkout.tsx       C-21 assinar
      [id].tsx                      C-22 gerir assinatura e visitas
    concierge/
      index.tsx                     C-24 entrada em linguagem natural
      [id].tsx                      C-25 plano, aprovação, execução
    assets/
      vehicles/…                    C-23 veículos (lista, novo, editar)
      equipments/…                  C-23 equipamentos
    payments/
      methods.tsx                   C-27 métodos de pagamento
      wallet.tsx                    C-27 carteira e créditos
      coupons.tsx                   C-27 cupons
    support/
      index.tsx                     C-29 ajuda e tickets
      [ticketId].tsx                C-29 chat de suporte
    notifications.tsx               C-30 central de notificações
    privacy.tsx                     C-28 consentimentos, exportar, excluir
    providers/[id].tsx              perfil público do profissional (folha)
```

Barra inferior: **Início** (home), **Pedidos**, **Mensagens**, **Perfil**. Ordem ativa aparece como cartão fixo acima da barra em todas as abas.

## 3. App do prestador (VÉLIO Pro) — Expo Router `(provider)`

```
app/
  (auth)/                           P-01 OTP (compartilhado com o cliente)
  (provider)/
    _layout.tsx                     tabs: Início, Agenda, Ganhos, Perfil
    onboarding/
      type.tsx                      P-02 autônomo ou empresa
      personal.tsx                  P-03 dados pessoais
      documents.tsx                 P-04 documentos e selfie
      skills.tsx                    P-05 especialidades
      area.tsx                      P-06 área de atendimento
      schedule.tsx                  P-07 disponibilidade semanal
      payout-account.tsx            P-08 dados de recebimento
      pending.tsx                   P-09 em análise / recusado
    (tabs)/
      index.tsx                     P-10 home: disponibilidade, ordem ativa, resumo do dia
      schedule/index.tsx            P-17 agenda (dia/semana), folgas
      earnings/index.tsx            P-20 saldo e extrato
      profile/index.tsx             P-24 perfil e indicadores
    offers/[id].tsx                 P-11 oferta recebida (modal de tela cheia)
    orders/
      [id]/
        index.tsx                   P-12/P-13 ordem aceita e execução (botão por etapa)
        navigate.tsx                P-13 rota (abre app externo) e mapa
        evidence.tsx                P-14 evidências: fotos, checklist, odômetro, QR
        quote.tsx                   P-15 orçamento adicional ou inicial
        chat.tsx                    P-18 chat com cliente
        complete.tsx                P-16 conclusão e avaliação do cliente
        cancel.tsx                  folha de cancelamento com aviso de penalidade
    earnings/
      payouts/index.tsx             P-21 repasses
      payouts/[id].tsx              P-21 comprovante
      statement.tsx                 P-20 extrato por período
    reviews/index.tsx               P-22 avaliações recebidas
    stats.tsx                       P-23 indicadores
    availability/time-off.tsx       P-17 folgas
    support/…                       P-26 suporte
    privacy.tsx                     P-27 privacidade
    notifications.tsx               P-25 notificações
```

Barra inferior: **Início**, **Agenda**, **Ganhos**, **Perfil**. Oferta recebida interrompe qualquer tela (modal de tela cheia com contagem regressiva).

## 4. Web — Next.js App Router

```
app/
  login/page.tsx                    e-mail e senha; 2FA (V1)
  (ops)/ops/
    layout.tsx                      navegação lateral; sala `ops` do Socket.IO
    page.tsx                        O-01 visão geral: KPIs do turno e alertas
    map/page.tsx                    O-02 mapa operacional + filas laterais
    queues/
      no-provider/page.tsx          O-03 sem profissional
      delays/page.tsx               O-03 atrasos (SLA)
      cancellations/page.tsx        O-03 cancelamentos
      payments/page.tsx             O-12 pagamentos com falha
      disputes/page.tsx             O-08 disputas
      concierge/page.tsx            O-10 NEEDS_HUMAN
    orders/
      page.tsx                      O-04 busca e lista de ordens
      [id]/page.tsx                 O-05 detalhe (linha do tempo, participantes, ações)
      [id]/assign/page.tsx          O-06 dispatch manual (candidatos)
    providers/
      page.tsx                      O-11 prestadores (online, busy, última ordem)
      [id]/page.tsx                 O-11 detalhe e suspensão temporária
    incidents/
      page.tsx                      O-07 incidentes
      [id]/page.tsx                 O-07 detalhe
    support/
      page.tsx                      O-09 tickets
      [id]/page.tsx                 O-09 chat
    sla/page.tsx                    O-13 SLAs e alertas
  (admin)/admin/
    layout.tsx
    page.tsx                        A-00 visão geral
    catalog/
      categories/page.tsx           A-01 árvore de categorias
      categories/[id]/page.tsx      A-01 editor de categoria
      services/page.tsx             A-02 serviços
      services/[id]/page.tsx        A-02 editor de serviço
    pricing/page.tsx                A-03 regras de preço por região
    regions/page.tsx                A-04 cidades, regiões, bairros
    commission/page.tsx             A-05 comissão
    matching/page.tsx               A-06 pesos do matching por categoria
    providers/
      page.tsx                      A-07 prestadores e fila de aprovação
      [id]/page.tsx                 A-07 documentos, decisão, skills, áreas
    users/page.tsx                  A-08 usuários e papéis
    home/page.tsx                   A-09 seções da home
    banners/page.tsx                A-10 banners e conteúdos
    plans/page.tsx                  A-11 planos
    subscriptions/page.tsx          A-11 assinaturas
    coupons/page.tsx                A-12 cupons e promoções
    sla/page.tsx                    A-13 SLAs
    settings/
      cancellation/page.tsx         A-14 política de cancelamento
      flags/page.tsx                A-18 feature flags e settings
      notifications/page.tsx        A-17 textos de notificação
    workflows/page.tsx              A-15 definições de workflow (leitura; sobrescrita em V2)
    payments/
      intents/page.tsx              A-16 intenções e reembolsos
      payouts/page.tsx              A-16 lotes de repasse
    audit/page.tsx                  A-19 auditoria
    analytics/page.tsx              A-20 dashboard
```

Navegação lateral de `/ops`: Visão geral, Mapa, Filas (com contadores), Ordens, Prestadores, Incidentes, Suporte, SLA. De `/admin`: Catálogo, Preços, Regiões, Comissão, Matching, Prestadores, Usuários, Home, Banners, Planos, Cupons, SLA, Configurações, Workflows, Pagamentos, Auditoria, Analytics.

## 5. Home configurável do cliente

`GET /v1/catalog/home?addressId=&at=` devolve `sections[]` ordenadas. Cada seção tem `type`, `id`, `title`, `subtitle?`, `items[]`, `rule` (já avaliada no servidor) e `analyticsKey`. O app renderiza por `type` e ignora tipos desconhecidos (compatibilidade futura).

| `type` | Conteúdo (`items`) | Regra de exibição típica | Componente | Interação |
|---|---|---|---|---|
| `hero` | Saudação por período, endereço atual, campo de busca | Sempre; texto por hora do dia | `HomeHero` | Toca endereço → C-05; busca → C-04 |
| `in_progress` | Ordens não terminais do usuário com status e ETA | Só com ordens ativas; sempre no topo após `hero` | `OrderStatusCard` | → C-10/C-11 |
| `categories` | Categorias raiz ativas na região, ordem do admin | Sempre | `CategoryTile` grid 4 colunas | → C-06 |
| `quick_services` | Serviços `IMMEDIATE` populares na região | Horário comercial estendido; região com cobertura `IMMEDIATE` | `ServiceCard` horizontal | → C-07 |
| `scheduled` | Serviços `SCHEDULED` em destaque + próximos agendamentos do usuário | Sempre | `ServiceCard` + `OrderStatusCard` | → C-07 / C-11 |
| `subscriptions` | Planos (Essencial, Residencial, Premium) ou "Sua próxima visita" | Sem assinatura: mostrar planos; com assinatura: próxima visita | `PlanCard` | → C-20 / C-22 |
| `concierge` | Entrada rápida "Descreva o que precisa" | Região com Concierge ativo | `ConciergeEntry` | → C-24 |
| `recommendations` | Sugestões com fonte declarada (`reason`: `equipment_maintenance_due`, `reorder`, `seasonal`) | Só com consentimento `personalization`; cada item exige `reason` com dado de origem | `ServiceCard` com legenda da razão | → C-07 pré-preenchido |
| `banner` | Imagem, título, destino (serviço, categoria, plano, conteúdo) | Vigência, região, segmento | `Banner` | Destino configurável |

Regras: `recommendations` nunca é exibida sem `reason` rastreável (ex.: `Equipment.lastMaintenanceAt` há mais de 6 meses); textos de `hero` por período vêm de `home_sections.config.greetings` (manhã, tarde, noite); ordem e visibilidade por região e horário são decididas no servidor; cache de 60 s; skeleton por tipo de seção.

## 6. Modelo de categorias

```ts
type ServiceCategory = {
  id: string;                 // uuid v7
  parentId: string | null;    // árvore
  slug: string;               // único, kebab-case, estável (usado em rotas e deep links)
  name: string;
  description?: string;
  icon: string;               // nome no conjunto de ícones do design system (09 §6)
  sortOrder: number;
  isActive: boolean;
  regions?: string[];         // vazio = todas as regiões ativas
  config: {
    requiresPin: boolean;                 // PIN de início (guard requiresPin)
    requiresBeforeAfterPhotos: boolean;   // guards requiresEvidence:BEFORE/AFTER
    requiresVehicle: boolean;             // insumo Vehicle obrigatório
    requiresEquipment: boolean;           // insumo Equipment obrigatório
    custody: 'NONE' | 'ITEMS' | 'VEHICLE';// CustodyEvent por item ou veículo
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; // afeta verificação do prestador e limiares de Concierge
    defaultWorkflowKind?: WorkflowKind;   // sugestão ao criar serviço
  };
};

type Service = {
  id: string; categoryId: string; slug: string; name: string;
  shortDescription: string; includes: string[]; excludes: string[];
  workflowKind: 'IMMEDIATE' | 'SCHEDULED' | 'QUOTE' | 'LOGISTICS' | 'LAUNDRY' | 'CONCIERGE';
  pricingModel: 'FIXED' | 'HOURLY' | 'QUOTE' | 'RANGE';
  pricingAttributes?: string[];          // ex.: ['btu'], ['vehicleSize'], ['kg']
  estimatedDurationMin: number;
  tags: string[];                         // busca
  media: { coverUrl: string };
  flags: { popular?: boolean; new?: boolean };
  isActive: boolean; sortOrder: number;
};
```

Preço vive em `service_price_rules` (serviço × região × vigência × atributos), nunca em `Service`. Slugs não mudam após publicação; renomear cria alias.

## 7. Taxonomia inicial

Categorias raiz com slug, ícone e `config`; serviços com `workflowKind` e `pricingModel` sugeridos. Prioridade indica a release em que o serviço entra no catálogo.

| Categoria | slug | ícone | PIN | Fotos A/D | Custódia | Risco |
|---|---|---|---|---|---|---|
| Hidráulica | `hidraulica` | `droplet` | sim | sim | NONE | MEDIUM |
| Elétrica | `eletrica` | `bolt` | sim | sim | NONE | HIGH |
| Ar-condicionado | `ar-condicionado` | `snowflake` | sim | sim | NONE | MEDIUM |
| Limpeza residencial | `limpeza` | `sparkle` | sim | sim | NONE | MEDIUM |
| Lavanderia | `lavanderia` | `shirt` | não | sim | ITEMS | LOW |
| Automotivo | `automotivo` | `car` | não | sim | VEHICLE | MEDIUM |
| Montagem e instalação | `montagem` | `wrench` | sim | sim | NONE | MEDIUM |
| Entregas rápidas | `entregas` | `package` | não | sim | ITEMS | LOW |
| Assistência residencial | `assistencia` | `home` | sim | sim | NONE | MEDIUM |
| Concierge | `concierge` | `compass` | depende das filhas | depende | depende | HIGH |

| # | Categoria | Serviço | slug | `workflowKind` | `pricingModel` | Atributos de preço | Duração (min) | Prio |
|---|---|---|---|---|---|---|---|---|
| 1 | Hidráulica | Vazamento urgente | `vazamento-urgente` | IMMEDIATE | FIXED | — | 60 | MVP |
| 2 | Hidráulica | Desentupimento | `desentupimento` | IMMEDIATE | RANGE | ponto (pia, vaso, ralo) | 60 | MVP |
| 3 | Hidráulica | Troca de torneira ou registro | `troca-torneira-registro` | SCHEDULED | FIXED | — | 45 | MVP |
| 4 | Hidráulica | Instalação de chuveiro | `instalacao-chuveiro` | SCHEDULED | FIXED | — | 60 | MVP |
| 5 | Hidráulica | Reparo de caixa acoplada | `reparo-caixa-acoplada` | SCHEDULED | FIXED | — | 60 | MVP |
| 6 | Hidráulica | Visita técnica hidráulica | `visita-tecnica-hidraulica` | QUOTE | QUOTE | — | 45 | V1 |
| 7 | Elétrica | Emergência elétrica | `emergencia-eletrica` | IMMEDIATE | HOURLY | — | 60 | MVP |
| 8 | Elétrica | Troca de disjuntor ou tomada | `troca-disjuntor-tomada` | SCHEDULED | FIXED | quantidade | 45 | MVP |
| 9 | Elétrica | Instalação de luminária ou ventilador | `instalacao-luminaria-ventilador` | SCHEDULED | FIXED | quantidade | 60 | MVP |
| 10 | Elétrica | Instalação de chuveiro elétrico | `instalacao-chuveiro-eletrico` | SCHEDULED | FIXED | — | 60 | MVP |
| 11 | Elétrica | Revisão elétrica | `revisao-eletrica` | QUOTE | QUOTE | — | 90 | V1 |
| 12 | Ar-condicionado | Limpeza de split | `limpeza-split` | SCHEDULED | FIXED | btu | 90 | MVP |
| 13 | Ar-condicionado | Manutenção preventiva | `manutencao-preventiva-ar` | SCHEDULED | FIXED | btu | 120 | MVP |
| 14 | Ar-condicionado | Instalação de split | `instalacao-split` | SCHEDULED | RANGE | btu, metros de tubulação | 240 | MVP |
| 15 | Ar-condicionado | Diagnóstico e reparo | `reparo-ar-condicionado` | QUOTE | QUOTE | — | 90 | V1 |
| 16 | Ar-condicionado | Plano Essencial (1 visita/semestre, 1 equipamento) | `plano-essencial` | SCHEDULED (via Subscription) | FIXED | equipamentos | 90 | V1 |
| 17 | Ar-condicionado | Plano Residencial (1 visita/trimestre, até 3 equipamentos) | `plano-residencial` | SCHEDULED (via Subscription) | FIXED | equipamentos | 180 | V1 |
| 18 | Ar-condicionado | Plano Premium (mensal, até 5 equipamentos, prioridade) | `plano-premium` | SCHEDULED (via Subscription) | FIXED | equipamentos | 240 | V1 |
| 19 | Limpeza | Diarista | `diarista` | SCHEDULED | HOURLY | horas (mín. 4) | 240 | MVP |
| 20 | Limpeza | Limpeza pesada ou pós-obra | `limpeza-pesada` | QUOTE | QUOTE | — | 480 | V1 |
| 21 | Limpeza | Limpeza de estofados | `limpeza-estofados` | SCHEDULED | RANGE | peças | 120 | MVP |
| 22 | Lavanderia | Lavar e passar por kg | `lavar-passar-kg` | LAUNDRY | RANGE | kg | 2880 | V1 |
| 23 | Lavanderia | Lavagem a seco por peça | `lavagem-seco-peca` | LAUNDRY | FIXED | peças | 4320 | V1 |
| 24 | Lavanderia | Edredons e cobertores | `edredons-cobertores` | LAUNDRY | FIXED | peças, tamanho | 2880 | V1 |
| 25 | Lavanderia | Tênis | `lavagem-tenis` | LAUNDRY | FIXED | pares | 2880 | V1 |
| 26 | Automotivo | Lavagem no local | `lavagem-no-local` | SCHEDULED | FIXED | vehicleSize | 60 | V1 |
| 27 | Automotivo | Leva e traz para lavagem | `leva-traz-lavagem` | LOGISTICS | FIXED | vehicleSize, distância | 180 | V1 |
| 28 | Automotivo | Leva e traz para revisão | `leva-traz-revisao` | LOGISTICS | FIXED (logística) + QUOTE (terceiro) | distância | 480 | V1 |
| 29 | Automotivo | Higienização interna | `higienizacao-interna` | SCHEDULED | FIXED | vehicleSize | 120 | V1 |
| 30 | Automotivo | Troca de bateria no local | `troca-bateria` | IMMEDIATE | RANGE | modelo da bateria | 45 | V1 |
| 31 | Automotivo | Socorro de pneu | `socorro-pneu` | IMMEDIATE | FIXED | — | 45 | V1 |
| 32 | Montagem | Montagem de móveis | `montagem-moveis` | SCHEDULED | HOURLY | horas | 120 | MVP |
| 33 | Montagem | Instalação de TV e suporte | `instalacao-tv` | SCHEDULED | FIXED | polegadas | 60 | MVP |
| 34 | Montagem | Instalação de cortinas e prateleiras | `instalacao-cortinas-prateleiras` | SCHEDULED | FIXED | quantidade | 60 | MVP |
| 35 | Entregas | Entrega de pequenos volumes | `entrega-pequenos-volumes` | LOGISTICS | FIXED | distância | 60 | V1 |
| 36 | Entregas | Retirada em loja ou correio | `retirada-loja-correio` | LOGISTICS | FIXED | distância | 90 | V1 |
| 37 | Entregas | Documentos | `entrega-documentos` | LOGISTICS | FIXED | distância | 60 | V1 |
| 38 | Assistência | Chaveiro | `chaveiro` | IMMEDIATE | RANGE | tipo de fechadura | 45 | MVP |
| 39 | Assistência | Pequenos reparos | `pequenos-reparos` | SCHEDULED | HOURLY | horas | 120 | MVP |
| 40 | Assistência | Dedetização | `dedetizacao` | QUOTE | QUOTE | — | 120 | V1 |
| 41 | Assistência | Jardinagem | `jardinagem` | SCHEDULED | HOURLY | horas | 120 | V1 |
| 42 | Concierge | Tarefa personalizada | `concierge-tarefa` | CONCIERGE | QUOTE | — | — | V1 |

## 8. Nomenclatura de estados em pt-BR

Mapa canônico em `packages/contracts/labels/orderStatus.ts`. `label` é o rótulo curto (StatusPill, listas); `customer` e `provider` são a frase de status na tela do pedido. Variáveis entre chaves são resolvidas pela tela. `tone` escolhe a cor semântica do `StatusPill` (09 §4).

| Status | label | Frase para o cliente | Frase para o prestador | tone |
|---|---|---|---|---|
| `REQUESTED` | Recebido | Recebemos seu pedido | — | neutral |
| `SCHEDULED` | Agendado | Agendado para {data}, {janela} | Agendado para {data}, {janela} | info |
| `MATCHING` | Buscando | Procurando um profissional perto de você | — | info |
| `OFFERED` | Buscando | Procurando um profissional perto de você | Nova oferta disponível | info |
| `NO_PROVIDER_FOUND` | Em busca | Ainda estamos buscando. Você pode aguardar ou cancelar sem custo | — | warning |
| `ACCEPTED` | Confirmado | {Prestador} aceitou seu pedido | Você aceitou este pedido | success |
| `REMINDED` | Confirmado | Lembrete: {data}, {janela} | Lembrete: {data}, {janela} | success |
| `UNDER_REVIEW` | Em análise | Um profissional está analisando seu pedido | Analise e envie o orçamento | info |
| `QUOTED` | Orçamento enviado | Orçamento disponível para aprovação | Aguardando decisão do cliente | warning |
| `QUOTE_APPROVED` | Orçamento aprovado | Você aprovou o orçamento | Orçamento aprovado | success |
| `QUOTE_REJECTED` | Orçamento recusado | Você recusou o orçamento | Orçamento recusado | neutral |
| `AUTHORIZED` | Confirmado | Pagamento autorizado. Aguardando o profissional | Pagamento autorizado. Você pode sair | success |
| `EN_ROUTE` | A caminho | {Prestador} saiu para o atendimento. Chegada prevista: {eta} | Você está a caminho | info |
| `ARRIVED` | Chegou | {Prestador} chegou | Você chegou. Informe o PIN para iniciar | info |
| `IN_PROGRESS` | Em execução | Serviço em andamento | Serviço em andamento | info |
| `DRIVER_ASSIGNED` | Confirmado | {Prestador} vai fazer a retirada | Você vai fazer a retirada | success |
| `EN_ROUTE_PICKUP` | A caminho | {Prestador} está indo buscar | A caminho da retirada | info |
| `PICKED_UP` | Retirado | Retirado com {n} registros de custódia | Retirada registrada | info |
| `IN_TRANSIT` | Em trânsito | A caminho de {destino} | A caminho de {destino} | info |
| `AT_DESTINATION` | No destino | Chegou em {destino} | No destino | info |
| `THIRD_PARTY_IN_PROGRESS` | Em serviço | {destino} está cuidando do seu {item} | Serviço do parceiro em andamento | info |
| `THIRD_PARTY_DONE` | Pronto | Pronto para devolução | Pronto para retirada | success |
| `RETURN_PICKUP` | Retirado | {Prestador} retirou para devolução | Retirada para devolução registrada | info |
| `RETURNING` | Voltando | A caminho da devolução. Previsão: {eta} | A caminho da devolução | info |
| `DELIVERED` | Entregue | Entrega confirmada | Entrega confirmada | success |
| `SUBMITTED` | Recebido | Recebemos seu pedido | — | neutral |
| `INTERPRETING` | Montando plano | Montando seu plano | — | info |
| `PLAN_PROPOSED` | Plano pronto | Seu plano está pronto para aprovação | — | warning |
| `NEEDS_HUMAN` | Em análise | Nossa equipe está revisando seu plano | — | info |
| `PLAN_APPROVED` | Plano aprovado | Plano aprovado. Calculando o valor | — | success |
| `IN_EXECUTION` | Em execução | {n} de {total} etapas concluídas | — | info |
| `COMPLETED` | Concluído | Serviço concluído. Avalie o atendimento | Serviço concluído | success |
| `REVIEWED` | Avaliado | Obrigado pela avaliação | Cliente avaliou | success |
| `CLOSED` | Encerrado | Pedido encerrado | Pedido encerrado | neutral |
| `DISPUTED` | Em contestação | Sua contestação está em análise | O cliente abriu uma contestação | warning |
| `REFUNDED` | Reembolsado | Reembolso de {valor} efetuado | Pedido reembolsado | neutral |
| `CANCELLED_BY_CUSTOMER` | Cancelado | Cancelado por você | Cancelado pelo cliente | neutral |
| `CANCELLED_BY_PROVIDER` | Cancelado | O profissional não pôde atender. Buscando outro | Cancelado por você | warning |
| `CANCELLED_BY_PLATFORM` | Cancelado | Cancelado pelo VÉLIO. {motivo} | Cancelado pela plataforma | neutral |

Outros enums com rótulo:

| Enum | Valor | Rótulo |
|---|---|---|
| `Provider.availability` | `OFFLINE` / `ONLINE` / `BUSY` / `UNAVAILABLE` | Offline / Online / Em atendimento / Indisponível |
| `Provider.status` | `PENDING` / `APPROVED` / `SUSPENDED` / `BLOCKED` | Em análise / Aprovado / Suspenso / Bloqueado |
| `Quote.status` | `SENT` / `APPROVED` / `REJECTED` / `EXPIRED` / `CANCELLED` | Aguardando / Aprovado / Recusado / Expirado / Cancelado |
| `PaymentIntent.status` | `PENDING` / `AUTHORIZED` / `PAID` / `FAILED` / `EXPIRED` / `REFUNDED` | Aguardando / Autorizado / Pago / Falhou / Expirado / Reembolsado |
| `Payout.status` | `PENDING` / `PROCESSING` / `PAID` / `FAILED` | Previsto / Em processamento / Pago / Falhou |
| `Dispute.status` | `OPEN` / `UNDER_REVIEW` / `RESOLVED_REFUNDED` / `RESOLVED_UPHELD` | Aberta / Em análise / Reembolsada / Mantida |
| `Subscription.status` | `ACTIVE` / `PAUSED` / `PAST_DUE` / `CANCELLED` | Ativa / Pausada / Pagamento pendente / Cancelada |
| `DispatchOffer.status` | `SENT` / `ACCEPTED` / `DECLINED` / `EXPIRED` / `LOST` | Enviada / Aceita / Recusada / Expirada / Aceita por outro |

## 9. Estrutura de notificações

Entidade `Notification` (`notifications`): `id`, `userId`, `kind`, `title`, `body`, `deepLink`, `channel[]` (`push`, `in_app`, `sms`), `data` (ids), `sentAt`, `readAt`, `orderId?`. A central de notificações (C-30 / P-25) agrupa por dia e marca `readAt` ao abrir.

| kind | Para | Título | Corpo (modelo) | Canais | Deep link |
|---|---|---|---|---|---|
| `offer.created` | P | Nova oferta perto de você | {serviço} · {distância} · {remuneração} | push (som próprio) | `velio-pro://offers/{offerId}` |
| `offer.expired` | P | Oferta expirada | A oferta de {serviço} expirou | in_app | `velio-pro://` |
| `order.accepted` | C | Profissional encontrado | {Prestador} aceitou seu pedido | push, in_app | `velio://orders/{id}` |
| `order.en_route` | C | Saiu para o atendimento | Chegada prevista: {eta} | push, in_app | `velio://orders/{id}` |
| `order.nearby` | C | Chegando | {Prestador} está a menos de 500 m | push | `velio://orders/{id}` |
| `order.arrived` | C | {Prestador} chegou | Informe o PIN {pin} para iniciar | push, in_app | `velio://orders/{id}` |
| `order.started` | C | Serviço iniciado | Acompanhe pelo app | push, in_app | `velio://orders/{id}` |
| `quote.created` | C | Orçamento disponível | {total} · aprove ou recuse | push, in_app, sms (fallback) | `velio://orders/{id}/quotes/{quoteId}` |
| `quote.decided` | P | Orçamento {aprovado/recusado} | {total} | push, in_app | `velio-pro://orders/{id}` |
| `payment.paid` | C | Pagamento aprovado | {total} · {método} | push, in_app | `velio://orders/{id}/receipt` |
| `payment.failed` | C | Não conseguimos cobrar | Atualize o pagamento para continuar | push, in_app, sms (fallback) | `velio://orders/{id}/payment` |
| `order.completed` | C | Serviço concluído | Total: {total} | push, in_app | `velio://orders/{id}` |
| `order.review_request` | C | Avalie o atendimento | Como foi com {Prestador}? | push, in_app | `velio://orders/{id}/review` |
| `order.cancelled` | C, P | Pedido cancelado | {motivo} | push, in_app, sms (fallback) | `velio://orders/{id}` |
| `booking.reminder` | C, P | Lembrete | {serviço} {quando} | push, in_app | `velio://orders/{id}` |
| `custody.recorded` | C | {n} itens {retirados/entregues} | Veja as fotos | push, in_app | `velio://orders/{id}/custody` |
| `concierge.plan_proposed` | C | Seu plano está pronto | {n} etapas · {estimativa} | push, in_app | `velio://concierge/{id}` |
| `subscription.visit_scheduled` | C | Próxima visita | {data}, {janela} · confirme ou reagende | push, in_app | `velio://subscriptions/{id}` |
| `payout.paid` | P | Repasse enviado | {valor} | push, in_app | `velio-pro://earnings/payouts/{payoutId}` |
| `document.reviewed` | P | Documento {aprovado/recusado} | {motivo} | push, in_app | `velio-pro://onboarding/documents` |
| `provider.approved` | P | Cadastro aprovado | Fique online para receber ofertas | push, in_app | `velio-pro://` |
| `message.created` | C, P | Nova mensagem | {prévia} | push, in_app | `velio://orders/{id}/chat` |
| `dispute.resolved` | C, P | Contestação resolvida | {decisão} | push, in_app, sms (fallback) | `velio://orders/{id}/dispute` |
| `ops.alert` | O | {tipo de alerta} | {resumo} | in_app (sala `ops`), e-mail | `/ops/queues/{queue}` |

Regras: agrupamento no SO por `orderId` (thread); push de oferta usa canal de alta prioridade e som próprio; nenhum push contém telefone, endereço completo ou valor de documento; textos administráveis em V1 (RF-A-017); preferências por tipo em V1, transacionais não desligáveis.

## 10. Deep links e URLs

Esquemas: `velio://` (cliente), `velio-pro://` (prestador); universal links `https://app.velio.com.br/...` e `https://pro.velio.com.br/...` mapeiam para os mesmos caminhos. App não instalado: a página web redireciona para a loja e preserva o caminho para abrir após instalar (deferred deep link).

| Caminho | Abre | Observação |
|---|---|---|
| `velio://orders/{id}` | C-10/C-11 acompanhamento | Rota estável para qualquer `workflowKind` |
| `velio://orders/{id}/chat` | C-12 | |
| `velio://orders/{id}/quotes/{quoteId}` | C-14 | Se já decidido, abre o pedido com aviso |
| `velio://orders/{id}/payment` | C-15 | |
| `velio://orders/{id}/receipt` | C-15 recibo | |
| `velio://orders/{id}/review` | C-17 | Se já avaliado, abre o pedido |
| `velio://orders/{id}/custody` | C-13 | |
| `velio://orders/{id}/dispute` | C-18 | |
| `velio://services/{slug}` | C-07 | Com `?addressId=` opcional |
| `velio://categories/{slug}` | C-06 | |
| `velio://subscriptions` e `/{id}` | C-20 / C-22 | |
| `velio://concierge/{id}` | C-25 | |
| `velio://support/{ticketId}` | C-29 | |
| `velio://coupons?code=` | C-27 com cupom pré-aplicado | Marketing com consentimento |
| `velio-pro://offers/{offerId}` | P-11 | Expirada: toast e volta à home |
| `velio-pro://orders/{id}` | P-12/P-13 | |
| `velio-pro://orders/{id}/chat` | P-18 | |
| `velio-pro://earnings/payouts/{payoutId}` | P-21 | |
| `velio-pro://onboarding/documents` | P-04 | |
| `velio-pro://reviews` | P-22 | |
| `/ops/orders/{id}` | O-05 | Exige sessão `operator` |
| `/ops/queues/no-provider` | O-03 | |
| `/ops/incidents/{id}` | O-07 | |
| `/admin/catalog/services/{id}` | A-02 | Exige sessão `admin` |

Parâmetros de rastreio (`utm_*`, `src`) são aceitos em qualquer link e gravados em `analytics_events` sem alterar a navegação. Links de notificação carregam `notificationId` para marcar `readAt` ao abrir.
