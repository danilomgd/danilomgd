# @velio/mobile — VÉLIO e VÉLIO Pro

Um projeto Expo (SDK 57, Expo Router) que gera **dois aplicativos** a partir do mesmo código (ADR-010):

| Variante | `EXPO_PUBLIC_APP_ROLE` | Nome | Bundle ID / package | Esquema de deep link | Árvore de rotas |
|---|---|---|---|---|---|
| Cliente | `customer` (padrão) | VÉLIO | `br.com.velio.app` | `velio://` | `app/(customer)/` |
| Prestador | `provider` | VÉLIO Pro | `br.com.velio.pro` | `velio-pro://` | `app/(provider)/` |

`app.config.ts` lê a variável em tempo de configuração e muda nome, slug, ícones, splash, permissões e plugins. O `_layout.tsx` raiz monta apenas a árvore do papel escolhido (`Stack.Protected`), por isso um binário nunca contém as telas do outro produto ativas.

## Rodar

Pré-requisitos: Node 22, pnpm 10, `pnpm install` na raiz do monorepo e a API (`apps/api`) rodando.

```bash
cp apps/mobile/.env.example apps/mobile/.env   # ajuste EXPO_PUBLIC_API_URL (IP da máquina para aparelho físico)

# App do cliente
pnpm --filter @velio/mobile start:customer

# App do prestador
pnpm --filter @velio/mobile start:provider
```

No terminal do Expo: `i` abre no simulador iOS, `a` no emulador Android, `w` no navegador (preview de desenvolvimento). Os dois apps usam módulos nativos (`react-native-maps`, `expo-camera`, `expo-location`, `expo-notifications`, `expo-secure-store`): fora do Expo Go é preciso um **development build** (`npx expo run:ios` / `run:android` ou EAS, abaixo).

### Variáveis

| Variável | Uso |
|---|---|
| `EXPO_PUBLIC_APP_ROLE` | `customer` ou `provider`. Define o produto. |
| `EXPO_PUBLIC_API_URL` | URL base da API (padrão `http://localhost:3333`). O realtime (Socket.IO em `/realtime`) usa a mesma base. |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` | Opcional. Chave do Google Maps para Android. iOS usa Apple Maps. |
| `EXPO_PUBLIC_UPLOAD_URL` | Opcional. Endpoint multipart (`file` → `{ url }`) usado por `src/lib/uploads.ts` enquanto a API não emite URL assinada. |
| `EAS_PROJECT_ID` | ID do projeto no EAS, injetado em `extra.eas.projectId`. |

### Validar sem aparelho

```bash
pnpm --filter @velio/mobile typecheck        # tsc
pnpm --filter @velio/mobile test             # Vitest: lógica pura (fila de analytics, lote de GPS, formatadores, tokenização, execução)
pnpm exec biome check apps/mobile packages/ui
pnpm --filter @velio/mobile export:web       # prova que o bundle fecha (web usa fallback de mapa)
```

## Builds com EAS

Crie `eas.json` com um perfil por produto; a diferença é só a variável de ambiente:

```json
{
  "build": {
    "customer": { "env": { "EXPO_PUBLIC_APP_ROLE": "customer", "EXPO_PUBLIC_API_URL": "https://api.velio.com.br" }, "distribution": "store" },
    "provider": { "env": { "EXPO_PUBLIC_APP_ROLE": "provider", "EXPO_PUBLIC_API_URL": "https://api.velio.com.br" }, "distribution": "store" },
    "customer-dev": { "extends": "customer", "developmentClient": true, "distribution": "internal" },
    "provider-dev": { "extends": "provider", "developmentClient": true, "distribution": "internal" }
  }
}
```

```bash
eas build --profile customer --platform all
eas build --profile provider --platform all
eas submit --profile customer --platform ios
```

Cada perfil gera um app com bundle ID, nome e ícone próprios; as lojas os tratam como produtos distintos.

## Estrutura

```
app/
  _layout.tsx                 providers (tema, React Query persistido, sessão, toasts) e seleção da árvore por papel
  (customer)/                 VÉLIO: (auth), (tabs) [Início, Pedidos, Concierge, Conta], category/[slug], service/[slug],
                              checkout, order/[id] (acompanhamento, chat, review, dispute), concierge/[id],
                              subscriptions/{plans,[id]}, account/{addresses,vehicles,equipments,payment-methods,notifications}, search
  (provider)/                 VÉLIO Pro: (auth), onboarding, pending, (tabs) [Painel, Serviços, Agenda, Ganhos, Perfil],
                              offer/[id] (modal de tela cheia), order/[id] (execução, chat, quote, custody, handover)
