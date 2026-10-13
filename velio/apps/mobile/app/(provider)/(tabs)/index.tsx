import { PROVIDER_AVAILABILITY_LABELS, type ProviderAvailability, TERMINAL_ORDER_STATUSES, formatBRL } from '@velio/contracts';
import { BottomSheet, Button, Card, CardSkeleton, Chip, EmptyState, Switch, Text, useTheme, useToast } from '@velio/ui/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { OrderRow } from '@/components/OrderRow';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { OfferCard } from '@/features/provider/OfferCard';
import { useProviderGate } from '@/hooks/useProviderGate';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { getCurrentPosition, requestForegroundLocation } from '@/lib/location';
import { qk } from '@/lib/query';

/** P-10: painel com interruptor de disponibilidade, ofertas pendentes e próxima ordem. */
export default function ProviderHomeScreen() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { colors, spacing } = useTheme();
  const { provider, query: me } = useProviderGate(true);
  const [permissionSheet, setPermissionSheet] = useState(false);

  const offers = useQuery({ queryKey: qk.provider.offers, queryFn: () => api.provider.offers(), refetchInterval: 20_000 });
  const orders = useQuery({ queryKey: qk.provider.orders('active'), queryFn: () => api.provider.orders({ scope: 'active', limit: 10 }), refetchInterval: 30_000 });
  const wallet = useQuery({ queryKey: qk.provider.wallet, queryFn: () => api.provider.wallet() });

  const setAvailability = useMutation({
    mutationFn: async (availability: ProviderAvailability) => {
      let location: { lat: number; lng: number } | undefined;
      if (availability === 'ONLINE' || availability === 'BUSY') {
        const perm = await requestForegroundLocation();
        if (perm !== 'granted') throw new Error('LOCATION_DENIED');
        location = (await getCurrentPosition()) ?? undefined;
      }
      return api.provider.setAvailability({ availability, location });
    },
    onSuccess: (p, availability) => {
      qc.setQueryData(qk.provider.me, p);
      track(availability === 'OFFLINE' || availability === 'UNAVAILABLE' ? 'provider_offline' : 'provider_online', { availability });
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'LOCATION_DENIED') setPermissionSheet(true);
      else toast.show({ message: errorMessage(e), tone: 'error' });
    },
  });

  const availability = provider?.availability ?? 'OFFLINE';
  const online = availability === 'ONLINE' || availability === 'BUSY';
  const pending = offers.data?.filter((o) => o.response === 'PENDING') ?? [];
  const active = orders.data?.items.filter((o) => !TERMINAL_ORDER_STATUSES.has(o.status)) ?? [];

  return (
    <Screen refreshing={me.isFetching || offers.isFetching} onRefresh={() => Promise.all([me.refetch(), offers.refetch(), orders.refetch()])}>
      <View style={{ gap: spacing[6] }}>
        <View style={[styles.availability, { backgroundColor: online ? colors.primary : colors.surface, borderColor: colors.border, borderRadius: 20 }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="caption" style={{ color: online ? colors.textOnPrimary : colors.textMuted }}>
              Disponibilidade
            </Text>
            <Text variant="title" style={{ color: online ? colors.textOnPrimary : colors.text }} accessibilityLiveRegion="polite">
              {PROVIDER_AVAILABILITY_LABELS[availability]}
            </Text>
            <Text variant="bodySm" style={{ color: online ? colors.textOnPrimary : colors.textMuted, opacity: 0.9 }}>
              {online ? 'Recebendo ofertas perto de você.' : 'Fique online para receber ofertas.'}
            </Text>
          </View>
          <Switch large value={online} onValueChange={(v) => setAvailability.mutate(v ? 'ONLINE' : 'OFFLINE')} loading={setAvailability.isPending} accessibilityLabel={online ? 'Ficar offline' : 'Ficar online'} />
        </View>
        <View style={styles.chips}>
          {(['ONLINE', 'BUSY', 'UNAVAILABLE', 'OFFLINE'] as const).map((a) => (
            <Chip key={a} label={PROVIDER_AVAILABILITY_LABELS[a]} selected={availability === a} onPress={() => availability !== a && setAvailability.mutate(a)} disabled={setAvailability.isPending} size="sm" />
          ))}
        </View>

        {pending.length ? (
          <Section title="Ofertas" subtitle="Responda antes de expirar.">
            <View style={{ gap: spacing[2] }}>
              {pending.map((o) => (
                <OfferCard key={o.id} offer={o} onPress={() => router.push(`/(provider)/offer/${o.id}`)} />
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="Próximo serviço">
          {orders.isPending ? (
            <CardSkeleton height={96} />
          ) : active.length ? (
            <View style={{ gap: spacing[2] }}>
              {active.slice(0, 3).map((o) => (
                <OrderRow key={o.id} order={o} role="provider" onPress={() => router.push(`/(provider)/order/${o.id}`)} />
              ))}
            </View>
          ) : (
            <EmptyState compact icon="clock" title={online ? 'Aguardando ofertas' : 'Nenhum serviço ativo'} description={online ? 'Avisamos com som e vibração quando chegar uma.' : 'Fique online para receber ofertas.'} />
          )}
        </Section>

        <Section title="Ganhos">
          <Card onPress={() => router.push('/(provider)/(tabs)/earnings')} accessibilityLabel="Ver ganhos">
            <View style={styles.kpis}>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="muted">
                  Disponível
                </Text>
                <Text variant="mono" style={{ fontSize: 18 }}>
                  {wallet.data ? formatBRL(wallet.data.balanceCents) : '—'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="muted">
                  A liberar
                </Text>
                <Text variant="mono" style={{ fontSize: 18 }}>
                  {wallet.data ? formatBRL(wallet.data.pendingCents) : '—'}
                </Text>
              </View>
            </View>
          </Card>
        </Section>
      </View>

      <BottomSheet visible={permissionSheet} onClose={() => setPermissionSheet(false)} title="Localização necessária">
        <View style={{ gap: spacing[3] }}>
          <Text variant="body" color="muted">
            Para ficar online, precisamos da sua localização: é assim que enviamos ofertas perto de você e mostramos seu trajeto ao cliente.
          </Text>
          <Text variant="bodySm" color="muted">
            Ajustes → VÉLIO Pro → Localização → Permitir durante o uso.
          </Text>
          <Button label="Abrir ajustes" onPress={() => Linking.openSettings()} />
          <Button label="Agora não" variant="ghost" onPress={() => setPermissionSheet(false)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  availability: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -12 },
  kpis: { flexDirection: 'row', gap: 16 },
});
