# 04 — Fluxos de usuário

Fluxos passo a passo das quatro superfícies. Vocabulário canônico de `11_MARKETPLACE_ENGINE.md`; rotas e módulos de `06_SYSTEM_ARCHITECTURE.md`; telas referenciadas por ID de `10_SCREEN_INVENTORY.md`.

Convenções de cada passo:

- `[ESTADO]` entre colchetes é o `status` da `ServiceOrder` ao fim do passo (`[—]` quando não há ordem ainda; `[sem mudança]` quando o passo não transiciona).
- `evt:` evento de domínio gravado no outbox e retransmitido pelo Socket.IO (`order.updated`, `order.event`, `offer.created`, `quote.created`, `payment.updated`, `message.created`, `provider.location`).
- `push:` notificação enviada (título curto da seção 8.6 do PRD).
- `job:` job agendado em `scheduled_jobs`.
- `tela:` ID da tela no inventário.
- Atores: **Cliente**, **Prestador**, **Operador**, **Admin**, **Sistema** (API, jobs, engine).

---

## 1. Cadastro e login por OTP (cliente e prestador)

1. Cliente abre o app pela primeira vez; vê a tela de boas-vindas com um único botão "Entrar com telefone". `[—]` tela: C-01.
2. Cliente digita o telefone (máscara +55); toca "Continuar". `[—]` Sistema `POST /v1/auth/otp/request`; grava `otp_codes` (6 dígitos, 5 min, 5 tentativas); porta `SmsSender` envia SMS. Rate limit por telefone e IP.
3. Cliente digita o código no `OTPInput`; preenchimento automático via SMS quando o SO permitir. `[—]` Sistema `POST /v1/auth/otp/verify`.
4. Código válido e usuário inexistente: Sistema cria `User` com papel `customer` (ou `provider`, conforme `EXPO_PUBLIC_APP_ROLE`), emite JWT (15 min) + refresh (30 dias, hash em `refresh_tokens`), registra `devices` com token de push. `[—]` evt: `UserRegistered` (analytics `signup_completed`).
5. Usuário novo: tela de nome e aceite de termos e política (versão e data gravadas em consentimentos). `[—]` tela: C-02.
6. Usuário existente: vai direto para a home. `[—]` analytics `login_completed`.
7. Código inválido: contador de tentativas; após 5, bloqueio de 15 min com mensagem "Muitas tentativas. Tente novamente em 15 min". `[—]`
8. Código expirado: botão "Reenviar código" habilitado após 30 s; novo `otp_codes`, o anterior é invalidado. `[—]`
9. Em sessões seguintes, o refresh rotativo renova o acesso em segundo plano; refresh inválido ou revogado leva à tela C-01 com aviso "Sua sessão expirou". `[—]`

## 2. Adicionar endereço

1. Cliente toca na localização no topo da home ("Definir endereço"). `[—]` tela: C-05.
2. Opções: "Usar localização atual" (pede permissão de localização em uso) ou busca por rua e número. `[—]` Sistema `geo` geocodifica pela porta de geocodificação; autocompletar com até 5 sugestões.
3. Cliente ajusta o pino no mapa (`MapView`), confirma número, complemento, apelido (Casa, Trabalho) e instruções de acesso (portaria, interfone). `[—]`
4. Cliente toca "Salvar endereço". `[—]` Sistema `POST /v1/addresses` cria `Address` com lat/lng; verifica cobertura contra `regions`.
5. Dentro de cobertura: endereço vira o atual; home recarrega `GET /v1/catalog/home?addressId=` com preços da região. `[—]` analytics `address_added`.
6. Fora de cobertura: tela "Ainda não atendemos esse endereço" com botão "Avisar quando chegar" (grava interesse por região) e opção de escolher outro endereço. `[—]`
7. Endereços salvos ficam em C-05 com editar e excluir; o último usado é padrão. `[—]`

## 3. Contratar serviço imediato (encanador, `IMMEDIATE`)

1. Cliente digita "vazamento" na busca da home ou toca a categoria Hidráulica. `[—]` Sistema `GET /v1/catalog/search?q=` ou `GET /v1/catalog/categories/hidraulica`. tela: C-03, C-06.
2. Cliente toca "Vazamento urgente": vê preço fixo da região, duração estimada, o que inclui, exigência de PIN, nota agregada. `[—]` `GET /v1/catalog/services/vazamento-urgente?addressId=`. tela: C-07.
3. Cliente toca "Pedir agora". `[—]` analytics `service_request_started`.
4. Resumo (tela: C-09): endereço atual, "Agora", preço, forma de pagamento padrão, política de cancelamento resumida ("Grátis até o profissional aceitar"), campo de observações e fotos opcionais, cupom. Cliente toca "Confirmar pedido". `[REQUESTED]` Sistema `POST /v1/requests` cria `ServiceRequest` + `ServiceOrder`, `order_events[0]`; evt: `OrderCreated`; job: `dispatch.start`.
5. Sistema inicia dispatch: candidatos `APPROVED` + `ONLINE` + skill + raio + sem conflito; score por `matching_configs`; cria `dispatch_rounds[wave=1]` e N `dispatch_offers`. `[MATCHING]` → `[OFFERED]` evt: `offer.created` para cada prestador; push RF-N-001 aos prestadores. Cliente vê "Procurando um profissional" com estimativa (tela: C-10).
6. Prestador aceita (fluxo 18). `[ACCEPTED]` evt: `order.updated`; outras ofertas expiram (`offer.expired`); Sistema `payments.authorize`: cartão pré-autorizado ou PIX gerado (`payment_intents kind=INITIAL`); push RF-N-002 "Profissional encontrado"; chat da ordem criado com mensagem de sistema.
7. Cliente vê o prestador (nome, foto, nota, serviços realizados, selo verificado), o PIN de início e o botão de chat. `[sem mudança]` tela: C-11.
8. Prestador toca "Saí para o atendimento". `[EN_ROUTE]` evt: `order.updated`; push RF-N-003; mapa com posição em tempo real (`provider.location`).
9. Prestador a menos de 500 m. `[sem mudança]` push RF-N-004 "Chegando"; mensagem de sistema no chat.
10. Prestador toca "Cheguei". `[ARRIVED]` evt: `order.updated`; mensagem de sistema "Carlos chegou".
11. Prestador tira fotos `BEFORE` (se a categoria exigir) e informa o PIN. `[IN_PROGRESS]` guard `requiresPin`; evt: `order.updated`; push RF-N-005.
12. Opcional: orçamento adicional (fluxo 9). `[sem mudança]`
13. Prestador tira fotos `AFTER` e toca "Concluir". `[COMPLETED]` guard `requiresEvidence:AFTER`; `payments.capture` pelo valor final; `wallet.settle` lança ledger; evt: `order.updated`, `payment.updated`; push RF-N-009 e RF-N-007; job: `order.auto_complete_check` (+7 dias).
14. Cliente vê resumo com fotos, total e recibo; toca "Avaliar" (fluxo 15). `[REVIEWED]`

## 4. Agendar limpeza de ar-condicionado (`SCHEDULED`)

1. Cliente toca a categoria Ar-condicionado → "Limpeza de split". `[—]` tela: C-07. Preço varia por BTU: o serviço pede o equipamento.
2. Cliente escolhe um `Equipment` salvo ou cadastra um novo (tipo, BTU, cômodo). `[—]` `POST /v1/assets/equipments`. tela: C-08.
3. Cliente toca "Agendar"; escolhe data e faixa horária entre as janelas disponíveis para região e categoria (`GET /v1/catalog/availability?serviceId&addressId&date`). `[—]` tela: C-09.
4. Resumo: equipamento, endereço, "Amanhã, 14h–16h", preço, pagamento, política ("Grátis até 24 h antes"). Cliente toca "Confirmar agendamento". `[SCHEDULED]` Sistema cria ordem + `Booking(startsAt, endsAt)`; evt: `OrderCreated`; job: `dispatch.start` (imediato ou com antecedência configurável); job: `booking.reminder` em T-24h e T-1h.
5. Sistema faz matching entre prestadores com janela livre na agenda (`provider_schedules`, `provider_time_off`, bloqueios). `[MATCHING]` evt: `offer.created`; push RF-N-001.
6. Prestador aceita; agenda bloqueada no horário. `[ACCEPTED]` evt: `order.updated`; pré-autorização ou PIX; push RF-N-002 "Confirmado para amanhã, 14h–16h". Cliente vê o pedido na seção "Agendados" da home.
7. T-24h: job `booking.reminder`. `[REMINDED]` push RF-N-013 a ambos; transição idempotente.
8. T-1h: job `booking.reminder` novamente. `[sem mudança]` push RF-N-013 "Daqui a 1 h".
9. Prestador toca "Saí para o atendimento" dentro da janela. `[EN_ROUTE]` → `[ARRIVED]` → PIN → `[IN_PROGRESS]` → fotos `AFTER` → `[COMPLETED]` como no fluxo 3.
10. Sistema atualiza `Equipment.lastMaintenanceAt` com a data de conclusão. `[sem mudança]` Base para a home contextual (RF-C-021) e para sugerir plano (fluxo 5).
11. Cliente avalia. `[REVIEWED]`

