import type { ImagePickerOptions } from 'expo-image-picker';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export type EvidenceItemStatus = 'local' | 'uploading' | 'uploaded' | 'failed' | 'queued';

export interface EvidenceItem {
  id: string;
  /** URI local ou URL remota já enviada. */
  uri: string;
  status: EvidenceItemStatus;
  kind?: string;
}

export interface PickedImage {
  uri: string;
  width?: number;
  height?: number;
}

export interface EvidenceUploaderProps {
  items: EvidenceItem[];
  /** Quantidade mínima exigida; células tracejadas mostram o que falta. */
  required?: number;
  label?: string;
  onAdd?: (picked: PickedImage) => void;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  readOnly?: boolean;
  /** Fonte da foto; padrão: `expo-image-picker` (câmera com fallback para galeria). */
  pickImage?: (source: 'camera' | 'library') => Promise<PickedImage | null>;
  source?: 'camera' | 'library';
  disabled?: boolean;
}

/** Captura com `expo-image-picker`. Remove EXIF (sem localização) e comprime. */
export async function defaultPickImage(source: 'camera' | 'library'): Promise<PickedImage | null> {
  const picker = await import('expo-image-picker');
  const perm =
    source === 'camera'
      ? await picker.requestCameraPermissionsAsync()
      : await picker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const options: ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.8,
    exif: false,
    allowsEditing: false,
  };
  const result =
    source === 'camera'
      ? await picker.launchCameraAsync(options)
      : await picker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

/** Grade de fotos (3 colunas, miniatura 96) com estados: enviando, falhou, na fila, obrigatória faltando. */
export function EvidenceUploader({
  items,
  required = 0,
  label,
  onAdd,
  onRemove,
  onRetry,
  readOnly,
  pickImage,
  source = 'camera',
  disabled,
}: EvidenceUploaderProps) {
  const { colors, radius } = useTheme();
  const missing = Math.max(0, required - items.length);
  const placeholders = Array.from({ length: missing }, (_, i) => i);

  async function handleAdd() {
    if (disabled || readOnly) return;
    const picked = await (pickImage ?? defaultPickImage)(source);
    if (picked) onAdd?.(picked);
  }

  return (
    <View style={styles.wrap}>
      {label ? (
        <View style={styles.labelRow}>
          <Text variant="labelSm" color="muted">
            {label}
          </Text>
          {required > 0 ? (
            <Text variant="caption" color={missing > 0 ? 'danger' : 'success'}>
              {Math.min(items.length, required)} de {required}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.grid}>
        {items.map((it, idx) => (
          <View
            key={it.id}
            style={[styles.cell, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt }]}
            accessibilityLabel={`Foto ${idx + 1} de ${items.length}`}
          >
            <Image source={{ uri: it.uri }} style={[styles.image, { borderRadius: radius.md }]} />
            {it.status === 'uploading' ? (
              <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
                <ActivityIndicator color={colors.textOnPrimary} />
              </View>
            ) : null}
            {it.status === 'failed' ? (
              <Pressable
                onPress={() => onRetry?.(it.id)}
                style={[styles.overlay, { backgroundColor: colors.overlay }]}
                accessibilityRole="button"
                accessibilityLabel="Reenviar foto"
              >
                <Icon name="alert-circle" size="lg" color={colors.textOnPrimary} />
                <Text variant="caption" style={{ color: colors.textOnPrimary }}>
                  Reenviar
                </Text>
              </Pressable>
            ) : null}
            {it.status === 'queued' ? (
              <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
                <Icon name="clock" size="lg" color={colors.textOnPrimary} />
                <Text variant="caption" style={{ color: colors.textOnPrimary }}>
                  Na fila
                </Text>
              </View>
            ) : null}
            {!readOnly && onRemove && it.status !== 'uploading' ? (
              <Pressable
                onPress={() => onRemove(it.id)}
                style={[styles.remove, { backgroundColor: colors.surface }]}
                accessibilityRole="button"
                accessibilityLabel="Remover foto"
                hitSlop={8}
              >
                <Icon name="x" size="sm" color={colors.text} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {!readOnly
          ? placeholders.map((i) => (
              <Pressable
                key={`missing-${i}`}
                onPress={handleAdd}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Adicionar foto obrigatória"
                style={[styles.cell, styles.dashed, { borderRadius: radius.md, borderColor: colors.danger }]}
              >
                <Icon name="camera" size="lg" color={colors.danger} />
                <Text variant="caption" color="danger">
                  Obrigatória
                </Text>
              </Pressable>
            ))
          : null}
        {!readOnly && missing === 0 ? (
          <Pressable
            onPress={handleAdd}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Adicionar foto"
            style={[styles.cell, styles.dashed, { borderRadius: radius.md, borderColor: colors.border }]}
          >
            <Icon name="plus" size="lg" color={colors.textMuted} />
            <Text variant="caption" color="muted">
              Adicionar
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed', gap: 4 },
  image: { width: 96, height: 96 },
  overlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 4 },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
