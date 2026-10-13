# 11 — Marketplace Engine

A camada central que governa entidades, estados e regras do VÉLIO. Implementada em `packages/domain` (regras puras) e orquestrada pelos módulos de `apps/api`.

## 1. Entidades canônicas

| Entidade | Papel | Observações |
|---|---|---|
| `User` | Identidade única | Papéis acumuláveis: `customer`, `provider`, `operator`, `admin` |
| `Provider` | Perfil profissional | `status` (PENDING, APPROVED, SUSPENDED, BLOCKED) e `availability` (OFFLINE, ONLINE, BUSY, UNAVAILABLE) |
| `ServiceCategory` | Árvore configurável | Ícone, ordem, `config` (exige PIN, exige fotos antes/depois, exige veículo…) |
| `Service` | Item contratável | `workflowKind`, `pricingModel` (FIXED, HOURLY, QUOTE, RANGE), duração estimada, flags |
| `ServiceRequest` | Intenção do cliente | Insumos: serviço, endereço, veículo/equipamento, janela, observações, mídia |
| `ServiceOrder` | Ordem de serviço | Uma por request (concierge: uma pai + filhas). Carrega `status`, preço, repasse, agenda |
| `OrderEvent` | Linha do tempo imutável | `seq` monotônico por ordem; origem de toda auditoria e do realtime |
| `OrderTask` | Subetapas | Usado por LOGISTICS e CONCIERGE |
| `ProviderAvailability` | Estado + agenda | Janelas semanais, folgas, bloqueios por ordem aceita |
| `ProviderLocation` | Última posição e histórico | Retida por 30 dias (LGPD) |
| `Quote` | Orçamento | `kind` INITIAL ou ADDITIONAL; só `APPROVED` autoriza cobrança |
| `Booking` | Reserva de horário | `startsAt`, `endsAt`, lembretes |
| `Subscription` | Plano recorrente | Gera `SubscriptionVisit` → `ServiceOrder` SCHEDULED |
| `Payment` (`PaymentIntent`) | Intenção/cobrança | `kind` INITIAL, ADDITIONAL, SUBSCRIPTION; pré-autorização e captura |
| `Wallet` + `LedgerEntry` | Contas e lançamentos | Dupla entrada; saldo derivado |
| `Payout` | Repasse ao prestador | Lotes por período |
| `Commission` (`CommissionRule`) | Regra de take rate | Por categoria/região, bps + fixo, com mínimos e máximos |
| `Review` | Avaliação | Só após `COMPLETED`; uma por lado por ordem |
| `Chat` (`Conversation`, `Message`) | Comunicação | Mascarada; mensagens de sistema por status |
| `SupportTicket` | Atendimento | Vinculado ou não a ordem |
| `Dispute` | Contestação pós-conclusão | Congela repasse até resolução |
| `Coupon`, `Promotion` | Incentivos | Regras de elegibilidade e limites |
| `Notification` | Entrega multicanal | push, in-app, SMS; com `readAt` |
| `Address` | Endereço com coordenadas | Instruções de acesso |
| `Vehicle`, `Equipment` | Bens do cliente | Equipamento com `lastMaintenanceAt` para sugestão |
| `MediaEvidence` | Fotos, checklist, odômetro, assinatura | Vinculada a ordem e etapa |
| `CustodyEvent` | Cadeia de custódia | Quem, quando, onde, estado; código QR por item |

## 2. Tipos de workflow

Enum `WorkflowKind`: `IMMEDIATE`, `SCHEDULED`, `QUOTE`, `LOGISTICS`, `LAUNDRY`, `CONCIERGE`. `LAUNDRY` especializa `LOGISTICS` com custódia obrigatória; visitas de assinatura usam `SCHEDULED`.

Estados comuns a todos: `CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_PROVIDER`, `CANCELLED_BY_PLATFORM`, `NO_PROVIDER_FOUND`, `DISPUTED`, `REFUNDED`. Terminais: cancelamentos, `REVIEWED`, `REFUNDED`, `CLOSED`.

### 2.1 IMMEDIATE

```
REQUESTED → MATCHING → OFFERED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED → REVIEWED
             │            │
             └→ NO_PROVIDER_FOUND (fallback ops) → ACCEPTED (atribuição manual)
```

