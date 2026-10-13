import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isSameYear,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function fmtDate(v: string | Date | null | undefined, withTime = false) {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (isToday(d)) return withTime ? `Hoje ${format(d, 'HH:mm')}` : 'Hoje';
  if (isTomorrow(d)) return 'Amanhã';
  if (isYesterday(d)) return 'Ontem';
  return format(d, isSameYear(d, new Date()) ? 'd MMM' : 'd MMM yyyy', { locale: ptBR });
}

export function fmtDateLong(v: string | Date | null | undefined) {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  return format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function fmtDateTime(v: string | Date | null | undefined) {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  return format(d, "d MMM yyyy 'às' HH:mm", { locale: ptBR });
}

export function fmtAgo(v: string | Date) {
  const d = typeof v === 'string' ? new Date(v) : v;
  return formatDistanceToNowStrict(d, { locale: ptBR, addSuffix: true });
}

export function dueClass(v: string | null | undefined, closed = false) {
  if (!v || closed) return 'muted';
  const diff = differenceInCalendarDays(new Date(v), new Date());
  if (diff < 0) return 'text-red-600 font-medium';
  if (diff === 0) return 'text-amber-600 font-medium';
  return 'muted';
}

export function fmtDuration(ms: number | null | undefined) {
  if (!ms) return '0m';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let ms = 0;
  const re = /(\d+(?:[.,]\d+)?)\s*(h|m|d)?/g;
  let matched = false;
  for (const mt of t.matchAll(re)) {
    matched = true;
    const n = Number.parseFloat(mt[1].replace(',', '.'));
    const unit = mt[2] ?? 'h';
    ms += unit === 'd' ? n * 8 * 3600_000 : unit === 'h' ? n * 3600_000 : n * 60_000;
  }
  return matched ? Math.round(ms) : null;
}

export function fmtMoney(v: number | null | undefined, currency = 'BRL') {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v);
}

export function toInputDate(v: string | Date | null | undefined) {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  return format(d, 'yyyy-MM-dd');
}

export function toInputDateTime(v: string | Date | null | undefined) {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}
