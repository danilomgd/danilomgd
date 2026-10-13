import { Pressable, StyleSheet } from 'react-native';
import { Icon, type IconProps } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  icon?: IconProps['name'];
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/** Chip de filtro/escolha. Selecionado usa `primarySoft`. */
export function Chip({ label, selected, onPress, onRemove, icon, disabled, size = 'md' }: ChipProps) {
  const { colors, radius } = useTheme();
  const fg = selected ? colors.primary : disabled ? colors.textMuted : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        {
          height: size === 'sm' ? 32 : 36,
          borderRadius: radius.sm,
          backgroundColor: selected ? colors.primarySoft : colors.surfaceAlt,
          borderColor: selected ? colors.primary : 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon ? <Icon name={icon} size="sm" color={fg} /> : null}
      <Text variant="labelSm" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable onPress={onRemove} accessibilityLabel={`Remover ${label}`} hitSlop={8}>
          <Icon name="x" size="sm" color={fg} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderWidth: 1 },
});
