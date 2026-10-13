import { useMutation } from '@tanstack/react-query';
import { formatBRL } from '@velio/contracts';
import { Button, Chip, IconButton, Input, PriceSummary, Text, useTheme, useToast } from '@velio/ui/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { useOrder } from '@/hooks/useOrder';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

interface Item {
  description: string;
  quantity: string;
  price: string;
}

function toCents(text: string): number {
  const d = text.replace(/\D/g, '');
  return d ? Number(d) : 0;
}
function fromCents(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** P-15: orçamento inicial (QUOTE em análise) ou adicional (durante a execução). */
export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const { order, refetch } = useOrder(id);
  const [items, setItems] = useState<Item[]>([{ description: '', quantity: '1', price: '' }]);
  const [notes, setNotes] = useState('');
  const [expires, setExpires] = useState(60);
  const kind =
    order?.status === 'UNDER_REVIEW' || order?.workflowKind === 'QUOTE'
      ? ('INITIAL' as const)
      : ('ADDITIONAL' as const);

  const parsed = items.map((i) => ({
    description: i.description.trim(),
    quantity: Number(i.quantity) || 0,
    unitPriceCents: toCents(i.price),
  }));
  const valid =
    parsed.length > 0 &&
    parsed.every((p) => p.description.length > 0 && p.quantity > 0 && p.unitPriceCents > 0);
  const total = parsed.reduce((s, p) => s + Math.round(p.quantity * p.unitPriceCents), 0);

  const submit = useMutation({
    mutationFn: () =>
      api.orders.createQuote(id, {
        kind,
        items: parsed,
        notes: notes.trim() || undefined,
        expiresInMinutes: expires,
      }),
    onSuccess: (q) => {
      track('quote_sent', { kind: q.kind, items: q.items.length, amountCents: q.amountCents }, id);
      refetch();
      toast.show({ message: 'Orçamento enviado ao cliente.', tone: 'success' });
      router.back();
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  return (
    <Screen
      keyboard
      footer={
        <Button
          label={valid ? `Enviar ${formatBRL(total)} ao cliente` : 'Enviar ao cliente'}
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!valid}
          disabledReason={!valid ? 'Preencha descrição, quantidade e valor de cada item.' : undefined}
        />
      }
    >
      <Header close title={kind === 'INITIAL' ? 'Orçamento' : 'Orçamento adicional'} />
      <View style={{ gap: spacing[4] }}>
        <Text variant="body" color="muted">
          {kind === 'INITIAL'
            ? 'O cliente aprova antes de qualquer cobrança.'
            : 'Não muda o combinado: o cliente aprova ou recusa só o adicional.'}
        </Text>
        {items.map((it, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: formulário de itens sem id
          <View key={`item-${idx}`} style={styles.item}>
            <Input
              label={`Item ${idx + 1}`}
              placeholder="Ex.: troca de sifão"
              value={it.description}
              onChangeText={(t) =>
                setItems((cur) => cur.map((x, i) => (i === idx ? { ...x, description: t } : x)))
              }
              maxLength={200}
            />
            <View style={styles.row}>
              <Input
                label="Qtd."
                value={it.quantity}
                keyboardType="decimal-pad"
                onChangeText={(t) =>
                  setItems((cur) =>
                    cur.map((x, i) =>
                      i === idx ? { ...x, quantity: t.replace(/[^\d.,]/g, '').replace(',', '.') } : x,
                    ),
                  )
                }
                containerStyle={{ flex: 1 }}
              />
              <Input
                label="Valor unitário"
                kind="money"
                prefix="R$"
                value={it.price}
                onChangeText={(t) =>
                  setItems((cur) =>
                    cur.map((x, i) => (i === idx ? { ...x, price: fromCents(toCents(t)) } : x)),
                  )
                }
                containerStyle={{ flex: 2 }}
              />
              {items.length > 1 ? (
                <View style={{ paddingTop: 22 }}>
                  <IconButton
                    icon="trash-2"
                    accessibilityLabel={`Remover item ${idx + 1}`}
                    onPress={() => setItems((cur) => cur.filter((_, i) => i !== idx))}
                  />
                </View>
              ) : null}
            </View>
          </View>
        ))}
        <Button
          label="Adicionar item"
          variant="secondary"
          size="md"
          icon="plus"
          onPress={() => setItems((cur) => [...cur, { description: '', quantity: '1', price: '' }])}
        />
        <Input
          kind="multiline"
          label="Justificativa (opcional)"
          placeholder="Explique o que encontrou"
          value={notes}
          onChangeText={setNotes}
          maxLength={500}
        />
        <View style={{ gap: 8 }}>
          <Text variant="labelSm" color="muted">
            Validade
          </Text>
          <View style={styles.row}>
            {[30, 60, 180, 1440].map((m) => (
              <Chip
                key={m}
                label={m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : '24 h'}
                selected={expires === m}
                onPress={() => setExpires(m)}
              />
            ))}
          </View>
        </View>
        <PriceSummary
          lines={parsed
            .filter((p) => p.description)
            .map((p) => ({
              label: `${p.description}${p.quantity !== 1 ? ` × ${p.quantity}` : ''}`,
              amountCents: Math.round(p.quantity * p.unitPriceCents),
            }))}
          totalCents={total}
          totalLabel={kind === 'INITIAL' ? 'Total' : 'Adicional'}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' },
});
