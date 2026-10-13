import { Text, useTheme } from '@velio/ui/native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

/** Seção com título, subtítulo e ação "Ver todos" opcional; 24 pt entre seções. */
export function Section({
  title,
  subtitle,
  action,
  children,
  style,
}: {
  title?: string | null;
  subtitle?: string | null;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
  style?: object;
}) {
  const { spacing } = useTheme();
  return (
    <View style={[{ marginBottom: spacing[6] }, style]}>
      {title || action ? (
        <View style={styles.head}>
          <View style={styles.texts}>
            {title ? (
              <Text variant="titleSm" accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="bodySm" color="muted">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {action ? (
            <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8} style={styles.action}>
              <Text variant="labelSm" color="brand">
                {action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Linha chave/valor compacta. */
export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text variant="bodySm" color="muted">
        {label}
      </Text>
      <Text variant="body" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  texts: { flex: 1, gap: 2 },
  action: { minHeight: 32, justifyContent: 'center' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, minHeight: 32, alignItems: 'center' },
});
