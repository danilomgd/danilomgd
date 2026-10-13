import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';

export interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
}

/** 2 a 4 segmentos; o selecionado ganha fundo de superfície e elevação leve. */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors, radius, elevation } = useTheme();
  return (
    <View
      style={[styles.track, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}
      accessibilityRole="tablist"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: Boolean(o.disabled) }}
            accessibilityLabel={o.label}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              { borderRadius: radius.md - 2 },
              selected ? { backgroundColor: colors.surface, ...elevation.sm } : null,
            ]}
          >
            <Text
              variant="labelSm"
              color={selected ? 'primary' : o.disabled ? 'muted' : 'muted'}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3, minHeight: 44 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});
