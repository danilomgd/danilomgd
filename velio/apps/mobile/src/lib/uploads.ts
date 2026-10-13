import { tokenStore } from './api';
import { UPLOAD_URL } from './config';

export class UploadUnavailableError extends Error {
  constructor() {
    super('Envio de fotos indisponível neste ambiente.');
    this.name = 'UploadUnavailableError';
  }
}

/**
 * Envia um arquivo local e devolve uma URL pública para gravar em `EvidenceInput.url`, `mediaUrls` etc.
 * A API ainda não expõe URL assinada; enquanto isso usa `EXPO_PUBLIC_UPLOAD_URL` (multipart, campo `file`,
 * resposta `{ url }`). Sem endpoint configurado, lança `UploadUnavailableError` e a tela informa o usuário.
 * Em web, `file://` não existe: URLs `http(s)` passam direto.
 */
export async function uploadMedia(
  localUri: string,
  opts: { kind?: string; mime?: string } = {},
): Promise<string> {
  if (/^https?:\/\//.test(localUri)) return localUri;
  if (!UPLOAD_URL) throw new UploadUnavailableError();
  const form = new FormData();
  const name = `${opts.kind ?? 'media'}-${Date.now()}.jpg`;
  // React Native aceita {uri, name, type} em FormData.
  form.append('file', { uri: localUri, name, type: opts.mime ?? 'image/jpeg' } as unknown as Blob);
  const token = await tokenStore.getAccessToken();
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Não foi possível enviar a foto. Tente de novo.');
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new Error('Resposta de upload sem URL.');
  return json.url;
}