src/
  auth/session.tsx            sessão em expo-secure-store, refresh automático via HttpClient, logout ao expirar
  lib/api.ts                  HttpClient + createApi (packages/api-client) com X-Velio-App por papel
  lib/realtime.ts             RealtimeClient (Socket.IO) com assinatura por evento e fallback para polling
  lib/query.ts                QueryClient + persistência leve (AsyncStorage) e chaves centralizadas
  lib/analytics.ts            fila de eventos (10 eventos ou 30 s) → POST /v1/analytics/events
  lib/location.ts             GPS: cliente (uma leitura) e prestador (lotes com intervalo de locationIntervalSeconds)
  lib/notifications.ts        token de push → POST /v1/me/devices; deep link por data.orderId/offerId
  lib/payments.ts             tokenizeCard: sandbox em dev, SDK do provedor em produção; número nunca vai à API
  lib/uploads.ts              upload de mídia (EXPO_PUBLIC_UPLOAD_URL) com erro explícito quando indisponível
  components/                 Screen, Header, TabBar, OrderMap (+ .web.tsx), ActiveOrderBanner, ProviderCard…
  features/                   telas compartilhadas (auth, chat, cancelamento) e helpers por papel
packages/ui/src/native/       design system React Native (ThemeProvider, Button, Input, OTPInput, StatusPill,
                              OrderStatusTimeline, QuoteApprovalCard, EvidenceUploader, BottomSheet, Toast…)
```

Regras seguidas: tudo vem da API (sem dados embutidos); todo carregamento tem skeleton, vazio tem `EmptyState` e erro tem "Tentar novamente"; uma ação principal por tela; alvos de toque de 44 pt; textos pt-BR curtos; rótulos de status vêm de `ORDER_STATUS_LABELS` em `@velio/contracts`.

## Comportamentos que dependem do ambiente

- **Mapa**: `react-native-maps` no iOS/Android. Na web, `OrderMap.web.tsx` mostra endereço/ETA em texto.
- **Fotos de evidência e documentos**: capturadas com `expo-image-picker` e enviadas por `uploadMedia`. Sem `EXPO_PUBLIC_UPLOAD_URL`, a tela avisa e aceita link (`https://`). Quando a API expuser URL assinada, troque só `src/lib/uploads.ts`.
- **Cartão**: em `__DEV__` o token é `tok_sandbox_<últimos 4>` (reconhecido pelo `SandboxGateway`). Em produção, `tokenizeCard` exige o SDK do provedor (Pagar.me v5 `POST /core/v5/tokens?appId=`); sem ele a função falha de propósito.
- **Endereço**: a API cliente não tem geocodificação; o endereço novo usa a posição atual do aparelho como coordenada (a tela informa isso).
- **Localização do prestador**: `ProviderLocationTracker` usa `locationIntervalSeconds` de `@velio/domain` (3 s a menos de 500 m, 10 s em deslocamento, 60 s ocioso, nada offline) e envia lotes por `POST /v1/providers/me/location`, com `location.push` pelo socket durante o deslocamento. Localização em segundo plano está declarada nas permissões, mas o watcher atual roda em primeiro plano (`expo-task-manager` fica para a próxima iteração).
- **Ofertas**: `offer.created` no socket abre `offer/[id]` como modal de tela cheia com haptics; a tela fecha sozinha ao expirar.

## Pendências conhecidas

1. **Não executado em dispositivo nem emulador nesta sessão.** Validação feita por `tsc`, Vitest, Biome e `expo export --platform web`. Fluxos nativos (mapa, câmera, push, SecureStore, haptics) precisam de teste em aparelho.
2. **Áudio no Concierge**: a API cliente não tem upload de mídia; o Concierge aceita texto e imagens por URL. A gravação (`expo-audio`, que substitui `expo-av` no SDK 57) entra quando houver endpoint de upload.
3. **Agenda semanal do prestador**: `SetScheduleInput` existe em `@velio/contracts`, mas `api-client` ainda não expõe `PUT /v1/providers/me/schedule`; as janelas ficam salvas no aparelho (`AsyncStorage`) e a tela avisa.
4. **Fontes Inter / JetBrains Mono** não estão embutidas: o app usa a fonte do sistema com números tabulares. Adicionar `@expo-google-fonts/inter` e `jetbrains-mono` quando a identidade for fechada.
5. **Versões**: Expo SDK 57 fixa `react-native 0.86.3` e `react 19.2.3` (`expo/bundledNativeModules.json`); por isso o app usa essas versões em vez de `react-native 0.87`. `packages/ui` segue as mesmas versões para evitar duas cópias no bundle (ver também os singletons em `metro.config.js`).
6. Reagendamento (C-33), custódia pelo cliente (C-13), recibo/pagamento (C-15), carteira e cupons do cliente (C-27 parcial) e resposta do prestador a disputas (P-28) não têm rota correspondente em `api-client` e ficaram fora desta entrega.