### 2.2 SCHEDULED

```
SCHEDULED → MATCHING → ACCEPTED(=CONFIRMED) → REMINDED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED → REVIEWED
```

`REMINDED` é disparado por job 24 h e 1 h antes; a transição é idempotente.

### 2.3 QUOTE

```
REQUESTED → MATCHING → OFFERED → UNDER_REVIEW → QUOTED → QUOTE_APPROVED → AUTHORIZED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED → REVIEWED
                                                  │
                                                  └→ QUOTE_REJECTED → (novo QUOTED | CANCELLED_BY_CUSTOMER)
```

O prestador que aceita a oferta (`provider.accept`) assume a análise e entra em `UNDER_REVIEW`; é ele quem envia o orçamento. Sem prestador, o fallback é o mesmo dos demais fluxos (`NO_PROVIDER_FOUND` → operador).

### 2.4 LOGISTICS (e LAUNDRY)

```
REQUESTED → MATCHING → DRIVER_ASSIGNED → EN_ROUTE_PICKUP → PICKED_UP → IN_TRANSIT → AT_DESTINATION
  → THIRD_PARTY_IN_PROGRESS → THIRD_PARTY_DONE → RETURN_PICKUP → RETURNING → DELIVERED → COMPLETED → REVIEWED
```

`PICKED_UP`, `AT_DESTINATION`, `RETURN_PICKUP` e `DELIVERED` exigem `CustodyEvent` (QR do item ou do veículo + foto). Veículos exigem também odômetro e checklist em `PICKED_UP` e `DELIVERED`.

### 2.5 CONCIERGE

```
SUBMITTED → INTERPRETING → PLAN_PROPOSED → PLAN_APPROVED → QUOTED → QUOTE_APPROVED → IN_EXECUTION → COMPLETED → REVIEWED
                 │                │
                 └→ NEEDS_HUMAN ──┘ (operador ajusta o plano)
```

`IN_EXECUTION` cria ordens filhas (`parentOrderId`) de qualquer outro tipo; a ordem pai conclui quando todas as filhas concluem ou são canceladas com aprovação.

### 2.6 Orçamento adicional durante `IN_PROGRESS`

Não muda o estado da ordem. Cria `Quote(kind=ADDITIONAL, status=SENT)`; o cliente recebe push e tela com `[RECUSAR] [APROVAR]`. `APPROVED` → nova `PaymentIntent(kind=ADDITIONAL)`; `REJECTED` → o prestador conclui só o escopo original. A captura final soma apenas intenções aprovadas.

## 3. Definição declarativa

```ts
type WorkflowDefinition = {
  kind: WorkflowKind;
  version: number;
  initial: OrderStatus;
  states: Record<OrderStatus, { terminal?: boolean; sla?: { seconds: number; escalateTo: 'ops' } }>;
  transitions: Array<{
    from: OrderStatus | OrderStatus[];
    to: OrderStatus;
    action: TransitionAction;          // ex.: 'provider.accept', 'provider.start', 'customer.cancel'
    allowedActors: ActorType[];        // customer | provider | operator | system
    guards?: GuardName[];              // ex.: 'requiresPin', 'requiresEvidence:AFTER', 'noOpenAdditionalQuote'
    effects?: EffectName[];            // ex.: 'payments.authorize', 'payments.capture', 'notify.customer:provider_found'
  }>;
};
```

A engine (`applyTransition`) recebe definição, ordem, ação, ator e contexto; devolve `{ ok, nextStatus, effects }` ou `{ ok: false, reason }`. Guards são funções puras registradas por nome; efeitos são nomes que a API resolve em serviços. Definições embutidas ficam em `packages/domain/src/workflow/definitions/*.ts`; o banco pode guardar sobrescritas por versão em `workflow_definitions`.

## 4. Política de cancelamento (padrão; configurável em `platform_settings.cancellation`)

