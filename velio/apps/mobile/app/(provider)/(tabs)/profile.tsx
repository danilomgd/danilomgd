import { useQuery } from '@tanstack/react-query';
import { formatBRL, PROVIDER_AVAILABILITY_LABELS, ProviderIndicators } from '@velio/contracts';
import {
  Avatar,
  Button,
  Card,
  CardSkeleton,
  ListItem,
  RatingStars,
  StatusPill,
  Text,
  useTheme,
} from '@velio/ui/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSession } from '@/auth/session';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { DOCUMENT_KINDS, DocumentUploadSheet } from '@/features/provider/DocumentUploadSheet';
import { useProviderGate } from '@/hooks/useProviderGate';
import { api } from '@/lib/api';
import { APP_VERSION } from '@/lib/config';
import { formatMinutes, percent } from '@/lib/format';
import { qk } from '@/lib/query';

const DOC_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  VERIFIED: { label: 'Verificado', tone: 'success' },
  PENDING: { label: 'Em análise', tone: 'warning' },
  REJECTED: { label: 'Recusado', tone: 'danger' },
};

/** P-24 / P-23: perfil, indicadores, documentos, sair. */
export default function ProviderProfileScreen() {
  const session = useSession();
  const { spacing } = useTheme();
  const { provider } = useProviderGate(true);
  const [docOpen, setDocOpen] = useState(false);
  const indicators = useQuery({
    queryKey: qk.provider.indicators(30),
    queryFn: async () => {
      const r = ProviderIndicators.safeParse(await api.provider.indicators(30));
      return r.success ? r.data : null;
    },
  });
  const ind = indicators.data;

  return (
    <Screen>
      <View style={[styles.head, { marginBottom: spacing[6] }]}>
        <Avatar
          name={provider?.displayName ?? session.user?.name}
          url={session.user?.avatarUrl}
          size={48}
          availability={provider?.availability}
        />
        <View style={{ flex: 1 }}>
          <Text variant="title">{provider?.displayName ?? session.user?.name ?? ''}</Text>
          <Text variant="bodySm" color="muted">
            {provider ? PROVIDER_AVAILABILITY_LABELS[provider.availability] : ''}
            {provider?.ratingCount ? ` · ${provider.ratingCount} avaliações` : ''}
          </Text>
        </View>
        <RatingStars value={provider?.ratingAvg ?? null} />
      </View>

      <Section title="Indicadores" subtitle="Últimos 30 dias">
        {indicators.isPending ? (
          <CardSkeleton height={140} />
        ) : (
          <Card>
            <View style={styles.grid}>
              <Kpi
                label="Nota"
                value={
                  ind?.ratingAvg != null
                    ? ind.ratingAvg.toFixed(1).replace('.', ',')
                    : provider?.ratingAvg != null
                      ? provider.ratingAvg.toFixed(1).replace('.', ',')
                      : '—'
                }
              />
              <Kpi label="Concluídos" value={String(ind?.completed ?? provider?.completedCount ?? 0)} />
              <Kpi label="Aceite" value={percent(ind?.acceptanceRate ?? provider?.acceptanceRate)} />
              <Kpi
                label="Cancelamentos"
                value={ind ? String(ind.cancelled) : percent(provider?.cancellationRate)}
              />
              <Kpi
                label="Resposta"
                value={
                  ind?.avgResponseSeconds != null
                    ? `${Math.round(ind.avgResponseSeconds)} s`
                    : provider?.avgResponseSeconds != null
                      ? formatMinutes(provider.avgResponseSeconds / 60)
                      : '—'
                }
              />
              <Kpi
                label="Ganhos"
                value={
                  ind ? formatBRL(ind.earningsCents) : provider ? formatBRL(provider.walletBalanceCents) : '—'
                }
              />
            </View>
          </Card>
        )}
      </Section>

      <Section title="Documentos" action={{ label: 'Enviar', onPress: () => setDocOpen(true) }}>
        {provider?.documents.length ? (
          provider.documents.map((d, i) => (
            <ListItem
              // biome-ignore lint/suspicious/noArrayIndexKey: documentos não têm id no contrato
              key={`${d.kind}-${i}`}
              title={DOCUMENT_KINDS.find((k) => k.value === d.kind)?.label ?? d.kind}
              subtitle={d.rejectedReason}
              icon="file-text"
              trailing={
                <StatusPill
                  label={DOC_STATUS[d.status]?.label ?? d.status}
                  tone={DOC_STATUS[d.status]?.tone ?? 'neutral'}
                  size="sm"
                />
              }
            />
          ))
        ) : (
          <Text variant="bodySm" color="muted">
            Nenhum documento enviado.
          </Text>
        )}
      </Section>

      <Section title="Conta">
        <ListItem
          title="Raio de atendimento"
          value={provider ? `${provider.serviceRadiusKm} km` : '—'}
          icon="map"
        />
        <ListItem title="Categorias" value={String(provider?.categoryIds.length ?? 0)} icon="grid" />
        <ListItem
          title="Sair"
          icon="log-out"
          destructive
          divider={false}
          onPress={() => session.signOut()}
          chevron={false}
        />
      </Section>
      <Text variant="caption" color="muted" align="center">
        VÉLIO Pro {APP_VERSION}
      </Text>
      <View style={{ height: spacing[4] }} />
      <Button label="Enviar documento" variant="secondary" onPress={() => setDocOpen(true)} />
      <DocumentUploadSheet visible={docOpen} onClose={() => setDocOpen(false)} />
    </Screen>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '30%', minWidth: 90 }}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="mono" style={{ fontSize: 18, lineHeight: 24 }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
});
