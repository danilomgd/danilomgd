import { BottomSheet, Button, Chip, EmptyState, Input, ListItem, ListSkeleton, Text, useTheme, useToast } from '@velio/ui/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/query';

const KINDS = [
  { value: 'AIR_CONDITIONER', label: 'Ar-condicionado' },
  { value: 'WATER_HEATER', label: 'Aquecedor' },
  { value: 'OTHER', label: 'Outro' },
] as const;

/** C-23: equipamentos (base da home contextual e das assinaturas). */
export default function EquipmentsScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const list = useQuery({ queryKey: qk.equipments, queryFn: () => api.me.equipments() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: 'AIR_CONDITIONER' as (typeof KINDS)[number]['value'], brand: '', model: '', btus: '', room: '' });
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => api.me.addEquipment({ kind: form.kind, brand: form.brand.trim(), model: form.model.trim() || undefined, btus: form.btus ? Number(form.btus) : undefined, room: form.room.trim(), maintenanceIntervalMonths: 6 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.equipments });
      qc.invalidateQueries({ queryKey: ['home'] });
      setOpen(false);
      setForm({ kind: 'AIR_CONDITIONER', brand: '', model: '', btus: '', room: '' });
      toast.show({ message: 'Equipamento salvo.', tone: 'success' });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const valid = form.brand.trim() && form.room.trim();

  return (
    <Screen footer={<Button label="Adicionar equipamento" icon="plus" onPress={() => setOpen(true)} />}>
      <Header title="Equipamentos" />
      <QueryState query={list} skeleton={<ListSkeleton rows={2} />}>
        {() =>
          list.data?.length ? (
            <View>
              {list.data.map((e) => (
                <ListItem key={e.id} title={`${e.brand}${e.model ? ` ${e.model}` : ''} · ${e.room}`} subtitle={`${KINDS.find((k) => k.value === e.kind)?.label ?? e.kind}${e.btus ? ` · ${e.btus} BTU` : ''}${e.nextMaintenanceDueAt ? ` · próxima revisão ${formatDate(e.nextMaintenanceDueAt)}` : ''}`} icon="wind" />
              ))}
            </View>
          ) : (
            <EmptyState icon="wind" title="Cadastre para pedir mais rápido" description="Avisamos quando a manutenção estiver perto." />
          )
        }
      </QueryState>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Novo equipamento">
        <View style={{ gap: spacing[3] }}>
          <View style={styles.chips}>
            {KINDS.map((k) => (
              <Chip key={k.value} label={k.label} selected={form.kind === k.value} onPress={() => setForm((f) => ({ ...f, kind: k.value }))} />
            ))}
          </View>
          <View style={styles.row}>
            <Input label="Marca" value={form.brand} onChangeText={(t) => setForm((f) => ({ ...f, brand: t }))} containerStyle={{ flex: 1 }} />
            <Input label="Modelo (opcional)" value={form.model} onChangeText={(t) => setForm((f) => ({ ...f, model: t }))} containerStyle={{ flex: 1 }} />
          </View>
          <View style={styles.row}>
            <Input label="Cômodo" value={form.room} onChangeText={(t) => setForm((f) => ({ ...f, room: t }))} containerStyle={{ flex: 2 }} placeholder="Sala, quarto" />
            <Input label="BTU" value={form.btus} onChangeText={(t) => setForm((f) => ({ ...f, btus: t.replace(/\D/g, '').slice(0, 6) }))} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
          </View>
          {error ? (
            <Text variant="bodySm" color="danger">
              {error}
            </Text>
          ) : null}
          <Button label="Salvar equipamento" onPress={() => add.mutate()} loading={add.isPending} disabled={!valid} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
