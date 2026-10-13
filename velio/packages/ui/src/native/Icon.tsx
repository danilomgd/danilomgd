import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useTheme } from './theme';

export type FeatherName = ComponentProps<typeof Feather>['name'];

/**
 * Nomes de ícone do catálogo (`ServiceCategory.icon`) → ícone Feather.
 * Nomes desconhecidos caem em `grid`.
 */
const CATALOG_ICON_MAP: Record<string, FeatherName> = {
  droplet: 'droplet',
  zap: 'zap',
  wind: 'wind',
  shirt: 'tag',
  car: 'truck',
  home: 'home',
  package: 'package',
  'life-buoy': 'life-buoy',
  sparkles: 'star',
  sparkle: 'star',
  bolt: 'zap',
  snowflake: 'wind',
  wrench: 'tool',
  tool: 'tool',
  compass: 'compass',
  'map-pin': 'map-pin',
  chat: 'message-circle',
  camera: 'camera',
  qr: 'maximize',
  star: 'star',
  clock: 'clock',
  check: 'check',
  alert: 'alert-circle',
  info: 'info',
  close: 'x',
  search: 'search',
  bell: 'bell',
  wallet: 'credit-card',
  calendar: 'calendar',
  user: 'user',
  'shield-check': 'shield',
  broom: 'wind',
  scissors: 'scissors',
  box: 'box',
  heart: 'heart',
};

export function resolveCatalogIcon(name: string | null | undefined): FeatherName {
  if (!name) return 'grid';
  return CATALOG_ICON_MAP[name] ?? (isFeatherName(name) ? name : 'grid');
}

function isFeatherName(name: string): name is FeatherName {
  const glyphs = (Feather as unknown as { glyphMap?: Record<string, number> }).glyphMap;
  return Boolean(glyphs && name in glyphs);
}

export type IconSize = 'sm' | 'md' | 'lg' | 'xl' | number;
const SIZES = { sm: 16, md: 20, lg: 24, xl: 32 } as const;

export interface IconProps {
  name: FeatherName | string;
  size?: IconSize;
  color?: string;
  accessibilityLabel?: string;
}

/** Ícone Feather com tamanho da escala e cor do tema por padrão. */
export function Icon({ name, size = 'lg', color, accessibilityLabel }: IconProps) {
  const { colors } = useTheme();
  const px = typeof size === 'number' ? size : SIZES[size];
  return (
    <Feather
      name={resolveCatalogIcon(name)}
      size={px}
      color={color ?? colors.text}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
    />
  );
}
