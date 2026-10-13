import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, StyleSheet, View, type ViewStyle } from 'react-native';
import { Icon, type IconProps } from './Icon';
import { Text } from './Text';
import { TOUCH_TARGET, useTheme } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSoft';
export type ButtonSize = 'md' | 'lg' | 'xl';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconProps['name'];
  fullWidth?: boolean;
  style?: ViewStyle;
  /** Texto curto exibido abaixo quando desabilitado, explicando o motivo. */
  disabledReason?: string;
  children?: ReactNode;
}

const HEIGHTS: Record<ButtonSize, number> = { md: TOUCH_TARGET, lg: 52, xl: 64 };

/** Botão com uma ação clara. Um `primary` por tela. */
export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  style,
  disabledReason,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const { colors, radius } = useTheme();
  const isDisabled = disabled || loading;

  const palette = (() => {
    if (isDisabled && !loading) return { bg: colors.surfaceAlt, fg: colors.textMuted, border: 'transparent' };
    switch (variant) {
      case 'secondary':
        return { bg: colors.primarySoft, fg: colors.primary, border: 'transparent' };
      case 'ghost':
        return { bg: 'transparent', fg: colors.primary, border: 'transparent' };
      case 'danger':
        return { bg: colors.danger, fg: colors.textOnPrimary, border: 'transparent' };
      case 'dangerSoft':
        return { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' };
      default:
        return { bg: colors.primary, fg: colors.textOnPrimary, border: 'transparent' };
    }
  })();

  return (
    <View style={[fullWidth ? styles.full : null, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        disabled={isDisabled}
        hitSlop={4}
        {...rest}
        style={({ pressed }) => [
          styles.base,
          {
            height: HEIGHTS[size],
            borderRadius: radius.md,
            backgroundColor: pressed && !isDisabled && variant === 'primary' ? colors.primaryHover : palette.bg,
            opacity: pressed && !isDisabled && variant !== 'primary' ? 0.8 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <View style={styles.row}>
            {icon ? <Icon name={icon} size="md" color={palette.fg} /> : null}
            <Text
              variant={size === 'xl' ? 'titleSm' : 'label'}
              style={{ color: palette.fg }}
              numberOfLines={1}
              maxFontSizeMultiplier={1.5}
            >
              {label}
            </Text>
          </View>
        )}
      </Pressable>
      {isDisabled && !loading && disabledReason ? (
        <Text variant="caption" color="muted" align="center" style={styles.reason}>
          {disabledReason}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: 'stretch' },
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reason: { marginTop: 6 },
});
