import { useMutation } from '@tanstack/react-query';
import {
  Button,
  EvidenceUploader,
  Input,
  ListItem,
  OTPInput,
  Switch,
  Text,
  useTheme,
  useToast,
} from '@velio/ui/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { useEvidence } from '@/hooks/useEvidence';
import { useOrder } from '@/hooks/useOrder';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

const CHECKLIST: Array<{ key: string; label: string }> = [
  { key: 'exterior_ok', label: 'Lataria sem avarias novas' },
  { key: 'interior_ok', label: 'Interior limpo e sem pertences' },
  { key: 'documents_present', label: 'Documento do veículo presente' },
  { key: 'keys_received', label: 'Chaves recebidas' },
  { key: 'warning_lights_off', label: 'Painel sem luzes de alerta' },
];

/** P-14: vistoria do veículo (odômetro, combustível, checklist, fotos, PIN do cliente). */
export default function HandoverScreen() {
  const { id, step } = useLocalSearchParams<{ id: string; step?: 'PICKUP' | 'DELIVERY' }>();
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const { refetch } = useOrder(id);
  const onEvidenceError = useCallback((m: string) => toast.show({ message: m, tone: 'error' }), [toast]);
  const evidence = useEvidence(id, onEvidenceError);
  const [odometer, setOdometer] = useState('');
  const [fuel, setFuel] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [pin, setPin] = useState('');
  const handoverStep = step === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
  const photos = evidence.ofKind(handoverStep);
  const photoUrls = photos.filter((p) => p.status === 'uploaded').map((p) => p.uri);

  const submit = useMutation({
    mutationFn: () =>
      api.orders.vehicleHandover(id, handoverStep, {
        odometerKm: Number(odometer.replace(/\D/g, '')),
        fuelLevelPct: fuel ? Number(fuel) : undefined,
        checklist: Object.fromEntries(CHECKLIST.map((c) => [c.key, Boolean(checklist[c.key])])),
        photoUrls,
        customerConfirmationPin: pin.length === 4 ? pin : undefined,
      }),
    onSuccess: () => {
      refetch();
      toast.show({
        message:
          handoverStep === 'PICKUP'
            ? 'Vistoria de retirada registrada.'
            : 'Vistoria de devolução registrada.',
        tone: 'success',
      });
      router.back();
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  const valid = odometer.replace(/\D/g, '').length > 0 && photoUrls.length >= 1;

  return (
    <Screen
      keyboard
      footer={
        <Button
          label="Salvar vistoria"
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!valid || evidence.busy}
          disabledReason={
            !valid
              ? 'Informe o odômetro e envie pelo menos 1 foto.'
              : evidence.busy
                ? 'Enviando fotos'
                : undefined
          }
        />
      }
    >
      <Header close title={handoverStep === 'PICKUP' ? 'Vistoria de retirada' : 'Vistoria de devolução'} />
      <View style={{ gap: spacing[4] }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Input
            label="Odômetro"
            kind="odometer"
            suffix="km"
            value={odometer}
            onChangeText={(t) => setOdometer(t.replace(/\D/g, '').slice(0, 7))}
            containerStyle={{ flex: 1 }}
          />
          <Input
            label="Combustível"
            suffix="%"
            keyboardType="number-pad"
            value={fuel}
            onChangeText={(t) => setFuel(String(Math.min(100, Number(t.replace(/\D/g, '') || 0)) || ''))}
            containerStyle={{ flex: 1 }}
          />
        </View>
        <View>
          <Text variant="labelSm" color="muted" style={{ marginBottom: 4 }}>
            Checklist
          </Text>
          {CHECKLIST.map((c, i) => (
            <ListItem
              key={c.key}
              title={c.label}
              divider={i < CHECKLIST.length - 1}
              trailing={
                <Switch
                  value={Boolean(checklist[c.key])}
                  onValueChange={(v) => setChecklist((cur) => ({ ...cur, [c.key]: v }))}
                  accessibilityLabel={c.label}
                />
              }
            />
          ))}
        </View>
        <EvidenceUploader
          label="Fotos do veículo"
          required={1}
          items={photos}
          onAdd={(p) => evidence.add(handoverStep, p)}
          onRemove={evidence.remove}
          onRetry={evidence.retry}
        />
        <View style={{ gap: 8 }}>
          <Text variant="labelSm" color="muted">
            PIN de confirmação do cliente (opcional)
          </Text>
          <OTPInput
            length={4}
            value={pin}
            onChange={setPin}
            accessibilityLabel="PIN de confirmação com 4 dígitos"
          />
        </View>
      </View>
    </Screen>
  );
}
