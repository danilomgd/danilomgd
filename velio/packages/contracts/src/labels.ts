import type { OrderStatus, ProviderAvailability, WorkflowKind } from './enums';

/** Rótulo curto e frase de status em pt-BR para cada estado. Único lugar para texto de status. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, { label: string; customer: string; provider: string }> =
  {
    REQUESTED: { label: 'Solicitado', customer: 'Recebemos seu pedido.', provider: 'Pedido criado.' },
    MATCHING: {
      label: 'Procurando',
      customer: 'Procurando o melhor profissional perto de você.',
      provider: 'Pedido em distribuição.',
    },
    OFFERED: {
      label: 'Aguardando aceite',
      customer: 'Um profissional está avaliando seu pedido.',
      provider: 'Oferta enviada.',
    },
    ACCEPTED: {
      label: 'Confirmado',
      customer: 'Profissional confirmado.',
      provider: 'Você aceitou este serviço.',
    },
    EN_ROUTE: {
      label: 'A caminho',
      customer: 'Seu profissional está a caminho.',
      provider: 'Você está a caminho.',
    },
    ARRIVED: { label: 'Chegou', customer: 'Seu profissional chegou.', provider: 'Você chegou ao local.' },
    IN_PROGRESS: {
      label: 'Em andamento',
      customer: 'Serviço em andamento.',
      provider: 'Serviço em execução.',
    },
    COMPLETED: {
      label: 'Concluído',
      customer: 'Serviço concluído. Avalie seu atendimento.',
      provider: 'Serviço concluído.',
    },
    REVIEWED: { label: 'Avaliado', customer: 'Obrigado pela avaliação.', provider: 'Serviço avaliado.' },
    CLOSED: { label: 'Encerrado', customer: 'Pedido encerrado.', provider: 'Pedido encerrado.' },
    SCHEDULED: {
      label: 'Agendado',
      customer: 'Agendamento registrado.',
      provider: 'Agendamento disponível.',
    },
    REMINDED: {
      label: 'Agendado',
      customer: 'Lembrete: seu serviço está próximo.',
      provider: 'Lembrete: serviço em breve.',
    },
    UNDER_REVIEW: {
      label: 'Em análise',
      customer: 'Um profissional está analisando sua solicitação.',
      provider: 'Analise e envie o orçamento.',
    },
    QUOTED: {
      label: 'Orçamento disponível',
      customer: 'Você tem um orçamento para aprovar.',
      provider: 'Orçamento enviado.',
    },
    QUOTE_APPROVED: {
      label: 'Orçamento aprovado',
      customer: 'Orçamento aprovado.',
      provider: 'Cliente aprovou o orçamento.',
    },
    QUOTE_REJECTED: {
      label: 'Orçamento recusado',
      customer: 'Você recusou o orçamento.',
      provider: 'Cliente recusou o orçamento.',
    },
    AUTHORIZED: {
      label: 'Pagamento autorizado',
      customer: 'Pagamento autorizado. Aguardando o profissional.',
      provider: 'Pagamento garantido. Pode seguir.',
    },
    DRIVER_ASSIGNED: {
      label: 'Motorista designado',
      customer: 'Motorista designado para a coleta.',
      provider: 'Você foi designado para a coleta.',
    },
    EN_ROUTE_PICKUP: {
      label: 'Indo coletar',
      customer: 'Motorista a caminho da coleta.',
      provider: 'A caminho da coleta.',
    },
    PICKED_UP: {
      label: 'Coletado',
      customer: 'Item coletado com registro de custódia.',
      provider: 'Coleta registrada.',
    },
    IN_TRANSIT: {
      label: 'Em transporte',
      customer: 'Em transporte até o destino.',
      provider: 'Em transporte.',
    },
    AT_DESTINATION: {
      label: 'No destino',
      customer: 'Chegou ao destino.',
      provider: 'Você chegou ao destino.',
    },
    THIRD_PARTY_IN_PROGRESS: {
      label: 'Em execução no destino',
      customer: 'O serviço está sendo executado.',
      provider: 'Aguardando execução por terceiro.',
    },
    THIRD_PARTY_DONE: {
      label: 'Pronto para retorno',
      customer: 'Serviço no destino concluído.',
      provider: 'Pronto para a nova coleta.',
    },
    RETURN_PICKUP: {
      label: 'Coletado para devolução',
      customer: 'Coletado para devolução.',
      provider: 'Coleta de retorno registrada.',
    },
    RETURNING: { label: 'Voltando', customer: 'A caminho da devolução.', provider: 'Voltando ao cliente.' },
    DELIVERED: {
      label: 'Devolvido',
      customer: 'Devolvido. Confirme o recebimento.',
      provider: 'Devolução registrada.',
    },
    SUBMITTED: {
      label: 'Recebido',
      customer: 'Recebemos seu pedido. Estamos interpretando.',
      provider: 'Pedido recebido.',
    },
    INTERPRETING: {
      label: 'Interpretando',
      customer: 'Montando um plano para você.',
      provider: 'Plano em preparação.',
    },
    PLAN_PROPOSED: {
      label: 'Plano pronto',
      customer: 'Revise e aprove o plano proposto.',
      provider: 'Plano aguardando o cliente.',
    },
    NEEDS_HUMAN: {
      label: 'Com nossa equipe',
      customer: 'Nossa equipe está revisando seu pedido.',
      provider: 'Em revisão pela operação.',
    },
    PLAN_APPROVED: {
      label: 'Plano aprovado',
      customer: 'Plano aprovado. Preparando o orçamento.',
      provider: 'Plano aprovado.',
    },
    IN_EXECUTION: {
      label: 'Em execução',
      customer: 'Suas tarefas estão em andamento.',
      provider: 'Tarefas em andamento.',
    },
    NO_PROVIDER_FOUND: {
      label: 'Buscando alternativa',
      customer: 'Nossa equipe está encontrando um profissional para você.',
      provider: 'Sem prestador. Operação acionada.',
    },
    CANCELLED_BY_CUSTOMER: {
      label: 'Cancelado',
      customer: 'Você cancelou este pedido.',
      provider: 'Cancelado pelo cliente.',
    },
    CANCELLED_BY_PROVIDER: {
      label: 'Cancelado',
      customer: 'O profissional cancelou. Estamos buscando outro.',
      provider: 'Você cancelou este serviço.',
    },
    CANCELLED_BY_PLATFORM: {
      label: 'Cancelado',
      customer: 'Cancelado pela plataforma. Reembolso em andamento.',
      provider: 'Cancelado pela plataforma.',
    },
    DISPUTED: {
      label: 'Em disputa',
      customer: 'Sua contestação está em análise.',
      provider: 'Contestação em análise.',
    },
    REFUNDED: {
      label: 'Reembolsado',
      customer: 'Reembolso realizado.',
      provider: 'Pedido reembolsado ao cliente.',
    },
  };

export const PROVIDER_AVAILABILITY_LABELS: Record<ProviderAvailability, string> = {
  OFFLINE: 'Offline',
  ONLINE: 'Online',
  BUSY: 'Ocupado',
  UNAVAILABLE: 'Indisponível',
};

export const WORKFLOW_KIND_LABELS: Record<WorkflowKind, string> = {
  IMMEDIATE: 'Serviço imediato',
  SCHEDULED: 'Serviço agendado',
  QUOTE: 'Serviço com orçamento',
  LOGISTICS: 'Leva e traz',
  LAUNDRY: 'Lavanderia',
  CONCIERGE: 'Concierge',
};

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
