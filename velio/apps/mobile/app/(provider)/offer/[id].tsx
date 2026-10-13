import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatBRL } from '@velio/contracts';
import { Button, CardSkeleton, StatusPill, Text, useTheme, useToast } from '@velio/ui/native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderMap } from '@/components/OrderMap';
import { useCountdown } from '@/hooks/useCountdown';
import { useOrderCacheUpdater } from '@/hooks/useOrder';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage, isConflict } from '@/lib/errors';
import { formatCountdown, formatDistanceKm, formatMinutes, formatSchedule } from '@/lib/format';
import { qk } from '@/lib/query';

/** P-11: oferta recebida. Tela cheia, contagem regressiva, aceitar com um toque. */
export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();
  const updateCache = useOrderCacheUpdater();
  const offers = useQuery({ queryKey: qk.provider.offers, queryFn: () => api.provider.offers() });
  const offer = offers.data?.find((o) => o.id === id);
  const remaining = useCountdown(offer?.expiresAt);
  const openedAt = useRef(Date.now());
  const closed = useRef(false);

  function close() {
    if (closed.current) return;
    closed.current = true;
    qc.invalidateQueries({ queryKey: qk.provider.offers });
    if (router.canGoBack()) router.back();
    else router.replace('/(provider)/(tabs)');
  }

  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!offer || announced.current === offer.id) return;
    announced.current = offer.id;
    track(
      'offer_received',
      { distanceKm: offer.summary.distanceKm, payoutCents: offer.summary.providerPayoutCents },
      offer.orderId,
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [offer]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fecha quando a oferta some da lista
  useEffect(() => {
    if (offers.isSuccess && !offer) {
      toast.show({ message: 'Oferta expirada.', tone: 'warning' });
      close();
    }
  }, [offers.isSuccess, offer]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fecha quando a oferta é decidida
  useEffect(() => {
    if (offer && offer.response !== 'PENDING') {
      toast.show({
        message: offer.response === 'EXPIRED' ? 'Oferta expirada.' : 'Esta oferta não está mais disponível.',
        tone: 'warning',
      });
      close();
    }
  }, [offer?.response]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fecha ao expirar a contagem
  useEffect(() => {
    if (offer && remaining <= 0) {
      track('offer_expired', {}, offer.orderId);
      toast.show({ message: 'Oferta expirada.', tone: 'warning' });
      close();
    }
  }, [remaining, offer?.id]);

  const accept = useMutation({
    mutationFn: () => api.provider.acceptOffer(id),
    onSuccess: (order) => {
      track(
        'offer_accepted',
        { secondsToDecide: Math.round((Date.now() - openedAt.current) / 1000) },
        order.id,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      updateCache(order);
      qc.invalidateQueries({ queryKey: qk.provider.offers });
      qc.invalidateQueries({ queryKey: qk.provider.me });
      closed.current = true;
      router.replace(`/(provider)/order/${order.id}`);
    },
    onError: (e) => {
      toast.show({
        message: isConflict(e) ? 'Esta oferta já foi aceita por outro profissional.' : errorMessage(e),
        tone: 'error',
      });
      if (isConflict(e)) close();
    },
  });
  const reject = useMutation({
    mutationFn: () => api.provider.rejectOffer(id),
    onSuccess: () => {
      track(
        'offer_rejected',
        { secondsToDecide: Math.round((Date.now() - openedAt.current) / 1000) },
        offer?.orderId,
      );
      close();
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  if (!offer) {
    return (
      <View
        style={[
          styles.root,
          { backgroundColor: colors.bg, paddingTop: insets.top + spacing[4], paddingHorizontal: spacing[5] },
        ]}
      >
        <CardSkeleton height={320} />
      </View>
    );
  }
  const s = offer.summary;
  const total = Math.max(
    1,
    (new Date(offer.expiresAt).getTime() - new Date(offer.offeredAt).getTime()) / 1000,
  );
  const progress = Math.max(0, Math.min(1, remaining / total));
  const urgent = remaining <= 10;

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + spacing[4] },
      ]}
    >
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress * 100}%`, backgroundColor: urgent ? colors.danger : colors.primary },
          ]}
        />
      </View>
      <View style={{ paddingHorizontal: spacing[5], gap: spacing[5], flex: 1 }}>
        <View style={styles.rowBetween}>
          <Text variant="labelSm" color="muted">
            Nova oferta
          </Text>
          <StatusPill
            label="Responder em"
            countdown={formatCountdown(remaining)}
            tone={urgent ? 'danger' : remaining <= 30 ? 'warning' : 'info'}
          />
        </View>
        <View>
          <Text
            variant="display"
            accessibilityLabel={`Remuneração ${s.providerPayoutCents != null ? formatBRL(s.providerPayoutCents) : 'sob orçamento'}`}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {s.providerPayoutCents != null ? formatBRL(s.providerPayoutCents) : 'Sob orçamento'}
          </Text>
          {s.priceCents != null ? (
            <Text variant="caption" color="muted">
              Cliente paga {formatBRL(s.priceCents)}
            </Text>
          ) : null}
        </View>
        <View style={{ gap: 4 }}>
          <Text variant="title">{s.serviceName}</Text>
          <Text variant="bodySm" color="muted">
            {s.categorySlug.replace(/-/g, ' ')}
          </Text>
        </View>
        <View style={[styles.logistics, { borderColor: colors.border, borderRadius: radius.lg }]}>
          <Fact label="Distância" value={formatDistanceKm(s.distanceKm)} />
          <Fact label="Local" value={s.approxLocation.neighborhood} />
          <Fact label="Quando" value={s.scheduledFor ? formatSchedule(s.scheduledFor) : 'Agora'} />
        </View>
        <OrderMap
          destination={{ lat: s.approxLocation.lat, lng: s.approxLocation.lng }}
          approxRadiusM={600}
          height={150}
          accessibilitySummary={`Região aproximada: ${s.approxLocation.neighborhood}, ${s.approxLocation.city}, a ${formatDistanceKm(s.distanceKm)}`}
        />
        <View style={{ gap: 4 }}>
          {s.estimatedDurationMinutes ? (
            <Text variant="body" color="muted">
              Duração: cerca de {formatMinutes(s.estimatedDurationMinutes)}
            </Text>
          ) : null}
          {s.notes ? (
            <Text variant="body" color="muted" numberOfLines={3}>
              Obs.: {s.notes}
            </Text>
          ) : null}
        </View>
        <View style={{ flex: 1 }} />
        <Button
          label="Aceitar"
          size="xl"
          onPress={() => accept.mutate()}
          loading={accept.isPending}
          disabled={reject.isPending}
        />
        <Button
          label="Recusar"
          variant="ghost"
          onPress={() => reject.mutate()}
          loading={reject.isPending}
          disabled={accept.isPending}
        />
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="label" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progressTrack: { height: 4 },
  progressFill: { height: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  logistics: { flexDirection: 'row', gap: 12, padding: 16, borderWidth: 1 },
});
