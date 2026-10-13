import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  circle?: boolean;
  style?: ViewStyle;
}

/** Placeholder de carregamento com pulso suave (desligado em "reduzir movimento"). */
export function Skeleton({ width = '100%', height = 16, radius, circle, style }: SkeletonProps) {
  const { colors, radius: r } = useTheme();
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [opacity]);
  return (
    <Animated.View
      accessibilityLabel="Carregando"
      style={[
        { width, height: circle ? (typeof width === 'number' ? width : height) : height, borderRadius: circle ? 999 : (radius ?? r.sm), backgroundColor: colors.surfaceAlt, opacity },
        style,
      ]}
    />
  );
}

/** Linhas de texto. */
export function SkeletonText({ lines = 3, lastWidth = '60%' }: { lines?: number; lastWidth?: `${number}%` }) {
  return (
    <View style={styles.lines}>
      {Array.from({ length: lines }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders
        <Skeleton key={i} height={14} width={i === lines - 1 ? lastWidth : '100%'} />
      ))}
    </View>
  );
}

/** Lista de linhas com a altura do ListItem real. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders
        <View key={i} style={styles.row}>
          <Skeleton width={40} circle />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={14} width="70%" />
            <Skeleton height={12} width="40%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Cartão genérico. */
export function CardSkeleton({ height = 120 }: { height?: number }) {
  const { radius } = useTheme();
  return <Skeleton height={height} radius={radius.lg} />;
}

const styles = StyleSheet.create({
  lines: { gap: 8 },
  list: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
});
