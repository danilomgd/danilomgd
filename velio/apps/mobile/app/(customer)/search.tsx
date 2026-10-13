import { Chip, EmptyState, Input, ListSkeleton, ServiceCard, useTheme } from '@velio/ui/native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Header } from '@/components/Header';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/** C-04: busca por texto com categorias como atalho no vazio. */
export default function SearchScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(id);
  }, [text]);

  const results = useQuery({ queryKey: qk.search(q), queryFn: () => api.catalog.search(q), enabled: q.length >= 2 });
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => api.catalog.categories() });

  useEffect(() => {
    if (results.data && q) track('search_performed', { query: q, resultsCount: results.data.length });
  }, [results.data, q]);

  return (
    <Screen>
      <Header title="Buscar" />
      <Input kind="search" placeholder="O que você precisa?" value={text} onChangeText={setText} autoFocus returnKeyType="search" containerStyle={{ marginBottom: spacing[4] }} />
      {q.length < 2 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {(categories.data ?? []).filter((c) => c.active && !c.parentId).map((c) => (
            <Chip key={c.id} label={c.name} icon={c.icon} onPress={() => router.push(`/(customer)/category/${c.slug}`)} />
          ))}
        </View>
      ) : (
        <QueryState query={results} skeleton={<ListSkeleton rows={4} />}>
          {() =>
            results.data?.length ? (
              <View style={{ gap: spacing[2] }}>
                {results.data.map((s) => (
                  <ServiceCard key={s.id} service={s} variant="row" onPress={() => router.push(`/(customer)/service/${s.slug}`)} />
                ))}
              </View>
            ) : (
              <EmptyState icon="search" title={`Nada encontrado para "${q}"`} description="Tente outra palavra ou escolha uma categoria." />
            )
          }
        </QueryState>
      )}
    </Screen>
  );
}
