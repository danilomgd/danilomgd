import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, `${what} não encontrado`);

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Corpo JSON inválido');
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, formatZod(r.error));
  return r.data;
}

function formatZod(e: ZodError) {
  return e.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Envolve um handler de rota convertendo exceções em respostas JSON. */
export function route<C = { params: Promise<Record<string, string>> }>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError)
        return json({ err: err.message, ECODE: err.status }, { status: err.status });
      if (err instanceof ZodError)
        return json({ err: formatZod(err), ECODE: 400 }, { status: 400 });
      console.error(err);
      return json({ err: 'Erro interno', ECODE: 500 }, { status: 500 });
    }
  };
}

/** Sessão: enquanto não há login, o usuário atual vem de cookie/header ou do dono do seed. */
export function currentUserId(req: Request): string {
  const header = req.headers.get('x-user-id');
  if (header) return header;
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)nexo_user=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : 'u_danilo';
}
