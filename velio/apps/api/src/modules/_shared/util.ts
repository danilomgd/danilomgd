import { randomBytes } from 'node:crypto';
import type { Db } from '../../db/client';

/** Executor de consultas: o banco ou uma transação aberta (PgTransaction estende PgDatabase). */
export type Exec = Db;

export const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
export const isoStrict = (d: Date): string => new Date(d).toISOString();

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '***';
  return `${phone.slice(0, 5)}***${phone.slice(-2)}`;
}

/** Código curto legível (sem 0/O/1/I) para custódia e referências. */
export function shortCode(len = 6, prefix = ''): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  return `${prefix}${out}`;
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

/** Hora local (0-23) em um fuso IANA, sem dependências. */
export function hourInTimezone(d: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    return h === 24 ? 0 : h;
  } catch {
    return d.getUTCHours();
  }
}

/** Constrói uma data local (fuso IANA) para o dia de `base` com hora/minuto dados. */
export function atLocalTime(base: Date, hour: number, minute: number, timeZone: string): Date {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(base).map((p) => [p.type, p.value]));
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? 0 : parts.hour),
    Number(parts.minute),
  );
  const offsetMs = localAsUtc - new Date(base).setUTCSeconds(0, 0);
  const target = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, minute);
  return new Date(target - offsetMs);
}

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}

/** Paginação por cursor em IDs uuid v7 (ordenáveis por tempo). */
export function page<T extends { id: string }>(rows: T[], limit: number): PageResult<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? last.id : null };
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
