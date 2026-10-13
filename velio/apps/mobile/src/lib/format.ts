/** Formatadores pt-BR usados nas telas. Puros, testáveis sem React Native. */

/** Normaliza telefone brasileiro para E.164 (+55DDDNÚMERO). Devolve null se inválido. */
export function normalizePhoneBR(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (national.length !== 10 && national.length !== 11) return null;
  return `+55${national}`;
}

/** Máscara visual (11) 98765-4321 enquanto o usuário digita. */
export function maskPhoneBR(input: string): string {
  const d = input.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCardNumber(input: string): string {
  return input.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function maskExpiry(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function maskCpfCnpj(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

export function maskPostalCode(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** "mm:ss" para contagens regressivas. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function secondsUntil(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((t - now) / 1000));
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Hoje, 14h–16h" / "Amanhã, 09h–10h" / "Qui 16/10, 14h". */
export function formatSchedule(startsAtIso: string | null | undefined, windowMinutes?: number | null, now = new Date()): string {
  if (!startsAtIso) return 'Agora';
  const start = new Date(startsAtIso);
  if (Number.isNaN(start.getTime())) return 'Agora';
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const day = sameDay(start, now)
    ? 'Hoje'
    : sameDay(start, tomorrow)
      ? 'Amanhã'
      : `${WEEKDAY_SHORT[start.getDay()]} ${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;
  const hour = (d: Date) => `${String(d.getHours()).padStart(2, '0')}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : ''}`;
  if (windowMinutes) {
    const end = new Date(start.getTime() + windowMinutes * 60_000);
    return `${day}, ${hour(start)}–${hour(end)}`;
  }
  return `${day}, ${hour(start)}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function weekdayName(i: number): string {
  return WEEKDAYS[i] ?? '';
}

export function minutesToClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "Chega em 12 min" a partir de `etaAt`. */
export function etaLabel(etaAt: string | null | undefined, now = Date.now()): string | null {
  if (!etaAt) return null;
  const t = new Date(etaAt).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.round((t - now) / 60_000);
  if (min <= 1) return 'Chegando agora';
  return `Chega em ${min} min`;
}

export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Saudação por hora do dia (a home usa a do servidor; esta cobre carregamento). */
export function greetingFor(hour: number): string {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function percent(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${Math.round(v * (v <= 1 ? 100 : 1))}%`;
}
