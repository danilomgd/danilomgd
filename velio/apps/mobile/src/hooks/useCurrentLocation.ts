import type { LatLng } from '@velio/contracts';
import { useEffect, useState } from 'react';
import { getCurrentPosition, requestForegroundLocation } from '@/lib/location';

/** Posição atual do aparelho (uma leitura). `null` sem permissão; `undefined` enquanto resolve. */
export function useCurrentLocation(ask = true): LatLng | null | undefined {
  const [pos, setPos] = useState<LatLng | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    (async () => {
      if (ask) await requestForegroundLocation();
      const p = await getCurrentPosition();
      if (active) setPos(p);
    })().catch(() => active && setPos(null));
    return () => {
      active = false;
    };
  }, [ask]);
  return pos;
}
