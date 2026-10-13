import {
  Address,
  type HomeSection,
  ServiceCategory,
  ServiceOrder,
  ServiceSummary,
  Subscription,
  SubscriptionPlan,
} from '@velio/contracts';
import { z } from 'zod';

/** Itens de seção chegam como `unknown[]`; validamos por tipo e ignoramos o que não bate. */
function parseList<T extends z.ZodTypeAny>(schema: T, items: unknown[]): Array<z.infer<T>> {
  const out: Array<z.infer<T>> = [];
  for (const it of items) {
    const r = schema.safeParse(it);
    if (r.success) out.push(r.data);
  }
  return out;
}

export const RecommendedService = ServiceSummary.extend({ reason: z.string().nullable().optional() });
export type RecommendedService = z.infer<typeof RecommendedService>;

export const Banner = z.object({
  id: z.string().optional(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  deepLink: z.string().nullable().optional(),
});
export type Banner = z.infer<typeof Banner>;

export function sectionServices(s: HomeSection): RecommendedService[] {
  return parseList(RecommendedService, s.items);
}
export function sectionCategories(s: HomeSection): ServiceCategory[] {
  return parseList(ServiceCategory, s.items);
}
export function sectionOrders(s: HomeSection): ServiceOrder[] {
  return parseList(ServiceOrder, s.items);
}
export function sectionPlans(s: HomeSection): SubscriptionPlan[] {
  return parseList(SubscriptionPlan, s.items);
}
export function sectionSubscriptions(s: HomeSection): Subscription[] {
  return parseList(Subscription, s.items);
}
export function sectionBanners(s: HomeSection): Banner[] {
  return parseList(Banner, s.items);
}
export function sectionAddresses(s: HomeSection): Address[] {
  return parseList(Address, s.items);
}

/** Rota interna a partir de um deep link `velio://...` ou caminho. */
export function deepLinkToPath(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = link.match(/^(?:velio:\/\/|https?:\/\/[^/]+\/|\/)?(.*)$/);
  const path = m?.[1] ?? '';
  if (!path) return null;
  if (path.startsWith('services/')) return `/(customer)/service/${path.slice('services/'.length)}`;
  if (path.startsWith('categories/')) return `/(customer)/category/${path.slice('categories/'.length)}`;
  if (path.startsWith('subscriptions')) return '/(customer)/subscriptions/plans';
  if (path.startsWith('concierge')) return '/(customer)/concierge';
  if (path.startsWith('orders/')) return `/(customer)/order/${path.slice('orders/'.length)}`;
  return null;
}
