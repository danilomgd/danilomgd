import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BottomSheet,
  Button,
  EmptyState,
  Input,
  ListItem,
  ListSkeleton,
  Text,
  useTheme,
  useToast,
} from '@velio/ui/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { maskCardNumber, maskExpiry } from '@/lib/format';
import { CardValidationError, tokenizeCard } from '@/lib/payments';
import { qk } from '@/lib/query';

/** C-27: métodos de pagamento. O número do cartão nunca vai à API: só o token (ADR-007). */
export default function PaymentMethodsScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const list = useQuery({ queryKey: qk.paymentMethods, queryFn: () => api.me.paymentMethods() });
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState({ number: '', holderName: '', expiry: '', cvv: '' });
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);

  const addCard = useMutation({
    mutationFn: async () => {
      const [mm, yy] = card.expiry.split('/');
      const token = await tokenizeCard({
        number: card.number,
        holderName: card.holderName,
        expMonth: Number(mm),
        expYear: Number(yy),
        cvv: card.cvv,
      });
      return api.me.addPaymentMethod({
        kind: 'CARD',
        gatewayToken: token.gatewayToken,
        holderName: card.holderName.trim(),
        setDefault: true,
      });
    },
    onSuccess: () => {
      track('payment_method_added', { kind: 'CARD' });
      qc.invalidateQueries({ queryKey: qk.paymentMethods });
      setOpen(false);
      setCard({ number: '', holderName: '', expiry: '', cvv: '' });
      toast.show({ message: 'Cartão adicionado.', tone: 'success' });
    },
    onError: (e) =>
      setError(
        e instanceof CardValidationError
          ? { field: e.field, message: e.message }
          : { message: errorMessage(e) },
      ),
  });
  const addPix = useMutation({
    mutationFn: () => api.me.addPaymentMethod({ kind: 'PIX', setDefault: !list.data?.length }),
    onSuccess: () => {
      track('payment_method_added', { kind: 'PIX' });
      qc.invalidateQueries({ queryKey: qk.paymentMethods });
      toast.show({ message: 'PIX habilitado.', tone: 'success' });
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  const hasPix = list.data?.some((m) => m.kind === 'PIX');

  return (
    <Screen
      footer={
        <View style={{ gap: spacing[2] }}>
          <Button label="Adicionar cartão" icon="credit-card" onPress={() => setOpen(true)} />
          {!hasPix ? (
            <Button
              label="Usar PIX"
              variant="secondary"
              onPress={() => addPix.mutate()}
              loading={addPix.isPending}
            />
          ) : null}
        </View>
      }
    >
      <Header title="Pagamento" />
      <QueryState query={list} skeleton={<ListSkeleton rows={2} />}>
        {() =>
          list.data?.length ? (
            <View>
              {list.data.map((m) => (
                <ListItem
                  key={m.id}
                  title={
                    m.kind === 'CARD'
                      ? `${m.brand ?? 'Cartão'} final ${m.last4 ?? ''}`
                      : m.kind === 'PIX'
                        ? 'PIX'
                        : 'Carteira'
                  }
                  subtitle={
                    m.kind === 'CARD' && m.expMonth
                      ? `Validade ${String(m.expMonth).padStart(2, '0')}/${m.expYear}${m.isDefault ? ' · padrão' : ''}`
                      : m.isDefault
                        ? 'Padrão'
                        : null
                  }
                  icon={m.kind === 'CARD' ? 'credit-card' : 'zap'}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="credit-card"
              title="Adicione um cartão ou use PIX"
              description="Cobramos só quando o serviço terminar."
            />
          )
        }
      </QueryState>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Novo cartão">
        <View style={{ gap: spacing[3] }}>
          <Input
            label="Número"
            value={card.number}
            onChangeText={(t) => setCard((c) => ({ ...c, number: maskCardNumber(t) }))}
            keyboardType="number-pad"
            textContentType="creditCardNumber"
            error={error?.field === 'number' ? error.message : null}
          />
          <Input
            label="Nome no cartão"
            value={card.holderName}
            onChangeText={(t) => setCard((c) => ({ ...c, holderName: t }))}
            autoCapitalize="characters"
            error={error?.field === 'holderName' ? error.message : null}
          />
          <View style={styles.row}>
            <Input
              label="Validade"
              value={card.expiry}
              onChangeText={(t) => setCard((c) => ({ ...c, expiry: maskExpiry(t) }))}
              keyboardType="number-pad"
              placeholder="MM/AA"
              containerStyle={{ flex: 1 }}
              error={error?.field === 'expMonth' || error?.field === 'expYear' ? error.message : null}
            />
            <Input
              label="CVV"
              value={card.cvv}
              onChangeText={(t) => setCard((c) => ({ ...c, cvv: t.replace(/\D/g, '').slice(0, 4) }))}
              keyboardType="number-pad"
              secureTextEntry
              containerStyle={{ flex: 1 }}
              error={error?.field === 'cvv' ? error.message : null}
            />
          </View>
          {error && !error.field ? (
            <Text variant="bodySm" color="danger">
              {error.message}
            </Text>
          ) : null}
          <Text variant="caption" color="muted">
            Os dados do cartão são tokenizados no aparelho. Nosso servidor nunca recebe o número completo.
          </Text>
          <Button
            label="Salvar cartão"
            onPress={() => addCard.mutate()}
            loading={addCard.isPending}
            disabled={
              card.number.replace(/\D/g, '').length < 13 ||
              !card.holderName ||
              card.expiry.length !== 5 ||
              card.cvv.length < 3
            }
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 } });
