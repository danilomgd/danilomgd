import { Avatar, Button, Chip, Input, RatingStars, Text, useTheme, useToast } from '@velio/ui/native';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { useOrder, useOrderCacheUpdater } from '@/hooks/useOrder';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { firstName } from '@/lib/format';

const LABELS: Record<number, string> = { 1: 'Ruim', 2: 'Fraco', 3: 'Ok', 4: 'Bom', 5: 'Excelente' };
const TAGS_HIGH = ['Pontual', 'Caprichoso', 'Explicou bem', 'Educado', 'Rápido'];
const TAGS_LOW = ['Atrasou', 'Serviço incompleto', 'Comunicação ruim', 'Deixou sujeira', 'Outro'];

/** C-17: avaliação em um toque. */
export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const { order } = useOrder(id);
  const updateCache = useOrderCacheUpdater();
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  const submit = useMutation({
    mutationFn: () => api.orders.review(id, { rating: rating ?? 5, tags, comment: comment.trim() || undefined }),
    onSuccess: async (r) => {
      track('review_created', { rating: r.rating, tags: r.tags.length, hasComment: Boolean(r.comment) }, id);
      const fresh = await api.orders.get(id).catch(() => null);
      if (fresh) updateCache(fresh);
      toast.show({ message: 'Obrigado. Sua avaliação ajuda outros clientes.', tone: 'success' });
      router.back();
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  const who = firstName(order?.provider?.displayName);
  const tagSet = rating != null && rating >= 4 ? TAGS_HIGH : TAGS_LOW;

  return (
    <Screen keyboard footer={<Button label="Enviar avaliação" onPress={() => submit.mutate()} loading={submit.isPending} disabled={rating == null} />}>
      <Header close title="" />
      <View style={styles.center}>
        <Avatar name={order?.provider?.displayName} url={order?.provider?.avatarUrl} size={72} />
        <Text variant="title" align="center">
          {who ? `Como foi com ${who}?` : 'Como foi o atendimento?'}
        </Text>
        <Text variant="caption" color="muted" align="center">
          {order?.serviceName}
        </Text>
        <View style={{ marginVertical: spacing[4] }}>
          <RatingStars value={rating} onChange={setRating} />
        </View>
        <Text variant="label" color={rating ? 'primary' : 'muted'} accessibilityLiveRegion="polite">
          {rating ? LABELS[rating] : 'Toque para avaliar'}
        </Text>
      </View>
      {rating != null ? (
        <View style={{ gap: spacing[4], marginTop: spacing[6] }}>
          <View style={styles.chips}>
            {tagSet.map((t) => (
              <Chip key={t} label={t} selected={tags.includes(t)} onPress={() => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < 5 ? [...cur, t] : cur))} />
            ))}
          </View>
          <Input kind="multiline" placeholder="Quer contar mais? (opcional)" value={comment} onChangeText={setComment} maxLength={600} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 8, paddingTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
});
