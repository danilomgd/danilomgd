# VÉLIO

Super app brasileiro de serviços sob demanda: pedir → acompanhar → receber → pagar → avaliar. Encanador, eletricista, ar-condicionado (avulso e por assinatura), lavanderia com coleta e entrega, lavagem e revisão de veículo com leva e traz, pequenas entregas, assistência residencial e Concierge em linguagem natural com IA e operador humano.

Monorepo TypeScript (pnpm + Turborepo). Documentação completa em [`docs/`](docs/), começando por [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md) e [`docs/06_SYSTEM_ARCHITECTURE.md`](docs/06_SYSTEM_ARCHITECTURE.md).

## Estrutura

```
packages/contracts    enums canônicos, DTOs Zod, rótulos pt-BR, eventos realtime e analytics
packages/domain       Marketplace Engine: workflows declarativos, matching, precificação, políticas, concierge
packages/ui           design system (tokens compartilhados + componentes React Native)
packages/api-client   cliente HTTP/realtime tipado para mobile e web
apps/api              API Fastify (modular monolith) + Drizzle (Postgres / PGlite) + Socket.IO + scheduler
apps/mobile           Expo Router: app do cliente (VÉLIO) e do prestador (VÉLIO Pro) a partir de um código
apps/web              Next.js: painel operacional (/ops) e administrativo (/admin)
docs/                 PRD, benchmark, arquitetura, schema, API, design system, segurança, roadmap, testes, gap analysis
```

## Requisitos

- Node.js 22.19+ e pnpm 10 (`corepack enable`)
- Nenhum banco necessário para desenvolver e testar: sem `DATABASE_URL`, a API usa PGlite (Postgres em WebAssembly) em memória ou em arquivo (`PGLITE_DATA_DIR=.pglite`)
- Para staging/produção: PostgreSQL 16 (Supabase, Neon, RDS ou equivalente)

## Executar

```bash
cd velio
pnpm install
pnpm check                      # lint + typecheck + testes + build de tudo

# API (porta 4000, PGlite, pagamentos sandbox, OTP no log)
pnpm --filter @velio/api db:seed       # migra e popula catálogo, planos, pesos de matching, settings
SEED_ADMIN_EMAIL=admin@velio.local SEED_ADMIN_PASSWORD='troque-esta-senha' pnpm --filter @velio/api db:seed
pnpm --filter @velio/api dev

# Painéis web (porta 3000)
NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm --filter @velio/web dev

# Apps mobile (Expo)
EXPO_PUBLIC_APP_ROLE=customer EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:4000 pnpm --filter @velio/mobile start
EXPO_PUBLIC_APP_ROLE=provider EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:4000 pnpm --filter @velio/mobile start
```

Em desenvolvimento o código OTP aparece no log da API (`[sms:log]`), mascarado; em `NODE_ENV=test` ele é devolvido na resposta para os testes automatizados.

## Testes

```bash
pnpm test                                   # todos os pacotes
pnpm --filter @velio/domain test            # engine, matching, pricing, políticas, concierge
pnpm --filter @velio/api test               # integração com PGlite em memória
pnpm test:scenarios                         # cenários A–L ponta a ponta (apps/api/test/scenarios)
```

## Variáveis de ambiente da API

| Variável | Padrão | Observação |
|---|---|---|
| `NODE_ENV` | `development` | Em `production`, adaptadores de desenvolvimento são recusados (ADR-015) |
| `PORT`, `HOST` | `4000`, `0.0.0.0` | |
| `DATABASE_URL` | vazio (PGlite) | Obrigatório em produção |
| `JWT_SECRET` | valor de desenvolvimento | Obrigatório trocar em produção (≥ 32 caracteres) |
| `DOCUMENT_HASH_KEY` | vazio (usa `JWT_SECRET`) | Chave do HMAC de CPF/CNPJ dos prestadores; obrigatória em produção e nunca rotacionar sem migrar os hashes |
| `PAYMENTS_PROVIDER` | `sandbox` | `pagarme` exige `PAGARME_SECRET_KEY` e `PAGARME_WEBHOOK_SECRET` |
| `SMS_PROVIDER` | `log` | `twilio` em V1 |
| `PUSH_PROVIDER` | `memory` | `expo` em V1 |
| `CONCIERGE_PLANNER` | `rules` | `claude` exige `ANTHROPIC_API_KEY`; modelo em `ANTHROPIC_MODEL` |
| `CORS_ORIGINS` | `*` | Lista separada por vírgula em produção |
| `SCHEDULER_ENABLED` | `true` | Desligue em réplicas sem jobs |

## Deploy

1. **Banco**: Postgres 16 gerenciado com backups PITR. Rode `pnpm --filter @velio/api db:migrate` no pipeline (as migrações estão em `apps/api/drizzle/`), depois `db:seed` (idempotente).
2. **API**: `pnpm --filter @velio/api build` gera `apps/api/dist/server.mjs` (bundle único; dependências nativas ficam externas). Container Node 22: `node dist/server.mjs`. Variáveis acima. Health em `GET /health`. Duas ou mais instâncias exigem o adaptador Redis do Socket.IO (V1) ou afinidade de sessão.
3. **Web**: `pnpm --filter @velio/web build`; publique no Vercel ou como container Next.js com `NEXT_PUBLIC_API_URL`.
4. **Mobile**: EAS Build com dois perfis (`customer` e `provider`) definindo `EXPO_PUBLIC_APP_ROLE` e `EXPO_PUBLIC_API_URL`; EAS Submit para App Store e Google Play.
5. **Webhooks de pagamento**: aponte o provedor para `POST https://api.seudominio/v1/payments/webhooks/pagarme` com o segredo configurado.

## Princípios

- Nada de mock em produção: adaptadores de desenvolvimento são selecionados por variável de ambiente e recusam iniciar em produção.
- Toda funcionalidade tem caminho real: UI → API → regra de negócio → banco → evento/realtime → retorno → erro tratado.
- Workflows, categorias, preços, comissão, pesos de matching e seções da home são dados, não código.
- LGPD by design: minimização, retenção definida, consentimento registrado, documento do prestador só em hash, localização aproximada na oferta.
