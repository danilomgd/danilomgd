import { useQuery } from '@tanstack/react-query';
import { Chip, EmptyState, ListSkeleton, ServiceCard, Text, useTheme } from '@velio/ui/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { Header } from '@/components/Header';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/** C-06: categoria com subcategorias (chips) e serviços da região. */
export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { spacing } = useTheme();
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => api.catalog.categories() });
  const category = categories.data?.find((c) => c.slug === slug);
  const children = categories.data?.filter((c) => c.parentId === category?.id && c.active) ?? [];
  const services = useQuery({
    queryKey: qk.services(slug),
    queryFn: () => api.catalog.services({ category: slug }),
    enabled: Boolean(slug),
  });

  useEffect(() => {
    if (category) track('category_view', { slug: category.slug });
  }, [category]);

  return (
    <Screen>
      <Header title={category?.name ?? 'Categoria'} />
      {category?.description ? (
        <Text variant="body" color="muted" style={{ marginBottom: spacing[4] }}>
          {category.description}
        </Text>
      ) : null}
      {children.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing[2], paddingBottom: spacing[4] }}
        >
          {children.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              icon={c.icon}
              onPress={() => router.push(`/(customer)/category/${c.slug}`)}
            />
          ))}
        </ScrollView>
      ) : null}
      <QueryState query={services} skeleton={<ListSkeleton rows={5} />}>
        {() =>
          services.data?.length ? (
            <View style={{ gap: spacing[2] }}>
              {services.data.map((s) => (
                <ServiceCard
                  key={s.id}
                  service={s}
                  variant="row"
                  badge={s.allowsImmediate ? 'Agora' : undefined}
                  onPress={() => router.push(`/(customer)/service/${s.slug}`)}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="map"
              title="Ainda não atendemos aqui"
              description="Esta categoria não tem serviços na sua região por enquanto."
              action={{ label: 'Ver outras categorias', onPress: () => router.back() }}
            />
          )
        }
      </QueryState>
    </Screen>
  );
}
