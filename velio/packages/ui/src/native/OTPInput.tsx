import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';

export interface OTPInputProps {
  length?: 4 | 6;
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Modo leitura (exibir PIN ao cliente). */
  readOnly?: boolean;
  accessibilityLabel?: string;
}

/** Células de código (OTP 6 ou PIN 4). Um único TextInput invisível recebe a digitação. */
export function OTPInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  disabled,
  autoFocus,
  readOnly,
  accessibilityLabel,
}: OTPInputProps) {
  const { colors, radius } = useTheme();
  const ref = useRef<TextInput>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!error) return;
    Animated.sequence([
      Animated.timing(shake, { toValue: 6, duration: 40, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -6, duration: 40, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }, [error, shake]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const active = Math.min(value.length, length - 1);

  return (
    <Pressable
      onPress={() => !readOnly && ref.current?.focus()}
      accessibilityRole={readOnly ? 'text' : 'none'}
      accessibilityLabel={accessibilityLabel ?? `Código com ${length} dígitos, ${value.length} preenchidos`}
      disabled={disabled}
    >
      <Animated.View style={[styles.row, { transform: [{ translateX: shake }] }]}>
        {digits.map((d, i) => {
          const isActive = focused && i === active && !readOnly;
          return (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: posições fixas
              key={i}
              style={[
                styles.cell,
                {
                  borderRadius: radius.md,
                  backgroundColor: readOnly ? colors.surfaceAlt : colors.surface,
                  borderColor: error ? colors.danger : isActive ? colors.primary : colors.border,
                  borderWidth: isActive ? 2 : 1,
                },
              ]}
            >
              <Text variant="monoLg" style={{ letterSpacing: 0 }}>
                {d}
              </Text>
            </View>
          );
        })}
      </Animated.View>
      {!readOnly ? (
        <TextInput
          ref={ref}
          value={value}
          onChangeText={(t) => {
            const clean = t.replace(/\D/g, '').slice(0, length);
            onChange(clean);
            if (clean.length === length) onComplete?.(clean);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={length === 6 ? 'sms-otp' : 'off'}
          maxLength={length}
          autoFocus={autoFocus}
          editable={!disabled}
          style={styles.hidden}
          caretHidden
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  cell: { width: 48, height: 56, alignItems: 'center', justifyContent: 'center' },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
