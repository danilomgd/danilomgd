import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export interface RatingStarsProps {
  value: number | null;
  onChange?: (value: number) => void;
  count?: number;
  size?: number;
  showNumber?: boolean;
}

/** Estrelas de entrada (44 pt por estrela) ou exibição (com número). */
export function RatingStars({ value, onChange, count, size, showNumber = true }: RatingStarsProps) {
  const { colors } = useTheme();
  const interactive = Boolean(onChange);
  const px = size ?? (interactive ? 40 : 16);
  const rounded = Math.round(value ?? 0);
  return (
    <View
      style={styles.row}
      accessibilityRole={interactive ? 'adjustable' : 'text'}
      accessibilityLabel={value ? `Nota ${value.toFixed(1)} de 5` : 'Sem avaliação'}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= rounded;
        const star = <Icon name="star" size={px} color={filled ? colors.accent : colors.border} />;
        if (!interactive) return <View key={i}>{star}</View>;
        return (
          <Pressable
            key={i}
            onPress={() => onChange?.(i)}
            accessibilityRole="button"
            accessibilityLabel={`${i} ${i === 1 ? 'estrela' : 'estrelas'}`}
            hitSlop={4}
            style={styles.starTarget}
          >
            {star}
          </Pressable>
        );
      })}
      {!interactive && showNumber ? (
        <Text variant="bodySm" color="muted" style={styles.number}>
          {value ? value.toFixed(1).replace('.', ',') : '—'}
          {count !== undefined ? ` · ${count}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  starTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  number: { marginLeft: 6 },
});
