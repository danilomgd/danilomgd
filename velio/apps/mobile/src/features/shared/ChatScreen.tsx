import type { Message } from '@velio/contracts';
import { ErrorState, IconButton, Input, ListSkeleton, Text, useTheme } from '@velio/ui/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { qk } from '@/lib/query';
import { subscribe } from '@/lib/realtime';

/** C-12 / P-18: chat da ordem. Mensagens de sistema por status; nunca expõe telefone. */
export function ChatScreen({ role }: { role: 'customer' | 'provider' }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { colors, radius, spacing } = useTheme();
  const [text, setText] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const list = useRef<FlatList<Message>>(null);

  const messages = useQuery({ queryKey: qk.messages(id), queryFn: () => api.orders.messages(id), enabled: Boolean(id), refetchInterval: 10_000 });

  useEffect(() => subscribe('message.created', (p) => p.orderId === id && qc.invalidateQueries({ queryKey: qk.messages(id) })), [id, qc]);

  const send = useMutation({
    mutationFn: (body: string) => api.orders.sendMessage(id, { body }),
    onMutate: (body) => {
      setFailed(null);
      setText('');
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.messages(id) }),
    onError: (e, body) => {
      setFailed(body);
      setText(body);
    },
  });

  const items = [...(messages.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <Screen scroll={false} padded={false} keyboard>
      <Header title="Chat" subtitle="Mensagens ficam registradas no pedido" />
      {messages.isPending ? (
        <View style={{ padding: spacing[4] }}>
          <ListSkeleton rows={4} />
        </View>
      ) : messages.isError ? (
        <ErrorState description={errorMessage(messages.error)} onRetry={() => messages.refetch()} />
      ) : (
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing[4], gap: spacing[2] }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.senderType === role;
            const system = item.senderType === 'system';
            if (system) {
              return (
                <Text variant="caption" color="muted" align="center" style={{ marginVertical: 4 }}>
                  {item.body}
                </Text>
              );
            }
            return (
              <View style={[styles.bubble, { alignSelf: mine ? 'flex-end' : 'flex-start', backgroundColor: mine ? colors.primary : colors.surface, borderColor: colors.border, borderRadius: radius.lg }]} accessibilityLabel={`${mine ? 'Você' : 'Outro participante'}: ${item.body ?? 'mídia'}`}>
                {item.body ? <Text variant="body" style={{ color: mine ? colors.textOnPrimary : colors.text }}>{item.body}</Text> : null}
                {item.mediaUrl ? (
                  <Text variant="caption" style={{ color: mine ? colors.textOnPrimary : colors.textMuted }}>
                    Anexo: {item.mediaUrl}
                  </Text>
                ) : null}
                <Text variant="caption" style={{ color: mine ? colors.textOnPrimary : colors.textMuted, opacity: 0.8, alignSelf: 'flex-end' }}>
                  {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text variant="bodySm" color="muted" align="center" style={{ marginTop: 24 }}>
              Combine os detalhes por aqui.
            </Text>
          }
        />
      )}
      {failed ? (
        <Text variant="caption" color="danger" align="center" style={{ paddingBottom: 4 }}>
          Não foi possível enviar. Toque em enviar para tentar de novo.
        </Text>
      ) : null}
      <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.surface, padding: spacing[2] }]}>
        <Input placeholder="Escreva uma mensagem" value={text} onChangeText={setText} containerStyle={{ flex: 1 }} maxLength={2000} onSubmitEditing={() => text.trim() && send.mutate(text.trim())} returnKeyType="send" />
        <IconButton icon="send" accessibilityLabel="Enviar mensagem" variant="filled" onPress={() => text.trim() && send.mutate(text.trim())} disabled={!text.trim() || send.isPending} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '82%', padding: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
