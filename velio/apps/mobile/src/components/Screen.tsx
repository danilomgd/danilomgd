import { useTheme } from '@velio/ui/native';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ScreenProps {
  children: ReactNode;
  /** Rolável (padrão) ou fixo. */
  scroll?: boolean;
  padded?: boolean;
  /** Barra fixa inferior (ação principal). */
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: { top?: boolean; bottom?: boolean };
  contentStyle?: ViewStyle;
  keyboard?: boolean;
}

/** Contêiner de tela: fundo, áreas seguras, gutter 16 e barra fixa inferior opcional. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  footer,
  refreshing,
  onRefresh,
  edges,
  contentStyle,
  keyboard,
}: ScreenProps) {
  const { colors, spacing, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const top = edges?.top === false ? 0 : insets.top;
  const bottom = edges?.bottom === false ? 0 : insets.bottom;
  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        padded ? { padding: spacing[4] } : null,
        { paddingBottom: (padded ? spacing[4] : 0) + (footer ? 0 : bottom) },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded ? { padding: spacing[4] } : null, contentStyle]}>{children}</View>
  );
  const content = keyboard ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={top}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );
  return (
    <View style={[styles.flex, { backgroundColor: colors.bg, paddingTop: top }]}>
      {content}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingHorizontal: spacing[4],
              paddingTop: spacing[3],
              paddingBottom: spacing[3] + bottom,
              ...elevation.md,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
