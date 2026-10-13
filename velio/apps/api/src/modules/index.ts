import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';

/**
 * Registro dos módulos (ADR-003). Cada módulo exporta `register(app, ctx, deps)` que devolve
 * seu serviço. A ordem importa: módulos de baixo (identity, catalog, geo) antes dos que dependem deles.
 *
 * Esta é a interface mínima que `app.ts` precisa. A implementação completa dos módulos vive em
 * `./<modulo>/` e é montada aqui.
 */
export interface Modules {
  orders: {
    canUserAccessOrder(
      userId: string,
      roles: string[],
      providerId: string | null,
      orderId: string,
    ): Promise<boolean>;
  };
  providers: {
    ingestLocation(providerId: string, pings: Array<Record<string, unknown>>): Promise<void>;
  };
}

export async function registerModules(app: FastifyInstance, ctx: AppContext): Promise<Modules> {
  const { registerAllModules } = await import('./registry');
  return registerAllModules(app, ctx);
}
