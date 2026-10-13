'use client';

import type { RealtimeEventName, RealtimePayload } from '@velio/contracts';
import { useEffect, useRef, useState } from 'react';
import { getRealtime } from './api';

export type RealtimeStatus = 'connecting' | 'live' | 'polling';

type Handlers = { [K in RealtimeEventName]?: (p: RealtimePayload<K>) => void };

/**
 * Conecta ao Socket.IO e registra handlers. Devolve o estado da conexão para a UI
 * decidir entre "ao vivo" e "atualizando por polling".
 */
export function useRealtime(handlers: Handlers, enabled = true): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const offs: Array<() => void> = [];
    const rt = getRealtime();
    rt.connect()
      .then((socket) => {
        if (disposed) return;
        const update = () => setStatus(socket.connected ? 'live' : 'polling');
        socket.on('connect', update);
        socket.on('disconnect', update);
        socket.on('connect_error', () => setStatus('polling'));
        update();
        for (const name of Object.keys(handlersRef.current) as RealtimeEventName[]) {
          offs.push(
            rt.on(name, (payload) => {
              const h = handlersRef.current[name] as ((p: unknown) => void) | undefined;
              h?.(payload);
            }),
          );
        }
        offs.push(() => {
          socket.off('connect', update);
          socket.off('disconnect', update);
        });
      })
      .catch(() => setStatus('polling'));
    return () => {
      disposed = true;
      for (const off of offs) off();
    };
    // handlers são lidos via ref; só reconecta se `enabled` mudar.
  }, [enabled]);

  return status;
}
