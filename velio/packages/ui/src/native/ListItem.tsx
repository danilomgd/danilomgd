import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconProps } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export interface ListItemProps {
  title: string;
  subtitle?: string | null;
  /** Valor mono à direita (dinheiro, quantidade). */
  value?: string;
  icon?: IconProps['name'];
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  divider?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** Linha de lista (56 pt; 72 com subtítulo). */
export function ListItem({
  title,
  subtitle,
  value,
  icon,
  leading,
  trailing,
  onPress,
  chevron,
  selected,
  destructive,
  disabled,
  divider = true,
  accessibilityLabel,
  testID,
}: ListItemProps) {
  const { colors, spacing } = useTheme();
  const content = (
    <View
      style={[
        styles.row,
        { minHeight: subtitle ? 72 : 56, borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border },
      ]}
    >
      {leading ?? (icon ? <Icon name={icon} size="lg" color={destructive ? colors.danger : colors.textMuted} /> : null)}
      <View style={styles.texts}>
        <Text variant="body" color={destructive ? 'danger' : disabled ? 'muted' : 'primary'} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" color="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? <Text variant="mono">{value}</Text> : null}
      {trailing}
      {selected ? <Icon name="check" size="md" color={colors.primary} /> : null}
      {chevron ?? (onPress && !selected && !trailing) ? (
        <Icon name="chevron-right" size="md" color={colors.textMuted} />
      ) : null}
      <View style={{ width: spacing[0] }} />
    </View>
  );
  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  texts: { flex: 1, gap: 2 },
});
