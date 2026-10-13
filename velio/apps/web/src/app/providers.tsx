'use client';

import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/lib/auth';
import { QueryProvider } from '@/lib/query';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
