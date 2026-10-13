import { randomUUID } from 'node:crypto';
import type { Clock, PaymentGateway, PushSender, SmsSender } from './ports';

/**
 * Gateway determinístico para dev/test. Nunca em produção (config.ts recusa).
 * Convenções: token terminado em "0002" é recusado na autorização; "0004" falha na captura;
 * PIX é pago quando o teste chama `settlePix(gatewayRef)` ou via webhook simulado.
 */
export class SandboxGateway implements PaymentGateway {
  readonly name = 'sandbox';
  readonly authorizations = new Map<
    string,
    { amountCents: number; captured: number; cancelled: boolean; refunded: number }
  >();
  readonly pixCharges = new Map<string, { amountCents: number; paid: boolean; expiresAt: Date }>();

  async createPixCharge(i: { amountCents: number; referenceId: string; expiresInSeconds: number }) {
    const gatewayRef = `pix_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + i.expiresInSeconds * 1000);
    this.pixCharges.set(gatewayRef, { amountCents: i.amountCents, paid: false, expiresAt });
    return {
      gatewayRef,
      qrCode: `00020126sandbox${gatewayRef}5204000053039865406${(i.amountCents / 100).toFixed(2)}5802BR`,
      copyPaste: `sandbox-pix-${gatewayRef}`,
      expiresAt,
    };
  }

  async authorizeCard(i: { amountCents: number; cardToken: string }) {
    if (i.cardToken.endsWith('0002'))
      return { ok: false as const, code: 'card_declined', message: 'Cartão recusado pelo emissor' };
    if (i.cardToken.endsWith('0009'))
      return { ok: false as const, code: 'insufficient_funds', message: 'Saldo insuficiente' };
    const gatewayRef = `auth_${randomUUID()}${i.cardToken.endsWith('0004') ? '_capfail' : ''}`;
    this.authorizations.set(gatewayRef, {
      amountCents: i.amountCents,
      captured: 0,
      cancelled: false,
      refunded: 0,
    });
    return { ok: true as const, gatewayRef };
  }

  async capture(i: { gatewayRef: string; amountCents: number }) {
    const a = this.authorizations.get(i.gatewayRef);
    if (!a || a.cancelled)
      return {
        ok: false as const,
        code: 'authorization_not_found',
        message: 'Autorização inexistente ou cancelada',
      };
    if (i.gatewayRef.endsWith('_capfail'))
      return { ok: false as const, code: 'capture_failed', message: 'Falha na captura' };
    a.captured += i.amountCents;
    return { ok: true as const };
  }

  async cancelAuthorization(i: { gatewayRef: string }) {
    const a = this.authorizations.get(i.gatewayRef);
    if (a) a.cancelled = true;
  }

  async refund(i: { gatewayRef: string; amountCents: number }) {
    const a = this.authorizations.get(i.gatewayRef);
    const p = this.pixCharges.get(i.gatewayRef);
    if (a) a.refunded += i.amountCents;
    else if (!p) return { ok: false as const, code: 'not_found', message: 'Cobrança não encontrada' };
    return { ok: true as const, refundRef: `rf_${randomUUID()}` };
  }

  async tokenizeForTests(card: { number: string; holder: string }) {
    const last4 = card.number.slice(-4);
    return {
      token: `tok_sandbox_${last4}`,
      brand: card.number.startsWith('4') ? 'visa' : 'mastercard',
      last4,
    };
  }

  /** Simula confirmação do PIX; devolve o payload que o webhook entregaria. */
  settlePix(gatewayRef: string): string {
    const p = this.pixCharges.get(gatewayRef);
    if (p) p.paid = true;
    return JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: 'charge.paid',
      data: { id: gatewayRef, status: 'paid', amount: p?.amountCents ?? 0 },
    });
  }

  async parseWebhook(rawBody: string) {
    try {
      const b = JSON.parse(rawBody) as {
        id: string;
        type: string;
        data: { id: string; status: string; amount?: number };
      };
      const status =
        b.data.status === 'paid'
          ? 'PAID'
          : b.data.status === 'failed'
            ? 'FAILED'
            : b.data.status === 'refunded'
              ? 'REFUNDED'
              : b.data.status === 'expired'
                ? 'EXPIRED'
                : 'OTHER';
      return {
        externalId: b.id,
        eventType: b.type,
        gatewayRef: b.data.id,
        status: status as 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED' | 'OTHER',
        amountCents: b.data.amount,
      };
    } catch {
      return null;
    }
  }
}

export class LogSmsSender implements SmsSender {
  readonly name = 'log';
  readonly sent: Array<{ to: string; body: string }> = [];
  constructor(private readonly log: { info: (o: unknown, msg?: string) => void }) {}
  async send(to: string, body: string) {
    this.sent.push({ to, body });
    this.log.info({ to: `${to.slice(0, 6)}***` }, `[sms:log] ${body.replace(/\d{6}/, '******')}`);
  }
}

export class MemoryPushSender implements PushSender {
  readonly name = 'memory';
  readonly sent: Array<{ tokens: string[]; title: string; body: string; data?: Record<string, unknown> }> =
    [];
  async send(tokens: string[], message: { title: string; body: string; data?: Record<string, unknown> }) {
    this.sent.push({ tokens, ...message });
    return { sent: tokens.length, invalidTokens: [] };
  }
}

export class SystemClock implements Clock {
  now() {
    return new Date();
  }
}

/** Relógio controlável para testes de agenda, lembretes e expiração de ofertas. */
export class FakeClock implements Clock {
  constructor(private current: Date) {}
  now() {
    return new Date(this.current);
  }
  set(d: Date) {
    this.current = new Date(d);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
    return this.now();
  }
}