## 5. Assinar plano de manutenção (Essencial, Residencial, Premium)

1. Cliente toca "Assinaturas" na home ou aceita a sugestão "Seu split não tem manutenção há 6 meses" (só com consentimento `personalization`). `[—]` tela: C-20.
2. Cliente compara planos (`GET /v1/subscriptions/plans`): frequência, serviços incluídos, quantidade de equipamentos, preço mensal. `[—]`
3. Cliente toca "Assinar Residencial"; escolhe equipamentos cobertos e endereço; define preferência de dia da semana e período. `[—]` tela: C-21.
4. Resumo: valor mensal, primeira cobrança, primeira visita prevista, regras de pausa e cancelamento. Cliente toca "Confirmar assinatura". `[—]` Sistema `POST /v1/subscriptions` cria `Subscription(status=ACTIVE)`; `payment_intents kind=SUBSCRIPTION` primeira cobrança; evt: `SubscriptionCreated`; push "Assinatura ativa".
5. Sistema agenda jobs `subscription.generate_visit` (antecedência configurável, ex.: 10 dias) e `subscription.charge` (ciclo mensal). `[—]`
6. Job `subscription.generate_visit` cria `SubscriptionVisit` e uma ordem `SCHEDULED` com janela sugerida e preferência pelo último prestador. `[SCHEDULED]` push RF-N-019 "Próxima visita: 12/11, 9h–11h. Confirmar ou reagendar".
7. Cliente confirma ou reagenda (fluxo 4, passos 5–11). `[MATCHING]` → … → `[REVIEWED]`
8. Job `subscription.charge` cobra o ciclo; falha segue fluxo 13 com janela de carência de 5 dias antes de `Subscription.status=PAST_DUE`. `[—]` push RF-N-007 ou RF-N-008.
9. Cliente pausa (até 2 meses) ou cancela pela tela C-22; visitas futuras não geradas; ordens já `ACCEPTED` seguem a política de cancelamento. `[—]` evt: `SubscriptionPaused` / `SubscriptionCancelled`.

## 6. Coleta de lavanderia com cadeia de custódia por QR (`LAUNDRY`)

1. Cliente toca Lavanderia → "Lavar e passar"; informa quantidade estimada de sacos e preferências (sem amaciante, passar camisas). `[—]` tela: C-07, C-08.
2. Escolhe janela de coleta e janela de devolução (mínimo configurável, ex.: 48 h). `[—]` tela: C-09.
3. Confirma pedido com preço estimado por kg (`pricingModel=RANGE`) e termos de custódia. `[REQUESTED]` evt: `OrderCreated`; job: `dispatch.start`.
4. Matching entre prestadores de lavanderia da região com capacidade para a janela. `[MATCHING]` → prestador (empresa) aceita. `[DRIVER_ASSIGNED]` evt: `order.updated`; push RF-N-002 "Coleta confirmada".
5. Motorista sai para a coleta. `[EN_ROUTE_PICKUP]` push RF-N-003; mapa.
6. No local, o motorista gera etiquetas QR por saco no VÉLIO Pro (ou cola etiquetas pré-impressas e as escaneia), fotografa cada saco com o cliente presente, informa contagem. Cliente confere a contagem na tela C-13 e confirma. `[PICKED_UP]` guard: `CustodyEvent` por item (quem, quando, onde, estado, QR) + foto; evt: `order.event`; push RF-N-017 "3 sacos retirados".
7. Transporte até a lavanderia. `[IN_TRANSIT]` evt: `order.updated`.
8. Chegada: cada QR é escaneado na entrada. `[AT_DESTINATION]` `CustodyEvent` por item; peso real registrado → preço final dentro da faixa (se exceder a faixa, vira orçamento adicional, fluxo 9).
9. Lavagem. `[THIRD_PARTY_IN_PROGRESS]` evt: `order.updated`; mensagem de sistema "Suas roupas estão sendo lavadas".
10. Pronto. `[THIRD_PARTY_DONE]` push "Suas roupas estão prontas. Entrega prevista: amanhã, 18h–20h".
11. Motorista escaneia QRs na saída. `[RETURN_PICKUP]` `CustodyEvent`. → `[RETURNING]` push RF-N-003; mapa.
12. Entrega: escaneia QRs, fotografa, cliente confirma recebimento digital na tela do motorista (ou via PIN). `[DELIVERED]` `CustodyEvent` + foto; push RF-N-017 "3 sacos entregues".
13. Sistema conclui; captura o valor final. `[COMPLETED]` evt: `payment.updated`; push RF-N-009, RF-N-010.
14. Divergência de contagem em qualquer ponto bloqueia a transição e abre `Incident` para ops com as fotos. `[sem mudança]`

## 7. Retirada do carro para lavagem e devolução (`LOGISTICS` com veículo)

1. Cliente toca Automotivo → "Leva e traz para lavagem"; escolhe `Vehicle` salvo ou cadastra (placa, modelo, cor, porte). `[—]` tela: C-08.
2. Define local de retirada, local de devolução (padrão: o mesmo), janela e lavagem desejada; vê preço (porte do veículo + logística). `[—]` tela: C-09.
3. Confirma com aceite dos termos de custódia de veículo. `[REQUESTED]` evt: `OrderCreated`; job: `dispatch.start`.
4. Matching exige skill `motorista` com habilitação válida e seguro quando configurado. `[MATCHING]` → aceite. `[DRIVER_ASSIGNED]` push RF-N-002 "Motorista confirmado: Paulo".
5. Motorista a caminho. `[EN_ROUTE_PICKUP]` push RF-N-003; mapa.
6. Na retirada, no VÉLIO Pro (tela P-14): escaneia QR do veículo (gerado pela plataforma e exibido no app do cliente ou impresso), fotografa 6 ângulos obrigatórios + painel, informa odômetro e nível de combustível, preenche checklist (arranhões, pneus, objetos no interior). Cliente revisa no próprio app (tela C-13) e assina digitalmente. `[PICKED_UP]` guards: `CustodyEvent` + `MediaEvidence` (fotos, odômetro, checklist, assinatura); push RF-N-017 "Veículo retirado. Odômetro: 54.320 km".
7. Deslocamento até o lava-rápido parceiro. `[IN_TRANSIT]` mapa; `provider.location`.
8. Chegada; QR escaneado. `[AT_DESTINATION]` `CustodyEvent`.
9. Lavagem pelo terceiro. `[THIRD_PARTY_IN_PROGRESS]` Eventual adicional (ex.: higienização) segue fluxo 9.
10. Pronto. `[THIRD_PARTY_DONE]` push "Seu carro está pronto. Devolução prevista: 16h30".
11. Motorista retira. `[RETURN_PICKUP]` `CustodyEvent` → `[RETURNING]` push RF-N-003; mapa.
12. Na devolução: QR, 6 fotos, odômetro (diferença exibida ao cliente), checklist, confirmação digital do cliente. `[DELIVERED]` guards idem ao passo 6; push RF-N-017.
13. Conclusão e captura. `[COMPLETED]` push RF-N-009, RF-N-010.
14. Divergência (odômetro acima do esperado, novo dano no checklist) marcada pelo cliente na confirmação abre `Dispute` imediatamente (fluxo 14) sem impedir `DELIVERED`. `[DELIVERED]` evt: `DisputeOpened`.

## 8. Concierge em linguagem natural (`CONCIERGE`)

