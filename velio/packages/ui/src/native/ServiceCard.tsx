import { formatBRL } from '@velio/contracts';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export interface ServiceCardData {
  name: string;
  shortDescription?: string | null;
  imageUrl?: string | null;
  pricingModel: 'FIXED' | 'HOURLY' | 'QUOTE' | 'RANGE';
  basePriceCents?: number | null;
  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  hourlyRateCents?: number | null;
  estimatedDurationMinutes?: number | null;
}

/** Linha de preço curta e honesta a partir do modelo de preço. */
export function priceLine(s: ServiceCardData): string {
  switch (s.pricingModel) {
    case 'FIXED':
      return s.basePriceCents != null ? formatBRL(s.basePriceCents) : 'Preço na confirmação';
    case 'HOURLY':
      return s.hourlyRateCents != null ? `${formatBRL(s.hourlyRateCents)}/h` : s.basePriceCents != null ? `${formatBRL(s.basePriceCents)}/h` : 'Por hora';
    case 'RANGE':
      if (s.priceMinCents != null && s.priceMaxCents != null) return `${formatBRL(s.priceMinCents)} – ${formatBRL(s.priceMaxCents)}`;
      if (s.priceMinCents != null) return `A partir de ${formatBRL(s.priceMinCents)}`;
      return 'Faixa de preço na confirmação';
    default:
      return 'Sob orçamento';
  }
}

export function durationLine(minutes: number | null | undefined): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `cerca de ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `cerca de ${h}h${String(m).padStart(2, '0')}` : `cerca de ${h}h`;
}

export interface ServiceCardProps {
  service: ServiceCardData;
  variant?: 'tile' | 'row';
  badge?: string;
  /** Legenda da razão (recomendações). */
  reason?: string | null;
  onPress: () => void;
  width?: number;
}

/** Cartão de serviço: `tile` para carrosséis (capa 3:2) e `row` para listas. */
export function ServiceCard({ service, variant = 'tile', badge, reason, onPress, width = 176 }: ServiceCardProps) {
  const { colors, radius, elevation } = useTheme();
  const duration = durationLine(service.estimatedDurationMinutes);
  const cover = (size: { w: number | string; h: number }) =>
    service.imageUrl ? (
      <Image source={{ uri: service.imageUrl }} style={{ width: size.w as number, height: size.h, borderRadius: variant === 'row' ? radius.md : 0 }} />
    ) : (
      <View style={[{ width: size.w as number, height: size.h, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', borderRadius: variant === 'row' ? radius.md : 0 }]}>
        <Icon name="tool" size={variant === 'row' ? 'lg' : 'xl'} color={colors.primary} />
      </View>
    );

  if (variant === 'row') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${service.name}, ${priceLine(service)}`}
        onPress={onPress}
        style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, opacity: pressed ? 0.85 : 1 }]}
      >
        {cover({ w: 56, h: 56 })}
        <View style={styles.rowTexts}>
          <Text variant="heading" numberOfLines={1}>
            {service.name}
          </Text>
          {reason ? (
            <Text variant="caption" color="brand" numberOfLines={2}>
              {reason}
            </Text>
          ) : service.shortDescription ? (
            <Text variant="bodySm" color="muted" numberOfLines={1}>
              {service.shortDescription}
            </Text>
          ) : null}
          <Text variant="mono" color="primary">
            {priceLine(service)}
            {duration ? (
              <Text variant="caption" color="muted">
                {'  '}
                {duration}
              </Text>
            ) : null}
          </Text>
        </View>
        <Icon name="chevron-right" size="md" color={colors.textMuted} />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${service.name}, ${priceLine(service)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { width, backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border, ...elevation.sm },
        pressed ? { transform: [{ scale: 0.99 }] } : null,
      ]}
    >
      <View style={{ borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: 'hidden' }}>
        {cover({ w: width, h: Math.round((width * 2) / 3) })}
        {badge ? (
          <View style={styles.badge}>
            <Badge variant="label" label={badge} tone="primary" />
          </View>
        ) : null}
      </View>
      <View style={styles.tileBody}>
        <Text variant="heading" numberOfLines={2} style={{ minHeight: 44 }}>
          {service.name}
        </Text>
        <Text variant="mono">{priceLine(service)}</Text>
        {duration ? (
          <Text variant="caption" color="muted">
            {duration}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  tileBody: { padding: 12, gap: 4 },
  badge: { position: 'absolute', top: 8, left: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  rowTexts: { flex: 1, gap: 2 },
});
