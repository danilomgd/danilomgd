'use client';

import { useState } from 'react';
import { cx } from '@/lib/format';

export interface Series {
  label: string;
  color: string;
  value: number;
}

/** Barras horizontais: rótulo, barra fina com ponta arredondada, valor em texto. A cor segue a entidade. */
export function HBarChart({
  series,
  format = (v) => String(v),
}: {
  series: Series[];
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...series.map((s) => s.value));
  const total = series.reduce((a, s) => a + s.value, 0);
  if (!series.length) return <Empty />;
  return (
    <div className="space-y-1.5">
      {series.map((s) => (
        <div
          key={s.label}
          className="group flex items-center gap-2 text-[12px]"
          title={`${s.label}: ${format(s.value)}${total ? ` (${Math.round((s.value / total) * 100)}%)` : ''}`}
        >
          <span className="w-28 shrink-0 truncate capitalize muted">{s.label}</span>
          <div className="relative h-3 flex-1 overflow-hidden rounded-[4px] bg-ink-100">
            <div
              className="h-full rounded-[4px] transition-[width]"
              style={{ width: `${(s.value / max) * 100}%`, background: s.color }}
            />
          </div>
          <span className="w-12 shrink-0 text-right font-medium tabular-nums">
            {format(s.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Colunas ao longo do tempo com tooltip por coluna. */
export function ColumnChart({
  series,
  color = '#7b68ee',
  height = 120,
}: {
  series: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((s) => s.value));
  if (!series.length) return <Empty />;
  const w = 100 / series.length;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Colunas por dia"
      >
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={0}
            x2={100}
            y1={height * (1 - p)}
            y2={height * (1 - p)}
            stroke="var(--border)"
            strokeWidth={0.3}
          />
        ))}
        {series.map((s, i) => {
          const h = (s.value / max) * (height - 8);
          return (
            <g key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * w} y={0} width={w} height={height} fill="transparent" />
              <rect
                x={i * w + w * 0.2}
                y={height - h}
                width={w * 0.6}
                height={h}
                rx={1}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.5}
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] muted">
        <span>{series[0].label}</span>
        <span>{series[Math.floor(series.length / 2)].label}</span>
        <span>{series[series.length - 1].label}</span>
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-1 rounded bg-ink-900 px-1.5 py-0.5 text-[11px] text-white"
          style={{ left: `${hover * w}%` }}
        >
          {series[hover].label}: <b>{series[hover].value}</b>
        </div>
      )}
    </div>
  );
}

/** Anel de proporção com legenda sempre presente (identidade nunca só pela cor). */
export function DonutChart({
  series,
  format = (v) => String(v),
}: {
  series: Series[];
  format?: (v: number) => string;
}) {
  const total = series.reduce((a, s) => a + s.value, 0);
  if (!total) return <Empty />;
  const r = 40;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 100 100"
        className="h-28 w-28 shrink-0"
        role="img"
        aria-label="Distribuição"
      >
        {series.map((s) => {
          const frac = s.value / total;
          const dash = frac * c;
          const el = (
            <circle
              key={s.label}
              cx={50}
              cy={50}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={12}
              strokeDasharray={`${Math.max(0, dash - 1.5)} ${c - dash + 1.5}`}
              strokeDashoffset={-acc * c + c / 4}
            />
          );
          acc += frac;
          return el;
        })}
        <text
          x={50}
          y={54}
          textAnchor="middle"
          className="fill-[var(--text)] text-[16px] font-semibold"
        >
          {format(total)}
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        {series.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-2 text-[12px]"
            title={`${s.label}: ${format(s.value)}`}
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="min-w-0 flex-1 truncate capitalize">{s.label}</span>
            <span className="tabular-nums muted">
              {format(s.value)} · {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatTile({
  value,
  label,
  tone,
  hint,
}: {
  value: string | number;
  label: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="flex h-full flex-col justify-center">
      <div className={cx('text-[30px] font-semibold leading-none tabular-nums', tone)}>{value}</div>
      <div className="mt-1 text-[12px] muted">{label}</div>
      {hint && <div className="text-[11px] muted">{hint}</div>}
    </div>
  );
}

function Empty() {
  return <div className="py-6 text-center text-[12px] muted">Sem dados para exibir.</div>;
}
