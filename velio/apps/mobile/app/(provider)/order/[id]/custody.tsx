import { useMutation } from '@tanstack/react-query';
import { Button, Input, Text, useTheme, useToast } from '@velio/ui/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { useOrder } from '@/hooks/useOrder';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { getCurrentPosition } from '@/lib/location';

/** P-14: leitor de QR para a cadeia de custódia, com digitação manual como alternativa. */
export default function CustodyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { colors, spacing, radius } = useTheme();
  const { refetch } = useOrder(id);
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [scanned, setScanned] = useState(false);

  const scan = useMutation({
    mutationFn: async () =>
      api.orders.custodyScan(id, {
        itemCode: code.trim(),
        location: (await getCurrentPosition()) ?? undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      refetch();
      toast.show({ message: 'Custódia registrada.', tone: 'success' });
      router.back();
    },
    onError: (e) => {
      toast.show({ message: errorMessage(e), tone: 'error' });
      setScanned(false);
    },
  });

  const cameraReady = permission?.granted;

  return (
    <Screen
      keyboard
      footer={
        <Button
          label="Registrar custódia"
          onPress={() => scan.mutate()}
          loading={scan.isPending}
          disabled={code.trim().length < 4}
          disabledReason={code.trim().length < 4 ? 'Leia o QR ou digite o código.' : undefined}
        />
      }
    >
      <Header close title="Custódia" />
      <View style={{ gap: spacing[4] }}>
        {cameraReady ? (
          <View style={[styles.camera, { borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }]}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128'] }}
              onBarcodeScanned={
                scanned
                  ? undefined
                  : ({ data }) => {
                      setScanned(true);
                      setCode(data);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    }
              }
            />
            <View
              style={[styles.frame, { borderColor: scanned ? colors.success : colors.surface }]}
              pointerEvents="none"
            />
          </View>
        ) : (
          <View
            style={[
              styles.camera,
              {
                borderRadius: radius.lg,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
              },
            ]}
          >
            <Text variant="body" color="muted" align="center">
              {permission?.canAskAgain === false
                ? 'Câmera sem permissão. Digite o código abaixo ou habilite nos ajustes.'
                : 'Permita a câmera para ler o QR.'}
            </Text>
            {permission?.canAskAgain !== false ? (
              <Button
                label="Permitir câmera"
                variant="secondary"
                size="md"
                fullWidth={false}
                onPress={() => requestPermission()}
              />
            ) : null}
          </View>
        )}
        <Input
          label="Código"
          value={code}
          onChangeText={(t) => {
            setCode(t);
            setScanned(false);
          }}
          placeholder="Lido pelo QR ou digitado"
          autoCapitalize="characters"
        />
        <Input
          label="Observação (opcional)"
          value={note}
          onChangeText={setNote}
          maxLength={300}
          placeholder="Estado do item, avarias"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { height: 280, overflow: 'hidden' },
  frame: { position: 'absolute', top: 50, left: 60, right: 60, bottom: 50, borderWidth: 3, borderRadius: 16 },
});
