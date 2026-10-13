import { ActivityIndicator, Animated, Pressable, StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';
import { useTheme } from './theme';

export interface SwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  /** 44x76 para o interruptor de disponibilidade do prestador. */
  large?: boolean;
  accessibilityLabel: string;
}

/** Interruptor com estado de carregamento (bloqueado com spinner). */
export function Switch({ value, onValueChange, disabled, loading, large, accessibilityLabel }: SwitchProps) {
  const { colors, motion } = useTheme();
  const w = large ? 76 : 52;
  const h = large ? 44 : 32;
  const knob = h - 6;
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: motion.duration.fast, useNativeDriver: false }).start();
  }, [value, anim, motion.duration.fast]);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [3, w - knob - 3] });
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.primary] });
  const blocked = disabled || loading;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: Boolean(blocked), busy: Boolean(loading) }}
      onPress={() => !blocked && onValueChange(!value)}
      disabled={blocked}
      hitSlop={6}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View style={[styles.track, { width: w, height: h, borderRadius: h / 2, backgroundColor: bg }]}>
        <Animated.View
          style={[
            styles.knob,
            { width: knob, height: knob, borderRadius: knob / 2, backgroundColor: colors.surface, transform: [{ translateX }] },
          ]}
        >
          {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { justifyContent: 'center' },
  knob: { alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});