1. Cliente toca "Concierge" na home; digita, grava áudio ou envia foto: "Pegue meu carro amanhã às 8h, leve para revisão e devolva". `[SUBMITTED]` tela: C-24. Sistema `POST /v1/concierge/requests` cria `ConciergeRequest` + ordem pai; evt: `OrderCreated`.
2. Sistema chama `ConciergePlanner` (adaptador Claude ou `RuleBasedPlanner`); áudio é transcrito antes. `[INTERPRETING]` tela mostra "Montando seu plano" com skeleton.
3. Planner devolve `ConciergePlan` validado por Zod: tarefas (retirada 8h, revisão na oficina parceira, devolução), dependências, janelas, estimativa de valor e duração; perguntas de esclarecimento quando faltar dado (qual veículo, qual oficina). `[PLAN_PROPOSED]` push RF-N-018 "Seu plano está pronto". tela: C-25.
4. Se o plano excede limiares (`platform_settings.concierge`: valor, número de tarefas, categorias de risco) ou o planner retorna baixa confiança: vai para operador. `[NEEDS_HUMAN]` fila em /ops (tela O-10); operador ajusta tarefas, janelas e estimativa e devolve. `[PLAN_PROPOSED]`
5. Cliente revisa o plano em cartões por tarefa; pode editar horário, remover tarefa, responder perguntas; toca "Aprovar plano". `[PLAN_APPROVED]` evt: `order.updated`.
6. Sistema consolida orçamento (`Quote kind=INITIAL`) com itens por tarefa e faixa para o serviço de terceiro. `[QUOTED]` push RF-N-006; tela C-14 com `[RECUSAR]` `[APROVAR]`.
7. Cliente aprova. `[QUOTE_APPROVED]` `payments.authorize` (pré-autorização pelo teto da faixa ou PIX do valor base).
8. Sistema cria ordens filhas (`parentOrderId`): `LOGISTICS` para o veículo (fluxo 7). `[IN_EXECUTION]` cada filha segue seu workflow; a tela do pai mostra as filhas como etapas (`OrderTask`).
9. Adicionais da oficina chegam como `Quote ADDITIONAL` na filha e exigem aprovação (fluxo 9). `[sem mudança no pai]`
10. Última filha em `COMPLETED` conclui o pai; captura consolidada de todas as intenções aprovadas. `[COMPLETED]` push RF-N-009 "Tudo pronto. Total: R$ 612,00".
11. Cliente avalia a experiência; ordens filhas recebem a avaliação do profissional. `[REVIEWED]`
12. Recusa do plano em 5: cliente pode pedir novo plano com ajustes (volta a `INTERPRETING`) ou cancelar sem custo. `[CANCELLED_BY_CUSTOMER]`

## 9. Orçamento adicional durante a execução

1. Prestador em `IN_PROGRESS` identifica necessidade além do escopo (ex.: trocar sifão). Toca "Orçamento adicional" na tela P-15. `[IN_PROGRESS]`
2. Preenche itens (descrição, quantidade, valor), justificativa curta e ao menos uma foto. Vê aviso "Não execute antes da aprovação do cliente". `[sem mudança]`
3. Toca "Enviar ao cliente". `[sem mudança]` Sistema `POST /v1/orders/:id/quotes` cria `Quote(kind=ADDITIONAL, status=SENT, expiresAt=+30 min)`; evt: `quote.created`; push RF-N-006 ao cliente; job: `quote.expire`.
4. Cliente abre a tela C-14: itens, total do adicional, novo total do pedido, fotos, justificativa; ações `[RECUSAR]` `[APROVAR]`. `[sem mudança]`
5. Cliente aprova. `[sem mudança]` `Quote.status=APPROVED`; Sistema cria `PaymentIntent(kind=ADDITIONAL)` (incremento de pré-autorização ou novo PIX); evt: `quote.decided`, `payment.updated`; push RF-N-011 ao prestador "Orçamento aprovado"; mensagem de sistema no chat.
6. Cliente recusa (motivo opcional). `[sem mudança]` `Quote.status=REJECTED`; push RF-N-011 "Orçamento recusado"; prestador conclui apenas o escopo original.
7. Sem resposta em 30 min: job `quote.expire` marca `EXPIRED`; prestador pode reenviar ou concluir o escopo original. `[sem mudança]` mensagem de sistema ao cliente.
8. Prestador pode cancelar o orçamento enviado enquanto `SENT`. `[sem mudança]` evt: `quote.decided(CANCELLED)`.
9. Na conclusão, a captura soma `INITIAL` + todas as `ADDITIONAL` com `APPROVED`. `[COMPLETED]` Recibo lista cada adicional.
10. PIX adicional não pago até a conclusão: ordem conclui, captura parcial; cobrança pendente aparece para o cliente com prazo de 24 h; depois, fluxo 13. `[COMPLETED]`

## 10. Cancelamento pelo cliente em cada fase

Política padrão em `platform_settings.cancellation` (11 §4). Em todas as fases o cliente vê o custo antes de confirmar em duas etapas ("Cancelar pedido" → folha com motivo e custo → "Confirmar cancelamento").

1. Fase `REQUESTED`/`MATCHING`/`OFFERED`/`SCHEDULED`: cliente cancela. `[CANCELLED_BY_CUSTOMER]` sem custo; ofertas abertas expiram (`offer.expired`); evt: `order.updated`; analytics `order_cancelled{phase}`.
2. Fase `ACCEPTED` até 10 min do aceite (`IMMEDIATE`): cancela sem custo. `[CANCELLED_BY_CUSTOMER]` pré-autorização liberada (`payments.cancel`) ou PIX estornado se pago; push RF-N-012 ao prestador; prestador volta a `ONLINE`.
3. Fase `ACCEPTED` após 10 min (`IMMEDIATE`) ou dentro da janela configurada antes de `startsAt` (`SCHEDULED`): taxa fixa configurável. `[CANCELLED_BY_CUSTOMER]` captura parcial da taxa; ledger: taxa dividida conforme `platform_settings.cancellation.split`; push RF-N-012.
4. Fase `EN_ROUTE`/`ARRIVED`: taxa de deslocamento (percentual do preço, mínimo configurável) creditada ao prestador. `[CANCELLED_BY_CUSTOMER]` captura da taxa; ledger: crédito `provider:{id}`; push RF-N-012; localização do prestador deixa de ser retransmitida imediatamente.
5. Fase `IN_PROGRESS`: botão "Cancelar" indisponível. Opções: "Relatar problema" (abre `SupportTicket` com chat de suporte) ou aguardar conclusão e contestar (fluxo 14). `[IN_PROGRESS]`
6. Fase `COMPLETED`: não há cancelamento; existe contestação (fluxo 14). `[COMPLETED]`
7. Ordens `LOGISTICS` após `PICKED_UP`: cancelamento vira "devolver agora" com taxa de deslocamento de ida e volta; o workflow pula para `RETURNING` → `DELIVERED` → `COMPLETED` com o valor da taxa. `[RETURNING]`
8. Ordens filhas de Concierge: cancelar uma filha exige aprovação do novo plano pelo cliente; o pai recalcula. `[IN_EXECUTION]`
9. Em todos os casos: chat da ordem é arquivado (leitura por 24 h), ordem some de "Em andamento" e aparece no histórico com rótulo "Cancelado por você". `[terminal]`

## 11. Cancelamento pelo prestador

1. Prestador em `ACCEPTED`, `EN_ROUTE` ou `ARRIVED` toca "Cancelar atendimento" na tela P-13. `[sem mudança]`
2. Folha exige motivo (lista: imprevisto pessoal, veículo quebrou, endereço inacessível, cliente não responde, outro) e mostra aviso "Cancelamentos após o aceite reduzem sua prioridade nas próximas ofertas". `[sem mudança]`
3. Confirma. `[CANCELLED_BY_PROVIDER]` evt: `order.updated`; `reputation` registra cancelamento tardio em `provider_stats`; prestador volta a `ONLINE`.
4. Sistema reabre automaticamente a ordem em `MATCHING` como nova ordem vinculada (`replacesOrderId`) com prioridade elevada no score e a pré-autorização mantida. `[MATCHING]` push ao cliente: "Carlos não poderá atender. Já estamos buscando outro profissional" (RF-N-012 com texto específico); job: `dispatch.start`.
5. Novo aceite segue o fluxo 3 a partir do passo 6. `[ACCEPTED]`
6. Se ninguém aceitar, fluxo 12. `[NO_PROVIDER_FOUND]`
7. Motivo "cliente não responde" em `ARRIVED` após 15 min de espera registrada no chat: cancelamento sem penalidade e taxa de deslocamento ao prestador (`CANCELLED_BY_PLATFORM` por regra, com revisão de ops). `[CANCELLED_BY_PLATFORM]` push ao cliente com explicação; `Incident` leve para auditoria.
8. Cancelamento em `IN_PROGRESS` não existe para o prestador: deve concluir parcial com justificativa e fotos, o que gera revisão de ops. `[COMPLETED]` `Incident` automático.
9. Em `LOGISTICS` após `PICKED_UP`, o prestador não cancela: só ops pode reatribuir o item/veículo em custódia a outro motorista com `CustodyEvent` de transferência. `[sem mudança]`

