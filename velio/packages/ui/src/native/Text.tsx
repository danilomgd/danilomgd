import { forwardRef } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { typography } from '../tokens';
import { useTheme } from './theme';

export type TextVariant =
  | 'display'
  | 'displaySm'
  | 'title'
  | 'titleSm'
  | 'heading'
  | 'body'
  | 'bodySm'
  | 'label'
  | 'labelSm'
  | 'caption'
  | 'mono'
  | 'monoLg';

export type TextColor = 'primary' | 'muted' | 'inverse' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
  weight?: keyof typeof typography.weight;
}

const VARIANTS: Record<TextVariant, TextStyle> = {
  display: { fontSize: typography.size['3xl'], lineHeight: typography.lineHeight['3xl'], fontWeight: '700', letterSpacing: -0.5 },
  displaySm: { fontSize: typography.size['2xl'], lineHeight: typography.lineHeight['2xl'], fontWeight: '700', letterSpacing: -0.25 },
  title: { fontSize: typography.size.xl, lineHeight: typography.lineHeight.xl, fontWeight: '600', letterSpacing: -0.25 },
  titleSm: { fontSize: typography.size.lg, lineHeight: typography.lineHeight.lg, fontWeight: '600' },
  heading: { fontSize: typography.size.md, lineHeight: typography.lineHeight.md, fontWeight: '600' },
  body: { fontSize: typography.size.md, lineHeight: typography.lineHeight.md, fontWeight: '400' },
  bodySm: { fontSize: typography.size.sm, lineHeight: typography.lineHeight.sm, fontWeight: '400' },
  label: { fontSize: typography.size.md, lineHeight: typography.lineHeight.md, fontWeight: '600' },
  labelSm: { fontSize: typography.size.sm, lineHeight: typography.lineHeight.sm, fontWeight: '600', letterSpacing: 0.1 },
  caption: { fontSize: typography.size.xs, lineHeight: typography.lineHeight.xs, fontWeight: '400', letterSpacing: 0.1 },
  mono: { fontSize: typography.size.md, lineHeight: typography.lineHeight.md, fontWeight: '500', fontVariant: ['tabular-nums'] },
  monoLg: { fontSize: typography.size['2xl'], lineHeight: typography.lineHeight['2xl'], fontWeight: '600', letterSpacing: 2, fontVariant: ['tabular-nums'] },
};

const MAX_SCALE: Partial<Record<TextVariant, number>> = { display: 1.4, displaySm: 1.4, monoLg: 1.4 };

/** Texto da escala tipográfica. Escala com o sistema (até 2x; display até 1,4x). */
export const Text = forwardRef<RNText, TextProps>(function Text(
  { variant = 'body', color = 'primary', align, weight, style, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const colorValue: Record<TextColor, string> = {
    primary: colors.text,
    muted: colors.textMuted,
    inverse: colors.textOnPrimary,
    brand: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
  };
  return (
    <RNText
      ref={ref}
      maxFontSizeMultiplier={MAX_SCALE[variant] ?? 2}
      {...rest}
      style={[
        VARIANTS[variant],
        { color: colorValue[color], textAlign: align },
        weight ? { fontWeight: typography.weight[weight] } : null,
        style,
      ]}
    />
  );
});
