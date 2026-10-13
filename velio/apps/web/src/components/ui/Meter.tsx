import s from './ui.module.css';

/** Barra fina de 0..1. Decorativa: o valor numérico deve aparecer ao lado. */
export function Meter({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={s.meter} title={label} aria-hidden="true">
      <div className={s.meterFill} style={{ width: `${pct}%` }} />
    </div>
  );
}
