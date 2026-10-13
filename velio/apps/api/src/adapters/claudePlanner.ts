import Anthropic from '@anthropic-ai/sdk';
import { ConciergePlan } from '@velio/contracts';
import { type ConciergePlanner, type PlannerContext, RuleBasedPlanner } from '@velio/domain';

/**
 * Planejador de Concierge com a API da Anthropic (ADR-014). Devolve só um plano estruturado,
 * validado por Zod; nunca executa ações. Em falha, cai para o planejador por regras.
 */
export class ClaudePlanner implements ConciergePlanner {
  readonly name: string;
  private readonly fallback = new RuleBasedPlanner();
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new Anthropic({ apiKey });
    this.name = `claude:${model}`;
  }

  async plan(text: string, ctx: PlannerContext): Promise<ConciergePlan> {
    const schema = JSON.stringify(ConciergePlan.toJSONSchema?.() ?? {});
    const system = [
      'Você é o planejador do Concierge do VÉLIO, um marketplace brasileiro de serviços sob demanda.',
      'Transforme o pedido do cliente em um plano de tarefas sequenciais. Responda APENAS com JSON válido no schema fornecido.',
      'Regras: nunca proponha pagamentos, compras ou ações financeiras automáticas; marque requiresHuman=true para qualquer tarefa que envolva terceiros com custo (oficina, concessionária), compras, valores acima de R$ 500 ou ambiguidade.',
      'Use kinds: VEHICLE_PICKUP, TRANSPORT, THIRD_PARTY_SERVICE, WAIT, RETURN_PICKUP, VEHICLE_RETURN, HOME_SERVICE, PURCHASE, DELIVERY, CUSTOM.',
      `Contexto: hoje é ${ctx.now.toISOString()}, fuso ${ctx.timezone}. Cliente ${ctx.hasVehicle ? 'tem' : 'não tem'} veículo cadastrado e ${ctx.hasAddress ? 'tem' : 'não tem'} endereço cadastrado.`,
      `Schema JSON: ${schema}`,
    ].join('\n');
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: text }],
      });
      const block = res.content.find((c) => c.type === 'text');
      const raw = block && block.type === 'text' ? block.text : '';
      const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
      const parsed = ConciergePlan.safeParse(JSON.parse(jsonText));
      if (!parsed.success) return this.fallback.plan(text, ctx);
      return parsed.data;
    } catch {
      return this.fallback.plan(text, ctx);
    }
  }
}
