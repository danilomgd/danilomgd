import { Image, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export interface AvatarProps {
  name?: string | null;
  url?: string | null;
  size?: 24 | 32 | 40 | 48 | 72;
  availability?: 'ONLINE' | 'BUSY' | 'OFFLINE' | 'UNAVAILABLE' | null;
  verified?: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Avatar com iniciais, imagem ou ícone; indicador de disponibilidade e selo verificado. */
export function Avatar({ name, url, size = 40, availability, verified }: AvatarProps) {
  const { colors } = useTheme();
  const dotColor =
    availability === 'ONLINE' ? colors.success : availability === 'BUSY' ? colors.warning : colors.textMuted;
  const fontSize = Math.round(size * 0.38);
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={name ? `Foto de ${name}` : 'Avatar'}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft },
          ]}
        >
          {name ? (
            <Text style={{ color: colors.primary, fontSize, fontWeight: '600', lineHeight: fontSize * 1.2 }}>
              {initials(name)}
            </Text>
          ) : (
            <Icon name="user" size={Math.round(size * 0.5)} color={colors.primary} />
          )}
        </View>
      )}
      {availability ? (
        <View
          style={[
            styles.dot,
            {
              backgroundColor: dotColor,
              borderColor: colors.surface,
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: size * 0.14,
            },
          ]}
        />
      ) : null}
      {verified ? (
        <View style={[styles.verified, { backgroundColor: colors.success, borderColor: colors.surface }]}>
          <Icon name="check" size={10} color={colors.textOnPrimary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', right: 0, bottom: 0, borderWidth: 2 },
  verified: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
