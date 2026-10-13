import type { ConciergePlanner } from '@velio/domain';

/** Porta de pagamentos (ADR-007). Valores em centavos. */
export interface PaymentGateway {
  readonly name: string;
  /** Cria cobrança PIX. Retorna QR e cópia-e-cola. */
  createPixCharge(input: { amountCents: number; referenceId: string; expiresInSeconds: number; customer: { userId: string; name: string | null } }): Promise<{
    gatewayRef: string;
    qrCode: string;
    copyPaste: string;
    expiresAt: Date;
  }>;
  /** Pré-autoriza no cartão tokenizado (captura depois). */
  authorizeCard(input: { amountCents: number; referenceId: string; cardToken: string; customer: { userId: string; name: string | null } }): Promise<
    { ok: true; gatewayRef: string } | { ok: false; code: string; message: string }
  >;
  /** Captura total ou parcial de uma autorização. */
  capture(input: { gatewayRef: string; amountCents: number }): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  cancelAuthorization(input: { gatewayRef: string }): Promise<void>;
  refund(input: { gatewayRef: string; amountCents: number }): Promise<{ ok: true; refundRef: string } | { ok: false; code: string; message: string }>;
  /** Tokeniza no servidor APENAS em sandbox/teste. Em produção o app tokeniza no SDK do provedor. */
  tokenizeForTests?(card: { number: string; holder: string; expMonth: number; expYear: number }): Promise<{ token: string; brand: string; last4: string }>;
  /** Verifica assinatura e normaliza webhook. */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<{ externalId: string; eventType: string; gatewayRef: string; status: 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED' | 'OTHER'; amountCents?: number } | null>;
}

export interface SmsSender {
  readonly name: string;
  send(to: string, body: string): Promise<void>;
}

export interface PushSender {
  readonly name: string;
  send(tokens: string[], message: { title: string; body: string; data?: Record<string, unknown> }): Promise<{ sent: number; invalidTokens: string[] }>;
}

export interface Clock {
  now(): Date;
}

export interface Adapters {
  payments: PaymentGateway;
  sms: SmsSender;
  push: PushSender;
  planner: ConciergePlanner;
  clock: Clock;
}
