'use client';

import type { ServiceOrder } from '@velio/contracts';
import { lightTheme, statusTone } from '@velio/ui';
import L from 'leaflet';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { StatusPill } from '@/components/ui';
import { shortId } from '@/lib/format';

export interface MapProvider {
  id: string;
  displayName: string;
  availability: string;
  lat: number;
  lng: number;
}

export interface OpsMapProps {
  orders: ServiceOrder[];
  providers: MapProvider[];
  focusOrderId?: string | null;
}

const toneColor: Record<string, string> = {
  neutral: lightTheme.textMuted,
  info: lightTheme.info,
  primary: lightTheme.primary,
  success: lightTheme.success,
  warning: lightTheme.warning,
  danger: lightTheme.danger,
};

const SAO_PAULO: [number, number] = [-23.55, -46.63];

function FitBounds({ points, focus }: { points: Array<[number, number]>; focus: [number, number] | null }) {
  const map = useMap();
  const key = points.length;
  useEffect(() => {
    if (focus) {
      map.flyTo(focus, Math.max(map.getZoom(), 14), { duration: 0.6 });
      return;
    }
    if (key === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.2), { maxZoom: 14, animate: false });
    // Reajusta só quando a quantidade de pontos muda, para não brigar com o operador.
  }, [map, key, focus, points]);
  return null;
}

function providerIcon(availability: string) {
  const cls = availability === 'ONLINE' ? 'online' : availability === 'BUSY' ? 'busy' : 'other';
  return L.divIcon({
    className: '',
    html: `<span class="velio-provider-marker ${cls}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function OpsMap({ orders, providers, focusOrderId }: OpsMapProps) {
  const located = useMemo(() => orders.filter((o) => o.address), [orders]);
  const points = useMemo<Array<[number, number]>>(() => {
    const pts: Array<[number, number]> = located.map((o) => [o.address?.lat ?? 0, o.address?.lng ?? 0]);
    for (const p of providers) pts.push([p.lat, p.lng]);
    return pts;
  }, [located, providers]);
  const focus = useMemo<[number, number] | null>(() => {
    const o = focusOrderId ? located.find((x) => x.id === focusOrderId) : null;
    return o?.address ? [o.address.lat, o.address.lng] : null;
  }, [focusOrderId, located]);

  return (
    <MapContainer
      center={SAO_PAULO}
      zoom={11}
      style={{ width: '100%', height: '100%' }}
      zoomControl
      attributionControl
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} focus={focus} />
      {providers.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={providerIcon(p.availability)}>
          <Popup>
            <strong>{p.displayName}</strong>
            <div className="muted">
              {p.availability === 'ONLINE'
                ? 'Online'
                : p.availability === 'BUSY'
                  ? 'Ocupado'
                  : p.availability}
            </div>
          </Popup>
        </Marker>
      ))}
      {located.map((o) => {
        const color = toneColor[statusTone[o.status] ?? 'neutral'] ?? lightTheme.textMuted;
        const highlighted = o.id === focusOrderId;
        return (
          <CircleMarker
            key={o.id}
            center={[o.address?.lat ?? 0, o.address?.lng ?? 0]}
            radius={highlighted ? 11 : 8}
            pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 }}
          >
            <Popup>
              <div className="stack-sm">
                <div className="row-between">
                  <strong>{o.serviceName}</strong>
                  <span className="mono muted">#{shortId(o.id)}</span>
                </div>
                <StatusPill status={o.status} />
                <div className="muted">{o.address?.summary}</div>
                <div>
                  {o.provider ? o.provider.displayName : <span className="muted">Sem profissional</span>}
                </div>
                <Link href={`/ops/orders/${o.id}`}>Abrir pedido</Link>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
