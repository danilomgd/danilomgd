import { type DispatchOffer, formatBRL } from '@velio/contracts';
import { Card, StatusPill, Text, useTheme } from '@velio/ui/native';
import { StyleSheet, View } from 'react-native';
import { useCountdown } from '@/hooks/useCountdown';
import { formatCountdown, formatDistanceKm, formatMinutes, formatSchedule } from '@/lib/format';

/** Resumo de oferta pendente no painel. */
export function OfferCard({ offer, onPress }: { offer: DispatchOffer; onPress: () => void }) {
  const remaining = useCountdown(offer.expiresAt);
  const { spacing } = useTheme();
  const s = offer.summary;
  return (
    <Card variant="elevated" onPress={onPress} accessibilityLabel={`Oferta: ${s.serviceName}, ${s.providerPayoutCents != null ? formatBRL(s.providerPayoutCents) : ''}, expira em ${formatCountdown(remaining)}`}>
      <View style={styles.row}>
        <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
          {s.serviceName}
        </Text>
        <StatusPill label="Expira em" countdown={formatCountdown(remaining)} tone={remaining <= 10 ? 'danger' : remaining <= 30 ? 'warning' : 'info'} size="sm" />
      </View>
      <View style={[styles.row, { marginTop: spacing[2] }]}>
        <Text variant="mono" style={{ fontSize: 18 }}>
          {s.providerPayoutCents != null ? formatBRL(s.providerPayoutCents) : 'Sob orçamento'}
        </Text>
        <Text variant="bodySm" color="muted">
          {formatDistanceKm(s.distanceKm)} · {s.approxLocation.neighborhood} · {s.scheduledFor ? formatSchedule(s.scheduledFor) : 'Agora'}
          {s.estimatedDurationMinutes ? ` · ${formatMinutes(s.estimatedDurationMinutes)}` : ''}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' } });
