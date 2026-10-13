import type { HomeSection } from '@velio/contracts';
import { Button, Card, CardSkeleton, CategoryTile, ErrorState, Icon, ServiceCard, Skeleton, Text, useTheme } from '@velio/ui/native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSession } from '@/auth/session';
import { OrderRow } from '@/components/OrderRow';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { firstName, greetingFor } from '@/lib/format';
import { qk } from '@/lib/query';
import { deepLinkToPath, sectionBanners, sectionCategories, sectionOrders, sectionPlans, sectionServices, sectionSubscriptions } from '@/features/customer/home/sections';

/** C-03: home configurável. Renderiza `HomeResponse.sections` por `kind`; tipos desconhecidos são ignorados. */
export default function HomeScreen() {
  const router = useRouter();
  const session = useSession();
  const { colors, spacing, radius } = useTheme();
  const location = useCurrentLocation();

  const addresses = useQuery({ queryKey: qk.addresses, queryFn: () => api.me.addresses() });
  const defaultAddress = addresses.data?.find((a) => a.isDefault) ?? addresses.data?.[0];
  const coords = useMemo(() => {
    if (defaultAddress) return { lat: defaultAddress.lat, lng: defaultAddress.lng };
    if (location) return location;
    return undefined;
  }, [defaultAddress, location]);

  const home = useQuery({
    queryKey: qk.home(coords?.lat, coords?.lng),
    queryFn: () => api.catalog.home(coords),
    enabled: location !== undefined || Boolean(defaultAddress),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (home.data) track('home_view', { sections: home.data.sections.length, hasAddress: Boolean(defaultAddress) });
  }, [home.data, defaultAddress]);

  const greeting = home.data?.greeting ?? `${greetingFor(new Date().getHours())}${session.user?.name ? `, ${firstName(session.user.name)}` : ''}`;

  return (
    <Screen padded={false} refreshing={home.isFetching && !home.isPending} onRefresh={() => home.refetch()}>
      <View style={[styles.topBar, { paddingHorizontal: spacing[4] }]}>
        <Pressable
          onPress={() => router.push('/(customer)/account/addresses')}
          accessibilityRole="button"
          accessibilityLabel={defaultAddress ? `Endereço atual: ${defaultAddress.street}, ${defaultAddress.number}. Trocar` : 'Definir endereço'}
          style={styles.address}
        >
          <Icon name="map-pin" size="md" color={colors.primary} />
          <Text variant="labelSm" numberOfLines={1} style={{ flexShrink: 1 }}>
            {defaultAddress ? `${defaultAddress.street}, ${defaultAddress.number}` : location ? 'Localização atual' : 'Definir endereço'}
          </Text>
          <Icon name="chevron-down" size="sm" color={colors.textMuted} />
        </Pressable>
        <Pressable onPress={() => router.push('/(customer)/account/notifications')} accessibilityRole="button" accessibilityLabel="Notificações" style={styles.bell}>
          <Icon name="bell" size="lg" color={colors.text} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing[4], paddingBottom: spacing[4], gap: spacing[2] }}>
        <Text variant="displaySm" accessibilityRole="header">
          {greeting}
        </Text>
        {home.data?.contextHint ? (
          <View style={[styles.hint, { backgroundColor: colors.accentSoft, borderRadius: radius.md }]}>
            <Icon name="info" size="sm" color={colors.warning} />
            <Text variant="bodySm" style={{ flex: 1 }}>
              {home.data.contextHint.text}
            </Text>
          </View>
        ) : null}
      </View>

      {home.isPending ? (
        <HomeSkeleton />
      ) : home.isError ? (
        <ErrorState description={errorMessage(home.error)} onRetry={() => home.refetch()} retrying={home.isFetching} />
      ) : (
        home.data.sections.map((s) => <SectionRenderer key={s.id} section={s} />)
      )}
    </Screen>
  );
}

