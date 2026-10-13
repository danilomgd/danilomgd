'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { type IconName, Icons } from './icons';
import s from './shell.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
}

export const OPS_NAV: NavItem[] = [
  { href: '/ops', label: 'Mapa ao vivo', icon: 'map', exact: true },
  { href: '/ops/orders', label: 'Pedidos', icon: 'list' },
  { href: '/ops/incidents', label: 'Incidentes', icon: 'alert' },
  { href: '/ops/disputes', label: 'Disputas', icon: 'scale' },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Visão geral', icon: 'chart', exact: true },
  { href: '/admin/categories', label: 'Categorias', icon: 'grid' },
  { href: '/admin/services', label: 'Serviços', icon: 'wrench' },
  { href: '/admin/regions', label: 'Regiões', icon: 'pin' },
  { href: '/admin/pricing', label: 'Preços', icon: 'tag' },
  { href: '/admin/commission', label: 'Comissão', icon: 'percent' },
  { href: '/admin/matching', label: 'Matching', icon: 'sliders' },
  { href: '/admin/coupons', label: 'Cupons', icon: 'ticket' },
  { href: '/admin/plans', label: 'Planos', icon: 'repeat' },
  { href: '/admin/home', label: 'Home do app', icon: 'home' },
  { href: '/admin/banners', label: 'Banners', icon: 'image' },
  { href: '/admin/providers', label: 'Profissionais', icon: 'shield' },
  { href: '/admin/users', label: 'Usuários', icon: 'users' },
  { href: '/admin/settings', label: 'Configurações', icon: 'settings' },
  { href: '/admin/workflows', label: 'Workflows', icon: 'flow' },
];

export function pageTitleFor(pathname: string): string {
  const all = [...OPS_NAV, ...ADMIN_NAV];
  const match = all
    .filter((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.label;
  return pathname.startsWith('/admin') ? 'Administração' : 'Operação';
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = Icons[item.icon];
  return (
    <Link
      href={item.href}
      className={[s.navItem, active ? s.navActive : ''].join(' ')}
      aria-current={active ? 'page' : undefined}
      title={item.label}
    >
      <Icon className={s.navIcon} />
      <span className={s.navLabel}>{item.label}</span>
    </Link>
  );
}

/** Navegação compacta exibida abaixo do cabeçalho em telas estreitas (a lateral fica oculta). */
export function MobileNav() {
  const pathname = usePathname();
  const { isAdmin, isOperator } = useAuth();
  const items = [...(isOperator ? OPS_NAV : []), ...(isAdmin ? ADMIN_NAV : [])];
  return (
    <nav className={s.mobileNav} aria-label="Navegação principal (compacta)">
      {items.map((i) => {
        const active = i.exact
          ? pathname === i.href
          : pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={[s.mobileItem, active ? s.navActive : ''].join(' ')}
            aria-current={active ? 'page' : undefined}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, isOperator } = useAuth();
  return (
    <aside className={s.sidebar} aria-label="Navegação principal">
      <Link href="/" className={s.brand} aria-label="VÉLIO, início">
        <span className={s.brandMark} aria-hidden>
          V
        </span>
        <span className={s.brandText}>VÉLIO</span>
      </Link>
      {isOperator ? (
        <nav className={s.section} aria-label="Operação">
          <span className={s.sectionTitle}>Operação</span>
          {OPS_NAV.map((i) => (
            <NavLink key={i.href} item={i} pathname={pathname} />
          ))}
        </nav>
      ) : null}
      {isAdmin ? (
        <nav className={s.section} aria-label="Administração">
          <span className={s.sectionTitle}>Administração</span>
          {ADMIN_NAV.map((i) => (
            <NavLink key={i.href} item={i} pathname={pathname} />
          ))}
        </nav>
      ) : null}
    </aside>
  );
}
