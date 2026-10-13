import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    env: { NODE_ENV: 'test', PAYMENTS_PROVIDER: 'sandbox', SMS_PROVIDER: 'log', PUSH_PROVIDER: 'memory' },
  },
});
