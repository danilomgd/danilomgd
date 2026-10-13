import { ORDER_STATUS_LABELS, type OrderStatus, formatBRL } from '@velio/contracts';

export { formatBRL };

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const timeOnly = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTime.format(d);
}
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : timeOnly.format(d);
}
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateOnly.format(d);
}

/** "há 11 min", "há 2 h". */
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.round((t - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return relative.format(diffSec, 'second');
  if (abs < 3600) return relative.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(diffSec / 3600), 'hour');
  return relative.format(Math.round(diffSec / 86400), 'day');
}

/** Minutos de espera desde `iso`. */
export function minutesSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / 60000));
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m} min ${rest} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`;
}

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

export function fmtKm(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

export function fmtRating(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Sem nota';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function statusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus]?.label ?? status;
}

/** Código curto da ordem para leitura humana: últimos 6 caracteres do UUID. */
export function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

/** bps (10000 = 100%) → "12,5%". */
export function fmtBps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '—';
  return fmtPct(bps / 100, 2);
}

/** Converte string de reais ("150,00") em centavos inteiros. */
export function parseBRL(input: string): number | null {
  const clean = input.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}
