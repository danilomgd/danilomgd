import { describe, expect, it } from 'vitest';
import { CardValidationError, detectBrand, isValidCardNumber, tokenizeCard } from './payments';

const card = {
  number: '4111 1111 1111 1111',
  holderName: 'ANA SILVA',
  expMonth: 12,
  expYear: 2031,
  cvv: '123',
};

describe('tokenizeCard', () => {
  it('gera token sandbox com os últimos 4 dígitos e nunca o número completo', async () => {
    const t = await tokenizeCard(card, { sandbox: true });
    expect(t).toEqual({ gatewayToken: 'tok_sandbox_1111', brand: 'visa', last4: '1111' });
    expect(JSON.stringify(t)).not.toContain('4111 1111');
  });
  it('usa o tokenizador do provedor quando informado', async () => {
    const t = await tokenizeCard(card, { tokenizer: async () => 'tok_live_abc' });
    expect(t.gatewayToken).toBe('tok_live_abc');
  });
  it('recusa produção sem SDK do provedor', async () => {
    await expect(tokenizeCard(card, { sandbox: false })).rejects.toThrow(/SDK do provedor/);
  });
  it('valida número (Luhn), validade e CVV', async () => {
    await expect(
      tokenizeCard({ ...card, number: '4111 1111 1111 1112' }, { sandbox: true }),
    ).rejects.toBeInstanceOf(CardValidationError);
    await expect(tokenizeCard({ ...card, expYear: 2020 }, { sandbox: true })).rejects.toMatchObject({
      field: 'expYear',
    });
    await expect(tokenizeCard({ ...card, cvv: '1' }, { sandbox: true })).rejects.toMatchObject({
      field: 'cvv',
    });
    expect(isValidCardNumber('5555 5555 5555 4444')).toBe(true);
    expect(detectBrand('5555555555554444')).toBe('mastercard');
    expect(detectBrand('378282246310005')).toBe('amex');
  });
});
