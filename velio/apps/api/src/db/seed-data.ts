import type { MatchingWeights, PricingModel, WaveConfig, WorkflowKind } from '@velio/contracts';

/**
 * Catálogo inicial do VÉLIO. Tudo aqui é configuração, não código: o admin altera pelo painel.
 * Preços em centavos, pensados para capitais brasileiras em 2026; o admin ajusta por região.
 */
export interface SeedCategory {
  slug: string;
  name: string;
  icon: string;
  description: string;
  sortOrder: number;
  config?: Record<string, unknown>;
  services: SeedService[];
}
export interface SeedService {
  slug: string;
  name: string;
  short: string;
  workflowKind: WorkflowKind;
  pricingModel: PricingModel;
  basePriceCents?: number;
  priceMinCents?: number;
  priceMaxCents?: number;
  hourlyRateCents?: number;
  durationMin?: number;
  allowsImmediate?: boolean;
  allowsScheduling?: boolean;
  requiresVehicle?: boolean;
  requiresEquipment?: boolean;
  options?: Array<Record<string, unknown>>;
}

export const seedCategories: SeedCategory[] = [
  {
    slug: 'hidraulica',
    name: 'Encanador',
    icon: 'droplet',
    description: 'Vazamentos, entupimentos, torneiras, caixas e registros',
    sortOrder: 1,
    config: { requiresBeforeAfterPhotos: true, requiresStartPin: true },
    services: [
      { slug: 'encanador-visita', name: 'Encanador: visita e reparo simples', short: 'Vazamento, torneira, sifão, válvula', workflowKind: 'IMMEDIATE', pricingModel: 'FIXED', basePriceCents: 8000, durationMin: 60, options: [{ key: 'urgente', label: 'Atendimento urgente (até 1h)', type: 'boolean', unitPriceCents: 3000 }] },
      { slug: 'desentupimento', name: 'Desentupimento', short: 'Pia, ralo, vaso ou coluna', workflowKind: 'IMMEDIATE', pricingModel: 'RANGE', priceMinCents: 12000, priceMaxCents: 30000, durationMin: 90 },
      { slug: 'instalacao-hidraulica', name: 'Instalação hidráulica', short: 'Chuveiro, torneira, caixa acoplada, filtro', workflowKind: 'SCHEDULED', pricingModel: 'FIXED', basePriceCents: 15000, durationMin: 120, allowsImmediate: false },
      { slug: 'reforma-hidraulica', name: 'Reforma hidráulica (orçamento)', short: 'Troca de tubulação, caixa d\'água, aquecedor', workflowKind: 'QUOTE', pricingModel: 'QUOTE', priceMinCents: 30000, priceMaxCents: 300000 },
    ],
  },
  {
    slug: 'eletrica',
    name: 'Eletricista',
    icon: 'zap',
    description: 'Tomadas, disjuntores, chuveiro, iluminação e quadro',
    sortOrder: 2,
    config: { requiresBeforeAfterPhotos: true, requiresStartPin: true },
    services: [
      { slug: 'eletricista-visita', name: 'Eletricista: visita e reparo simples', short: 'Tomada, interruptor, disjuntor, lâmpada', workflowKind: 'IMMEDIATE', pricingModel: 'FIXED', basePriceCents: 9000, durationMin: 60, options: [{ key: 'pontos', label: 'Pontos adicionais', type: 'number', unitPriceCents: 2500, min: 0, max: 10 }] },
      { slug: 'instalacao-chuveiro', name: 'Instalação de chuveiro elétrico', short: 'Com teste de disjuntor e fiação', workflowKind: 'SCHEDULED', pricingModel: 'FIXED', basePriceCents: 12000, durationMin: 60 },
      { slug: 'instalacao-ventilador-luminaria', name: 'Instalação de ventilador ou luminária', short: 'Teto, com suporte e teste', workflowKind: 'SCHEDULED', pricingModel: 'FIXED', basePriceCents: 11000, durationMin: 60 },
      { slug: 'quadro-eletrico', name: 'Quadro elétrico e rede (orçamento)', short: 'Troca de quadro, novos circuitos, aterramento', workflowKind: 'QUOTE', pricingModel: 'QUOTE', priceMinCents: 40000, priceMaxCents: 500000 },
    ],
  },
  {
    slug: 'ar-condicionado',
    name: 'Ar-condicionado',
    icon: 'wind',
    description: 'Limpeza, manutenção, instalação e planos recorrentes',
    sortOrder: 3,
    config: { requiresEquipment: true, requiresBeforeAfterPhotos: true, requiresStartPin: true },
    services: [
      { slug: 'ac-limpeza', name: 'Limpeza de ar-condicionado', short: 'Higienização completa de split até 18.000 BTUs', workflowKind: 'SCHEDULED', pricingModel: 'FIXED', basePriceCents: 18000, durationMin: 90, requiresEquipment: true, options: [{ key: 'btus', label: 'Capacidade', type: 'select', choices: [{ value: 'ate18', label: 'Até 18.000 BTUs', priceDeltaCents: 0 }, { value: 'ate30', label: '18.001 a 30.000 BTUs', priceDeltaCents: 6000 }, { value: 'acima30', label: 'Acima de 30.000 BTUs', priceDeltaCents: 14000 }] }] },
      { slug: 'ac-manutencao', name: 'Manutenção preventiva', short: 'Limpeza + verificação de gás, dreno e elétrica', workflowKind: 'SCHEDULED', pricingModel: 'FIXED', basePriceCents: 26000, durationMin: 120, requiresEquipment: true },
      { slug: 'ac-instalacao', name: 'Instalação de ar-condicionado', short: 'Split, com tubulação até 3 m', workflowKind: 'SCHEDULED', pricingModel: 'RANGE', priceMinCents: 60000, priceMaxCents: 120000, durationMin: 240, requiresEquipment: true, allowsImmediate: false },
      { slug: 'ac-reparo', name: 'Reparo (orçamento)', short: 'Não gela, vaza, faz barulho', workflowKind: 'QUOTE', pricingModel: 'QUOTE', priceMinCents: 15000, priceMaxCents: 250000, requiresEquipment: true },
    ],
  },
  {
    slug: 'lavanderia',
    name: 'Lavanderia',
    icon: 'shirt',
    description: 'Coletamos, lavamos e devolvemos',
    sortOrder: 4,
    config: { requiresCustody: true },
    services: [
      { slug: 'lavanderia-coleta', name: 'Lavanderia com coleta e entrega', short: 'Lavar e secar, saco de até 8 kg, devolução em 48h', workflowKind: 'LAUNDRY', pricingModel: 'FIXED', basePriceCents: 8900, durationMin: 2880, options: [{ key: 'sacos', label: 'Sacos adicionais (8 kg)', type: 'number', unitPriceCents: 6900, min: 0, max: 5 }, { key: 'passar', label: 'Passar roupas', type: 'boolean', unitPriceCents: 4500 }] },
      { slug: 'lavanderia-expressa', name: 'Lavanderia expressa 24h', short: 'Devolução no dia seguinte', workflowKind: 'LAUNDRY', pricingModel: 'FIXED', basePriceCents: 12900, durationMin: 1440 },
    ],
  },
  {
    slug: 'automotivo',
    name: 'Automotivo',
    icon: 'car',
    description: 'Lavagem, estética, revisão e leva e traz',
    sortOrder: 5,
    config: { requiresVehicle: true, requiresBeforeAfterPhotos: true },
    services: [
      { slug: 'lavagem-carro-domicilio', name: 'Lavagem a domicílio', short: 'Externa + interna, a seco ou com água', workflowKind: 'SCHEDULED', pricingModel: 'FIXED', basePriceCents: 9000, durationMin: 90, requiresVehicle: true, options: [{ key: 'porte', label: 'Porte', type: 'select', choices: [{ value: 'hatch', label: 'Hatch', priceDeltaCents: 0 }, { value: 'sedan', label: 'Sedan/SUV', priceDeltaCents: 2000 }, { value: 'grande', label: 'Caminhonete/Van', priceDeltaCents: 5000 }] }] },
      { slug: 'leva-e-traz-lavagem', name: 'Leva e traz: lavagem completa', short: 'Buscamos, lavamos em parceiro e devolvemos', workflowKind: 'LOGISTICS', pricingModel: 'FIXED', basePriceCents: 16000, durationMin: 240, requiresVehicle: true },
      { slug: 'leva-e-traz-veiculo', name: 'Leva e traz: revisão ou manutenção', short: 'Levamos à oficina/concessionária e devolvemos', workflowKind: 'LOGISTICS', pricingModel: 'FIXED', basePriceCents: 12000, durationMin: 480, requiresVehicle: true, allowsImmediate: false },
      { slug: 'estetica-automotiva', name: 'Estética automotiva (orçamento)', short: 'Polimento, vitrificação, higienização de bancos', workflowKind: 'QUOTE', pricingModel: 'QUOTE', priceMinCents: 20000, priceMaxCents: 200000, requiresVehicle: true },
    ],
  },
  {
    slug: 'residencial',
    name: 'Casa',
    icon: 'home',
    description: 'Montagem, pequenos reparos, pintura e limpeza',
    sortOrder: 6,
    config: { requiresStartPin: true },
    services: [
      { slug: 'marido-de-aluguel', name: 'Pequenos reparos (por hora)', short: 'Prateleiras, quadros, cortinas, portas', workflowKind: 'IMMEDIATE', pricingModel: 'HOURLY', hourlyRateCents: 7000, durationMin: 60 },
      { slug: 'montagem-moveis', name: 'Montagem de móveis', short: 'Guarda-roupa, cama, estante, mesa', workflowKind: 'SCHEDULED', pricingModel: 'RANGE', priceMinCents: 12000, priceMaxCents: 40000, durationMin: 180 },
      { slug: 'limpeza-residencial', name: 'Limpeza residencial', short: 'Diarista por período, produtos inclusos', workflowKind: 'SCHEDULED', pricingModel: 'FIXED', basePriceCents: 22000, durationMin: 240, allowsImmediate: false },
      { slug: 'pintura', name: 'Pintura (orçamento)', short: 'Cômodos, fachadas, portões', workflowKind: 'QUOTE', pricingModel: 'QUOTE', priceMinCents: 50000, priceMaxCents: 800000 },
    ],
  },
  {
    slug: 'entregas',
    name: 'Entregas',
    icon: 'package',
    description: 'Pequenas entregas e retiradas na cidade',
    sortOrder: 7,
    services: [
      { slug: 'entrega-rapida', name: 'Entrega rápida', short: 'Documentos e pacotes até 10 kg na cidade', workflowKind: 'LOGISTICS', pricingModel: 'FIXED', basePriceCents: 2500, durationMin: 60, options: [{ key: 'km', label: 'Distância estimada (km)', type: 'number', unitPriceCents: 180, min: 1, max: 60 }] },
      { slug: 'retirada-compra', name: 'Retirar compra ou encomenda', short: 'Buscamos na loja e entregamos', workflowKind: 'LOGISTICS', pricingModel: 'FIXED', basePriceCents: 3500, durationMin: 90 },
    ],
  },
  {
    slug: 'assistencia',
    name: 'Assistência',
    icon: 'life-buoy',
    description: 'Chaveiro, vidraceiro, dedetização, emergências',
    sortOrder: 8,
    config: { requiresStartPin: true },
    services: [
      { slug: 'chaveiro', name: 'Chaveiro', short: 'Abertura, troca de segredo, cópias', workflowKind: 'IMMEDIATE', pricingModel: 'RANGE', priceMinCents: 8000, priceMaxCents: 25000, durationMin: 45 },
      { slug: 'dedetizacao', name: 'Dedetização', short: 'Baratas, formigas, cupins', workflowKind: 'SCHEDULED', pricingModel: 'RANGE', priceMinCents: 15000, priceMaxCents: 45000, durationMin: 90, allowsImmediate: false },
      { slug: 'vidraceiro', name: 'Vidraceiro (orçamento)', short: 'Box, janelas, espelhos', workflowKind: 'QUOTE', pricingModel: 'QUOTE', priceMinCents: 20000, priceMaxCents: 300000 },
    ],
  },
  {
    slug: 'concierge',
    name: 'Concierge',
    icon: 'sparkles',
    description: 'Diga o que precisa. Nós resolvemos.',
    sortOrder: 9,
    services: [{ slug: 'concierge', name: 'Concierge', short: 'Pedidos em linguagem natural, com plano e orçamento', workflowKind: 'CONCIERGE', pricingModel: 'QUOTE', priceMinCents: 5000, priceMaxCents: 500000, allowsImmediate: true }],
  },
];