## 12. Nenhum prestador aceita (ondas, raio, operador)

1. Ordem em `OFFERED` com onda 1: N prestadores, T segundos (`matching_configs`). `[OFFERED]` job: `dispatch.wave_timeout`.
2. Timeout sem aceite: ofertas expiram (`offer.expired`); Sistema amplia raio e grupo (onda 2), inclui prestadores com score menor. `[OFFERED]` novos `dispatch_offers`; push RF-N-001. Cliente vê "Ampliando a busca" na tela C-10.
3. Onda 3 (última configurada) sem aceite. `[NO_PROVIDER_FOUND]` evt: `order.updated`; alerta em /ops se > 10 min; push ao cliente "Estamos buscando um profissional. Você pode aguardar ou cancelar sem custo"; analytics `no_provider_found`.
4. Operador vê a ordem na fila "Sem profissional" da tela O-02 ordenada por tempo de espera. `[NO_PROVIDER_FOUND]`
5. Operador abre a ordem (O-05), vê candidatos com score, distância, disponibilidade e motivo de exclusão (fora do raio, `BUSY`, recusou). Pode: atribuir manualmente (fluxo 19), ligar para prestador fora da plataforma (registrado como nota), ou propor novo horário ao cliente (vira `SCHEDULED`). `[sem mudança]`
6. Atribuição manual aceita. `[ACCEPTED]` fluxo 3 a partir do passo 6.
7. Cliente cancela enquanto espera: sem custo. `[CANCELLED_BY_CUSTOMER]`
8. Sem solução em prazo configurável (ex.: 30 min para `IMMEDIATE`): Sistema cancela pela plataforma com crédito de cortesia opcional. `[CANCELLED_BY_PLATFORM]` push RF-N-012 "Não encontramos um profissional. Você recebeu R$ 10 de crédito"; `Incident` para análise de cobertura.
9. Para `SCHEDULED`, o fallback acontece em T-24h sem aceite: ops aciona prestadores da base; em T-4h sem solução, cliente é avisado com opção de reagendar. `[NO_PROVIDER_FOUND]`

## 13. Pagamento falha e recuperação

### 13.1 PIX expirado

1. Em `ACCEPTED`, cliente recebe PIX (QR e copia e cola) com expiração de 15 min na tela C-15. `[ACCEPTED]` `payment_intents(status=PENDING)`.
2. Prestador vê "Aguardando pagamento do cliente" e o botão "Saí para o atendimento" desabilitado até `PAID` (ver PRD 13.1). `[ACCEPTED]`
3. Webhook do gateway confirma. `[ACCEPTED]` `payment.updated(PAID)`; push RF-N-007; botão do prestador habilitado.
4. Sem pagamento em 15 min: job `payment.reconcile` consulta o gateway; se expirado, `status=EXPIRED`. `[ACCEPTED]` push RF-N-008 "Seu PIX expirou. Gere um novo para continuar"; tela C-15 com botão "Gerar novo PIX" ou "Pagar com cartão".
5. Cliente gera novo PIX ou troca para cartão (nova `PaymentIntent`, a anterior cancelada). `[ACCEPTED]` evt: `payment.updated`.
6. Sem ação em mais 10 min (total configurável): Sistema cancela pela plataforma sem custo, libera o prestador. `[CANCELLED_BY_PLATFORM]` push RF-N-012 a ambos; o prestador não é penalizado.

### 13.2 Cartão recusado

1. Pré-autorização em `ACCEPTED` recusada pelo gateway. `[ACCEPTED]` `payment_intents(status=FAILED, reason)`; push RF-N-008 "Não conseguimos autorizar seu cartão final 1234".
2. Tela C-15 oferece: tentar novamente, escolher outro cartão, pagar com PIX, usar saldo da carteira. `[ACCEPTED]`
3. Nova tentativa aprovada. `[ACCEPTED]` `payment.updated(AUTHORIZED)`; prestador liberado.
4. Sem recuperação em 10 min: `CANCELLED_BY_PLATFORM` sem custo; `customer_risk_signals` registra falha (uso interno). `[CANCELLED_BY_PLATFORM]`
5. Captura em `COMPLETED` recusada (raro: pré-autorização expirada em `SCHEDULED` longo): ordem conclui; cobrança fica pendente com prazo de 24 h e lembretes; após o prazo, bloqueio de novos pedidos até regularizar; `Payout` do prestador não é afetado (a plataforma assume o risco). `[COMPLETED]` push RF-N-008.

### 13.3 Cobrança de assinatura falha

1. `subscription.charge` falha. `[—]` push RF-N-008; nova tentativa em 1, 3 e 5 dias.
2. Sem sucesso: `Subscription.status=PAST_DUE`; visitas não geradas; cliente pode atualizar método a qualquer momento. `[—]`
3. Após 15 dias: `CANCELLED` com aviso. `[—]`

## 14. Disputa após conclusão

1. Cliente abre a ordem `COMPLETED` até 72 h depois e toca "Contestar". `[COMPLETED]` tela: C-18.
2. Escolhe motivo (serviço incompleto, dano, cobrança indevida, profissional não compareceu mas concluiu, outro), descreve e anexa fotos. `[COMPLETED]`
3. Envia. `[DISPUTED]` Sistema cria `Dispute(status=OPEN)`; congela `Payout` da ordem; evt: `order.updated`, `DisputeOpened`; push ao prestador "O cliente abriu uma contestação. Você pode responder em 24 h"; fila em /ops (tela O-08).
4. Prestador responde pelo VÉLIO Pro com texto e fotos (as evidências `BEFORE`/`AFTER` já estão anexadas). `[DISPUTED]`
5. Operador analisa linha do tempo, evidências, chat e custódia; decide: manter cobrança, reembolso parcial, reembolso total, crédito de cortesia; registra justificativa. `[DISPUTED]` `audit_logs`.
6. Reembolso parcial ou total: `payments.refund` → `refunds`; ledger ajusta repasse; se o reembolso é por culpa do prestador, o `Payout` é reduzido; se é cortesia da plataforma, sai de `platform:revenue`. `[REFUNDED]` evt: `payment.updated`; push RF-N-020 a ambos.
7. Cobrança mantida: `Dispute.status=RESOLVED_UPHELD`; `Payout` liberado. `[CLOSED]` push RF-N-020.
8. Cliente pode avaliar mesmo com disputa; a avaliação fica marcada internamente como "com contestação" para ponderação em `provider_stats`. `[sem mudança]`
9. Reincidência do prestador em disputas procedentes dispara revisão de admin (`SUSPENDED` temporário). `[—]`

## 15. Avaliação

1. 30 min após `COMPLETED` (ou ao abrir o app), cliente recebe push RF-N-010 "Avalie o atendimento" com deep link para C-17. `[COMPLETED]`
2. Tela: foto do prestador, serviço, `RatingStars` de 1 a 5 como ação principal. `[COMPLETED]`
3. Ao tocar uma estrela, aparecem tags rápidas conforme a nota (4–5: Pontual, Caprichoso, Educado, Explicou bem; 1–3: Atrasou, Deixou sujeira, Cobrou a mais, Não resolveu) e campo opcional de comentário. `[COMPLETED]`
4. Cliente toca "Enviar". `[REVIEWED]` Sistema `POST /v1/orders/:id/review` cria `Review`; `reputation.recompute` atualiza `provider_stats` (média ponderada por recência); evt: `order.updated`; analytics `review_submitted`.
5. Nota ≤ 2 abre automaticamente a pergunta "Quer falar com o suporte?" que cria `SupportTicket` vinculado. `[REVIEWED]`
6. Nota ≥ 4 mostra "Pedir de novo com Carlos" (favoritar + recompra, fluxo 16). `[REVIEWED]`
7. Prestador avalia o cliente (nota interna, uma por lado) na tela P-16 ao concluir; não exibida ao cliente. `[sem mudança]`
8. Sem avaliação em 7 dias: job `order.auto_complete_check` fecha a ordem. `[CLOSED]`
9. Prestador vê a avaliação na tela P-22 e pode responder publicamente em até 200 caracteres (V1). `[sem mudança]`

## 16. Recompra a partir do histórico

