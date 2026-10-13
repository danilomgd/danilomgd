import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { Icon, type IconProps } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  prefix?: string;
  suffix?: string;
  icon?: IconProps['name'];
  /** `search` tem cantos arredondados e ícone de lupa; `money` usa teclado numérico e mono. */
  kind?: 'text' | 'multiline' | 'search' | 'money' | 'phone' | 'odometer';
  containerStyle?: object;
}

/** Campo de texto com rótulo visível, erro inline e estados de foco. */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, prefix, suffix, icon, kind = 'text', containerStyle, style, onFocus, onBlur, editable = true, ...rest },
  ref,
) {
  const { colors, radius, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const multiline = kind === 'multiline';
  const search = kind === 'search';
  const mono = kind === 'money' || kind === 'odometer';
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;
  return (
    <View style={containerStyle}>
      {label ? (
        <Text variant="labelSm" color="muted" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          {
            borderColor,
            borderWidth: focused ? 2 : 1,
            borderRadius: search ? radius.pill : radius.md,
            backgroundColor: editable ? colors.surface : colors.surfaceAlt,
            minHeight: multiline ? 112 : 52,
            alignItems: multiline ? 'flex-start' : 'center',
            paddingVertical: multiline ? 12 : 0,
          },
        ]}
      >
        {search || icon ? <Icon name={icon ?? 'search'} size="md" color={colors.textMuted} /> : null}
        {prefix ? (
          <Text variant={mono ? 'mono' : 'body'} color="muted">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label ?? rest.placeholder}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          editable={editable}
          keyboardType={
            kind === 'money' || kind === 'odometer' ? 'number-pad' : kind === 'phone' ? 'phone-pad' : rest.keyboardType
          }
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
          style={[
            styles.input,
            {
              color: colors.text,
              fontSize: typography.size.md,
              lineHeight: multiline ? typography.lineHeight.md : undefined,
              fontVariant: mono ? ['tabular-nums'] : undefined,
            },
            style,
          ]}
        />
        {suffix ? (
          <Text variant={mono ? 'mono' : 'body'} color="muted">
            {suffix}
          </Text>
        ) : null}
        {error ? <Icon name="alert-circle" size="md" color={colors.danger} /> : null}
      </View>
      {error ? (
        <Text variant="caption" color="danger" style={styles.helper} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="muted" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { marginBottom: 6 },
  field: { flexDirection: 'row', paddingHorizontal: 14, gap: 8 },
  input: { flex: 1, paddingVertical: 0, minHeight: 24 },
  helper: { marginTop: 6 },
});
