import { Pressable, type PressableProps, StyleSheet, View } from 'react-native';
import { Badge } from './Badge';
import { Icon, type IconProps } from './Icon';
import { TOUCH_TARGET, useTheme } from './theme';

export type IconButtonVariant = 'filled' | 'tonal' | 'ghost' | 'onMedia';

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: IconProps['name'];
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: number;
  badgeCount?: number;
  color?: string;
}

/** Botão circular de ícone com alvo mínimo de 44 pt. */
export function IconButton({
  icon,
  accessibilityLabel,
  variant = 'ghost',
  size = TOUCH_TARGET,
  badgeCount,
  color,
  disabled,
  ...rest
}: IconButtonProps) {
  const { colors } = useTheme();
  const bg =
    variant === 'filled'
      ? colors.primary
      : variant === 'tonal'
        ? colors.surfaceAlt
        : variant === 'onMedia'
          ? colors.surface
          : 'transparent';
  const fg =
    color ?? (variant === 'filled' ? colors.textOnPrimary : disabled ? colors.textMuted : colors.text);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          opacity: pressed ? 0.7 : 1,
          shadowColor: variant === 'onMedia' ? '#000' : 'transparent',
          shadowOpacity: variant === 'onMedia' ? 0.12 : 0,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: variant === 'onMedia' ? 3 : 0,
        },
      ]}
    >
      <Icon name={icon} size="lg" color={fg} />
      {badgeCount ? (
        <View style={styles.badge}>
          <Badge variant="count" count={badgeCount} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 2, right: 2 },
});
