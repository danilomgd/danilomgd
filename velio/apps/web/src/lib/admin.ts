'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from './api';

/** Nomes de recurso aceitos por `api.admin.list/upsert/remove` (espelham a API). */
export type AdminResource =
  | 'categories'
  | 'services'
  | 'regions'
  | 'price-rules'
  | 'commission-rules'
  | 'matching-configs'
  | 'coupons'
  | 'plans'
  | 'home-sections'
  | 'banners'
  | 'providers'
  | 'users';

export function useAdminList<T>(
  resource: AdminResource,
  query?: Record<string, string | number | boolean | undefined>,
) {
  return useQuery({
    queryKey: ['admin', resource, query ?? {}],
    queryFn: () => api.admin.list<T>(resource, query),
  });
}

export function useAdminUpsert<T>(resource: AdminResource) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.admin.upsert<T>(resource, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', resource] }),
  });
}

export function useAdminRemove(resource: AdminResource) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.admin.remove(resource, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', resource] }),
  });
}

export type FieldErrors = Record<string, string>;

const ISSUE_MESSAGES: Record<string, string> = {
  invalid_type: 'Valor inválido.',
  too_small: 'Valor muito curto ou muito baixo.',
  too_big: 'Valor muito longo ou muito alto.',
  invalid_format: 'Formato inválido.',
  invalid_value: 'Escolha uma das opções.',
  custom: 'Valor inválido.',
};

/** Converte issues do Zod em mapa `caminho → mensagem` legível. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.') || '_';
    if (out[path]) continue;
    const base = ISSUE_MESSAGES[issue.code] ?? 'Valor inválido.';
    out[path] =
      issue.message && !/^Invalid|^Too|^Expected|^Required/i.test(issue.message) ? issue.message : base;
  }
  return out;
}

/** Valida e devolve dados ou erros por campo. */
export function validate<S extends z.ZodTypeAny>(
  schema: S,
  values: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; errors: FieldErrors } {
  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, errors: zodFieldErrors(parsed.error) };
}

export function emptyToNull(v: string): string | null {
  return v.trim() === '' ? null : v.trim();
}

export function emptyToUndefined(v: string): string | undefined {
  return v.trim() === '' ? undefined : v.trim();
}

export function toInt(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : Number.NaN;
}

export function toNum(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** ISO (datetime) → valor para <input type="datetime-local"> no fuso local. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
