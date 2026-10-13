import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  pwd: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
/** scrypt exige 128·N·r bytes (33,5 MB com estes parâmetros); o padrão do Node é 32 MB. */
const maxmem = (N: number, r: number) => 128 * N * r * 2;

/** scrypt do Node (sem dependência nativa). Formato: scrypt$N$r$p$salt$hash (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { ...PARAMS, maxmem: maxmem(PARAMS.N, PARAMS.r) });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scrypt(password, salt, expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: maxmem(Number(N), Number(r)),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