1. Cliente abre "Pedidos" (C-16) e toca "Pedir de novo" em uma ordem `REVIEWED`/`CLOSED`, ou toca a sugestão "Repetir limpeza do split da sala" na home. `[—]` analytics `reorder_started`.
2. Sistema pré-preenche: serviço (se ainda ativo no catálogo e disponível na região), endereço, equipamento ou veículo, observações anteriores, método de pagamento; marca o prestador anterior como preferido se `APPROVED` e não bloqueado. `[—]`
3. Serviço descontinuado ou preço alterado: aviso em linha "O preço mudou de R$ 140 para R$ 150" ou "Este serviço foi substituído por …". `[—]`
4. Cliente escolhe "Agora" ou agenda; confirma na tela C-09. `[REQUESTED]` ou `[SCHEDULED]` fluxo 3 ou 4.
5. Matching aplica bônus de preferência ao prestador anterior (peso `preferredProvider` em `matching_configs`); a primeira onda inclui o preferido com T estendido quando `ONLINE` e elegível. `[OFFERED]`
6. Preferido indisponível: matching normal, sem aviso adicional além do nome do profissional encontrado. `[ACCEPTED]`

## 17. Fluxo do prestador: do onboarding ao primeiro repasse

1. Abre o VÉLIO Pro; OTP (fluxo 1) com papel `provider`. `Provider.status=PENDING`. tela: P-01.
2. Escolhe "Trabalho sozinho" ou "Tenho uma empresa" (CNPJ; equipe em V1). tela: P-02.
3. Dados pessoais: nome, CPF, data de nascimento, e-mail. Progresso salvo a cada etapa (`PATCH /v1/providers/me`). tela: P-03.
4. Documento com foto (frente e verso) e selfie com prova de vida; upload via URL assinada para storage privado (`provider_documents status=PENDING`). tela: P-04.
5. Comprovante de endereço e, por categoria, certificações opcionais (ex.: NR-10 para elétrica, CNH para motorista). tela: P-04.
6. Especialidades: seleciona categorias e serviços (`provider_skills`). tela: P-05.
7. Área de atendimento: escolhe bairros/regiões ou raio a partir de um ponto (`provider_service_areas`). tela: P-06.
8. Disponibilidade semanal: janelas por dia (`provider_schedules`). tela: P-07.
9. Dados de recebimento: chave PIX ou conta bancária com verificação por microdepósito ou validação do gateway (`wallet_accounts`). tela: P-08.
10. Aceite de termos do prestador e política de privacidade; envia para análise. push "Recebemos seu cadastro. Análise em até 48 h". tela: P-09 (espera).
11. Admin analisa na tela A-07: aprova ou recusa documento a documento com motivo. Recusa parcial: push RF-N-015 "Documento recusado: foto ilegível. Envie novamente"; prestador reenvia (passo 4). Aprovação: `Provider.status=APPROVED`; push "Seu cadastro foi aprovado".
12. Primeira abertura após aprovação: tour de 3 telas (como funcionam ofertas, como executar, como recebe). tela: P-10.
13. Prestador alterna para `ONLINE` na home (P-10); concede permissão de localização "sempre" com explicação; `LocationPolicy` passa a enviar a cada 60 s ocioso.
14. Recebe oferta (fluxo 18); aceita; executa (fluxo 3, lado do prestador); conclui. `[COMPLETED]` ledger: débito `gateway:clearing` bruto; crédito `platform:revenue` comissão; crédito `provider:{id}` líquido.
15. Vê na tela P-20 "A liberar: R$ 128,00 · próximo repasse: sexta" e o extrato por ordem (bruto, comissão, líquido).
16. Job `payout.batch` (período configurável, ex.: semanal) agrupa lançamentos liberados (ordens `COMPLETED` sem `Dispute` aberta há mais de 48 h) em `Payout(status=PENDING)`; admin aprova lote (A-16) ou aprovação automática abaixo de limiar.
17. Gateway executa a transferência; webhook confirma `Payout.status=PAID`. push RF-N-014 "Repasse de R$ 128,00 enviado"; comprovante em P-21.
18. Falha de transferência (chave inválida): `Payout.status=FAILED`; push "Não conseguimos enviar seu repasse. Verifique seus dados de recebimento"; corrige em P-08; próximo lote reprocessa.

## 18. Oferta recebida pelo prestador (detalhe)

1. Sistema cria `dispatch_offers` para o prestador. `[OFFERED]` evt: `offer.created` na sala `provider:{id}`; push RF-N-001 com som distinto.
2. App em primeiro plano: tela cheia P-11 com contagem regressiva (T segundos); em segundo plano: notificação de alta prioridade que abre P-11.
3. Conteúdo: serviço, categoria, distância e tempo até o local, bairro (não o endereço), horário ("Agora" ou janela), preço ao cliente, remuneração líquida estimada, duração estimada, exigências (PIN, fotos), nota do cliente não exibida.
4. Prestador toca "Aceitar". `[ACCEPTED]` `POST /v1/offers/:id/accept`; guarda de concorrência: primeiro aceite vence; demais ofertas da onda expiram (`offer.expired`). Tela P-12 com endereço completo, instruções de acesso, chat e botão de rota.
5. Outro prestador aceitou antes: resposta `409`; tela "Esta oferta já foi aceita por outro profissional" por 2 s; volta à home. `[sem mudança]`
6. Prestador toca "Recusar" (motivo opcional: longe, horário, valor). `[sem mudança]` `dispatch_offers.status=DECLINED`; não penaliza; registra para `matching_configs` futuro.
7. Tempo esgotado: `offer.expire` marca `EXPIRED`; tela fecha com "Oferta expirada". `[sem mudança]` `provider_stats.responseTime` atualizado.
8. Prestador `BUSY` com ordem ativa só recebe ofertas `SCHEDULED` compatíveis com sua agenda (configurável: "ofertas encadeadas" em V1).

## 19. Fluxo do operador em dispatch manual

1. Operador faz login em `/login` com e-mail e senha (2FA em V1); abre `/ops` (tela O-01). RBAC `operator`.
2. Fila "Sem profissional" (O-02) lista ordens em `NO_PROVIDER_FOUND` ordenadas por tempo em espera, com badge de SLA (verde < 5 min, âmbar < 10, vermelho ≥ 10). Sala `ops` atualiza em tempo real.
3. Operador clica na ordem; painel lateral O-05 mostra: serviço, cliente (nome e bairro), endereço completo, janela, preço, histórico de ondas (`dispatch_rounds`, `dispatch_offers` com quem recusou/expirou), linha do tempo.
4. Clica "Atribuir profissional"; a tela O-06 lista candidatos de `GET /v1/ops/orders/:id/candidates` com score por componente, distância, disponibilidade atual, ordens no dia, nota, motivo de exclusão (fora da área, `BUSY`, recusou nesta ordem, folga) e filtro para incluir excluídos.
5. Operador escolhe um prestador e clica "Atribuir"; informa motivo (lista) e se é "oferta" (prestador pode recusar em N segundos) ou "atribuição direta" (já combinada por telefone). `[ACCEPTED]` ou `[OFFERED]` conforme modo. `POST /v1/ops/orders/:id/assign`; `audit_logs`; evt: `order.updated`; push ao prestador "Você foi atribuído a um pedido" e ao cliente RF-N-002.
6. Modo oferta recusado ou expirado: ordem volta à fila com nota do operador. `[NO_PROVIDER_FOUND]`
7. Sem candidato viável: operador clica "Propor novo horário" (envia ao cliente opções; aceitação converte em `SCHEDULED`) ou "Cancelar pela plataforma" com crédito de cortesia. `[SCHEDULED]` ou `[CANCELLED_BY_PLATFORM]`
8. Operador pode registrar `Incident` ligado à ordem (ex.: "cobertura insuficiente no bairro X") para o admin ajustar raio ou recrutamento. `[sem mudança]`
9. Todas as ações aparecem na linha do tempo da ordem como `OrderEvent(actor=operator)`.

## 20. Fluxo do admin criando nova categoria e serviço sem código

