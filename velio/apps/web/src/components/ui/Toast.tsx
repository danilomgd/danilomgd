'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import s from './Overlay.module.css';

type ToastTone = 'neutral' | 'success' | 'error' | 'warning';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = 'neutral') => {
    const id = ++seq.current;
    setItems((prev) => [...prev.slice(-1), { id, tone, message }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (m) => toast(m, 'success'),
      error: (m) => toast(m, 'error'),
    }),
    [toast],
  );

  const toneClass: Record<ToastTone, string> = {
    neutral: s.toastNeutral ?? '',
    success: s.toastSuccess ?? '',
    error: s.toastError ?? '',
    warning: s.toastWarning ?? '',
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={s.toasts} aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <output key={t.id} className={[s.toast, toneClass[t.tone]].join(' ')}>
            <span className={s.toastDot} aria-hidden />
            <span>{t.message}</span>
          </output>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa de ToastProvider');
  return ctx;
}
