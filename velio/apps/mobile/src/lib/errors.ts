import { ApiRequestError } from '@velio/api-client';

/** Mensagem curta e acionável para o usuário a partir de um erro de API ou rede. */
export function errorMessage(error: unknown, fallback = 'Algo não saiu como esperado. Tente de novo.'): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 409) return error.message || 'Este pedido foi atualizado. Veja o estado atual.';
    if (error.status === 429) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
    if (error.status >= 500) return 'Nosso servidor está indisponível no momento. Tente em instantes.';
    return error.message || fallback;
  }
  if (error instanceof TypeError && /network|fetch/i.test(error.message)) return 'Sem conexão. Verifique sua internet.';
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}