1. Admin acessa `/admin/catalog/categories` (A-01); clica "Nova categoria".
2. Preenche: nome ("Jardinagem"), slug gerado (`jardinagem`), ícone (seleção do conjunto de ícones do design system), categoria pai (opcional), ordem, `config`: exige PIN (não), exige fotos antes/depois (sim), exige veículo (não), exige equipamento (não), custódia (não). Salva como "Inativa". `POST /v1/admin/catalog/categories`; `audit_logs`.
3. Acessa `/admin/catalog/services` (A-02); "Novo serviço": nome ("Corte de grama"), slug, categoria Jardinagem, `workflowKind=SCHEDULED`, `pricingModel=HOURLY`, duração estimada 120 min, mínimo 1 h, descrição curta, inclui/não inclui, fotos de capa, tags de busca ("grama", "jardim", "poda"). Salva como "Inativo".
4. Em `/admin/pricing` (A-03): regra de preço para a região "Zona Sul": R$ 60/h, vigência a partir de hoje. `service_price_rules`.
5. Em `/admin/commission` (A-05): confere a regra global (ex.: 2000 bps) ou cria regra específica para Jardinagem (1800 bps, mínimo R$ 8). `commission_rules`.
6. Em `/admin/matching` (A-06): aceita o padrão global ou ajusta pesos para Jardinagem (proximidade maior, qualificação menor). `matching_configs`.
7. Em `/admin/providers` (A-07): habilita a nova skill para prestadores existentes que a solicitarem; o VÉLIO Pro passa a mostrar "Jardinagem" na seleção de especialidades.
8. Em `/admin/home` (A-09): adiciona a categoria à seção "Categorias" (ou ela entra automaticamente pela ordem) e cria um banner opcional com vigência.
9. Pré-visualização: botão "Ver como cliente" renderiza a home e o detalhe do serviço com dados reais da região escolhida.
10. Ativa categoria e serviço. O app do cliente passa a exibir Jardinagem no próximo `GET /v1/catalog/home` (cache de 60 s); nenhum deploy, nenhuma alteração de tela: a linha do tempo e os rótulos vêm de `contracts` por `workflowKind` e status.
11. Primeira ordem criada é visível em /ops como qualquer outra; admin acompanha em `/admin/analytics` por categoria.

## 21. Solicitar orçamento com visita técnica (`QUOTE`)

1. Cliente toca Hidráulica → "Visita técnica hidráulica" (`pricingModel=QUOTE`): tela C-07 mostra "Preço sob orçamento. Visita: R$ 0 se aprovar o serviço, R$ 40 se recusar" (valor configurável em `service_price_rules`). `[—]`
2. Descreve o problema e anexa fotos obrigatórias; escolhe janela da visita. `[REQUESTED]` tela: C-09; evt: `OrderCreated`.
3. Sistema atribui um prestador avaliador por matching reduzido (skill + região + agenda) ou ops triagem conforme PRD 13.2. `[UNDER_REVIEW]` push RF-N-002 "Visita técnica confirmada: quinta, 9h–11h".
4. Prestador visita, diagnostica e envia `Quote(kind=INITIAL)` com itens, prazo de execução e validade de 72 h pela tela P-15. `[QUOTED]` evt: `quote.created`; push RF-N-006; tela C-14.
5. Cliente aprova. `[QUOTE_APPROVED]` → `payments.authorize` `[AUTHORIZED]` push RF-N-011 ao prestador; agenda da execução combinada no chat ou escolhida em janelas propostas no orçamento.
6. Cliente recusa. `[QUOTE_REJECTED]` cobrança da visita (quando configurada) por `PaymentIntent` própria; prestador pode enviar novo orçamento revisado uma vez; cliente pode cancelar sem custo adicional. `[QUOTED]` ou `[CANCELLED_BY_CUSTOMER]`
7. Validade expira: job `quote.expire`. `[QUOTE_REJECTED]` push "O orçamento expirou. Peça uma revisão ou cancele".
8. Execução segue `EN_ROUTE` → `ARRIVED` → `IN_PROGRESS` → `COMPLETED` → `REVIEWED` (fluxo 3, passos 8–14), com captura do orçamento aprovado mais adicionais aprovados.

## 22. Reagendamento pelo cliente (`SCHEDULED`)

1. Cliente abre pedido `SCHEDULED`/`ACCEPTED`/`REMINDED` e toca "Reagendar" na tela C-11. `[sem mudança]`
2. Sistema mostra a política: sem custo até N horas antes (`platform_settings.cancellation.rescheduleFreeHours`); depois, taxa fixa. `[sem mudança]`
3. Cliente escolhe nova janela disponível. Em `SCHEDULED` (antes de aceite): novo `Booking`, matching segue. `[SCHEDULED]` evt: `BookingRescheduled`.
4. Em `ACCEPTED`/`REMINDED`: Sistema pergunta ao prestador atual se mantém (push "O cliente reagendou para sexta, 14h. Você pode atender?"); 15 min para responder. `[ACCEPTED]` com `Booking` novo e flag `pendingProviderConfirmation`.
5. Prestador aceita: agenda atualizada; lembretes reprogramados (`booking.reminder`). `[ACCEPTED]` push ao cliente "Reagendado com Carlos".
6. Prestador recusa ou não responde: ordem volta a `MATCHING` sem penalidade ao prestador; pré-autorização mantida. `[MATCHING]` push ao cliente "Buscando outro profissional para o novo horário".
7. Limite de 2 reagendamentos por ordem; o terceiro pedido orienta a cancelar e criar novo pedido. `[sem mudança]`

## 23. Chat e mensagens automáticas de status

1. `Conversation` da ordem é criada em `ACCEPTED` com participantes cliente e prestador (ops entra em leitura quando abre a ordem). `[ACCEPTED]` mensagem de sistema inicial.
2. Telefones nunca aparecem; tentativa de enviar sequência de 8+ dígitos ou link gera aviso "Para sua segurança, combine tudo pelo app" e a mensagem é entregue com o número mascarado (configurável). `[sem mudança]`
3. Imagens passam por redimensionamento e remoção de metadados de localização antes de armazenar. `[sem mudança]`
4. Cada transição relevante gera mensagem de sistema no chat (sem push duplicado), conforme a tabela abaixo. `[sem mudança]` evt: `message.created(kind=SYSTEM)`.
5. Após `COMPLETED`, o chat fica aberto por 24 h para combinados finais; depois, somente leitura; conteúdo retido 12 meses após `CLOSED` (RNF-012). `[COMPLETED]`
6. Chat com suporte: cliente toca "Ajuda" na ordem ou no perfil; cria `SupportTicket` e conversa `kind=SUPPORT`; operador responde pela tela O-09; macros e anexos. `[sem mudança]`

| Transição | Mensagem de sistema no chat (pt-BR) |
|---|---|
| `ACCEPTED` | "{Prestador} aceitou seu pedido. Use este chat para combinar detalhes." |
| `EN_ROUTE` | "{Prestador} saiu para o atendimento. Chegada prevista: {eta}." |
| a 500 m | "{Prestador} está chegando." |
| `ARRIVED` | "{Prestador} chegou." |
| `IN_PROGRESS` | "Serviço iniciado às {hora}." |
| `Quote SENT` | "Orçamento adicional enviado: {total}. Aprove ou recuse na tela do pedido." |
| `Quote APPROVED` | "Orçamento adicional aprovado." |
| `Quote REJECTED` | "Orçamento adicional recusado. O serviço segue no escopo original." |
| `COMPLETED` | "Serviço concluído. Total: {total}. Este chat fecha em 24 h." |
| `PICKED_UP` | "{n} itens retirados. Veja as fotos na linha do tempo." |
| `DELIVERED` | "Entrega confirmada." |
| `CANCELLED_*` | "Pedido cancelado {por quem}. {motivo resumido quando aplicável}." |
| `DISPUTED` | "Uma contestação foi aberta. O suporte vai analisar." |

## 24. Prestador: disponibilidade, folga e agenda

1. Prestador toca o interruptor `OFFLINE`/`ONLINE` na home P-10. `ONLINE` exige permissão de localização concedida e `Provider.status=APPROVED`; caso contrário, folha explica o que falta. evt: `ProviderAvailabilityChanged`; `LocationPolicy` passa a 60 s.
2. Ao aceitar oferta, Sistema marca `BUSY` até `COMPLETED` ou cancelamento; `BUSY` recebe apenas ofertas `SCHEDULED` compatíveis. evt: `ProviderAvailabilityChanged`.
3. Folga: em P-07, prestador cria `provider_time_off` (data/hora início e fim, motivo opcional). Durante a folga, `UNAVAILABLE`; ordens já aceitas no período exigem confirmação "Você tem 2 pedidos neste período. Cancelar com penalidade ou manter?".
4. Agenda semanal em P-07: janelas por dia da semana; alteração vale a partir da próxima semana para não afetar ordens aceitas; vigência imediata disponível com o mesmo aviso do passo 3.
5. Sem interação por 4 h em `ONLINE` sem ordem: push "Você ainda está online?"; sem resposta em 15 min, `OFFLINE` automático para poupar bateria e evitar ofertas sem resposta.
6. Prestador `SUSPENDED` pelo admin: interruptor desabilitado com motivo e prazo; `BLOCKED`: acesso ao app restrito a saldo, repasses e suporte.