export const seedPlans = [
  { slug: 'ac-essencial', name: 'Plano Essencial', description: '1 limpeza por semestre para 1 equipamento', serviceSlug: 'ac-limpeza', intervalMonths: 12, visitsPerCycle: 2, priceCents: 29900, benefits: ['2 limpezas por ano', 'Lembretes automáticos', 'Prioridade no agendamento'] },
  { slug: 'ac-residencial', name: 'Plano Residencial', description: 'Até 3 equipamentos, manutenção preventiva semestral', serviceSlug: 'ac-manutencao', intervalMonths: 12, visitsPerCycle: 2, priceCents: 69900, benefits: ['Até 3 equipamentos', '2 manutenções por ano', 'Reparo com 10% de desconto'] },
  { slug: 'ac-premium', name: 'Plano Premium', description: 'Até 5 equipamentos, manutenção trimestral e visita de emergência', serviceSlug: 'ac-manutencao', intervalMonths: 12, visitsPerCycle: 4, priceCents: 149900, benefits: ['Até 5 equipamentos', '4 manutenções por ano', '1 visita de emergência inclusa', 'Reparo com 20% de desconto'] },
];

export const seedMatchingWeights: MatchingWeights = { proximity: 0.3, qualification: 0.15, reputation: 0.2, availability: 0.15, compatibility: 0.1, acceptanceRate: 0.1, cancellationPenalty: 0.1 };
export const seedWaves: WaveConfig = {
  waves: [
    { radiusKm: 5, offerCount: 3, timeoutSeconds: 90 },
    { radiusKm: 10, offerCount: 5, timeoutSeconds: 120 },
    { radiusKm: 20, offerCount: 8, timeoutSeconds: 180 },
  ],
  escalateToOps: true,
  minScore: 0.2,
};

