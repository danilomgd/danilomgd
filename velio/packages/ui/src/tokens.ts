/**
 * Tokens do design system "Trilho" do VÉLIO. Fonte única para React Native e web.
 * Paleta própria: um azul-petróleo profundo como primária (confiança, serviço técnico),
 * neutros quentes (premium, calmo) e um âmbar discreto como acento de ação secundária.
 */
export const palette = {
  petrol: {
    50: '#EEF4F6',
    100: '#D6E4E9',
    200: '#ADC9D3',
    300: '#7FAABA',
    400: '#4F879C',
    500: '#2E6A80',
    600: '#215468',
    700: '#194252',
    800: '#122F3B',
    900: '#0B1E26',
  },
  sand: {
    50: '#FBFAF7',
    100: '#F5F2EC',
    200: '#EAE5DA',
    300: '#D9D1C2',
    400: '#BDB2A0',
    500: '#9A8E7B',
    600: '#75695A',
    700: '#564D42',
    800: '#38322B',
    900: '#1F1B17',
  },
  amber: { 100: '#FFF1D6', 300: '#FFD48A', 500: '#F2A93B', 600: '#D98F1F', 700: '#A86A0F' },
  green: { 100: '#DDF5EA', 500: '#1F9D6A', 700: '#15704B' },
  red: { 100: '#FDE3E1', 500: '#D64545', 700: '#A12E2E' },
  blue: { 100: '#E1ECFD', 500: '#3B6FD6', 700: '#2A4F9A' },
  white: '#FFFFFF',
  black: '#0A0A0A',
} as const;

export const lightTheme = {
  bg: palette.sand[50],
  surface: palette.white,
  surfaceAlt: palette.sand[100],
  border: palette.sand[200],
  text: palette.sand[900],
  textMuted: palette.sand[600],
  textOnPrimary: palette.white,
  primary: palette.petrol[600],
  primaryHover: palette.petrol[700],
  primarySoft: palette.petrol[50],
  accent: palette.amber[500],
  accentSoft: palette.amber[100],
  success: palette.green[500],
  successSoft: palette.green[100],
  warning: palette.amber[600],
  warningSoft: palette.amber[100],
  danger: palette.red[500],
  dangerSoft: palette.red[100],
  info: palette.blue[500],
  infoSoft: palette.blue[100],
  overlay: 'rgba(11, 30, 38, 0.45)',
} as const;

export const darkTheme: Theme = {
  bg: palette.petrol[900],
  surface: palette.petrol[800],
  surfaceAlt: palette.petrol[700],
  border: palette.petrol[600],
  text: palette.sand[50],
  textMuted: palette.sand[400],
  textOnPrimary: palette.white,
  primary: palette.petrol[300],
  primaryHover: palette.petrol[200],
  primarySoft: palette.petrol[700],
  accent: palette.amber[300],
  accentSoft: palette.amber[700],
  success: palette.green[500],
  successSoft: palette.green[700],
  warning: palette.amber[300],
  warningSoft: palette.amber[700],
  danger: palette.red[500],
  dangerSoft: palette.red[700],
  info: palette.blue[500],
  infoSoft: palette.blue[700],
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type Theme = Record<keyof typeof lightTheme, string>;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const typography = {
  fontFamily: { sans: 'Inter', mono: 'JetBrains Mono' },
  size: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28, '3xl': 34 },
  lineHeight: { xs: 16, sm: 20, md: 24, lg: 26, xl: 30, '2xl': 36, '3xl': 42 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
} as const;

export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  sm: {
    shadowColor: palette.petrol[900],
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: palette.petrol[900],
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  lg: {
    shadowColor: palette.petrol[900],
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
} as const;

export const motion = {
  duration: { fast: 120, base: 200, slow: 320 },
  easing: { standard: 'cubic-bezier(0.2, 0, 0, 1)', emphasized: 'cubic-bezier(0.3, 0, 0, 1)' },
} as const;

export const layout = { gutter: 16, gutterWide: 20, touchTarget: 44, maxContentWidth: 640 } as const;

/** Cores por estado de ordem, para StatusPill e timeline. */
export const statusTone: Record<string, 'neutral' | 'info' | 'primary' | 'success' | 'warning' | 'danger'> = {
  REQUESTED: 'neutral',
  MATCHING: 'info',
  OFFERED: 'info',
  ACCEPTED: 'primary',
  EN_ROUTE: 'primary',
  ARRIVED: 'primary',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  REVIEWED: 'success',
  CLOSED: 'neutral',
  SCHEDULED: 'info',
  REMINDED: 'info',
  UNDER_REVIEW: 'info',
  QUOTED: 'warning',
  QUOTE_APPROVED: 'primary',
  QUOTE_REJECTED: 'neutral',
  AUTHORIZED: 'primary',
  DRIVER_ASSIGNED: 'primary',
  EN_ROUTE_PICKUP: 'primary',
  PICKED_UP: 'primary',
  IN_TRANSIT: 'primary',
  AT_DESTINATION: 'primary',
  THIRD_PARTY_IN_PROGRESS: 'info',
  THIRD_PARTY_DONE: 'info',
  RETURN_PICKUP: 'primary',
  RETURNING: 'primary',
  DELIVERED: 'success',
  SUBMITTED: 'neutral',
  INTERPRETING: 'info',
  PLAN_PROPOSED: 'warning',
  NEEDS_HUMAN: 'warning',
  PLAN_APPROVED: 'primary',
  IN_EXECUTION: 'primary',
  NO_PROVIDER_FOUND: 'warning',
  CANCELLED_BY_CUSTOMER: 'neutral',
  CANCELLED_BY_PROVIDER: 'warning',
  CANCELLED_BY_PLATFORM: 'neutral',
  DISPUTED: 'danger',
  REFUNDED: 'neutral',
};

/** CSS custom properties para a web (gerado a partir do tema). */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme))
    out[`--color-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`] = v;
  for (const [k, v] of Object.entries(spacing)) out[`--space-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) out[`--radius-${k}`] = `${v}px`;
  return out;
}
