/** Sem importar módulos nativos: este arquivo é puro e testável em Node. */
const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export interface CardInput {
  /** Número completo. Nunca sai do aparelho: só o token vai à API. */
  number: string;
  holderName: string;
  expMonth: number;
  expYear: number;
  cvv: string;
}

export interface CardToken {
  gatewayToken: string;
  brand: string;
  last4: string;
}

export class CardValidationError extends Error {
  constructor(
    public readonly field: keyof CardInput,
    message: string,
  ) {
    super(message);
    this.name = 'CardValidationError';
  }
}

/** Luhn. */
export function isValidCardNumber(number: string): boolean {
  const d = number.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function detectBrand(number: string): string {
  const d = number.replace(/\D/g, '');
  if (/^4/.test(d)) return 'visa';
  if (/^5[1-5]/.test(d) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(d)) return 'mastercard';
  if (/^3[47]/.test(d)) return 'amex';
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011|506699)/.test(d)) return 'elo';
  if (/^(606282|3841)/.test(d)) return 'hipercard';
  return 'card';
}

export function validateCard(card: CardInput, now = new Date()): void {
  if (!isValidCardNumber(card.number)) throw new CardValidationError('number', 'Número do cartão inválido.');
  if (card.holderName.trim().length < 2)
    throw new CardValidationError('holderName', 'Informe o nome como está no cartão.');
  if (card.expMonth < 1 || card.expMonth > 12)
    throw new CardValidationError('expMonth', 'Mês de validade inválido.');
  const year = card.expYear < 100 ? 2000 + card.expYear : card.expYear;
  const expires = new Date(year, card.expMonth, 0, 23, 59, 59);
  if (expires < now) throw new CardValidationError('expYear', 'Cartão vencido.');
  if (!/^\d{3,4}$/.test(card.cvv)) throw new CardValidationError('cvv', 'Código de segurança inválido.');
}

/**
 * Tokeniza o cartão no aparelho (ADR-007). A API só recebe `gatewayToken`.
 *
 * - Desenvolvimento/sandbox: gera `tok_sandbox_<últimos4>`, que o `SandboxGateway` reconhece.
 * - Produção: deve chamar o SDK do provedor (Pagar.me v5: `POST https://api.pagar.me/core/v5/tokens?appId=<chave pública>`
 *   com `{ type: 'card', card: { number, holder_name, exp_month, exp_year, cvv } }`) e devolver `id` como token.
 *   Enquanto não houver chave pública configurada em produção, a função falha explicitamente em vez de
 *   enviar um token falso.
 */
export async function tokenizeCard(
  card: CardInput,
  opts: { sandbox?: boolean; tokenizer?: (c: CardInput) => Promise<string> } = {},
): Promise<CardToken> {
  validateCard(card);
  const digits = card.number.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  const brand = detectBrand(digits);
  const sandbox = opts.sandbox ?? IS_DEV;
  if (opts.tokenizer) return { gatewayToken: await opts.tokenizer(card), brand, last4 };
  if (sandbox) return { gatewayToken: `tok_sandbox_${last4}`, brand, last4 };
  throw new Error('Tokenização de cartão em produção exige o SDK do provedor (ver src/lib/payments.ts).');
}
