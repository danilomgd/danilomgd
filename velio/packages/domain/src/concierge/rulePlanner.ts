import type { ConciergePlan } from '@velio/contracts';

export interface PlannerContext {
  now: Date;
  timezone: string;
  hasVehicle: boolean;
  hasAddress: boolean;
  settings: { humanReviewAboveCents: number; humanReviewAboveTasks: number; alwaysHumanForKinds: string[] };
}

export interface ConciergePlanner {
  readonly name: string;
  plan(text: string, ctx: PlannerContext): Promise<ConciergePlan>;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Extrai "amanhã às 8h", "hoje 14:30", "sexta 9h". Retorna null se não houver referência clara. */
export function parseWhen(text: string, now: Date): Date | null {
  const t = norm(text);
  const time = t.match(/(\d{1,2})(?::|h)(\d{2})?\s*(h|hs|horas)?/);
  let dayOffset: number | null = null;
  if (/\bhoje\b/.test(t)) dayOffset = 0;
  else if (/\bdepois de amanha\b/.test(t)) dayOffset = 2;
  else if (/\bamanha\b/.test(t)) dayOffset = 1;
  if (dayOffset === null && !time) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + (dayOffset ?? 0));
  if (time) {
    const hh = Number(time[1]);
    const mm = time[2] ? Number(time[2]) : 0;
    if (hh > 23 || mm > 59) return null;
    d.setHours(hh, mm, 0, 0);
    if (dayOffset === null && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

/**
 * Planejador determinístico para padrões frequentes. Cobre os testes e serve de fallback
 * quando a IA não está configurada. Qualquer padrão desconhecido pede revisão humana.
 */
export class RuleBasedPlanner implements ConciergePlanner {
  readonly name = 'rules@1';

  async plan(text: string, ctx: PlannerContext): Promise<ConciergePlan> {
    const t = norm(text);
    const when = parseWhen(text, ctx.now);
    const whenIso = when?.toISOString();
    const vehicle = /\b(carro|veiculo|moto|caminhonete|suv)\b/.test(t);
    const pickup = /\b(pegue|pegar|busque|buscar|retire|retirar|leve|levar)\b/.test(t);
    const ret = /\b(devolv|traga|trazer|retorn)/.test(t);
    const revision = /\b(revisao|manutencao|oficina|concessionaria|mecanic)/.test(t);
    const wash = /\b(lav(ar|agem)|polimento|estetica)\b/.test(t);
    const laundry = /\b(roupa|lavanderia)\b/.test(t);
    const clarifications: string[] = [];
    const reasons: string[] = [];

    if (vehicle && pickup) {
      if (!ctx.hasVehicle) clarifications.push('Qual veículo? Cadastre marca, modelo e placa.');
      if (!ctx.hasAddress) clarifications.push('Onde está o veículo? Informe o endereço de retirada.');
      const dest = revision ? 'THIRD_PARTY_SERVICE' : wash ? 'THIRD_PARTY_SERVICE' : 'CUSTOM';
      const destTitle = revision
        ? 'Entrega na oficina/concessionária para revisão'
        : wash
          ? 'Lavagem do veículo'
          : 'Serviço no destino';
      if (!revision && !wash) clarifications.push('Para onde levar o veículo e qual serviço deve ser feito?');
      const estimateMin = 15000;
      const estimateMax = revision ? 45000 : 25000;
      const tasks: ConciergePlan['tasks'] = [
        {
          seq: 1,
          title: 'Retirada do veículo',
          kind: 'VEHICLE_PICKUP',
          serviceSlug: 'leva-e-traz-veiculo',
          startsAt: whenIso,
          dependsOnSeq: [],
          estimateCents: 6000,
        },
        { seq: 2, title: 'Transporte até o destino', kind: 'TRANSPORT', dependsOnSeq: [1] },
        {
          seq: 3,
          title: destTitle,
          kind: dest,
          dependsOnSeq: [2],
          notes: revision ? 'Custo da revisão é cobrado pela oficina; a plataforma acompanha.' : undefined,
        },
        { seq: 4, title: 'Acompanhamento e espera', kind: 'WAIT', dependsOnSeq: [3] },
        { seq: 5, title: 'Nova coleta no destino', kind: 'RETURN_PICKUP', dependsOnSeq: [4] },
        {
          seq: 6,
          title: 'Devolução ao cliente',
          kind: 'VEHICLE_RETURN',
          dependsOnSeq: [5],
          estimateCents: 6000,
        },
      ];
      if (!ret) clarifications.push('Devemos devolver o veículo no mesmo endereço?');
      const requiresHuman =
        revision ||
        estimateMax > ctx.settings.humanReviewAboveCents ||
        tasks.length > ctx.settings.humanReviewAboveTasks;
      if (revision) reasons.push('Serviço de terceiro (oficina) exige combinação humana de custo e prazo');
      if (tasks.length > ctx.settings.humanReviewAboveTasks) reasons.push('Plano com muitas tarefas');
      return {
        summary: `Retirar o veículo${when ? ` em ${when.toLocaleString('pt-BR', { timeZone: ctx.timezone })}` : ''}, levar para ${revision ? 'revisão' : wash ? 'lavagem' : 'o destino'} e devolver ao cliente.`,
        tasks,
        estimateMinCents: estimateMin,
        estimateMaxCents: estimateMax,
        confidence: clarifications.length === 0 ? 0.8 : 0.55,
        clarifications,
        requiresHuman,
        requiresHumanReasons: reasons,
      };
    }

    if (laundry && (pickup || ret)) {
      return {
        summary: 'Coleta de roupas, lavagem em lavanderia parceira e devolução.',
        tasks: [
          {
            seq: 1,
            title: 'Coleta das roupas',
            kind: 'HOME_SERVICE',
            serviceSlug: 'lavanderia-coleta',
            startsAt: whenIso,
            dependsOnSeq: [],
          },
          { seq: 2, title: 'Lavagem', kind: 'THIRD_PARTY_SERVICE', dependsOnSeq: [1] },
          { seq: 3, title: 'Devolução', kind: 'DELIVERY', dependsOnSeq: [2] },
        ],
        estimateMinCents: 6000,
        estimateMaxCents: 15000,
        confidence: 0.75,
        clarifications: ctx.hasAddress ? [] : ['Qual o endereço de coleta?'],
        requiresHuman: false,
        requiresHumanReasons: [],
      };
    }

    return {
      summary: 'Pedido personalizado que precisa de análise da nossa equipe.',
      tasks: [
        {
          seq: 1,
          title: 'Analisar pedido e montar plano',
          kind: 'CUSTOM',
          dependsOnSeq: [],
          notes: text.slice(0, 500),
        },
      ],
      estimateMinCents: 0,
      estimateMaxCents: 0,
      confidence: 0.2,
      clarifications: [],
      requiresHuman: true,
      requiresHumanReasons: ['Padrão não reconhecido pelo planejador automático'],
    };
  }
}

/** Decide se um plano precisa de humano além do que o planejador já disse (defesa em profundidade). */
export function needsHumanReview(
  plan: ConciergePlan,
  settings: PlannerContext['settings'],
): { required: boolean; reasons: string[] } {
  const reasons = [...plan.requiresHumanReasons];
  if (plan.requiresHuman && reasons.length === 0) reasons.push('Planejador solicitou revisão');
  if (plan.estimateMaxCents > settings.humanReviewAboveCents)
    reasons.push('Estimativa acima do limite de aprovação automática');
  if (plan.tasks.length > settings.humanReviewAboveTasks) reasons.push('Número de tarefas acima do limite');
  if (plan.tasks.some((t) => settings.alwaysHumanForKinds.includes(t.kind)))
    reasons.push('Contém tarefa que sempre exige humano');
  if (plan.confidence < 0.5) reasons.push('Confiança baixa do planejador');
  return { required: reasons.length > 0, reasons: [...new Set(reasons)] };
}
