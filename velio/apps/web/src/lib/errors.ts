import { ApiRequestError } from '@velio/api-client';

const CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  UNAUTHORIZED: 'Sua sessão expirou. Entre de novo.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  NOT_FOUND: 'Registro não encontrado.',
  VALIDATION_ERROR: 'Alguns campos estão inválidos. Revise e tente de novo.',
  CONFLICT: 'A ação não é permitida no estado atual. Recarregamos os dados.',
  INVALID_TRANSITION: 'A ação não é permitida no estado atual. Recarregamos os dados.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde um instante.',
};

/** Converte qualquer erro em frase curta em pt-BR, sem expor detalhes internos. */
export function errorMessage(err: unknown, fallback = 'Não foi possível concluir. Tente de novo.'): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 0) return 'Sem conexão com a API. Verifique se o servidor está no ar.';
    const known = CODE_MESSAGES[err.code];
    if (known) return known;
    if (err.status === 401) return CODE_MESSAGES.UNAUTHORIZED ?? fallback;
    if (err.status === 403) return CODE_MESSAGES.FORBIDDEN ?? fallback;
    if (err.status === 404) return CODE_MESSAGES.NOT_FOUND ?? fallback;
    if (err.status === 409) return CODE_MESSAGES.CONFLICT ?? fallback;
    if (err.message && err.message !== err.code) return err.message;
    return fallback;
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return 'Sem conexão com a API. Verifique se o servidor está no ar.';
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && /fetch|network/i.test(err.message);
}
