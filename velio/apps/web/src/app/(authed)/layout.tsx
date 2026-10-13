'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/shell/AuthGuard';
import { Header } from '@/components/shell/Header';
import { MobileNav, Sidebar } from '@/components/shell/Sidebar';
import s from '@/components/shell/shell.module.css';

export default function AuthedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className={s.shell}>
        <Sidebar />
        <div className={s.main}>
          <Header />
          <MobileNav />
          <main className={s.content}>{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
