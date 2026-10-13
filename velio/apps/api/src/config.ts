import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url().optional(),
  PGLITE_DATA_DIR: z.string().optional(),
  JWT_SECRET: z.string().min(32).default('dev-only-secret-change-me-dev-only-secret-change-me'),
  JWT_ACCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .default(15 * 60),
  JWT_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .default(30 * 24 * 3600),
  CORS_ORIGINS: z.string().default('*'),
  PAYMENTS_PROVIDER: z.enum(['sandbox', 'pagarme']).default('sandbox'),
  PAGARME_SECRET_KEY: z.string().optional(),
  PAGARME_WEBHOOK_SECRET: z.string().optional(),
  /** Chave do HMAC de documentos (CPF/CNPJ). Obrigatória em produção. */
  DOCUMENT_HASH_KEY: z.string().min(16).optional(),
  SMS_PROVIDER: z.enum(['log', 'twilio']).default('log'),
  PUSH_PROVIDER: z.enum(['memory', 'expo']).default('memory'),
  CONCIERGE_PLANNER: z.enum(['rules', 'claude']).default('rules'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  SCHEDULER_ENABLED: z.coerce.boolean().default(true),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().default(2000),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().default(500),
  RATE_LIMIT_MAX: z.coerce.number().int().default(300),
  OTP_TTL_SECONDS: z.coerce.number().int().default(300),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cfg = Env.parse(env);
  if (cfg.NODE_ENV === 'production') {
    // ADR-015: adaptadores de desenvolvimento nunca em produção.
    const problems: string[] = [];
    if (!cfg.DATABASE_URL) problems.push('DATABASE_URL obrigatório');
    if (cfg.JWT_SECRET.startsWith('dev-only')) problems.push('JWT_SECRET de desenvolvimento');
    if (cfg.PAYMENTS_PROVIDER === 'sandbox') problems.push('PAYMENTS_PROVIDER=sandbox');
    if (cfg.PAYMENTS_PROVIDER === 'pagarme' && !cfg.PAGARME_SECRET_KEY)
      problems.push('PAGARME_SECRET_KEY ausente');
    if (cfg.PAYMENTS_PROVIDER === 'pagarme' && !cfg.PAGARME_WEBHOOK_SECRET)
      problems.push('PAGARME_WEBHOOK_SECRET ausente (webhooks sem assinatura)');
    if (!cfg.DOCUMENT_HASH_KEY) problems.push('DOCUMENT_HASH_KEY ausente');
    if (cfg.SMS_PROVIDER === 'log') problems.push('SMS_PROVIDER=log');
    if (cfg.PUSH_PROVIDER === 'memory') problems.push('PUSH_PROVIDER=memory');
    if (problems.length) throw new Error(`Configuração inválida para produção: ${problems.join('; ')}`);
  }
  return cfg;
}
