import type { ProviderPublic } from '@velio/contracts';
import { Avatar, Badge, IconButton, RatingStars, Text, useTheme } from '@velio/ui/native';
import { StyleSheet, View } from 'react-native';

/** Cartão do profissional no acompanhamento: nunca mostra telefone. */
export function ProviderCard({ provider, onChat, onHelp }: { provider: ProviderPublic; onChat?: () => void; onHelp?: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
      <Avatar name={provider.displayName} url={provider.avatarUrl} size={48} verified={provider.verified} />
      <View style={styles.texts}>
        <Text variant="titleSm" numberOfLines={1}>
          {provider.displayName}
        </Text>
        <View style={styles.meta}>
          <RatingStars value={provider.ratingAvg} size={14} showNumber />
          <Text variant="caption" color="muted">
            · {provider.completedCount} serviços
          </Text>
        </View>
        {provider.verified ? <Badge variant="label" label="Verificado" tone="success" /> : null}
      </View>
      {onChat ? <IconButton icon="message-circle" accessibilityLabel="Abrir chat" variant="tonal" onPress={onChat} /> : null}
      {onHelp ? <IconButton icon="help-circle" accessibilityLabel="Preciso de ajuda" variant="tonal" onPress={onHelp} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  texts: { flex: 1, gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
