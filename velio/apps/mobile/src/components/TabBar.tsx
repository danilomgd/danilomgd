import { Badge, Icon, type IconProps, Text, useTheme } from '@velio/ui/native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface TabSpec {
  name: string;
  label: string;
  icon: IconProps['name'];
}

export interface TabBarProps extends BottomTabBarProps {
  tabs: TabSpec[];
  /** Conteúdo fixo acima da barra (cartão "Em andamento"). */
  above?: ReactNode;
  badges?: Record<string, number>;
}

/** Barra inferior própria: 56 pt + área segura, ícone 24 + rótulo 12, cartão acima opcional. */
export function TabBar({ state, navigation, tabs, above, badges }: TabBarProps) {
  const { colors, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
          ...elevation.md,
        },
      ]}
    >
      {above}
      <View style={styles.row} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
          const route = state.routes[routeIndex];
          const focused = state.index === routeIndex;
          const count = badges?.[tab.name];
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                if (!route) return;
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={styles.tab}
            >
              <View>
                <Icon name={tab.icon} size="lg" color={focused ? colors.primary : colors.textMuted} />
                {count ? (
                  <View style={styles.badge}>
                    <Badge variant="count" count={count} />
                  </View>
                ) : null}
              </View>
              <Text
                variant="caption"
                style={{
                  color: focused ? colors.primary : colors.textMuted,
                  fontWeight: focused ? '600' : '400',
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', height: 56 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 44 },
  badge: { position: 'absolute', top: -6, right: -10 },
});
