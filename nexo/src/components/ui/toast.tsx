'use client';

import { useEffect, useState } from 'react';

type Toast = { id: number; text: string; kind: 'info' | 'error' | 'success' };
let listeners: ((t: Toast) => void)[] = [];
let seq = 0;

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: ++seq, text, kind };
  for (const l of listeners) l(t);
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const l = (t: Toast) => {
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);
  if (!items.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`animate-fade-in rounded-md px-3 py-2 text-sm shadow-pop ${t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'success' ? 'bg-emerald-600 text-white' : 'bg-ink-900 text-white'}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
