import type { UpsertCommissionRuleInput } from '@velio/contracts';
import { type CommissionRule, DEFAULT_COMMISSION, pickCommissionRule, settle } from '@velio/domain';
import { and, asc, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { commissionRules, ledgerEntries, payouts, scheduledJobs, walletAccounts } from '../../db/schema';
import { newId } from '../../db/schema/_shared';
import { errors } from '../../lib/errors';
import { type Exec, iso } from '../_shared/util';

export type OwnerType = 'USER' | 'PROVIDER' | 'PLATFORM';
export type AccountRow = typeof walletAccounts.$inferSelect;

/** Contas internas da plataforma. */
export const PLATFORM = { clearing: 'clearing', revenue: 'revenue' } as const;

interface JournalLine {
  accountId: string;
  direction: 'CREDIT' | 'DEBIT';
  amountCents: number;
  kind: string;
  description: string;
}

export interface SettleInput {
  orderId: string;
  providerId: string | null;
  categoryId: string;
  regionId: string | null;
  grossCents: number;
  discountCents: number;
  billedViaParent: boolean;
}

export function createWalletService(ctx: AppContext) {
  const { db, adapters, log } = ctx;

  async function account(ownerType: OwnerType, ownerId: string, exec: Exec = db): Promise<AccountRow> {
    const [existing] = await exec
      .select()
      .from(walletAccounts)
      .where(and(eq(walletAccounts.ownerType, ownerType), eq(walletAccounts.ownerId, ownerId)))
      .limit(1);
    if (existing) return existing;
    const [created] = await exec
      .insert(walletAccounts)
      .values({ ownerType, ownerId })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [again] = await exec
      .select()
      .from(walletAccounts)
      .where(and(eq(walletAccounts.ownerType, ownerType), eq(walletAccounts.ownerId, ownerId)))
      .limit(1);
    if (!again) throw new Error('Falha ao criar conta de carteira');
    return again;
  }

  /** Lançamento em dupla entrada: soma de créditos == soma de débitos. Atualiza saldos. */
  async function journal(
    lines: JournalLine[],
    ref: { orderId?: string | null; intentId?: string | null; payoutId?: string | null },
    exec: Exec = db,
  ): Promise<string> {
    const credits = lines.filter((l) => l.direction === 'CREDIT').reduce((s, l) => s + l.amountCents, 0);
    const debits = lines.filter((l) => l.direction === 'DEBIT').reduce((s, l) => s + l.amountCents, 0);
    if (credits !== debits)
      throw new Error(`Lançamento desbalanceado: créditos ${credits} ≠ débitos ${debits}`);
    const journalId = newId();
    for (const l of lines) {
      if (l.amountCents === 0) continue;
      await exec.insert(ledgerEntries).values({
        accountId: l.accountId,
        journalId,
        direction: l.direction,
        amountCents: l.amountCents,
        kind: l.kind,
        orderId: ref.orderId ?? null,
        intentId: ref.intentId ?? null,
        payoutId: ref.payoutId ?? null,
        description: l.description,
      });
      const delta = l.direction === 'CREDIT' ? l.amountCents : -l.amountCents;
      await exec
        .update(walletAccounts)
        .set({ balanceCents: sql`${walletAccounts.balanceCents} + ${delta}` })
        .where(eq(walletAccounts.id, l.accountId));
    }
    return journalId;
  }

  async function activeRules(now: Date, exec: Exec = db) {
    return exec
      .select()
      .from(commissionRules)
      .where(
        and(
          lte(commissionRules.activeFrom, now),
          or(isNull(commissionRules.activeUntil), gt(commissionRules.activeUntil, now)),
        ),
      );
  }

  async function orderSettlementJournal(orderId: string, exec: Exec = db) {
    const [row] = await exec
      .select({ journalId: ledgerEntries.journalId })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, orderId), eq(ledgerEntries.kind, 'provider_payout')))
      .limit(1);
    return row?.journalId ?? null;
  }

  return {
    account,
    journal,

    async pickRule(categoryId: string, regionId: string | null): Promise<CommissionRule> {
      const rules = await activeRules(adapters.clock.now());
      const picked = pickCommissionRule(rules, categoryId, regionId);
      return picked
        ? {
            percentBps: picked.percentBps,
            fixedCents: picked.fixedCents,
            minCents: picked.minCents,
            maxCents: picked.maxCents,
            passPaymentFeeToProvider: picked.passPaymentFeeToProvider,
          }
        : DEFAULT_COMMISSION;
    },

    /**
     * Liquidação da ordem concluída. Débito em gateway:clearing (bruto cobrado), crédito no prestador
     * (líquido) e crédito na plataforma (comissão − desconto). Idempotente por ordem.
     */
    async settleOrder(input: SettleInput) {
      if (await orderSettlementJournal(input.orderId)) {
        log.debug({ orderId: input.orderId }, 'ordem já liquidada');
        return null;
      }
      const rule = await this.pickRule(input.categoryId, input.regionId);
      const s = settle(input.grossCents, input.discountCents, rule);
      const clearing = await account('PLATFORM', PLATFORM.clearing);
      const revenue = await account('PLATFORM', PLATFORM.revenue);
      const lines: JournalLine[] = [];
      if (input.providerId) {
        const prov = await account('PROVIDER', input.providerId);
        if (input.billedViaParent) {
          // Filha de concierge: o cliente já pagou ao pai; a plataforma repassa do que arrecadou.
          lines.push(
            {
              accountId: revenue.id,
              direction: 'DEBIT',
              amountCents: s.providerPayoutCents,
              kind: 'provider_payout_funding',
              description: 'Repasse financiado pela ordem pai (concierge)',
            },
            {
              accountId: prov.id,
              direction: 'CREDIT',
              amountCents: s.providerPayoutCents,
              kind: 'provider_payout',
              description: 'Repasse líquido do serviço',
            },
          );
        } else {
          lines.push(
            {
              accountId: clearing.id,
              direction: 'DEBIT',
              amountCents: s.chargedCents,
              kind: 'order_charge',
              description: 'Valor cobrado do cliente',
            },
            {
              accountId: prov.id,
              direction: 'CREDIT',
              amountCents: s.providerPayoutCents,
              kind: 'provider_payout',
              description: 'Repasse líquido do serviço',
            },
            {
              accountId: revenue.id,
              direction: 'CREDIT',
              amountCents: s.chargedCents - s.providerPayoutCents,
              kind: 'platform_fee',
              description: `Comissão da plataforma (${rule.percentBps / 100}%)`,
            },
          );
        }
      } else {
        lines.push(
          {
            accountId: clearing.id,
            direction: 'DEBIT',
            amountCents: s.chargedCents,
            kind: 'order_charge',
            description: 'Valor cobrado do cliente',
          },
          {
            accountId: revenue.id,
            direction: 'CREDIT',
            amountCents: s.chargedCents,
            kind: 'provider_payout',
            description: 'Arrecadação de ordem sem prestador direto (concierge)',
          },
        );
      }
      await journal(lines, { orderId: input.orderId });
      return s;
    },

    /** Disputa aberta: move o repasse do prestador para `heldCents` até a resolução. */
    async hold(orderId: string, providerId: string, amountCents: number) {
      if (amountCents <= 0) return;
      const prov = await account('PROVIDER', providerId);
      await db
        .update(walletAccounts)
        .set({
          balanceCents: sql`${walletAccounts.balanceCents} - ${amountCents}`,
          heldCents: sql`${walletAccounts.heldCents} + ${amountCents}`,
        })
        .where(eq(walletAccounts.id, prov.id));
      await db.insert(ledgerEntries).values({
        accountId: prov.id,
        journalId: newId(),
        direction: 'DEBIT',
        amountCents,
        kind: 'dispute_hold',
        orderId,
        description: 'Repasse retido por contestação',
      });
    },

    /** Resolução da disputa: libera o valor retido com o repasse ajustado; a diferença volta à plataforma. */
    async releaseHold(orderId: string, providerId: string, heldCents: number, finalPayoutCents: number) {
      const prov = await account('PROVIDER', providerId);
      const revenue = await account('PLATFORM', PLATFORM.revenue);
      const release = Math.min(heldCents, Math.max(0, finalPayoutCents));
      const adjustment = heldCents - release;
      await db
        .update(walletAccounts)
        .set({ heldCents: sql`${walletAccounts.heldCents} - ${heldCents}` })
        .where(eq(walletAccounts.id, prov.id));
      const journalId = newId();
      if (release > 0) {
        await db.insert(ledgerEntries).values({
          accountId: prov.id,
          journalId,
          direction: 'CREDIT',
          amountCents: release,
          kind: 'dispute_release',
          orderId,
          description: 'Repasse liberado após contestação',
        });
        await db
          .update(walletAccounts)
          .set({ balanceCents: sql`${walletAccounts.balanceCents} + ${release}` })
          .where(eq(walletAccounts.id, prov.id));
      }
      if (adjustment > 0) {
        await db.insert(ledgerEntries).values({
          accountId: revenue.id,
          journalId,
          direction: 'CREDIT',
          amountCents: adjustment,
          kind: 'dispute_adjustment',
          orderId,
          description: 'Ajuste de repasse por contestação (reembolso ao cliente)',
        });
        await db
          .update(walletAccounts)
          .set({ balanceCents: sql`${walletAccounts.balanceCents} + ${adjustment}` })
          .where(eq(walletAccounts.id, revenue.id));
      }
    },

    async creditProviderFee(
      providerId: string,
      amountCents: number,
      orderId: string,
      intentId: string | null,
    ) {
      if (amountCents <= 0) return;
      const clearing = await account('PLATFORM', PLATFORM.clearing);
      const prov = await account('PROVIDER', providerId);
      await journal(
        [
          {
            accountId: clearing.id,
            direction: 'DEBIT',
            amountCents,
            kind: 'cancellation_fee_charge',
            description: 'Taxa de cancelamento cobrada do cliente',
          },
          {
            accountId: prov.id,
            direction: 'CREDIT',
            amountCents,
            kind: 'cancellation_fee',
            description: 'Taxa de cancelamento recebida',
          },
        ],
        { orderId, intentId },
      );
    },

    /** Pagamento com saldo da carteira do cliente. */
    async debitCustomer(userId: string, amountCents: number, orderId: string, intentId: string | null) {
      const user = await account('USER', userId);
      if (user.balanceCents < amountCents) throw errors.paymentRequired('Saldo da carteira insuficiente');
      const clearing = await account('PLATFORM', PLATFORM.clearing);
      await journal(
        [
          {
            accountId: user.id,
            direction: 'DEBIT',
            amountCents,
            kind: 'wallet_payment',
            description: 'Pagamento com saldo da carteira',
          },
          {
            accountId: clearing.id,
            direction: 'CREDIT',
            amountCents,
            kind: 'wallet_payment',
            description: 'Recebimento via carteira do cliente',
          },
        ],
        { orderId, intentId },
      );
    },

    async creditCustomer(userId: string, amountCents: number, orderId: string | null, description: string) {
      if (amountCents <= 0) return;
      const user = await account('USER', userId);
      const revenue = await account('PLATFORM', PLATFORM.revenue);
      await journal(
        [
          { accountId: revenue.id, direction: 'DEBIT', amountCents, kind: 'customer_credit', description },
          { accountId: user.id, direction: 'CREDIT', amountCents, kind: 'customer_credit', description },
        ],
        { orderId },
      );
    },

    async balance(ownerType: OwnerType, ownerId: string): Promise<number> {
      return (await account(ownerType, ownerId)).balanceCents;
    },

    async summary(ownerType: OwnerType, ownerId: string) {
      const acc = await account(ownerType, ownerId);
      const [pending] = await db
        .select({ total: sql<number>`coalesce(sum(${payouts.amountCents}), 0)` })
        .from(payouts)
        .where(and(eq(payouts.providerId, ownerId), eq(payouts.status, 'SCHEDULED')));
      return {
        balanceCents: acc.balanceCents,
        pendingCents: ownerType === 'PROVIDER' ? Number(pending?.total ?? 0) : 0,
        heldCents: acc.heldCents,
        nextPayoutAt: ownerType === 'PROVIDER' ? iso(await this.nextPayoutAt()) : null,
      };
    },

    async ledger(ownerType: OwnerType, ownerId: string, limit = 50) {
      const acc = await account(ownerType, ownerId);
      const rows = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.accountId, acc.id))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        direction: r.direction as 'CREDIT' | 'DEBIT',
        amountCents: r.amountCents,
        orderId: r.orderId,
        description: r.description,
        createdAt: r.createdAt.toISOString(),
      }));
    },

    async listPayouts(providerId: string) {
      const rows = await db
        .select()
        .from(payouts)
        .where(eq(payouts.providerId, providerId))
        .orderBy(desc(payouts.createdAt));
      return rows.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        status: p.status as 'SCHEDULED' | 'PROCESSING' | 'PAID' | 'FAILED',
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        paidAt: iso(p.paidAt),
      }));
    },

    async nextPayoutAt(): Promise<Date> {
      const [job] = await db
        .select({ runAt: scheduledJobs.runAt })
        .from(scheduledJobs)
        .where(and(eq(scheduledJobs.kind, 'payout.batch'), eq(scheduledJobs.status, 'PENDING')))
        .orderBy(asc(scheduledJobs.runAt))
        .limit(1);
      return job?.runAt ?? adapters.clock.now();
    },

    /** Lote de repasses: agrupa saldo disponível por prestador em `payouts` SCHEDULED. */
    async runPayoutBatch(now: Date, periodDays = 7) {
      const accounts = await db
        .select()
        .from(walletAccounts)
        .where(and(eq(walletAccounts.ownerType, 'PROVIDER'), gt(walletAccounts.balanceCents, 0)));
      const payable = await account('PLATFORM', 'payouts_payable');
      let created = 0;
      for (const acc of accounts) {
        const [payout] = await db
          .insert(payouts)
          .values({
            providerId: acc.ownerId,
            amountCents: acc.balanceCents,
            periodStart: new Date(now.getTime() - periodDays * 86_400_000),
            periodEnd: now,
          })
          .returning();
        if (!payout) continue;
        await journal(
          [
            {
              accountId: acc.id,
              direction: 'DEBIT',
              amountCents: acc.balanceCents,
              kind: 'payout',
              description: 'Repasse agendado',
            },
            {
              accountId: payable.id,
              direction: 'CREDIT',
              amountCents: acc.balanceCents,
              kind: 'payout',
              description: `Repasse a pagar ao prestador ${acc.ownerId}`,
            },
          ],
          { payoutId: payout.id },
        );
        created++;
      }
      return created;
    },

    admin: {
      commissionRules: {
        list: async () => db.select().from(commissionRules).orderBy(asc(commissionRules.createdAt)),
        upsert: async (input: z.infer<typeof UpsertCommissionRuleInput>) => {
          const values = {
            categoryId: input.categoryId,
            regionId: input.regionId,
            percentBps: input.percentBps,
            fixedCents: input.fixedCents,
            minCents: input.minCents,
            maxCents: input.maxCents ?? null,
            passPaymentFeeToProvider: input.passPaymentFeeToProvider,
            activeFrom: input.activeFrom ? new Date(input.activeFrom) : adapters.clock.now(),
          };
          const [row] = input.id
            ? await db.update(commissionRules).set(values).where(eq(commissionRules.id, input.id)).returning()
            : await db.insert(commissionRules).values(values).returning();
          if (!row) throw errors.notFound('Regra de comissão');
          return row;
        },
        remove: async (id: string) => {
          await db
            .update(commissionRules)
            .set({ activeUntil: adapters.clock.now() })
            .where(eq(commissionRules.id, id));
        },
      },
    },
  };
}

export type WalletService = ReturnType<typeof createWalletService>;
