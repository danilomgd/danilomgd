'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Icons } from './icons';
import { pageTitleFor } from './Sidebar';
import s from './shell.module.css';

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const src = (name ?? email ?? '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function Header() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();
  const router = useRouter();
  return (
    <header className={s.header}>
      <span className={s.headerTitle}>{pageTitleFor(pathname)}</span>
      <div className={s.user}>
        <span className={s.avatar} aria-hidden>
          {initials(user?.name, user?.email)}
        </span>
        <div>
          <div className={s.userName}>{user?.name ?? user?.email ?? 'Usuário'}</div>
          <div className={s.userRole}>{isAdmin ? 'Administrador' : 'Operador'}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Icons.logout width={16} height={16} />}
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          Sair
        </Button>
      </div>
    </header>
  );
}
