import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { type Tone, toneColors, useTheme } from './theme';

export type BadgeProps =
  | { variant: 'dot'; tone?: Tone }
  | { variant: 'count'; count: number; tone?: Tone }
  | { variant: 'label'; label: string; tone?: Tone };

/** Marcador pequeno: ponto, contagem (até 99+) ou rótulo curto. */
export function Badge(props: BadgeProps) {
  const { colors, radius } = useTheme();
  const tone = props.tone ?? (props.variant === 'label' ? 'success' : 'danger');
  const c = toneColors(colors, tone);
  if (props.variant === 'dot') {
    return <View style={[styles.dot, { backgroundColor: c.solid }]} accessibilityElementsHidden />;
  }
  if (props.variant === 'count') {
    const text = props.count > 99 ? '99+' : String(props.count);
    return (
      <View
        style={[styles.count, { backgroundColor: c.solid, borderRadius: radius.pill }]}
        accessibilityLabel={`${props.count} novos`}
      >
        <Text variant="caption" style={{ color: colors.textOnPrimary, fontWeight: '600', lineHeight: 14 }}>
          {text}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.label, { backgroundColor: c.bg, borderRadius: radius.sm }]}>
      <Text variant="caption" style={{ color: c.fg, fontWeight: '600' }}>
        {props.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  count: { minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  label: { paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
});
