import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Chip, Input, Select, Text, useTheme, useToast } from '@velio/ui/native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { qk } from '@/lib/query';

const EXAMPLES = [
  'Levar meu carro para lavar e trazer de volta até as 18h',
  'Trocar o chuveiro e revisar a tomada do quarto',
  'Buscar roupas na lavanderia e entregar em casa',
];

/**
 * C-24: entrada do Concierge em linguagem natural. Aceita texto e imagens por URL.
 * Áudio: pendente até a API expor upload de mídia (ver README).
 */
export default function ConciergeScreen() {
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const addresses = useQuery({ queryKey: qk.addresses, queryFn: () => api.me.addresses() });

  const submit = useMutation({
    mutationFn: () =>
      api.concierge.create({
        inputType: images.length && !text.trim() ? 'IMAGE' : 'TEXT',
        text: text.trim() || undefined,
        imageUrls: images,
        addressId: addressId ?? undefined,
      }),
    onSuccess: (r) => {
      track('concierge_submitted', { inputType: r.inputType, images: images.length }, r.orderId);
      setText('');
      setImages([]);
      router.push(`/(customer)/concierge/${r.id}`);
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  const valid = text.trim().length >= 5;

  return (
    <Screen
      keyboard
      footer={
        <Button
          label="Enviar"
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!valid}
          disabledReason={!valid && text.length ? 'Conte um pouco mais (mínimo 5 caracteres).' : undefined}
        />
      }
    >
      <View style={{ gap: spacing[4] }}>
        <Text variant="title" accessibilityRole="header">
          O que podemos resolver para você?
        </Text>
        <Text variant="body" color="muted">
          Descreva com suas palavras. Montamos um plano com tarefas, horários e estimativa para você aprovar.
        </Text>
        <Input
          kind="multiline"
          placeholder="Ex.: levar meu carro para a revisão amanhã de manhã e trazer de volta"
          value={text}
          onChangeText={setText}
          maxLength={2000}
          autoFocus
        />
        <View style={styles.chips}>
          {EXAMPLES.map((e) => (
            <Chip key={e} label={e} size="sm" onPress={() => setText(e)} />
          ))}
        </View>
        <Select
          label="Endereço de referência (opcional)"
          value={addressId}
          options={(addresses.data ?? []).map((a) => ({
            value: a.id,
            label: `${a.label} · ${a.street}, ${a.number}`,
          }))}
          onChange={setAddressId}
          placeholder="Escolher endereço"
        />
        <Input
          label="Foto por link (opcional)"
          placeholder="https://"
          value={imageUrl}
          onChangeText={setImageUrl}
          autoCapitalize="none"
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (/^https?:\/\//.test(imageUrl.trim()) && images.length < 4) {
              setImages((cur) => [...cur, imageUrl.trim()]);
              setImageUrl('');
            }
          }}
          hint="Até 4 imagens. Cole o link e toque em concluir no teclado."
        />
        <View style={styles.chips}>
          {images.map((u) => (
            <Chip
              key={u}
              label={u.replace(/^https?:\/\//, '').slice(0, 28)}
              onRemove={() => setImages((cur) => cur.filter((x) => x !== u))}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
