/**
 * Roteador mínimo para o catch-all de /api/v2. Padrões no estilo
 * "team/:teamId/space"; parâmetros chegam em `params`.
 */
import { HttpError, json, route } from './http';

export interface Ctx {
  req: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  userId: string;
}

type Handler = (ctx: Ctx) => Promise<unknown>;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Route {
  method: Method;
  segs: string[];
  handler: Handler;
}

const routes: Route[] = [];

export function on(method: Method, pattern: string, handler: Handler) {
  routes.push({ method, segs: pattern.split('/').filter(Boolean), handler });
}

function match(segs: string[], path: string[]): Record<string, string> | null {
  if (segs.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(path[i]);
    else if (seg !== path[i]) return null;
  }
  return params;
}

export function dispatch(userIdOf: (req: Request) => string) {
  return route<{ params: Promise<{ path: string[] }> }>(async (req, ctx) => {
    const { path } = await ctx.params;
    const method = req.method.toUpperCase() as Method;
    for (const r of routes) {
      if (r.method !== method) continue;
      const params = match(r.segs, path);
      if (!params) continue;
      const url = new URL(req.url);
      const result = await r.handler({
        req,
        params,
        query: url.searchParams,
        userId: userIdOf(req),
      });
      if (result instanceof Response) return result;
      return json(result ?? {});
    }
    throw new HttpError(404, `Rota não encontrada: ${method} /${path.join('/')}`);
  });
}
