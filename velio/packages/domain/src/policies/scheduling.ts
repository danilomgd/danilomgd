/** Instantes de lembrete para um agendamento: 24 h e 1 h antes, só os que ainda estão no futuro. */
export function reminderTimes(scheduledFor: Date, now: Date): Date[] {
  const out: Date[] = [];
  for (const h of [24, 1]) {
    const t = new Date(scheduledFor.getTime() - h * 3600_000);
    if (t.getTime() > now.getTime()) out.push(t);
  }
  return out;
}

/** Quando iniciar o matching de um agendado: imediatamente se faltar < 6 h; senão 6 h antes. */
export function scheduledMatchingStart(scheduledFor: Date, now: Date): Date {
  const sixHoursBefore = new Date(scheduledFor.getTime() - 6 * 3600_000);
  return sixHoursBefore.getTime() <= now.getTime() ? now : sixHoursBefore;
}

/** Próxima visita de assinatura. */
export function nextVisitDue(
  lastVisitAt: Date | null,
  startedAt: Date,
  intervalMonths: number,
  visitsPerCycle: number,
): Date {
  const base = lastVisitAt ?? startedAt;
  const monthsPerVisit = intervalMonths / visitsPerCycle;
  const d = new Date(base);
  const whole = Math.floor(monthsPerVisit);
  d.setMonth(d.getMonth() + whole);
  const frac = monthsPerVisit - whole;
  if (frac > 0) d.setDate(d.getDate() + Math.round(frac * 30));
  return d;
}

/** Equipamento precisa de manutenção? */
export function maintenanceDue(
  lastMaintenanceAt: Date | null,
  intervalMonths: number,
  now: Date,
): { due: boolean; dueAt: Date | null; overdueDays: number } {
  if (!lastMaintenanceAt) return { due: true, dueAt: null, overdueDays: 0 };
  const dueAt = new Date(lastMaintenanceAt);
  dueAt.setMonth(dueAt.getMonth() + intervalMonths);
  const overdueDays = Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000);
  return { due: overdueDays >= 0, dueAt, overdueDays: Math.max(0, overdueDays) };
}

/** Gera PIN numérico de 4 dígitos a partir de bytes aleatórios fornecidos pela API (sem Math.random no domínio). */
export function pinFromBytes(bytes: Uint8Array): string {
  let n = 0;
  for (const b of bytes.slice(0, 4)) n = (n * 256 + b) % 10000;
  return n.toString().padStart(4, '0');
}
