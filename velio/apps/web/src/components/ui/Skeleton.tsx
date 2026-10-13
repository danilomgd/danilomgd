import s from './ui.module.css';

export function Skeleton({
  width = '100%',
  height = 14,
  radius,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}) {
  return (
    <span
      className={[s.skeleton, className ?? ''].join(' ')}
      style={{ display: 'block', width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}

export function SkeletonRows({ rows = 6, height = 44 }: { rows?: number; height?: number }) {
  const items = Array.from({ length: rows }, (_, i) => `row-${i}`);
  return (
    <div className="stack-sm" role="status" aria-busy aria-label="Carregando">
      {items.map((k) => (
        <Skeleton key={k} height={height} radius="var(--radius-md)" />
      ))}
    </div>
  );
}

export function SkeletonTiles({ count = 4 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, i) => `tile-${i}`);
  return (
    <div className="grid-tiles" role="status" aria-busy aria-label="Carregando">
      {items.map((k) => (
        <Skeleton key={k} height={92} radius="var(--radius-lg)" />
      ))}
    </div>
  );
}
