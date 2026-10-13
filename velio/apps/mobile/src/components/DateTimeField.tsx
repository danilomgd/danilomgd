import DateTimePicker from '@react-native-community/datetimepicker';
import { Icon, Text, useTheme } from '@velio/ui/native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { formatSchedule } from '@/lib/format';

export interface DateTimeFieldProps {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
}

/** Seletor de data e hora nativo (iOS inline, Android em dois passos). */
export function DateTimeField({ label, value, onChange, minimumDate }: DateTimeFieldProps) {
  const { colors, radius } = useTheme();
  const [mode, setMode] = useState<'date' | 'time' | null>(Platform.OS === 'ios' ? 'date' : null);
  const iosInline = Platform.OS === 'ios';
  return (
    <View style={{ gap: 8 }}>
      <Text variant="labelSm" color="muted">
        {label}
      </Text>
      {!iosInline ? (
        <Pressable onPress={() => setMode('date')} accessibilityRole="button" accessibilityLabel={`${label}: ${formatSchedule(value.toISOString())}. Alterar`} style={[styles.field, { borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }]}>
          <Icon name="calendar" size="md" color={colors.textMuted} />
          <Text variant="body" style={{ flex: 1 }}>
            {formatSchedule(value.toISOString())}
          </Text>
        </Pressable>
      ) : null}
      {mode ? (
        <View style={iosInline ? styles.inlineRow : null}>
          <DateTimePicker
            value={value}
            mode={iosInline ? 'datetime' : mode}
            display={iosInline ? 'compact' : 'default'}
            minimumDate={minimumDate}
            minuteInterval={15}
            locale="pt-BR"
            onChange={(e, d) => {
              if (!iosInline) setMode(mode === 'date' && e.type === 'set' ? 'time' : null);
              if (d) onChange(d);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 52, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  inlineRow: { alignItems: 'flex-start' },
});
