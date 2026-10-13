import type { AddressInput } from '@velio/contracts';
import { BottomSheet, Button, EmptyState, IconButton, Input, ListItem, ListSkeleton, Switch, Text, useTheme, useToast } from '@velio/ui/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { maskPostalCode } from '@/lib/format';
import { getCurrentPosition, requestForegroundLocation } from '@/lib/location';
import { qk } from '@/lib/query';

const EMPTY: Omit<AddressInput, 'lat' | 'lng'> = { label: 'Casa', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', postalCode: '', instructions: '', isDefault: true };

/**
 * C-05: endereços. Sem endpoint de geocodificação na API, as coordenadas vêm da localização atual
 * do aparelho no momento de salvar (o usuário deve estar no endereço).
 */
export default function AddressesScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const list = useQuery({ queryKey: qk.addresses, queryFn: () => api.me.addresses() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      await requestForegroundLocation();
      const pos = await getCurrentPosition();
      if (!pos) throw new Error('Ative a localização e salve estando no endereço: usamos sua posição atual como referência.');
      return api.me.addAddress({ ...form, complement: form.complement || null, instructions: form.instructions || null, state: form.state.toUpperCase(), postalCode: form.postalCode, lat: pos.lat, lng: pos.lng });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.addresses });
      qc.invalidateQueries({ queryKey: ['home'] });
      setOpen(false);
      setForm(EMPTY);
      toast.show({ message: 'Endereço salvo.', tone: 'success' });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.me.deleteAddress(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.addresses }),
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  const set = (k: keyof typeof form) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.street && form.number && form.neighborhood && form.city && form.state.length === 2 && /^\d{5}-?\d{3}$/.test(form.postalCode);

  return (
    <Screen footer={<Button label="Adicionar endereço" icon="plus" onPress={() => setOpen(true)} />}>
      <Header title="Endereços" />
      <QueryState query={list} skeleton={<ListSkeleton rows={3} />}>
        {() =>
          list.data?.length ? (
            <View>
              {list.data.map((a) => (
                <ListItem
                  key={a.id}
                  title={`${a.label} · ${a.street}, ${a.number}`}
                  subtitle={`${a.neighborhood}, ${a.city} – ${a.state}${a.isDefault ? ' · padrão' : ''}`}
                  icon="map-pin"
                  trailing={<IconButton icon="trash-2" accessibilityLabel={`Excluir ${a.label}`} onPress={() => remove.mutate(a.id)} disabled={remove.isPending} />}
                />
              ))}
            </View>
          ) : (
            <EmptyState icon="map-pin" title="Adicione seu primeiro endereço" description="Com o endereço salvo, você pede em três toques." />
          )
        }
      </QueryState>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Novo endereço">
        <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing[3], paddingBottom: spacing[2] }}>
          <Input label="Apelido" value={form.label} onChangeText={set('label')} placeholder="Casa, Trabalho" maxLength={40} />
          <Input label="CEP" value={form.postalCode} onChangeText={(t) => set('postalCode')(maskPostalCode(t))} keyboardType="number-pad" />
          <Input label="Rua" value={form.street} onChangeText={set('street')} />
          <View style={styles.row}>
            <Input label="Número" value={form.number} onChangeText={set('number')} containerStyle={{ flex: 1 }} />
            <Input label="Complemento" value={form.complement ?? ''} onChangeText={set('complement')} containerStyle={{ flex: 2 }} placeholder="Apto, bloco" />
          </View>
          <Input label="Bairro" value={form.neighborhood} onChangeText={set('neighborhood')} />
          <View style={styles.row}>
            <Input label="Cidade" value={form.city} onChangeText={set('city')} containerStyle={{ flex: 3 }} />
            <Input label="UF" value={form.state} onChangeText={(t) => set('state')(t.toUpperCase().slice(0, 2))} containerStyle={{ flex: 1 }} autoCapitalize="characters" maxLength={2} />
          </View>
          <Input label="Instruções de acesso" value={form.instructions ?? ''} onChangeText={set('instructions')} placeholder="Portaria, interfone" maxLength={500} />
          <View style={styles.switchRow}>
            <Text variant="body" style={{ flex: 1 }}>
              Usar como padrão
            </Text>
            <Switch value={form.isDefault} onValueChange={(v) => set('isDefault')(v)} accessibilityLabel="Usar como endereço padrão" />
          </View>
          {error ? (
            <Text variant="bodySm" color="danger">
              {error}
            </Text>
          ) : null}
          <Text variant="caption" color="muted">
            Usamos sua localização atual como posição deste endereço.
          </Text>
          <Button label="Salvar endereço" onPress={() => add.mutate()} loading={add.isPending} disabled={!valid} />
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 }, switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 } });
