import { Button, Chip, Input, Text, useTheme, useToast } from '@velio/ui/native';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { useOrder } from '@/hooks/useOrder';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

const REASONS = [
  { value: 'NOT_DONE', label: 'Não foi feito' },
  { value: 'POOR_QUALITY', label: 'Qualidade ruim' },
  { value: 'DAMAGE', label: 'Dano' },
  { value: 'OVERCHARGE', label: 'Cobrança indevida' },
  { value: 'OTHER', label: 'Outro' },
] as const;

/** C-18: contestação após conclusão (até 72 h). */
export default function DisputeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const { refetch } = useOrder(id);
  const [reason, setReason] = useState<(typeof REASONS)[number]['value'] | null>(null);
  const [description, setDescription] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [url, setUrl] = useState('');

  const submit = useMutation({
    mutationFn: () => api.orders.openDispute(id, { reason: reason ?? 'OTHER', description: description.trim(), evidenceUrls: urls }),
    onSuccess: () => {
      track('dispute_opened', { reason: reason ?? 'OTHER' }, id);
      refetch();
      toast.show({ message: 'Contestação enviada. Respondemos em até 24 h.', tone: 'success' });
      router.back();
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  return (
    <Screen keyboard footer={<Button label="Enviar contestação" variant="danger" onPress={() => submit.mutate()} loading={submit.isPending} disabled={!reason || description.trim().length < 10} disabledReason={description.trim().length < 10 && reason ? 'Descreva o problema com pelo menos 10 caracteres.' : undefined} />}>
      <Header close title="Contestar" />
      <View style={{ gap: spacing[4] }}>
        <Text variant="body" color="muted">
          Conte o que aconteceu. O repasse ao profissional fica congelado até a análise.
        </Text>
        <View style={styles.chips}>
          {REASONS.map((r) => (
            <Chip key={r.value} label={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />
          ))}
        </View>
        <Input kind="multiline" label="O que aconteceu" value={description} onChangeText={setDescription} maxLength={2000} placeholder="Descreva o problema" />
        <Input
          label="Links de fotos ou vídeos (opcional)"
          value={url}
          onChangeText={setUrl}
          placeholder="https://"
          autoCapitalize="none"
          keyboardType="url"
          onSubmitEditing={() => {
            if (/^https?:\/\//.test(url.trim())) {
              setUrls((u) => [...u, url.trim()].slice(0, 10));
              setUrl('');
            }
          }}
          returnKeyType="done"
          hint="Cole o link e toque em concluir no teclado."
        />
        <View style={styles.chips}>
          {urls.map((u) => (
            <Chip key={u} label={u.replace(/^https?:\/\//, '').slice(0, 28)} onRemove={() => setUrls((cur) => cur.filter((x) => x !== u))} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
