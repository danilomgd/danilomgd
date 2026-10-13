import { RuleBasedPlanner } from '@velio/domain';
import type { Config } from '../config';
import { ClaudePlanner } from './claudePlanner';
import { PagarmeGateway } from './pagarme';
import type { Adapters } from './ports';
import { LogSmsSender, MemoryPushSender, SandboxGateway, SystemClock } from './sandbox';

export function buildAdapters(
  cfg: Config,
  log: { info: (o: unknown, msg?: string) => void },
  overrides: Partial<Adapters> = {},
): Adapters {
  const payments =
    overrides.payments ??
    (cfg.PAYMENTS_PROVIDER === 'pagarme'
      ? new PagarmeGateway(
          cfg.PAGARME_SECRET_KEY ??
            (() => {
              throw new Error('PAGARME_SECRET_KEY ausente');
            })(),
          cfg.PAGARME_WEBHOOK_SECRET,
        )
      : new SandboxGateway());
  const sms = overrides.sms ?? new LogSmsSender(log);
  const push = overrides.push ?? new MemoryPushSender();
  const planner =
    overrides.planner ??
    (cfg.CONCIERGE_PLANNER === 'claude' && cfg.ANTHROPIC_API_KEY
      ? new ClaudePlanner(cfg.ANTHROPIC_API_KEY, cfg.ANTHROPIC_MODEL)
      : new RuleBasedPlanner());
  const clock = overrides.clock ?? new SystemClock();
  return { payments, sms, push, planner, clock };
}

export * from './ports';
export * from './sandbox';
