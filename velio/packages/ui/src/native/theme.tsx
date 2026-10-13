import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import {
  type Theme,
  darkTheme,
  elevation,
  layout,
  lightTheme,
  motion,
  radius,
  spacing,
  statusTone,
  typography,
} from '../tokens';

export type ColorScheme = 'light' | 'dark';
export type SchemePreference = ColorScheme | 'system';

export type Tone = (typeof statusTone)[string];

export interface ResolvedTheme {
  scheme: ColorScheme;
  colors: Theme;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  elevation: typeof elevation;
  motion: typeof motion;
  layout: typeof layout;
}

const ThemeContext = createContext<ResolvedTheme | null>(null);

export function buildTheme(scheme: ColorScheme): ResolvedTheme {
  return {
    scheme,
    colors: scheme === 'dark' ? darkTheme : lightTheme,
    spacing,
    radius,
    typography,
    elevation,
    motion,
    layout,
  };
}

export interface ThemeProviderProps {
  scheme?: SchemePreference;
  children: ReactNode;
}

/** Fornece o tema Aura (claro/escuro). `scheme="system"` segue a preferência do aparelho. */
export function ThemeProvider({ scheme = 'system', children }: ThemeProviderProps) {
  const system = useColorScheme();
  const resolved: ColorScheme = scheme === 'system' ? (system === 'dark' ? 'dark' : 'light') : scheme;
  const value = useMemo(() => buildTheme(resolved), [resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ResolvedTheme {
  const ctx = useContext(ThemeContext);
  return ctx ?? buildTheme('light');
}

/** Memoiza um StyleSheet por tema. */
export function useStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: ResolvedTheme) => T): T {
  const theme = useTheme();
  // biome-ignore lint/correctness/useExhaustiveDependencies: factory é estável por chamada de componente
  return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
}

/** Cores de fundo/texto para um tom semântico (StatusPill, Badge, Toast). */
export function toneColors(theme: Theme, tone: Tone): { bg: string; fg: string; solid: string } {
  switch (tone) {
    case 'primary':
      return { bg: theme.primarySoft, fg: theme.primary, solid: theme.primary };
    case 'success':
      return { bg: theme.successSoft, fg: theme.success, solid: theme.success };
    case 'warning':
      return { bg: theme.warningSoft, fg: theme.warning, solid: theme.warning };
    case 'danger':
      return { bg: theme.dangerSoft, fg: theme.danger, solid: theme.danger };
    case 'info':
      return { bg: theme.infoSoft, fg: theme.info, solid: theme.info };
    default:
      return { bg: theme.surfaceAlt, fg: theme.textMuted, solid: theme.textMuted };
  }
}

export function toneForStatus(status: string): Tone {
  return statusTone[status] ?? 'neutral';
}

/** Alvo mínimo de toque (44 pt). */
export const TOUCH_TARGET = layout.touchTarget;
