import { useEffect, useState } from 'react';
import { secondsUntil } from '@/lib/format';

/** Segundos restantes até `expiresAt`, atualizado a cada segundo. 0 quando expirado. */
export function useCountdown(expiresAt: string | null | undefined): number {
  const [remaining, setRemaining] = useState(() => secondsUntil(expiresAt));
  useEffect(() => {
    setRemaining(secondsUntil(expiresAt));
    if (!expiresAt) return;
    const id = setInterval(() => {
      const s = secondsUntil(expiresAt);
      setRemaining(s);
      if (s <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}
