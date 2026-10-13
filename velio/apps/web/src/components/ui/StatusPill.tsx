import { ORDER_STATUS_LABELS, type OrderStatus } from '@velio/contracts';
import { statusTone } from '@velio/ui';
import s from './ui.module.css';

export type Tone = 'neutral' | 'info' | 'primary' | 'success' | 'warning' | 'danger';

const toneClass: Record<Tone, string> = {
  neutral: s.neutral ?? '',
  info: s.info ?? '',
  primary: s.primaryTone ?? '',
  success: s.success ?? '',
  warning: s.warning ?? '',
  danger: s.danger ?? '',
};

export interface PillProps {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  title?: string;
}

export function Pill({ tone = 'neutral', children, dot, title }: PillProps) {
  return (
    <span className={[s.pill, toneClass[tone]].join(' ')} title={title}>
      {dot ? <span className={s.pillDot} aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Pill de status de ordem: cor vem de `statusTone`, texto de `ORDER_STATUS_LABELS`. */
export function StatusPill({ status }: { status: string }) {
  const tone = statusTone[status] ?? 'neutral';
  const label = ORDER_STATUS_LABELS[status as OrderStatus]?.label ?? status;
  return (
    <Pill tone={tone} dot title={status}>
      <span className="sr-only">Status: </span>
      {label}
    </Pill>
  );
}

const genericTones: Record<string, Tone> = {
  ACTIVE: 'success',
  APPROVED: 'success',
  VERIFIED: 'success',
  PAID: 'success',
  CAPTURED: 'success',
  ONLINE: 'success',
  DONE: 'success',
  RESOLVED_CUSTOMER: 'success',
  RESOLVED_PROVIDER: 'success',
  RESOLVED_SPLIT: 'success',
  PENDING: 'warning',
  OPEN: 'warning',
  BUSY: 'warning',
  REQUIRES_ACTION: 'warning',
  SENT: 'warning',
  UNDER_REVIEW: 'info',
  IN_PROGRESS: 'info',
  PROCESSING: 'info',
  AUTHORIZED: 'primary',
  SCHEDULED: 'info',
  SUSPENDED: 'danger',
  BLOCKED: 'danger',
  REJECTED: 'danger',
  FAILED: 'danger',
  HIGH: 'danger',
  URGENT: 'danger',
  CRITICAL: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  OFFLINE: 'neutral',
  UNAVAILABLE: 'neutral',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'neutral',
  DRAFT: 'neutral',
  SKIPPED: 'neutral',
  PAUSED: 'neutral',
  PAST_DUE: 'danger',
};

const genericLabels: Record<string, string> = {
  ACTIVE: 'Ativo',
  APPROVED: 'Aprovado',
  VERIFIED: 'Verificado',
  PAID: 'Pago',
  CAPTURED: 'Capturado',
  ONLINE: 'Online',
  DONE: 'Concluída',
  PENDING: 'Pendente',
  OPEN: 'Aberta',
  BUSY: 'Ocupado',
  REQUIRES_ACTION: 'Aguardando ação',
  SENT: 'Enviado',
  UNDER_REVIEW: 'Em análise',
  IN_PROGRESS: 'Em andamento',
  PROCESSING: 'Processando',
  AUTHORIZED: 'Autorizado',
  SCHEDULED: 'Agendado',
  SUSPENDED: 'Suspenso',
  BLOCKED: 'Bloqueado',
  REJECTED: 'Recusado',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
  OFFLINE: 'Offline',
  UNAVAILABLE: 'Indisponível',
  REFUNDED: 'Reembolsado',
  PARTIALLY_REFUNDED: 'Reembolso parcial',
  DRAFT: 'Rascunho',
  SKIPPED: 'Pulada',
  PAUSED: 'Pausada',
  PAST_DUE: 'Em atraso',
  RESOLVED_CUSTOMER: 'A favor do cliente',
  RESOLVED_PROVIDER: 'A favor do profissional',
  RESOLVED_SPLIT: 'Dividida',
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
  CRITICAL: 'Crítica',
  INITIAL: 'Inicial',
  ADDITIONAL: 'Adicional',
  SUBSCRIPTION: 'Assinatura',
  CANCELLATION_FEE: 'Taxa de cancelamento',
};

/** Pill para enums genéricos (disponibilidade, pagamentos, disputas, prestadores). */
export function EnumPill({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>;
  return <Pill tone={genericTones[value] ?? 'neutral'}>{genericLabels[value] ?? value}</Pill>;
}

export function BoolPill({
  value,
  yes = 'Ativo',
  no = 'Inativo',
}: {
  value: boolean;
  yes?: string;
  no?: string;
}) {
  return <Pill tone={value ? 'success' : 'neutral'}>{value ? yes : no}</Pill>;
}
