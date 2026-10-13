import type { z } from 'zod';
import { errors } from './errors';

/** Valida entrada com Zod e converte em erro 400 legível. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw errors.badRequest(
      'Entrada inválida',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}
