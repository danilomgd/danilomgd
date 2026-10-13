import { createDb } from './client';

const handle = await createDb();
await handle.migrate();
console.log(`migrações aplicadas (${handle.driver})`);
await handle.close();
