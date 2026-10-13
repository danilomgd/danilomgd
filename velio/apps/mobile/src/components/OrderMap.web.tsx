import { Icon, Text, useTheme } from '@velio/ui/native';
import { StyleSheet, View } from 'react-native';
import type { OrderMapProps } from './OrderMap';

/**
 * Web não tem `react-native-maps`: mostra um painel com o resumo (endereço, ETA, distância)
 * no lugar do mapa. O mapa ao vivo é funcionalidade do app nativo.
 */
export function OrderMap({ height = 260, accessibilitySummary, approxRadiusM }: OrderMapProps) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.box, { height, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg }]} accessibilityLabel={accessibilitySummary ?? 'Mapa indisponível na web'}>
      <Icon name="map" size="xl" color={colors.textMuted} />
      <Text variant="body" color="muted" align="center">
        {accessibilitySummary ?? (approxRadiusM ? 'Região aproximada do serviço' : 'Mapa ao vivo disponível no app')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
});
