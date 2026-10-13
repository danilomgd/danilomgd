import type { LocationPing } from '@velio/contracts';

/** Buffer de pings de GPS com descarte de ruído e limite do contrato (60 por lote). */
export class LocationBatch {
  private pings: LocationPing[] = [];
  constructor(private readonly max = 60) {}

  get size() {
    return this.pings.length;
  }

  /** Ignora leituras piores que 100 m e repetidas (< 5 m, mesmo intervalo). */
  push(p: LocationPing): boolean {
    if (p.accuracyM != null && p.accuracyM > 100) return false;
    const last = this.pings[this.pings.length - 1];
    if (last && Math.abs(last.lat - p.lat) < 0.00004 && Math.abs(last.lng - p.lng) < 0.00004) {
      // atualiza o horário do último ponto em vez de acumular duplicatas
      this.pings[this.pings.length - 1] = { ...last, recordedAt: p.recordedAt };
      return false;
    }
    this.pings.push(p);
    if (this.pings.length > this.max) this.pings.splice(0, this.pings.length - this.max);
    return true;
  }

  drain(): LocationPing[] {
    const out = this.pings;
    this.pings = [];
    return out;
  }

  peek(): LocationPing | null {
    return this.pings[this.pings.length - 1] ?? null;
  }
}
