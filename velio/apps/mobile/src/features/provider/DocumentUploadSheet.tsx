import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BottomSheet,
  Button,
  Chip,
  defaultPickImage,
  Input,
  Text,
  useTheme,
  useToast,
} from '@velio/ui/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { qk } from '@/lib/query';
import { UploadUnavailableError, uploadMedia } from '@/lib/uploads';

export const DOCUMENT_KINDS = [
  { value: 'ID_FRONT', label: 'Documento (frente)' },
  { value: 'ID_BACK', label: 'Documento (verso)' },
  { value: 'SELFIE', label: 'Selfie' },
  { value: 'PROOF_OF_ADDRESS', label: 'Comprovante de endereço' },
  { value: 'CERTIFICATE', label: 'Certificado' },
  { value: 'CNPJ_CARD', label: 'Cartão CNPJ' },
  { value: 'DRIVER_LICENSE', label: 'CNH' },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['value'];

/** P-04: envio de documento por foto (upload) ou link. */
export function DocumentUploadSheet({
  visible,
  onClose,
  initialKind,
}: {
  visible: boolean;
  onClose: () => void;
  initialKind?: DocumentKind;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const [kind, setKind] = useState<DocumentKind>(initialKind ?? 'ID_FRONT');
  const [url, setUrl] = useState('');

  const send = useMutation({
    mutationFn: async (source: 'camera' | 'library' | 'url') => {
      let fileUrl = url.trim();
      if (source !== 'url') {
        const picked = await defaultPickImage(source);
        if (!picked) throw new Error('Nenhuma foto selecionada.');
        fileUrl = await uploadMedia(picked.uri, { kind: kind.toLowerCase() });
      }
      if (!/^https?:\/\//.test(fileUrl)) throw new Error('Informe um link válido (https://).');
      await api.provider.addDocument({ kind, fileUrl });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.provider.me });
      setUrl('');
      toast.show({ message: 'Documento enviado para análise.', tone: 'success' });
      onClose();
    },
    onError: (e) =>
      toast.show({
        message:
          e instanceof UploadUnavailableError
            ? 'Envio de fotos indisponível neste ambiente. Use um link.'
            : errorMessage(e),
        tone: 'error',
      }),
  });

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Enviar documento">
      <View style={{ gap: spacing[3] }}>
        <View style={styles.chips}>
          {DOCUMENT_KINDS.map((k) => (
            <Chip
              key={k.value}
              label={k.label}
              selected={kind === k.value}
              onPress={() => setKind(k.value)}
              size="sm"
            />
          ))}
        </View>
        <Button
          label="Tirar foto"
          icon="camera"
          onPress={() => send.mutate('camera')}
          loading={send.isPending && send.variables === 'camera'}
          disabled={send.isPending}
        />
        <Button
          label="Escolher da galeria"
          variant="secondary"
          icon="image"
          onPress={() => send.mutate('library')}
          loading={send.isPending && send.variables === 'library'}
          disabled={send.isPending}
        />
        <Text variant="caption" color="muted" align="center">
          ou
        </Text>
        <Input
          label="Link do arquivo"
          placeholder="https://"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          keyboardType="url"
        />
        <Button
          label="Enviar link"
          variant="ghost"
          onPress={() => send.mutate('url')}
          loading={send.isPending && send.variables === 'url'}
          disabled={!url.trim() || send.isPending}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
