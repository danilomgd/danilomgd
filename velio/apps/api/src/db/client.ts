import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DbHandle {
  db: Db;
  driver: 'pglite' | 'postgres';
  migrate: () => Promise<void>;
  close: () => Promise<void>;
}

const here = new URL('.', import.meta.url);
const migrationsFolder = new URL('../../drizzle', here).pathname;

/**
 * DATABASE_URL definido → Postgres real. Ausente → PGlite (memória, ou arquivo se PGLITE_DATA_DIR).
 * Em NODE_ENV=production, PGlite é recusado (ADR-015).
 */
export async function createDb(opts: { url?: string | null; dataDir?: string | null; nodeEnv?: string } = {}): Promise<DbHandle> {
  const url = opts.url ?? process.env.DATABASE_URL ?? null;
  const nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  if (url) {
    const sql = postgres(url, { max: 10, prepare: false });
    const db = drizzlePostgres(sql, { schema }) as unknown as Db;
    return {
      db,
      driver: 'postgres',
      migrate: () => migratePostgres(db as never, { migrationsFolder }),
      close: () => sql.end({ timeout: 5 }),
    };
  }
  if (nodeEnv === 'production') {
    throw new Error('DATABASE_URL é obrigatório em produção; PGlite só para dev/test (ADR-015)');
  }
  const dataDir = opts.dataDir ?? process.env.PGLITE_DATA_DIR ?? undefined;
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  return {
    db,
    driver: 'pglite',
    migrate: () => migratePglite(db as never, { migrationsFolder }),
    close: () => client.close(),
  };
}

export { schema };