## 25. Operador: incidente e SLA

1. Ordem ultrapassa `states[].sla` (ex.: `ACCEPTED` sem `EN_ROUTE` por 20 min em `IMMEDIATE`): Sistema cria `Incident(severity=MEDIUM, kind=SLA_BREACH)` e emite na sala `ops`. `[sem mudança]` tela O-07.
2. Operador assume o incidente ("Atribuir a mim"); vê ordem, prestador, última localização (apenas por ordem ativa), chat. `audit_logs`.
3. Ações: enviar mensagem ao prestador pelo chat da ordem; ligar (telefone exibido apenas ao operador, registrado); reatribuir (`operator.reassign` → `MATCHING`); estender SLA com justificativa; cancelar pela plataforma com crédito.
4. Resolução: operador registra desfecho (resolvido, cancelado, reatribuído) e causa (lista configurável). `Incident.status=RESOLVED`; métrica de tempo de resolução.
5. Incidentes com cliente (dano, comportamento, segurança) seguem o mesmo fluxo com `severity=HIGH`, notificação ao gestor de plantão e bloqueio preventivo do prestador até análise quando a categoria for de risco.
6. Alertas de plataforma (webhook de pagamento falhando, fila de jobs atrasada, `NO_PROVIDER_FOUND` > 10 min) aparecem no mesmo painel com origem "sistema" e não exigem ordem vinculada.

## 26. Privacidade: exportação e exclusão de conta

1. Cliente ou prestador acessa Perfil → Privacidade (C-28 / P-27); vê consentimentos com data e versão; pode alterar `personalization`, `marketing`, `backgroundLocation` (prestador: obrigatório para ficar `ONLINE`).
2. "Exportar meus dados": Sistema gera pacote (perfil, endereços, ordens, avaliações, mensagens enviadas, consentimentos) em até 15 dias; link assinado por e-mail ou in-app. `audit_logs`.
3. "Excluir minha conta": folha explica retenção legal (dados fiscais de ordens pagas) e o prazo de 30 dias; exige OTP de confirmação.
4. Ordens não terminais impedem a exclusão imediata: "Você tem 1 pedido em andamento. Conclua ou cancele antes".
5. Prestador com saldo a liberar: exclusão fica pendente até o último `Payout`; aviso claro.
6. Após 30 dias: anonimização (nome, telefone, e-mail, fotos, documentos removidos; `owner_user_id` mantido como pseudônimo para integridade do ledger e das ordens). Sessões revogadas no ato do pedido.

## 27. Erros e bordas transversais

| Situação | Comportamento esperado | Superfície |
|---|---|---|
| Sem conexão ao abrir | Home em cache com faixa "Sem conexão"; ações de criar pedido desabilitadas com explicação | Cliente, prestador |
| Sem conexão durante transição do prestador | Transição e fotos entram em fila local; indicador "Enviando quando a conexão voltar"; reenvio idempotente por `seq` | Prestador |
| `409` em transição (estado mudou) | Tela recarrega o estado atual a partir da resposta e mostra "Este pedido foi atualizado"; nunca repete a ação automaticamente | Todas |
| Sessão expirada | Refresh em segundo plano; falha leva a C-01/P-01 preservando a rota de retorno (deep link) | Mobile |
| Permissão de localização negada (cliente) | Endereço por busca manual; sem bloqueio | Cliente |
| Permissão de localização negada (prestador) | Não pode ficar `ONLINE`; folha com passo a passo para habilitar | Prestador |
| Permissão de câmera negada | Evidências por galeria permitidas apenas se a categoria não exigir foto ao vivo; senão, instrução para habilitar | Prestador |
| Push desabilitado | Faixa persistente nas telas de acompanhamento; in-app continua funcionando; SMS apenas para eventos críticos | Mobile |
| Gateway de pagamento indisponível | Checkout informa "Pagamento temporariamente indisponível"; ordem não é criada; alerta em /ops | Cliente, ops |
| Geocodificação falha | Permite ajustar o pino manualmente e salvar com coordenadas do mapa | Cliente |
| Realtime desconectado | Fallback para polling de `GET /v1/orders/:id` a cada 15 s com indicador discreto | Mobile, web |
| Expiração de URL assinada de mídia | Nova URL obtida automaticamente ao abrir a mídia | Todas |

---

## 28. Matriz estado × ação permitida × ator

Legenda de atores: **C** cliente, **P** prestador, **O** operador, **S** sistema (jobs e engine). Ações em `TransitionAction` do `WorkflowDefinition`. Estados terminais não têm linhas de ação além de leitura.

### 28.1 Estados comuns e `IMMEDIATE`/`SCHEDULED`

| Estado | Ação | C | P | O | S | Guard / efeito principal |
|---|---|---|---|---|---|---|
| `REQUESTED` | `customer.cancel` | sim | — | — | — | Sem custo |
| `REQUESTED` | `operator.cancel_platform` | — | — | sim | — | Reembolso integral |
| `REQUESTED` | `system.start_dispatch` | — | — | — | sim | → `MATCHING`; job `dispatch.start` |
| `SCHEDULED` | `customer.cancel` | sim | — | — | — | Sem custo |
| `SCHEDULED` | `customer.reschedule` | sim | — | sim | — | Antes de `ACCEPTED`; novo `Booking` |
| `SCHEDULED` | `system.start_dispatch` | — | — | — | sim | → `MATCHING` |
| `MATCHING` | `system.offer` | — | — | — | sim | → `OFFERED`; cria `dispatch_offers` |
| `MATCHING` | `customer.cancel` | sim | — | — | — | Sem custo |
| `MATCHING` | `operator.assign` | — | — | sim | — | → `ACCEPTED`; `audit_logs` |
| `OFFERED` | `provider.accept` | — | sim | — | — | Guarda de concorrência; `payments.authorize`; → `ACCEPTED` |
| `OFFERED` | `provider.decline` | — | sim | — | — | Sem penalidade; oferta `DECLINED` |
| `OFFERED` | `system.wave_timeout` | — | — | — | sim | Nova onda ou → `NO_PROVIDER_FOUND` |
| `OFFERED` | `customer.cancel` | sim | — | — | — | Sem custo; ofertas expiram |
| `OFFERED` | `operator.assign` | — | — | sim | — | → `ACCEPTED` |
| `NO_PROVIDER_FOUND` | `operator.assign` | — | — | sim | — | → `ACCEPTED` ou `OFFERED` (modo oferta) |
| `NO_PROVIDER_FOUND` | `operator.reopen_matching` | — | — | sim | — | → `MATCHING` com raio ampliado |
| `NO_PROVIDER_FOUND` | `operator.propose_reschedule` | — | — | sim | — | → `SCHEDULED` após aceite do cliente |
| `NO_PROVIDER_FOUND` | `customer.cancel` | sim | — | — | — | Sem custo |
| `NO_PROVIDER_FOUND` | `system.cancel_platform` | — | — | — | sim | Após prazo; crédito de cortesia opcional |
| `ACCEPTED` | `provider.en_route` | — | sim | — | — | Guard: pagamento `AUTHORIZED`/`PAID`; → `EN_ROUTE` |
| `ACCEPTED` | `provider.cancel` | — | sim | — | — | Penalidade; → `CANCELLED_BY_PROVIDER` e nova ordem em `MATCHING` |
| `ACCEPTED` | `customer.cancel` | sim | — | — | — | Sem custo até 10 min; depois taxa fixa |
| `ACCEPTED` | `customer.retry_payment` | sim | — | — | — | Nova `PaymentIntent` |
| `ACCEPTED` | `system.remind` | — | — | — | sim | `SCHEDULED`: → `REMINDED` (idempotente) |
| `ACCEPTED` | `operator.reassign` | — | — | sim | — | Cancela aceite atual sem penalidade quando justificado; → `MATCHING` |
| `REMINDED` | `provider.en_route` | — | sim | — | — | → `EN_ROUTE` |
| `REMINDED` | `customer.cancel` | sim | — | — | — | Taxa conforme janela |
| `REMINDED` | `provider.cancel` | — | sim | — | — | Penalidade; → `MATCHING` |
| `EN_ROUTE` | `provider.arrived` | — | sim | — | — | → `ARRIVED` |
| `EN_ROUTE` | `customer.cancel` | sim | — | — | — | Taxa de deslocamento ao prestador |
| `EN_ROUTE` | `provider.cancel` | — | sim | — | — | Penalidade; → `MATCHING` |
| `EN_ROUTE` | `provider.push_location` | — | sim | — | — | `provider.location` para `order:{id}` |
| `ARRIVED` | `provider.start` | — | sim | — | — | Guards `requiresPin`, `requiresEvidence:BEFORE`; → `IN_PROGRESS` |
| `ARRIVED` | `customer.cancel` | sim | — | — | — | Taxa de deslocamento |
| `ARRIVED` | `provider.cancel` | — | sim | — | — | "Cliente não responde" após 15 min → `CANCELLED_BY_PLATFORM` com taxa |
| `IN_PROGRESS` | `provider.create_quote` | — | sim | — | — | `Quote ADDITIONAL SENT`; sem mudança de estado |
| `IN_PROGRESS` | `customer.decide_quote` | sim | — | — | — | `APPROVED` → `PaymentIntent ADDITIONAL`; `REJECTED` |
| `IN_PROGRESS` | `provider.complete` | — | sim | — | — | Guards `requiresEvidence:AFTER`, `noOpenAdditionalQuote`; `payments.capture`; → `COMPLETED` |
| `IN_PROGRESS` | `customer.report_problem` | sim | — | — | — | `SupportTicket`; sem mudança |
| `IN_PROGRESS` | `operator.force_complete` | — | — | sim | — | Com justificativa; `Incident` |
| `IN_PROGRESS` | `operator.cancel_platform` | — | — | sim | — | Reembolso integral |
| `COMPLETED` | `customer.review` | sim | — | — | — | → `REVIEWED`; `reputation.recompute` |
| `COMPLETED` | `provider.review_customer` | — | sim | — | — | Nota interna; sem mudança |
| `COMPLETED` | `customer.open_dispute` | sim | — | — | — | Até 72 h; → `DISPUTED`; congela `Payout` |
| `COMPLETED` | `system.auto_close` | — | — | — | sim | 7 dias sem avaliação; → `CLOSED` |
| `COMPLETED` | `customer.retry_payment` | sim | — | — | — | Cobrança pendente |
| `DISPUTED` | `provider.respond_dispute` | — | sim | — | — | 24 h |
| `DISPUTED` | `operator.resolve_dispute` | — | — | sim | — | → `REFUNDED` ou `CLOSED`; libera/ajusta `Payout` |
| `REVIEWED` | `customer.open_dispute` | sim | — | — | — | Até 72 h de `COMPLETED`; → `DISPUTED` |
| `REVIEWED` | `operator.refund` | — | — | sim | — | → `REFUNDED` |
| `qualquer não terminal` | `operator.add_note` | — | — | sim | — | `OrderEvent` sem mudança de estado |
| `qualquer não terminal` | `participant.send_message` | sim | sim | sim | — | `message.created` |

