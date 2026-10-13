import type { ServiceOption } from '@velio/contracts';
import { formatBRL } from '@velio/contracts';
import { Chip, Input, Switch, Text, useTheme } from '@velio/ui/native';
import { StyleSheet, View } from 'react-native';

export type OptionValues = Record<string, string | number | boolean>;

/** Valores padrão: primeira escolha de selects obrigatórios, mínimo de números. */
export function defaultOptionValues(options: ServiceOption[]): OptionValues {
  const out: OptionValues = {};
  for (const o of options) {
    if (o.type === 'select' && o.required && o.choices?.[0]) out[o.key] = o.choices[0].value;
    if (o.type === 'number' && o.required) out[o.key] = o.min ?? 1;
    if (o.type === 'boolean') out[o.key] = false;
  }
  return out;
}

/** Opções obrigatórias ainda sem valor. */
export function missingRequired(options: ServiceOption[], values: OptionValues): string[] {
  return options
    .filter((o) => o.required && (values[o.key] === undefined || values[o.key] === ''))
    .map((o) => o.label);
}

/** Formulário dinâmico a partir de `Service.options` (select, number, boolean, text). */
export function ServiceOptionsForm({
  options,
  values,
  onChange,
}: {
  options: ServiceOption[];
  values: OptionValues;
  onChange: (next: OptionValues) => void;
}) {
  const { spacing } = useTheme();
  if (!options.length) return null;
  const set = (key: string, value: string | number | boolean) => onChange({ ...values, [key]: value });
  return (
    <View style={{ gap: spacing[4] }}>
      {options.map((o) => {
        switch (o.type) {
          case 'select':
            return (
              <View key={o.key} style={{ gap: 8 }}>
                <Text variant="labelSm" color="muted">
                  {o.label}
                  {o.required ? '' : ' (opcional)'}
                </Text>
                <View style={styles.chips}>
                  {(o.choices ?? []).map((c) => (
                    <Chip
                      key={c.value}
                      label={c.priceDeltaCents ? `${c.label} · +${formatBRL(c.priceDeltaCents)}` : c.label}
                      selected={values[o.key] === c.value}
                      onPress={() => set(o.key, c.value)}
                    />
                  ))}
                </View>
              </View>
            );
          case 'number':
            return (
              <Input
                key={o.key}
                label={o.label}
                keyboardType="number-pad"
                value={values[o.key] === undefined ? '' : String(values[o.key])}
                onChangeText={(t) => {
                  const n = Number(t.replace(/\D/g, ''));
                  set(
                    o.key,
                    t === '' ? '' : Math.min(o.max ?? Number.MAX_SAFE_INTEGER, Math.max(o.min ?? 0, n)),
                  );
                }}
                hint={o.unitPriceCents ? `${formatBRL(o.unitPriceCents)} por unidade` : undefined}
              />
            );
          case 'boolean':
            return (
              <View key={o.key} style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{o.label}</Text>
                  {o.unitPriceCents ? (
                    <Text variant="caption" color="muted">
                      +{formatBRL(o.unitPriceCents)}
                    </Text>
                  ) : null}
                </View>
                <Switch
                  value={Boolean(values[o.key])}
                  onValueChange={(v) => set(o.key, v)}
                  accessibilityLabel={o.label}
                />
              </View>
            );
          default:
            return (
              <Input
                key={o.key}
                label={o.label}
                value={String(values[o.key] ?? '')}
                onChangeText={(t) => set(o.key, t)}
                placeholder={o.required ? undefined : 'Opcional'}
              />
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
});
