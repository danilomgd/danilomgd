import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export interface CategoryTileProps {
  name: string;
  icon: string;
  onPress: () => void;
  selected?: boolean;
  variant?: 'grid' | 'row';
}

/** Ícone 28 em círculo 48 + rótulo de até 2 linhas. Grade de 4 por linha. */
export function CategoryTile({ name, icon, onPress, selected, variant = 'grid' }: CategoryTileProps) {
  const { colors, radius } = useTheme();
  if (variant === 'row') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ selected: Boolean(selected) }}
        onPress={onPress}
        style={({ pressed }) => [styles.row, { borderRadius: radius.md, backgroundColor: selected ? colors.primarySoft : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]}
      >
        <Icon name={icon} size="lg" color={colors.primary} />
        <Text variant="body" style={{ flex: 1 }}>
          {name}
        </Text>
        {selected ? <Icon name="check" size="md" color={colors.primary} /> : null}
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.circle, { backgroundColor: selected ? colors.primary : colors.primarySoft }]}>
        <Icon name={icon} size={28} color={selected ? colors.textOnPrimary : colors.primary} />
      </View>
      <Text variant="labelSm" align="center" numberOfLines={2} style={{ minHeight: 36 }}>
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { width: 76, alignItems: 'center', gap: 8 },
  circle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, minHeight: 56 },
});