### 28.2 `QUOTE`

| Estado | Ação | C | P | O | S | Guard / efeito |
|---|---|---|---|---|---|---|
| `REQUESTED` | `system.assign_reviewer` | — | — | sim | sim | → `UNDER_REVIEW` (ver PRD 13.2) |
| `UNDER_REVIEW` | `provider.send_quote` | — | sim | — | — | `Quote INITIAL SENT`; → `QUOTED` |
| `UNDER_REVIEW` | `customer.cancel` | sim | — | — | — | Sem custo |
| `QUOTED` | `customer.approve_quote` | sim | — | — | — | → `QUOTE_APPROVED` → `AUTHORIZED` (`payments.authorize`) |
| `QUOTED` | `customer.reject_quote` | sim | — | — | — | → `QUOTE_REJECTED` |
| `QUOTED` | `system.expire_quote` | — | — | — | sim | Validade; → `QUOTE_REJECTED` |
| `QUOTE_REJECTED` | `provider.send_quote` | — | sim | — | — | Novo `Quote`; → `QUOTED` |
| `QUOTE_REJECTED` | `customer.cancel` | sim | — | — | — | Sem custo |
| `AUTHORIZED` | `provider.en_route` | — | sim | — | — | → `EN_ROUTE`; segue 21.1 |

### 28.3 `LOGISTICS` e `LAUNDRY`

| Estado | Ação | C | P | O | S | Guard / efeito |
|---|---|---|---|---|---|---|
| `DRIVER_ASSIGNED` | `provider.en_route_pickup` | — | sim | — | — | Guard pagamento; → `EN_ROUTE_PICKUP` |
| `DRIVER_ASSIGNED` | `customer.cancel` | sim | — | — | — | Regra de `ACCEPTED` |
| `EN_ROUTE_PICKUP` | `provider.pickup` | — | sim | — | — | Guards `custodyEvent`, `evidence:PHOTOS`; veículo: `odometer`, `checklist`, `customerSignature`; → `PICKED_UP` |
| `EN_ROUTE_PICKUP` | `customer.cancel` | sim | — | — | — | Taxa de deslocamento |
| `PICKED_UP` | `provider.depart` | — | sim | — | — | → `IN_TRANSIT` |
| `PICKED_UP` | `customer.cancel` | sim | — | — | — | Vira "devolver agora": → `RETURNING` com taxa |
| `IN_TRANSIT` | `provider.arrive_destination` | — | sim | — | — | Guard `custodyEvent`; → `AT_DESTINATION` |
| `AT_DESTINATION` | `system.third_party_start` | — | sim | — | sim | → `THIRD_PARTY_IN_PROGRESS` |
| `THIRD_PARTY_IN_PROGRESS` | `provider.create_quote` | — | sim | — | — | Adicional do terceiro |
| `THIRD_PARTY_IN_PROGRESS` | `customer.decide_quote` | sim | — | — | — | |
| `THIRD_PARTY_IN_PROGRESS` | `provider.third_party_done` | — | sim | — | — | Guard `noOpenAdditionalQuote`; → `THIRD_PARTY_DONE` |
| `THIRD_PARTY_DONE` | `provider.return_pickup` | — | sim | — | — | Guard `custodyEvent`; → `RETURN_PICKUP` |
| `RETURN_PICKUP` | `provider.depart_return` | — | sim | — | — | → `RETURNING` |
| `RETURNING` | `provider.deliver` | — | sim | — | — | Guards `custodyEvent`, fotos; veículo: odômetro, checklist, confirmação do cliente; → `DELIVERED` |
| `DELIVERED` | `system.complete` | — | — | — | sim | `payments.capture`; → `COMPLETED` |
| `DELIVERED` | `customer.open_dispute` | sim | — | — | — | Divergência na confirmação; → `DISPUTED` após `COMPLETED` |
| `PICKED_UP` … `RETURNING` | `operator.transfer_custody` | — | — | sim | — | Reatribui motorista com `CustodyEvent` de transferência |
| `PICKED_UP` … `RETURNING` | `provider.cancel` | — | não | — | — | Proibido com item em custódia |

### 28.4 `CONCIERGE`

| Estado | Ação | C | P | O | S | Guard / efeito |
|---|---|---|---|---|---|---|
| `SUBMITTED` | `system.interpret` | — | — | — | sim | → `INTERPRETING` |
| `INTERPRETING` | `system.propose_plan` | — | — | — | sim | Plano validado; → `PLAN_PROPOSED` ou `NEEDS_HUMAN` por limiar |
| `NEEDS_HUMAN` | `operator.edit_plan` | — | — | sim | — | → `PLAN_PROPOSED` |
| `NEEDS_HUMAN` | `operator.cancel_platform` | — | — | sim | — | Inviável; sem custo |
| `PLAN_PROPOSED` | `customer.approve_plan` | sim | — | — | — | → `PLAN_APPROVED` |
| `PLAN_PROPOSED` | `customer.request_changes` | sim | — | — | — | → `INTERPRETING` |
| `PLAN_PROPOSED` | `customer.cancel` | sim | — | — | — | Sem custo |
| `PLAN_APPROVED` | `system.quote` | — | — | — | sim | `Quote INITIAL`; → `QUOTED` |
| `QUOTED` | `customer.approve_quote` | sim | — | — | — | `payments.authorize`; → `QUOTE_APPROVED` → `IN_EXECUTION` (cria filhas) |
| `QUOTED` | `customer.reject_quote` | sim | — | — | — | → `PLAN_PROPOSED` para ajuste ou cancelamento |
| `IN_EXECUTION` | `customer.cancel_child` | sim | — | — | — | Exige aprovação de novo plano |
| `IN_EXECUTION` | `operator.adjust_children` | — | — | sim | — | Adiciona/remove filhas com aprovação do cliente |
| `IN_EXECUTION` | `system.complete_parent` | — | — | — | sim | Todas as filhas terminais; captura consolidada; → `COMPLETED` |
| `COMPLETED` | `customer.review` | sim | — | — | — | → `REVIEWED` |
