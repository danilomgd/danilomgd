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
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { qk } from '@/lib/query';

/** C-23: veículos. */
export default function VehiclesScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const list = useQuery({ queryKey: qk.vehicles, queryFn: () => api.me.vehicles() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ brand: '', model: '', plate: '', year: '', color: '' });
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      api.me.addVehicle({
        brand: form.brand.trim(),
        model: form.model.trim(),
        plate: form.plate,
        year: Number(form.year),
        color: form.color.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.vehicles });
      setOpen(false);
      setForm({ brand: '', model: '', plate: '', year: '', color: '' });
      toast.show({ message: 'Veículo salvo.', tone: 'success' });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const valid =
    form.brand &&
    form.model &&
    /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(form.plate.toUpperCase().replace(/[^A-Z0-9]/g, '')) &&
    /^\d{4}$/.test(form.year);

  return (
    <Screen footer={<Button label="Adicionar veículo" icon="plus" onPress={() => setOpen(true)} />}>
      <Header title="Veículos" />
      <QueryState query={list} skeleton={<ListSkeleton rows={2} />}>
        {() =>
          list.data?.length ? (
            <View>
              {list.data.map((v) => (
                <ListItem
                  key={v.id}
                  title={`${v.brand} ${v.model}`}
                  subtitle={`${v.plate} · ${v.year}${v.color ? ` · ${v.color}` : ''}`}
                  icon="truck"
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="truck"
              title="Cadastre para pedir mais rápido"
              description="Serviços de leva e traz usam o veículo salvo."
            />
          )
        }
      </QueryState>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Novo veículo">
        <View style={{ gap: spacing[3] }}>
          <View style={styles.row}>
            <Input
              label="Marca"
              value={form.brand}
              onChangeText={(t) => setForm((f) => ({ ...f, brand: t }))}
              containerStyle={{ flex: 1 }}
            />
            <Input
              label="Modelo"
              value={form.model}
              onChangeText={(t) => setForm((f) => ({ ...f, model: t }))}
              containerStyle={{ flex: 1 }}
            />
          </View>
          <View style={styles.row}>
            <Input
              label="Placa"
              value={form.plate}
              onChangeText={(t) => setForm((f) => ({ ...f, plate: t.toUpperCase().slice(0, 8) }))}
              autoCapitalize="characters"
              containerStyle={{ flex: 1 }}
              placeholder="ABC1D23"
            />
            <Input
              label="Ano"
              value={form.year}
              onChangeText={(t) => setForm((f) => ({ ...f, year: t.replace(/\D/g, '').slice(0, 4) }))}
              keyboardType="number-pad"
              containerStyle={{ flex: 1 }}
            />
          </View>
          <Input
            label="Cor (opcional)"
            value={form.color}
            onChangeText={(t) => setForm((f) => ({ ...f, color: t }))}
          />
          {error ? (
            <Text variant="bodySm" color="danger">
              {error}
            </Text>
          ) : null}
          <Button
            label="Salvar veículo"
            onPress={() => add.mutate()}
            loading={add.isPending}
            disabled={!valid}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 } });