function SectionRenderer({ section }: { section: HomeSection }) {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const gutter = { paddingHorizontal: spacing[4] };
  const openService = (slug: string) => router.push(`/(customer)/service/${slug}`);

  switch (section.kind) {
    case 'hero':
    case 'search':
      return (
        <View style={[gutter, { marginBottom: spacing[6] }]}>
          <Pressable
            onPress={() => router.push('/(customer)/search')}
            accessibilityRole="search"
            accessibilityLabel={section.title ?? 'Buscar serviço'}
            style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill }]}
          >
            <Icon name="search" size="md" color={colors.textMuted} />
            <Text variant="body" color="muted">
              {section.title ?? 'O que você precisa?'}
            </Text>
          </Pressable>
        </View>
      );
    case 'active_orders': {
      const orders = sectionOrders(section);
      if (!orders.length) return null;
      return (
        <Section title={section.title ?? 'Em andamento'} style={gutter}>
          <View style={{ gap: spacing[2] }}>
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} role="customer" onPress={() => router.push(`/(customer)/order/${o.id}`)} />
            ))}
          </View>
        </Section>
      );
    }
    case 'categories': {
      const cats = sectionCategories(section).filter((c) => c.active);
      if (!cats.length) return null;
      return (
        <Section title={section.title} subtitle={section.subtitle} style={gutter}>
          <View style={styles.grid}>
            {cats.map((c) => (
              <CategoryTile key={c.id} name={c.name} icon={c.icon} onPress={() => router.push(`/(customer)/category/${c.slug}`)} />
            ))}
          </View>
        </Section>
      );
    }
    case 'quick_services': {
      const services = sectionServices(section);
      if (!services.length) return null;
      return (
        <Section title={section.title ?? 'Serviços rápidos'} subtitle={section.subtitle} style={{ paddingLeft: spacing[4] }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[3], paddingRight: spacing[4] }}>
            {services.map((s) => (
              <ServiceCard key={s.id} service={s} badge={s.allowsImmediate ? 'Agora' : undefined} onPress={() => openService(s.slug)} />
            ))}
          </ScrollView>
        </Section>
      );
    }
    case 'scheduled':
    case 'recommendations': {
      const services = sectionServices(section);
      if (!services.length) return null;
      return (
        <Section title={section.title} subtitle={section.subtitle} style={gutter}>
          <View style={{ gap: spacing[2] }}>
            {services.map((s) => (
              <ServiceCard key={s.id} service={s} variant="row" reason={section.kind === 'recommendations' ? (s.reason ?? null) : null} onPress={() => openService(s.slug)} />
            ))}
          </View>
        </Section>
      );
    }
    case 'subscriptions': {
      const subs = sectionSubscriptions(section);
      const plans = sectionPlans(section);
      const active = subs.find((s) => s.status === 'ACTIVE' || s.status === 'PAST_DUE');
      return (
        <Section title={section.title ?? 'Planos de manutenção'} subtitle={section.subtitle} style={gutter}>
          {active ? (
            <Card variant="elevated" onPress={() => router.push(`/(customer)/subscriptions/${active.id}`)} accessibilityLabel={`Assinatura ${active.planName}`}>
              <Text variant="heading">{active.planName}</Text>
              <Text variant="bodySm" color="muted">
                {active.nextVisitDueAt ? `Próxima visita: ${new Date(active.nextVisitDueAt).toLocaleDateString('pt-BR')}` : 'Visitas serão agendadas em breve pela nossa equipe'}
              </Text>
            </Card>
          ) : (
            <Card variant="elevated">
              <Text variant="heading">{plans[0]?.name ?? 'Casa em dia, sem lembrar'}</Text>
              <Text variant="bodySm" color="muted" style={{ marginBottom: 12 }}>
                {plans[0]?.description ?? 'Manutenção recorrente com visitas agendadas.'}
              </Text>
              <Button label="Ver planos" variant="secondary" size="md" onPress={() => router.push('/(customer)/subscriptions/plans')} />
            </Card>
          )}
        </Section>
      );
    }
    case 'concierge':
      return (
        <Section title={section.title ?? 'Concierge'} subtitle={section.subtitle} style={gutter}>
          <Pressable onPress={() => router.push('/(customer)/concierge')} accessibilityRole="button" accessibilityLabel="Abrir concierge" style={[styles.concierge, { backgroundColor: colors.primary, borderRadius: radius.lg }]}>
            <Text variant="body" style={{ color: colors.textOnPrimary, flex: 1 }}>
              Descreva o que precisa. Nós resolvemos.
            </Text>
            <Icon name="arrow-right" size="md" color={colors.textOnPrimary} />
          </Pressable>
        </Section>
      );
    case 'banner': {
      const banners = sectionBanners(section);
      if (!banners.length) return null;
      return (
        <View style={[gutter, { gap: spacing[3], marginBottom: spacing[6] }]}>
          {banners.map((b, i) => {
            const path = deepLinkToPath(b.deepLink);
            return (
              <Pressable
                key={b.id ?? `${b.title}-${i}`}
                disabled={!path}
                onPress={() => path && router.push(path)}
                accessibilityRole="button"
                accessibilityLabel={b.title}
                style={[styles.banner, { backgroundColor: colors.primarySoft, borderRadius: radius.lg }]}
              >
                {b.imageUrl ? <Image source={{ uri: b.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                <View style={styles.bannerText}>
                  <Text variant="titleSm">{b.title}</Text>
                  {b.subtitle ? (
                    <Text variant="bodySm" color="muted">
                      {b.subtitle}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      );
    }
    default:
      return null;
  }
}

function HomeSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 24 }}>
      <Skeleton height={52} radius={999} />
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={76} height={88} radius={16} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <CardSkeleton height={200} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: 8 },
  address: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, flexShrink: 1 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  search: { height: 52, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  concierge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, minHeight: 64 },
  banner: { minHeight: 120, overflow: 'hidden', justifyContent: 'flex-end' },
  bannerText: { padding: 16, gap: 2 },
});
