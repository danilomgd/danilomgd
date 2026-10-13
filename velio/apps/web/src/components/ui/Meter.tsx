import s from './ui.module.css';

/** Barra fina de 0..1. */
export function Meter({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={s.meter}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div className={s.meterFill} style={{ width: `${pct}%` }} />
    </div>
  );
}
