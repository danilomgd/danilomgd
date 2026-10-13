import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export type CardVariant = 'flat' | 'outlined' | 'elevated';

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: number;
  onPress?: () => void;
  selected?: boolean;
  children: ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/** Superfície agrupadora. `onPress` torna o cartão interativo (escala 0,99 ao pressionar). */
export function Card({
  variant = 'outlined',
  padding,
  onPress,
  selected,
  children,
  style,
  accessibilityLabel,
  ...rest
}: CardProps) {
  const { colors, radius, elevation, spacing } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: padding ?? spacing[4],
    borderWidth: variant === 'outlined' || selected ? 1 : 0,
    borderColor: selected ? colors.primary : colors.border,
    ...(variant === 'elevated' ? elevation.sm : {}),
  };
  if (!onPress) {
    return (
      <View {...rest} style={[base, style]}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [base, style, pressed ? styles.pressed : null]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({ pressed: { transform: [{ scale: 0.99 }], opacity: 0.95 } });
