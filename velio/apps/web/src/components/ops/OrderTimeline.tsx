import { ORDER_STATUS_LABELS, type OrderEvent } from '@velio/contracts';
import { fmtDate, fmtTime } from '@/lib/format';
import s from './ops.module.css';

const ACTOR_LABELS: Record<string, string> = {
  customer: 'cliente',
  provider: 'profissional',
  operator: 'operação',
  system: 'sistema',
};

function describe(ev: OrderEvent): { label: string; desc: string | null } {
  if (ev.toStatus) {
    const lbl = ORDER_STATUS_LABELS[ev.toStatus];
    return { label: lbl?.label ?? ev.toStatus, desc: lbl?.customer ?? null };
  }
  const payloadMsg = typeof ev.payload.message === 'string' ? ev.payload.message : null;
  const payloadReason = typeof ev.payload.reason === 'string' ? ev.payload.reason : null;
  return { label: ev.type.replace(/[._]/g, ' '), desc: payloadMsg ?? payloadReason };
}

export function OrderTimeline({ events, currentStatus }: { events: OrderEvent[]; currentStatus: string }) {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  if (sorted.length === 0) return <p className="muted small">Sem eventos registrados.</p>;
  return (
    <ol className={s.timeline} aria-label="Linha do tempo do pedido">
      {sorted.map((ev, i) => {
        const { label, desc } = describe(ev);
        const isCurrent = i === sorted.length - 1 && ev.toStatus === currentStatus;
        const reason = typeof ev.payload.reason === 'string' && ev.toStatus ? ev.payload.reason : null;
        return (
          <li key={ev.id} className={s.tlItem}>
            <div className={s.tlTime}>
              <div>{fmtTime(ev.createdAt)}</div>
              <div style={{ fontSize: 11 }}>{fmtDate(ev.createdAt)}</div>
            </div>
            <div className={s.tlRail}>
              <span
                className={[s.tlDot, isCurrent ? s.tlDotCurrent : ev.toStatus ? s.tlDotDone : ''].join(' ')}
                aria-hidden
              />
            </div>
            <div className={s.tlBody}>
              <div className={s.tlLabel}>
                {label}
                <span className="caption" style={{ marginLeft: 8 }}>
                  {ACTOR_LABELS[ev.actorType] ?? ev.actorType}
                  {ev.action ? ` · ${ev.action}` : ''}
                </span>
              </div>
              {desc ? <div className={s.tlDesc}>{desc}</div> : null}
              {reason ? <div className={s.tlDesc}>Motivo: {reason}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
