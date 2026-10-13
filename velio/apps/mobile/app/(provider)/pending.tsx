import { Button, EmptyState, ListItem, StatusPill, Text, useTheme } from '@velio/ui/native';
import { useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/auth/session';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import {
  DOCUMENT_KINDS,
  type DocumentKind,
  DocumentUploadSheet,
} from '@/features/provider/DocumentUploadSheet';
import { useProviderGate } from '@/hooks/useProviderGate';

const DOC_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  VERIFIED: { label: 'Verificado', tone: 'success' },
  PENDING: { label: 'Em análise', tone: 'warning' },
  REJECTED: { label: 'Recusado', tone: 'danger' },
};
const REQUIRED: DocumentKind[] = ['ID_FRONT', 'ID_BACK', 'SELFIE', 'PROOF_OF_ADDRESS'];

/** P-04 / P-09: documentos e status do cadastro (em análise, suspenso, bloqueado). */
export default function PendingScreen() {
  const session = useSession();
  const { spacing } = useTheme();
  const { provider, query } = useProviderGate(true);
  const [docOpen, setDocOpen] = useState<DocumentKind | null>(null);
  const docs = provider?.documents ?? [];
  const missing = REQUIRED.filter((k) => !docs.some((d) => d.kind === k && d.status !== 'REJECTED'));
  const blocked = provider?.status === 'BLOCKED';
  const suspended = provider?.status === 'SUSPENDED';

  return (
    <Screen
      refreshing={query.isFetching}
      onRefresh={() => query.refetch()}
      footer={
        missing.length ? (
          <Button
            label={`Enviar ${DOCUMENT_KINDS.find((k) => k.value === missing[0])?.label ?? 'documento'}`}
            onPress={() => setDocOpen(missing[0] ?? null)}
          />
        ) : undefined
      }
    >
      <View style={{ paddingTop: spacing[4] }}>
        {blocked ? (
          <EmptyState
            icon="slash"
            title="Cadastro bloqueado"
            description="Fale com o suporte para entender o motivo."
          />
        ) : suspended ? (
          <EmptyState
            icon="pause-circle"
            title="Cadastro suspenso"
            description="Você não recebe ofertas enquanto a suspensão durar. Veja seu e-mail ou fale com o suporte."
          />
        ) : missing.length ? (
          <EmptyState
            icon="file-text"
            title="Envie seus documentos"
            description={`Faltam ${missing.length}: ${missing.map((m) => DOCUMENT_KINDS.find((k) => k.value === m)?.label).join(', ')}.`}
          />
        ) : (
          <EmptyState
            icon="clock"
            title="Cadastro em análise"
            description="Revisamos documentos em até 2 dias úteis. Avisamos por notificação."
          />
        )}
      </View>
      <Section
        title="Documentos"
        action={{ label: 'Enviar outro', onPress: () => setDocOpen('CERTIFICATE') }}
      >
        {docs.length ? (
          docs.map((d, i) => (
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
              onPress={d.status === 'REJECTED' ? () => setDocOpen(d.kind as DocumentKind) : undefined}
            />
          ))
        ) : (
          <Text variant="bodySm" color="muted">
            Nenhum documento enviado ainda.
          </Text>
        )}
      </Section>
      <Button label="Sair" variant="ghost" onPress={() => session.signOut()} />
      <DocumentUploadSheet
        visible={Boolean(docOpen)}
        onClose={() => setDocOpen(null)}
        initialKind={docOpen ?? undefined}
      />
    </Screen>
  );
}
