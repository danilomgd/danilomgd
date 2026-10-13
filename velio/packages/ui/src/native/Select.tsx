import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { ListItem } from './ListItem';
import { Text } from './Text';
import { useTheme } from './theme';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface SelectProps<T extends string> {
  label?: string;
  placeholder?: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  error?: string | null;
  disabled?: boolean;
  /** Ação extra no fim da lista (ex.: "Adicionar endereço"). */
  extraAction?: { label: string; onPress: () => void };
}

/** Seletor que abre uma folha inferior com as opções. */
export function Select<T extends string>({
  label,
  placeholder = 'Selecionar',
  value,
  options,
  onChange,
  error,
  disabled,
  extraAction,
}: SelectProps<T>) {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View>
      {label ? (
        <Text variant="labelSm" color="muted" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? placeholder}: ${selected?.label ?? 'nenhum selecionado'}`}
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          {
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.md,
            backgroundColor: disabled ? colors.surfaceAlt : colors.surface,
          },
        ]}
      >
        <Text variant="body" color={selected ? 'primary' : 'muted'} style={{ flex: 1 }} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="chevron-down" size="md" color={colors.textMuted} />
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger" style={styles.label}>
          {error}
        </Text>
      ) : null}
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label ?? placeholder}>
        <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
          {options.map((o) => (
            <ListItem
              key={o.value}
              title={o.label}
              subtitle={o.description}
              selected={o.value === value}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
            />
          ))}
          {extraAction ? (
            <ListItem
              title={extraAction.label}
              icon="plus"
              divider={false}
              onPress={() => {
                setOpen(false);
                extraAction.onPress();
              }}
            />
          ) : null}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6, marginTop: 2 },
  field: {
    minHeight: 52,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
});
