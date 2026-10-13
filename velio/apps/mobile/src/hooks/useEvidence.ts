import type { EvidenceKind } from '@velio/contracts';
import type { EvidenceItem, PickedImage } from '@velio/ui/native';
import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import { uploadMedia } from '@/lib/uploads';

export interface EvidenceState extends EvidenceItem {
  kind: EvidenceKind;
  evidenceId?: string;
  localUri: string;
}

/**
 * Fila de evidências de uma ordem: foto local → upload → `POST /orders/:id/evidence`.
 * Falhas ficam marcadas para reenvio; os ids enviados alimentam `complete.evidenceIds`.
 */
export function useEvidence(orderId: string, onError?: (message: string) => void) {
  const [items, setItems] = useState<EvidenceState[]>([]);

  const upload = useCallback(
    async (item: EvidenceState) => {
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, status: 'uploading' } : i)));
      try {
        const url = await uploadMedia(item.localUri, { kind: item.kind.toLowerCase() });
        const saved = await api.orders.addEvidence(orderId, { kind: item.kind, url, metadata: { source: 'provider_app' } });
        setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, status: 'uploaded', uri: url, evidenceId: saved.id } : i)));
      } catch (e) {
        setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, status: 'failed' } : i)));
        onError?.(e instanceof Error ? e.message : 'Falha ao enviar a foto.');
      }
    },
    [orderId, onError],
  );

  const add = useCallback(
    (kind: EvidenceKind, picked: PickedImage) => {
      const item: EvidenceState = { id: `${kind}-${Date.now()}`, uri: picked.uri, localUri: picked.uri, status: 'local', kind };
      setItems((cur) => [...cur, item]);
      void upload(item);
    },
    [upload],
  );

  const retry = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (item) void upload(item);
    },
    [items, upload],
  );

  const remove = useCallback((id: string) => setItems((cur) => cur.filter((i) => i.id !== id)), []);

  const ofKind = useCallback((kind: EvidenceKind) => items.filter((i) => i.kind === kind), [items]);
  const uploadedIds = items.filter((i) => i.evidenceId).map((i) => i.evidenceId as string);
  const uploadedCount = (kind: EvidenceKind) => items.filter((i) => i.kind === kind && i.status === 'uploaded').length;

  return { items, add, retry, remove, ofKind, uploadedIds, uploadedCount, busy: items.some((i) => i.status === 'uploading') };
}
