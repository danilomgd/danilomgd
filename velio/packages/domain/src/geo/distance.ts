import type { LatLng } from '@velio/contracts';

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Caixa envolvente para pré-filtro em SQL (sem PostGIS). */
export function boundingBox(center: LatLng, radiusKm: number) {
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180) || 1e-6);
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

/** ETA simples por velocidade média urbana; a API pode substituir por provedor de rotas. */
export function estimateEtaMinutes(distanceKm: number, avgSpeedKmh = 22): number {
  if (distanceKm <= 0) return 0;
  return Math.max(2, Math.round((distanceKm / avgSpeedKmh) * 60 + 3));
}
