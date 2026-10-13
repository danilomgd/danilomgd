export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  badRequest: (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details),
  unauthorized: (msg = 'Não autenticado') => new AppError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'Sem permissão para esta ação') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (what = 'Recurso') => new AppError(404, 'NOT_FOUND', `${what} não encontrado`),
  conflict: (msg: string, details?: unknown) => new AppError(409, 'CONFLICT', msg, details),
  invalidTransition: (msg: string, details?: unknown) =>
    new AppError(409, 'INVALID_TRANSITION', msg, details),
  paymentRequired: (msg: string, details?: unknown) => new AppError(402, 'PAYMENT_FAILED', msg, details),
  tooMany: (msg = 'Muitas tentativas. Aguarde.') => new AppError(429, 'RATE_LIMITED', msg),
  unprocessable: (msg: string, details?: unknown) => new AppError(422, 'UNPROCESSABLE', msg, details),
};