export const seedHomeSections = [
  { id: 'search', kind: 'search', title: 'O que você precisa?', sortOrder: 0 },
  { id: 'active_orders', kind: 'active_orders', title: 'Em andamento', sortOrder: 1, rules: { requiresActiveOrder: true } },
  { id: 'categories', kind: 'categories', title: null, sortOrder: 2 },
  { id: 'quick', kind: 'quick_services', title: 'Serviços rápidos', subtitle: 'Alguém a caminho em minutos', sortOrder: 3 },
  { id: 'morning', kind: 'recommendations', title: 'Para começar o dia', sortOrder: 4, rules: { hoursOfDay: [6, 7, 8, 9, 10] }, config: { serviceSlugs: ['lavanderia-coleta', 'lavagem-carro-domicilio', 'limpeza-residencial'] } },
  { id: 'today', kind: 'recommendations', title: 'Resolver hoje', sortOrder: 4, rules: { hoursOfDay: [11, 12, 13, 14, 15, 16, 17] }, config: { serviceSlugs: ['encanador-visita', 'eletricista-visita', 'marido-de-aluguel'] } },
  { id: 'evening', kind: 'recommendations', title: 'Para amanhã cedo', sortOrder: 4, rules: { hoursOfDay: [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5] }, config: { serviceSlugs: ['ac-limpeza', 'leva-e-traz-veiculo', 'limpeza-residencial'] } },
  { id: 'equipment_due', kind: 'recommendations', title: 'Está na hora de revisar seu ar-condicionado?', sortOrder: 5, rules: { requiresEquipmentDue: true }, config: { serviceSlugs: ['ac-limpeza', 'ac-manutencao'] } },
  { id: 'scheduled', kind: 'scheduled', title: 'Agende com antecedência', sortOrder: 6, config: { serviceSlugs: ['ac-limpeza', 'instalacao-chuveiro', 'montagem-moveis', 'dedetizacao'] } },
  { id: 'subscriptions', kind: 'subscriptions', title: 'Planos de manutenção', subtitle: 'Seu ar-condicionado sempre em dia', sortOrder: 7 },
  { id: 'concierge', kind: 'concierge', title: 'Concierge', subtitle: 'Diga o que precisa. Nós resolvemos.', sortOrder: 8 },
];

export const seedSettings = {
  cancellation: { freeMinutesAfterAccept: 10, lateFeeCents: 1500, enRouteFeeBps: 2000, enRouteFeeMinCents: 2000 },
  offers: { defaultTimeoutSeconds: 90 },
  quotes: { additionalQuoteExpiresMinutes: 60 },
  payouts: { cadence: 'WEEKLY', weekday: 3 },
  concierge: { humanReviewAboveCents: 50000, humanReviewAboveTasks: 4, alwaysHumanForKinds: ['PURCHASE'] },
  location: { maxAccuracyM: 100, retentionDays: 30 },
  reviews: { windowDays: 7 },
};

export const seedRegions = [
  { name: 'São Paulo — Capital', city: 'São Paulo', state: 'SP', bbox: { minLat: -24.01, minLng: -46.83, maxLat: -23.36, maxLng: -46.36 }, neighborhoods: ['Pinheiros', 'Vila Mariana', 'Moema', 'Perdizes', 'Tatuapé', 'Santana', 'Itaim Bibi', 'Brooklin'] },
];

export const seedCoupons = [{ code: 'BEMVINDO10', kind: 'PERCENT' as const, value: 10, maxDiscountCents: 3000, perUserLimit: 1 }];
