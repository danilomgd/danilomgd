import { buildApp } from './app';

const app = await buildApp();
const { PORT, HOST } = app.ctx.cfg;

const shutdown = async (signal: string) => {
  app.fastify.log.info({ signal }, 'encerrando');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.fastify.listen({ port: PORT, host: HOST });
app.fastify.log.info(`VÉLIO API ouvindo em http://${HOST}:${PORT} (db=${app.ctx.dbHandle.driver}, payments=${app.ctx.adapters.payments.name})`);
