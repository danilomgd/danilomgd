import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentGateway } from './ports';

/**
 * Adaptador real para a API v5 da Pagar.me (orders/charges). Exige PAGARME_SECRET_KEY.
 * Não há testes automatizados contra o provedor nesta base; validar em sandbox do provedor
 * antes de produção (ver 13_PAYMENT_ARCHITECTURE.md).
 */
export class PagarmeGateway implements PaymentGateway {
  readonly name = 'pagarme';
  private readonly base = 'https://api.pagar.me/core/v5';

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers() {
    return {
      Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private async call<T>(path: string, method: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, { method, headers: this.headers(), body: body ? JSON.stringify(body) : undefined });
    const json = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new Error(`pagarme ${method} ${path} → ${res.status} ${json.message ?? ''}`);
    return json;
  }

  async createPixCharge(i: { amountCents: number; referenceId: string; expiresInSeconds: number; customer: { userId: string; name: string | null } }) {
    const r = await this.call<{ id: string; charges: Array<{ id: string; last_transaction: { qr_code: string; qr_code_url: string; expires_at: string } }> }>('/orders', 'POST', {
      code: i.referenceId,
      customer: { name: i.customer.name ?? 'Cliente VÉLIO', code: i.customer.userId },
      items: [{ amount: i.amountCents, description: 'Serviço VÉLIO', quantity: 1, code: i.referenceId }],
      payments: [{ payment_method: 'pix', pix: { expires_in: i.expiresInSeconds } }],
    });
    const ch = r.charges[0];
    if (!ch) throw new Error('pagarme: pedido sem charge');
    return { gatewayRef: ch.id, qrCode: ch.last_transaction.qr_code, copyPaste: ch.last_transaction.qr_code, expiresAt: new Date(ch.last_transaction.expires_at) };
  }

  async authorizeCard(i: { amountCents: number; referenceId: string; cardToken: string; customer: { userId: string; name: string | null } }) {
    try {
      const r = await this.call<{ charges: Array<{ id: string; status: string; last_transaction?: { acquirer_message?: string; acquirer_return_code?: string } }> }>('/orders', 'POST', {
        code: i.referenceId,
        customer: { name: i.customer.name ?? 'Cliente VÉLIO', code: i.customer.userId },
        items: [{ amount: i.amountCents, description: 'Serviço VÉLIO', quantity: 1, code: i.referenceId }],
        payments: [{ payment_method: 'credit_card', credit_card: { operation_type: 'auth_only', installments: 1, card_token: i.cardToken } }],
      });
      const ch = r.charges[0];
      if (!ch) return { ok: false as const, code: 'no_charge', message: 'Sem cobrança retornada' };
      if (ch.status !== 'authorized_pending_capture' && ch.status !== 'paid') {
        return { ok: false as const, code: ch.last_transaction?.acquirer_return_code ?? ch.status, message: ch.last_transaction?.acquirer_message ?? 'Autorização recusada' };
      }
      return { ok: true as const, gatewayRef: ch.id };
    } catch (e) {
      return { ok: false as const, code: 'gateway_error', message: String((e as Error).message) };
    }
  }

  async capture(i: { gatewayRef: string; amountCents: number }) {
    try {
      await this.call(`/charges/${i.gatewayRef}/capture`, 'POST', { amount: i.amountCents });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, code: 'capture_failed', message: String((e as Error).message) };
    }
  }

  async cancelAuthorization(i: { gatewayRef: string }) {
    await this.call(`/charges/${i.gatewayRef}`, 'DELETE');
  }

  async refund(i: { gatewayRef: string; amountCents: number }) {
    try {
      const r = await this.call<{ id: string }>(`/charges/${i.gatewayRef}`, 'DELETE', { amount: i.amountCents });
      return { ok: true as const, refundRef: r.id };
    } catch (e) {
      return { ok: false as const, code: 'refund_failed', message: String((e as Error).message) };
    }
  }

  async parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>) {
    if (this.webhookSecret) {
      const sigHeader = headers['x-hub-signature'];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      if (!sig) return null;
      const expected = `sha256=${createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')}`;
      const a = Buffer.from(expected);
      const b = Buffer.from(sig);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    }
    try {
      const body = JSON.parse(rawBody) as { id: string; type: string; data: { id: string; status: string; amount?: number } };
      const map: Record<string, 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED' | 'OTHER'> = {
        'charge.paid': 'PAID',
        'charge.payment_failed': 'FAILED',
        'charge.refunded': 'REFUNDED',
        'charge.pending': 'OTHER',
      };
      return { externalId: body.id, eventType: body.type, gatewayRef: body.data.id, status: map[body.type] ?? 'OTHER', amountCents: body.data.amount };
    } catch {
      return null;
    }
  }
}
