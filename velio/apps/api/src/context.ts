import type { FastifyBaseLogger } from 'fastify';
import type { Server as IOServer } from 'socket.io';
import type { Adapters } from './adapters/ports';
import type { Config } from './config';
import type { Db, DbHandle } from './db/client';
import type { Outbox } from './platform/outbox';
import type { Scheduler } from './platform/scheduler';

/**
 * Contexto compartilhado entre módulos. Cada módulo recebe o contexto e expõe um serviço;
 * módulos não importam tabelas de outros módulos (ADR-003), só serviços.
 */
export interface AppContext {
  cfg: Config;
  db: Db;
  dbHandle: DbHandle;
  log: FastifyBaseLogger;
  adapters: Adapters;
  outbox: Outbox;
  scheduler: Scheduler;
  io: IOServer | null;
}
