import { StyleSheet, View } from 'react-native';
import { Icon, type IconProps } from './Icon';
import { Text } from './Text';
import { type Tone, toneColors, toneForStatus, useTheme } from './theme';

export interface StatusPillProps {
  label: string;
  /** Status de ordem; quando informado, o tom vem de `statusTone`. */
  status?: string;
  tone?: Tone;
  solid?: boolean;
  icon?: IconProps['name'];
  size?: 'sm' | 'md';
  /** Texto mono à direita (contagem regressiva). */
  countdown?: string;
}

/** Pílula de estado. Nunca decide cor por conta própria: usa `statusTone` ou `tone`. */
export function StatusPill({ label, status, tone, solid, icon, size = 'md', countdown }: StatusPillProps) {
  const { colors, radius } = useTheme();
  const t = tone ?? (status ? toneForStatus(status) : 'neutral');
  const c = toneColors(colors, t);
  const fg = solid ? colors.textOnPrimary : c.fg;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}${countdown ? `, ${countdown}` : ''}`}
      style={[
        styles.pill,
        { height: size === 'sm' ? 24 : 28, borderRadius: radius.sm, backgroundColor: solid ? c.solid : c.bg },
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text variant="labelSm" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
      {countdown ? (
        <Text variant="mono" style={{ color: fg, fontSize: 13, lineHeight: 16 }}>
          {countdown}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
});
