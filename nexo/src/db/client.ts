import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';
import { seedIfEmpty } from './seed';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = resolve(process.cwd(), 'drizzle');

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sql = postgres(url, { max: 10, prepare: false });
    const db = drizzlePostgres(sql, { schema }) as unknown as Db;
    await migratePostgres(db as never, { migrationsFolder });
    await seedIfEmpty(db);
    return db;
  }
  const dataDir = process.env.PGLITE_DATA_DIR || resolve(process.cwd(), '.data/pglite');
  if (!existsSync(/* turbopackIgnore: true */ dataDir))
    mkdirSync(/* turbopackIgnore: true */ dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await migratePglite(db as never, { migrationsFolder });
  await seedIfEmpty(db);
  return db;
}

// Singleton resistente ao HMR do Next em desenvolvimento.
const g = globalThis as unknown as { __nexoDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__nexoDb) g.__nexoDb = create();
  return g.__nexoDb;
}

export { schema };
