import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AccessTokenClaims } from '@velio/contracts';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** JWT HS256 mínimo e auditável, sem dependência externa. */
export function signJwt(
  claims: Record<string, unknown>,
  secret: string,
  ttlSeconds: number,
  now = Date.now(),
): string {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(now / 1000);
  const payload = b64u(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyJwt(
  token: string,
  secret: string,
  now = Date.now(),
): (AccessTokenClaims & { exp: number; iat: number }) | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
    const claims = AccessTokenClaims.safeParse(payload);
    if (!claims.success) return null;
    return { ...claims.data, exp: payload.exp, iat: Number(payload.iat ?? 0) };
  } catch {
    return null;
  }
}

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** HMAC-SHA256 em hex. Para dados pessoais (ex.: CPF/CNPJ) passe uma chave secreta do ambiente. */
export function sha256(input: string, key = 'velio-hash'): string {
  return createHmac('sha256', key).update(input).digest('hex');
}