| Quem | Quando | Efeito |
|---|---|---|
| Cliente | Antes de `ACCEPTED` | Sem custo |
| Cliente | Após `ACCEPTED`, antes de `EN_ROUTE` | Sem custo até 10 min do aceite; depois taxa fixa configurável |
| Cliente | `EN_ROUTE`/`ARRIVED` | Taxa de deslocamento (percentual do preço, mínimo configurável) creditada ao prestador |
| Cliente | `IN_PROGRESS` | Não cancela; abre `Dispute` ou conclui parcial com orçamento |
| Prestador | Após `ACCEPTED` | Penalidade reputacional; ordem volta a `MATCHING` automaticamente |
| Plataforma | Qualquer | Reembolso integral + crédito de cortesia opcional |

## 5. Regras de dinheiro

- Preço final = base (ou orçamento aprovado) + adicionais aprovados − cupom − crédito promocional.
- Comissão = `max(min, min(max, round_half_up(final × bps/10000) + fixo))`, por regra mais específica (categoria+região > categoria > global).
- Repasse = final − comissão − taxa de pagamento repassada quando configurado.
- Ledger em `COMPLETED`: crédito `platform:revenue` (comissão), crédito `provider:{id}` (líquido), débito `customer:{id}` ou `gateway:clearing` (bruto).
- `Dispute` aberta congela o `Payout` da ordem.

## 6. Reputação

`provider_stats`: média ponderada por recência (últimas 50 avaliações pesam 70 %), quantidade, taxa de conclusão, taxa de aceite, taxa de cancelamento, tempo médio de resposta a ofertas. Sinais internos do cliente (não exibidos, não discriminatórios): cancelamentos tardios, disputas abertas sem razão, chargebacks. Usados apenas para exigir pré-pagamento ou revisão humana.

## 7. Decisões sobre pontos ambíguos da visão de produto

| Ponto | Decisão no MVP | Evolução |
|---|---|---|
| PIX em serviço imediato: o prestador sairia sem pagamento confirmado | Quando o método é PIX, a cobrança nasce na criação do pedido e o matching só começa após o webhook de pagamento (`REQUESTED` permanece até `PAID`; expira em 15 min sem pagamento e a ordem é cancelada pela plataforma). Cartão e carteira pré-autorizam no aceite, como no fluxo padrão | PIX com confirmação instantânea via provedor e "pagar depois" para clientes com bom histórico |
| PIN de início e de fim | PIN na transição `provider.start`. O fim é comprovado por `MediaEvidence(AFTER)` e pela avaliação do cliente; na devolução de veículo, `VehicleHandoverInput.customerConfirmationPin` confirma a entrega | Guard `requiresEndPin` por categoria, se a operação pedir |
| Chat cliente ↔ suporte | Usa `communication.conversations` com `kind = CUSTOMER_SUPPORT`; `support_tickets.conversation_id` aponta para ela. Não há segunda tabela de mensagens | Integração com ferramenta de atendimento externa |
| Estado `CLOSED` | Alcançado por `system.auto_close` (após a janela de avaliação/disputa) e por `operator.resolve_dispute` | — |
| Terceiro em LOGISTICS (oficina, lavanderia, lava-rápido) | Destino é um endereço (`destinationAddressId`) escolhido pelo cliente ou pela operação; o terceiro não é usuário da plataforma. Custo do terceiro, quando houver, entra como `Quote(ADDITIONAL)` aprovado pelo cliente | Terceiros como `Provider` parceiro com agenda e preço próprios (V2) |
| SCHEDULED sem `OFFERED` explícito | A definição tem `MATCHING → OFFERED → ACCEPTED`, igual ao imediato; o doc anterior omitia por brevidade | — |
| Cancelamento em SCHEDULED | Mesma política de `customerCancellation`, com `acceptedAt` como referência; a janela gratuita de 10 min vale após a confirmação | Janela maior (ex.: até 24 h antes) configurável por categoria |
| Módulo `providers` ausente na lista do ADR-003 | Incluído; ver ADR-003 atualizado | — |

## 8. Extensibilidade

Nova categoria: linha em `service_categories` + serviços com `workflowKind` existente. Novo fluxo: nova `WorkflowDefinition` (código ou banco) + eventuais guards/efeitos novos. Nenhuma tela precisa mudar: os apps renderizam a linha do tempo a partir de `order_events` e dos rótulos pt-BR mapeados por status em `contracts`.
