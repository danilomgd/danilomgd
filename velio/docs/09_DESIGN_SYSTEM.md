# 09 — Design System: Trilho

**Trilho** é o design system do VÉLIO. O nome vem da ideia central do produto: o cliente vê o pedido correr sobre um trilho previsível, do pedido à avaliação, sem desvios nem surpresas. O sistema é original, não deriva da identidade visual de nenhum outro produto, e serve às quatro superfícies (VÉLIO, VÉLIO Pro, `/ops`, `/admin`) a partir de um único pacote: `packages/ui`.

Relação com a arquitetura: tokens em `packages/ui/tokens.ts` (ADR-001, 06 §2); componentes React Native em `packages/ui/native` e web em `packages/ui/web`; rótulos de status vêm de `packages/contracts/labels` e nunca são definidos aqui.

## 1. Princípios

| Princípio | O que significa na prática | Como se verifica |
|---|---|---|
| Uma ação por tela | Cada tela tem um único botão primário visível; o resto é secundário, ghost ou link | Inventário de telas (10) lista a ação principal de cada tela |
| Espaço antes de ornamento | Hierarquia por tamanho, peso e espaço; sem gradientes decorativos, sem sombras pesadas, sem ilustração que compete com dados | Elevação máxima 2 em cartões; 3 e 4 só para folhas e modais |
| Estado sempre nomeado | Toda mudança de estado tem rótulo, cor semântica e, quando relevante, hora | `StatusPill` e `OrderStatusTimeline` leem `contracts/labels` |
| Rápido de verdade | Skeleton em menos de 100 ms, transições de 120–200 ms, nenhuma animação bloqueia toque | Tokens de movimento; teste de latência percebida |
| Confiável no detalhe | Dinheiro sempre em `mono` com duas casas; horários com previsão explícita; nada de "em breve" sem número | Regras de microcopy (seção 9) |
| Acessível por padrão | Contraste AA, alvos 44 pt, tamanhos dinâmicos, leitor de tela com verbo e objeto | Checklist (10 §10) |
| Um sistema, duas plataformas | Mesmos tokens e nomes de componentes em RN e web; divergência só quando a plataforma exige | `tokens.ts` único; testes visuais por componente |

## 2. Tokens

Nomenclatura: `categoria.grupo.variante` (ex.: `color.text.secondary`, `space.4`, `radius.md`). Cores: paleta bruta (`palette.*`) e papéis semânticos (`color.*`) que apontam para a paleta. Componentes só usam papéis semânticos.

### 2.1 Paleta

| Token | HSL | HEX | Uso |
|---|---|---|---|
| `palette.brand.50` | 170 40% 94% | #EAF6F4 | Fundo de destaque suave |
| `palette.brand.100` | 170 42% 86% | #CCEAE5 | Fundo de chip selecionado |
| `palette.brand.200` | 171 44% 72% | #98D7CE | Bordas de foco (claro) |
| `palette.brand.300` | 171 44% 58% | #65C3B5 | Texto e ícone primário no modo escuro |
| `palette.brand.400` | 172 52% 44% | #36AB9B | Preenchimento primário no modo escuro |
| `palette.brand.500` | 172 66% 32% | #1C8779 | Acento, ícones ativos, barras de progresso |
| `palette.brand.600` | 173 68% 26% | #156F65 | Preenchimento primário no modo claro (6,0:1 com branco) |
| `palette.brand.700` | 174 66% 20% | #11554E | Primário pressionado |
| `palette.brand.800` | 175 60% 15% | #0F3D39 | Texto sobre fundo brand.100 |
| `palette.brand.900` | 176 55% 10% | #0B2826 | Reservado |
| `palette.neutral.0` | 0 0% 100% | #FFFFFF | Superfície base (claro) |
| `palette.neutral.50` | 200 12% 97% | #F6F8F8 | Fundo de página (claro) |
| `palette.neutral.100` | 200 12% 94% | #EEF0F2 | Fundo de input, skeleton |
| `palette.neutral.200` | 200 12% 88% | #DDE2E4 | Divisores, bordas |
| `palette.neutral.300` | 200 10% 78% | #C1C9CD | Bordas de input, texto secundário (escuro) |
| `palette.neutral.400` | 200 9% 63% | #98A3A9 | Ícones desabilitados |
| `palette.neutral.500` | 200 9% 47% | #6D7B83 | Texto desabilitado, ícones decorativos (não para texto corrido) |
| `palette.neutral.600` | 200 10% 36% | #535F65 | Texto secundário e placeholder (6,6:1 com branco) |
| `palette.neutral.700` | 200 11% 26% | #3B454A | Ícones padrão |
| `palette.neutral.800` | 200 12% 17% | #262D31 | Superfície elevada (escuro) |
| `palette.neutral.900` | 200 14% 10% | #161B1D | Texto primário (claro); superfície (escuro) |
| `palette.neutral.950` | 200 16% 6% | #0D1012 | Fundo de página (escuro) |
| `palette.success.100` | 150 45% 92% | #E1F4EB | Fundo de pill de sucesso |
| `palette.success.500` | 150 55% 36% | #298E5C | Ícone e preenchimento de sucesso |
| `palette.success.700` | 152 60% 24% | #186240 | Texto de sucesso (7,3:1) |
| `palette.warning.100` | 40 90% 93% | #FDF3DD | Fundo de pill de alerta |
| `palette.warning.500` | 38 85% 45% | #D48D11 | Ícone e barra de alerta (não para texto) |
| `palette.warning.700` | 36 85% 30% | #8E5A0B | Texto de alerta (5,8:1) |
| `palette.error.100` | 4 80% 94% | #FCE5E3 | Fundo de pill de erro |
| `palette.error.500` | 4 70% 48% | #D03025 | Ícone, borda de erro, botão destrutivo (5,1:1) |
| `palette.error.700` | 4 70% 34% | #93221A | Texto de erro |
| `palette.info.100` | 212 80% 94% | #E3EFFC | Fundo de pill informativo |
| `palette.info.500` | 212 70% 48% | #2575D0 | Ícone e marcador informativo |
| `palette.info.700` | 214 70% 32% | #184A8B | Texto informativo |

### 2.2 Papéis semânticos de cor

| Papel | Claro | Escuro | Uso |
|---|---|---|---|
| `color.bg.page` | neutral.50 | neutral.950 | Fundo de tela |
| `color.bg.surface` | neutral.0 | neutral.900 | Cartões, folhas, barras |
| `color.bg.surfaceRaised` | neutral.0 + elevação 2 | neutral.800 | Cartões sobre cartões, menus |
| `color.bg.subtle` | neutral.100 | neutral.800 | Inputs, skeleton, chips neutros |
| `color.bg.inverse` | neutral.900 | neutral.50 | Toast, tooltip |
| `color.border.default` | neutral.200 | neutral.700 | Divisores e bordas |
| `color.border.strong` | neutral.300 | neutral.600 | Bordas de input |
| `color.border.focus` | brand.500 | brand.300 | Anel de foco (2 px) |
| `color.text.primary` | neutral.900 | neutral.50 | Títulos e corpo |
| `color.text.secondary` | neutral.600 | neutral.300 | Apoio, legendas |
| `color.text.disabled` | neutral.500 | neutral.500 | Desabilitado |
| `color.text.inverse` | neutral.0 | neutral.950 | Sobre primário e inverso |
| `color.text.link` | brand.600 | brand.300 | Links |
| `color.primary.bg` | brand.600 | brand.400 | Botão primário, switch ligado |
| `color.primary.bgPressed` | brand.700 | brand.500 | Pressionado |
| `color.primary.fg` | neutral.0 | neutral.950 | Texto sobre primário |
| `color.primary.subtleBg` | brand.50 | brand.900 | Chip selecionado, destaque |
| `color.primary.subtleFg` | brand.800 | brand.200 | Texto sobre subtleBg |
| `color.accent` | brand.500 | brand.300 | Ícones ativos, progresso, marcador do prestador no mapa |
| `color.success.bg` / `.fg` / `.subtleBg` | success.500 / success.700 / success.100 | success.500 / success.100 / neutral.800 + borda success.700 | Confirmações |
| `color.warning.bg` / `.fg` / `.subtleBg` | warning.500 / warning.700 / warning.100 | warning.500 / warning.100 / neutral.800 + borda warning.700 | Atenção, expiração |
| `color.error.bg` / `.fg` / `.subtleBg` | error.500 / error.700 / error.100 | error.500 / error.100 / neutral.800 + borda error.700 | Erros, destrutivo |
| `color.info.bg` / `.fg` / `.subtleBg` | info.500 / info.700 / info.100 | info.500 / info.100 / neutral.800 + borda info.700 | Estados em progresso |
| `color.map.route` | brand.500 | brand.300 | Linha de rota |
| `color.map.provider` | brand.600 | brand.400 | Marcador do prestador |
| `color.map.destination` | neutral.900 | neutral.50 | Pino do endereço |
| `color.overlay` | neutral.950 a 40 % | neutral.950 a 60 % | Fundo de folhas e modais |

Mapeamento de `tone` do `StatusPill` (05 §8): `neutral` → `bg.subtle`/`text.secondary`; `info` → `info.subtleBg`/`info.fg`; `success` → `success.subtleBg`/`success.fg`; `warning` → `warning.subtleBg`/`warning.fg`; `error` → `error.subtleBg`/`error.fg`.

### 2.3 Tipografia

Família: **Inter** (licença SIL OFL) para interface; **JetBrains Mono** (SIL OFL) para números que precisam de alinhamento (valores, PIN, OTP, odômetro, códigos). Fallbacks: iOS `-apple-system`/`SF Pro`, Android `Roboto`, web `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; mono: `ui-monospace, Menlo, "Roboto Mono", monospace`. Números tabulares (`tnum`) ativados em listas e extratos.

| Token | Tamanho/linha (pt) | Peso | Letter spacing | Uso |
|---|---|---|---|---|
| `type.display.lg` | 40 / 48 | 700 | −0,5 | Remuneração na oferta (P-11), valor total em recibo |
| `type.display.sm` | 32 / 40 | 700 | −0,25 | Saudação da home, saldo |
| `type.title.lg` | 24 / 32 | 600 | −0,25 | Título de tela |
| `type.title.md` | 20 / 28 | 600 | 0 | Título de seção, frase de status |
| `type.title.sm` | 18 / 24 | 600 | 0 | Título de cartão |
| `type.body.lg` | 17 / 24 | 400 | 0 | Texto principal em telas de leitura |
| `type.body.md` | 15 / 22 | 400 | 0 | Texto padrão |
| `type.body.sm` | 13 / 18 | 400 | 0 | Texto de apoio |
| `type.label.lg` | 15 / 20 | 600 | 0 | Botões, tabs |
| `type.label.md` | 13 / 16 | 600 | 0,1 | Chips, pills, rótulos de input |
| `type.caption` | 12 / 16 | 400 | 0,1 | Legendas, horas na linha do tempo |
| `type.mono.lg` | 28 / 32 | 500 | 2 (PIN/OTP) | PIN, OTP |
| `type.mono.md` | 15 / 20 | 500 | 0 | Valores em listas, odômetro |

Tamanho dinâmico: todos os tokens escalam com a preferência do sistema até 200 %; `display.*` limita a 140 % para não quebrar layouts de valor; mínimos de linha preservam legibilidade.

### 2.4 Espaçamento, raios, elevação, movimento, ícones

| Grupo | Token | Valor | Uso |
|---|---|---|---|
| Espaço (escala de 4) | `space.0` … `space.16` | 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 (índices 0,1,2,3,4,5,6,8,10,12,16) | Margens 16 (`space.4`) em telas; 20 (`space.5`) em folhas e cartões de destaque; 8 entre itens relacionados; 24 entre seções |
| Raio | `radius.xs` | 4 | Skeleton de texto, badges pequenos |
| | `radius.sm` | 8 | Chips, inputs compactos, pills |
| | `radius.md` | 12 | Inputs, botões, cartões de lista |
| | `radius.lg` | 16 | Cartões de destaque, ServiceCard |
| | `radius.xl` | 24 | Folhas (BottomSheet), modais |
| | `radius.full` | 999 | Avatar, switch, botão circular |
| Elevação | `elevation.0` | nenhuma | Padrão |
| | `elevation.1` | y1 blur2 a 6 % + y0 blur1 a 4 % (Android 1) | Cartões em lista |
| | `elevation.2` | y4 blur12 a 8 % (Android 3) | Cartões de destaque, barra fixa inferior |
| | `elevation.3` | y12 blur32 a 14 % (Android 8) | BottomSheet, menus |
| | `elevation.4` | y24 blur48 a 20 % (Android 16) | Modais, oferta recebida |
| Duração | `motion.duration.instant` | 80 ms | Pressionado, troca de ícone |
| | `motion.duration.fast` | 120 ms | Chips, switch, toast entrando |
| | `motion.duration.base` | 200 ms | Navegação push, troca de aba, skeleton → conteúdo |
| | `motion.duration.slow` | 320 ms | BottomSheet, modal |
| | `motion.duration.deliberate` | 480 ms | Transição de status na linha do tempo, mapa recentralizando |
| Curva | `motion.easing.standard` | cubic-bezier(0.2, 0, 0, 1) | Padrão |
| | `motion.easing.decelerate` | cubic-bezier(0.05, 0.7, 0.1, 1) | Elementos entrando |
| | `motion.easing.accelerate` | cubic-bezier(0.3, 0, 0.8, 0.15) | Elementos saindo |
| | `motion.spring.sheet` | damping 28, stiffness 320, mass 1 | Folhas arrastáveis |
| Ícones | `icon.size.sm/md/lg/xl` | 16, 20, 24, 32 | Inline, botões, navegação, CategoryTile (28 derivado) |
| | `icon.stroke` | 1,75 em grade 24 | Traço único, cantos e pontas arredondados, sem preenchimento sólido salvo estados ativos |

Conjunto próprio de ícones ("Trilho Icons"), desenhado em grade 24 com traço 1,75, nomes semânticos usados por `ServiceCategory.icon` (ex.: `droplet`, `bolt`, `snowflake`, `sparkle`, `shirt`, `car`, `wrench`, `package`, `home`, `compass`, `map-pin`, `chat`, `camera`, `qr`, `star`, `clock`, `check`, `alert`, `info`, `close`, `chevron-right`, `search`, `bell`, `wallet`, `calendar`, `user`, `shield-check`). Movimento reduzido do sistema desliga animações não essenciais e substitui por fade de 80 ms.

### 2.5 Tokens em JSON

```json
{
  "palette": {
    "brand": { "50": "#EAF6F4", "100": "#CCEAE5", "200": "#98D7CE", "300": "#65C3B5", "400": "#36AB9B", "500": "#1C8779", "600": "#156F65", "700": "#11554E", "800": "#0F3D39", "900": "#0B2826" },
    "neutral": { "0": "#FFFFFF", "50": "#F6F8F8", "100": "#EEF0F2", "200": "#DDE2E4", "300": "#C1C9CD", "400": "#98A3A9", "500": "#6D7B83", "600": "#535F65", "700": "#3B454A", "800": "#262D31", "900": "#161B1D", "950": "#0D1012" },
    "success": { "100": "#E1F4EB", "500": "#298E5C", "700": "#186240" },
    "warning": { "100": "#FDF3DD", "500": "#D48D11", "700": "#8E5A0B" },
    "error":   { "100": "#FCE5E3", "500": "#D03025", "700": "#93221A" },
    "info":    { "100": "#E3EFFC", "500": "#2575D0", "700": "#184A8B" }
  },
  "color": {
    "light": {
      "bg": { "page": "{palette.neutral.50}", "surface": "{palette.neutral.0}", "surfaceRaised": "{palette.neutral.0}", "subtle": "{palette.neutral.100}", "inverse": "{palette.neutral.900}" },
      "border": { "default": "{palette.neutral.200}", "strong": "{palette.neutral.300}", "focus": "{palette.brand.500}" },
      "text": { "primary": "{palette.neutral.900}", "secondary": "{palette.neutral.600}", "disabled": "{palette.neutral.500}", "inverse": "{palette.neutral.0}", "link": "{palette.brand.600}" },
      "primary": { "bg": "{palette.brand.600}", "bgPressed": "{palette.brand.700}", "fg": "{palette.neutral.0}", "subtleBg": "{palette.brand.50}", "subtleFg": "{palette.brand.800}" },
      "accent": "{palette.brand.500}",
      "success": { "bg": "{palette.success.500}", "fg": "{palette.success.700}", "subtleBg": "{palette.success.100}" },
      "warning": { "bg": "{palette.warning.500}", "fg": "{palette.warning.700}", "subtleBg": "{palette.warning.100}" },
      "error":   { "bg": "{palette.error.500}", "fg": "{palette.error.700}", "subtleBg": "{palette.error.100}" },
      "info":    { "bg": "{palette.info.500}", "fg": "{palette.info.700}", "subtleBg": "{palette.info.100}" },
      "map": { "route": "{palette.brand.500}", "provider": "{palette.brand.600}", "destination": "{palette.neutral.900}" },
      "overlay": "rgba(13, 16, 18, 0.40)"
    },
    "dark": {
      "bg": { "page": "{palette.neutral.950}", "surface": "{palette.neutral.900}", "surfaceRaised": "{palette.neutral.800}", "subtle": "{palette.neutral.800}", "inverse": "{palette.neutral.50}" },
      "border": { "default": "{palette.neutral.700}", "strong": "{palette.neutral.600}", "focus": "{palette.brand.300}" },
      "text": { "primary": "{palette.neutral.50}", "secondary": "{palette.neutral.300}", "disabled": "{palette.neutral.500}", "inverse": "{palette.neutral.950}", "link": "{palette.brand.300}" },
      "primary": { "bg": "{palette.brand.400}", "bgPressed": "{palette.brand.500}", "fg": "{palette.neutral.950}", "subtleBg": "{palette.brand.900}", "subtleFg": "{palette.brand.200}" },
      "accent": "{palette.brand.300}",
      "success": { "bg": "{palette.success.500}", "fg": "{palette.success.100}", "subtleBg": "{palette.neutral.800}" },
      "warning": { "bg": "{palette.warning.500}", "fg": "{palette.warning.100}", "subtleBg": "{palette.neutral.800}" },
      "error":   { "bg": "{palette.error.500}", "fg": "{palette.error.100}", "subtleBg": "{palette.neutral.800}" },
      "info":    { "bg": "{palette.info.500}", "fg": "{palette.info.100}", "subtleBg": "{palette.neutral.800}" },
      "map": { "route": "{palette.brand.300}", "provider": "{palette.brand.400}", "destination": "{palette.neutral.50}" },
      "overlay": "rgba(13, 16, 18, 0.60)"
    }
  },
  "type": {
    "family": { "sans": ["Inter", "-apple-system", "Roboto", "system-ui", "sans-serif"], "mono": ["JetBrains Mono", "ui-monospace", "Menlo", "Roboto Mono", "monospace"] },
    "display": { "lg": { "size": 40, "line": 48, "weight": 700, "tracking": -0.5 }, "sm": { "size": 32, "line": 40, "weight": 700, "tracking": -0.25 } },
    "title":   { "lg": { "size": 24, "line": 32, "weight": 600, "tracking": -0.25 }, "md": { "size": 20, "line": 28, "weight": 600, "tracking": 0 }, "sm": { "size": 18, "line": 24, "weight": 600, "tracking": 0 } },
    "body":    { "lg": { "size": 17, "line": 24, "weight": 400 }, "md": { "size": 15, "line": 22, "weight": 400 }, "sm": { "size": 13, "line": 18, "weight": 400 } },
    "label":   { "lg": { "size": 15, "line": 20, "weight": 600 }, "md": { "size": 13, "line": 16, "weight": 600, "tracking": 0.1 } },
    "caption": { "size": 12, "line": 16, "weight": 400, "tracking": 0.1 },
    "mono":    { "lg": { "size": 28, "line": 32, "weight": 500, "tracking": 2 }, "md": { "size": 15, "line": 20, "weight": 500 } }
  },
  "space": { "0": 0, "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "8": 32, "10": 40, "12": 48, "16": 64 },
  "radius": { "xs": 4, "sm": 8, "md": 12, "lg": 16, "xl": 24, "full": 999 },
  "elevation": {
    "0": { "shadow": "none", "android": 0 },
    "1": { "shadow": "0 1px 2px rgba(13,16,18,0.06), 0 0 1px rgba(13,16,18,0.04)", "android": 1 },
    "2": { "shadow": "0 4px 12px rgba(13,16,18,0.08)", "android": 3 },
    "3": { "shadow": "0 12px 32px rgba(13,16,18,0.14)", "android": 8 },
    "4": { "shadow": "0 24px 48px rgba(13,16,18,0.20)", "android": 16 }
  },
  "motion": {
    "duration": { "instant": 80, "fast": 120, "base": 200, "slow": 320, "deliberate": 480 },
    "easing": { "standard": [0.2, 0, 0, 1], "decelerate": [0.05, 0.7, 0.1, 1], "accelerate": [0.3, 0, 0.8, 0.15] },
    "spring": { "sheet": { "damping": 28, "stiffness": 320, "mass": 1 } }
  },
  "icon": { "size": { "sm": 16, "md": 20, "lg": 24, "xl": 32 }, "stroke": 1.75 },
  "layout": { "gutter": 16, "gutterWide": 20, "touchTarget": 44, "maxContentWidth": 640, "sidebarWidth": 240, "panelWidth": 380 }
}
```

## 3. Componentes

Todos os componentes: aceitam `testID`/`data-testid`, expõem rótulo acessível, respeitam tamanho dinâmico e têm os estados **default, pressed/hover, focus, disabled, loading** quando interativos. Tabela geral e, a seguir, especificação dos componentes com regras próprias.

| Componente | Variantes | Tamanhos | Estados específicos | Tokens-chave |
|---|---|---|---|---|
| Button | `primary`, `secondary`, `ghost`, `destructive`, `destructiveSoft` | `md` 44, `lg` 52, `xl` 64 (oferta) | loading (spinner substitui rótulo, largura mantida), com ícone à esquerda | `color.primary.*`, `radius.md`, `type.label.lg` |
| IconButton | `filled`, `tonal`, `ghost`, `onMedia` (sobre imagem/mapa) | 44 (alvo), ícone 24 | com Badge | `radius.full`, `color.bg.subtle` |
| Input | `text`, `multiline`, `search`, `money`, `phone`, `odometer` | altura 52 (md), 44 (compact web) | error (borda + mensagem), success (ícone), prefix/suffix, contador de caracteres | `color.border.strong`, `radius.md`, `type.body.md` |
| OTPInput | 4 dígitos (PIN), 6 dígitos (OTP) | célula 48×56 | preenchendo, erro (shake 120 ms), sucesso | `type.mono.lg`, `color.border.focus` |
| Select | `sheet` (mobile, abre BottomSheet), `dropdown` (web), `inline` (poucas opções) | 52 | com busca, múltipla, agrupada | idem Input |
| Chip | `filter` (toggle), `choice` (exclusivo), `input` (removível), `suggestion` | 32, 36 | selected, disabled, com ícone | `radius.sm`, `color.primary.subtleBg`, `type.label.md` |
| Card | `flat`, `outlined`, `elevated`, `interactive` | padding 16/20 | pressed (escala 0,99, 80 ms), selected (borda primária) | `radius.lg`, `elevation.1/2` |
| ServiceCard | `tile` (carrossel, capa 3:2), `row` (lista, capa 56), `hero` (detalhe) | — | preço "a partir de", badge `popular`/`new`, indisponível (dessaturado + rótulo) | `radius.lg`, `type.title.sm`, `type.mono.md` |
| CategoryTile | `grid` (ícone 28 sobre fundo subtle, rótulo 2 linhas), `row` | 76×88 | selected | `radius.lg`, `color.primary.subtleBg` |
| OrderStatusTimeline | `vertical` (completa, com mídia e hora), `horizontal` (compacta, etapas), `mini` (3 pontos no cartão) | — | etapa concluída, atual (pulso suave 1,6 s), futura, pulada, falha | `color.accent`, `color.border.default`, `type.caption` |
| StatusPill | `tone` neutral/info/success/warning/error; `solid` ou `subtle` | 24, 28 | com ícone, com contagem regressiva | `radius.sm`, `type.label.md` |
| BottomSheet | `anchored` (paradas), `modal` (uma altura), `fullscreen` | paradas 30/55/90 % | arrastando, teclado aberto (sobe), com cabeçalho fixo | `radius.xl`, `elevation.3`, `motion.spring.sheet`, `color.overlay` |
| MapView | `tracking` (segue marcador), `static` (miniatura), `picker` (pino central ajustável), `ops` (web, agrupamento) | — | sem permissão, sem conexão (última posição), carregando tiles | `color.map.*` |
| ProviderCard | `compact` (lista, 48), `tracking` (acompanhamento, com ações), `profile` (folha, 72), `ops` (web) | — | verificado (Badge), indisponível, favorito (V1) | `radius.lg`, `type.title.sm`, `color.success.fg` |
| PriceSummary | `inline` (uma linha), `summary` (base + total), `full` (itens, adicionais, descontos, total, nota) | — | valor riscado, pendente ("sob orçamento"), negativo (desconto) | `type.mono.md`, `type.title.md`, `color.border.default` |
| QuoteApprovalCard | `pending` (ações), `approved`, `rejected`, `expired` | — | contagem regressiva; fotos | `color.warning.*`, `radius.lg`, `elevation.2` |
| EvidenceUploader | `camera` (guia de enquadramento), `grid` (miniaturas 3 colunas), `readonly`, `signature` | miniatura 96 | obrigatório faltando (contorno tracejado error), enviando (progresso), falhou (reenviar), offline (fila) | `color.error.bg`, `radius.md` |
| RatingStars | `input` (44 por estrela), `display` (16/20 com número) | — | parcial (display), vazio | `color.warning.500` para estrela cheia, `neutral.300` vazia |
| Avatar | `image`, `initials`, `icon` | 24, 32, 40, 48, 72 | com indicador de disponibilidade (ONLINE/BUSY), com Badge verificado | `radius.full`, `color.primary.subtleBg` |
| EmptyState | `default` (ilustração 120 + título + texto + ação), `compact` (inline em seção) | — | — | `type.title.sm`, `type.body.md`, `color.text.secondary` |
| Skeleton | `text` (linhas), `rect`, `circle`, `card` (composição) | — | shimmer 1,2 s (desligado em movimento reduzido) | `color.bg.subtle`, `radius.xs/md/full` |
| Toast | `neutral`, `success`, `error`, `warning`; com ação opcional | — | empilha até 2; some em 4 s (8 s com ação) | `color.bg.inverse`, `color.text.inverse`, `radius.md`, `elevation.3` |
| Tabs | `top` (texto com indicador 2 px), `bottom` (navegação com ícone 24 + rótulo 12), `pills` (web) | 48 (top), 56 + área segura (bottom) | com Badge, desabilitado | `color.accent`, `type.label.lg/md` |
| SegmentedControl | 2–4 segmentos | 40 | selected (fundo surface + elevação 1) | `radius.md`, `color.bg.subtle` |
| ListItem | `default`, `navigation` (chevron), `selectable` (check), `twoLine`, `withValue` (mono à direita) | 56, 72 (duas linhas) | pressed, destrutivo (texto error) | `type.body.md`, `color.border.default` |
| Switch | padrão; `large` (Online/Offline em P-10) | 32×52; 44×76 | on, off, loading (bloqueado com spinner) | `color.primary.bg`, `radius.full`, `motion.duration.fast` |
| Badge | `dot`, `count` (até 99+), `label` (texto curto: "Verificado", "Novo") | 8 (dot), 18 (count) | — | `color.error.bg` (count), `color.success.*` (verificado) |

### 3.1 Button

- Anatomia: contêiner, rótulo (`label.lg`), ícone opcional 20 à esquerda, spinner 20 em loading.
- Variantes: `primary` (fundo `primary.bg`, texto `primary.fg`), `secondary` (fundo `primary.subtleBg`, texto `primary.subtleFg`), `ghost` (sem fundo, texto `text.link`), `destructive` (fundo `error.bg`, texto `text.inverse`), `destructiveSoft` (fundo `error.subtleBg`, texto `error.fg`; usado em `[RECUSAR]`).
- Estados: pressed escurece para `bgPressed` em 80 ms; disabled usa `bg.subtle` + `text.disabled` e mantém contraste 3:1 do contorno; loading mantém largura e bloqueia duplo toque; focus mostra anel 2 px `border.focus` com offset 2.
- Regras: um `primary` por tela; rótulo com verbo no infinitivo ou imperativo curto ("Confirmar pedido", "Aceitar"); largura total em barras fixas inferiores; `xl` (64) só na oferta recebida (P-11) e no interruptor de disponibilidade.

### 3.2 Input e OTPInput

- Input: rótulo acima (`label.md`, `text.secondary`), campo 52 com borda `border.strong` 1 px, raio `md`, texto `body.md`; foco troca borda para `border.focus` 2 px; erro troca para `error.bg` e mostra mensagem `caption` em `error.fg` com ícone; placeholder em `text.secondary` (nunca `disabled`).
- Variantes com máscara: `phone` (+55 e DDD), `money` (prefixo R$, `mono.md`, teclado numérico, centavos sempre visíveis), `odometer` (sufixo km, `mono.md`), `search` (ícone à esquerda, limpar à direita, cantos `full`).
- OTPInput: células separadas 48×56 com `mono.lg`; preenchimento automático via SMS quando disponível; erro agita 120 ms e limpa; sucesso fecha teclado; leitor de tela anuncia "dígito 3 de 6".
- PIN exibido ao cliente (C-11) usa a mesma célula em modo leitura, com espaçamento 2 e rótulo "Informe este PIN ao profissional".

### 3.3 OrderStatusTimeline e StatusPill

- Timeline lê `order_events` e `contracts/labels`; nunca recebe strings livres. Cada nó: ponto 12 (concluído: `accent` preenchido com check 8; atual: anel `accent` com pulso; futuro: `border.default`), hora em `caption` à esquerda (vertical), rótulo `body.md`, descrição opcional `body.sm`, mídia em miniaturas 64.
- Horizontal (P-13): etapas definidas pelo `workflowKind` (10 §11); etapa atual com rótulo em `label.lg`; demais só ícone e rótulo `caption`.
- StatusPill: altura 24/28, raio `sm`, `label.md`; ícone 14 opcional; `subtle` é o padrão; `solid` apenas em mapas e sobre imagens; contagem regressiva usa `mono.md` e muda para `warning` nos últimos 10 s e `error` nos últimos 5.
- `tone` vem do mapa de rótulos (05 §8); componente não decide cor por status.

### 3.4 BottomSheet e MapView

- BottomSheet: alça 36×4 em `border.strong`; raio `xl` no topo; `elevation.3`; overlay `color.overlay`; paradas configuráveis; cabeçalho fixo com título `title.md` e IconButton fechar; conteúdo rola internamente; ao abrir teclado, sobe para a parada máxima; fecha por arrasto, overlay ou botão; Android respeita botão voltar.
- MapView: wrapper único sobre o provedor nativo (RN) e web; API: `markers[]`, `route`, `followMarkerId`, `pickerMode`, `onRegionChange`, `clustering` (web); estilo de mapa próprio (tons neutros dessaturados, rótulos em `text.secondary`) para o marcador e a rota se destacarem; marcador do prestador: círculo 36 `map.provider` com ícone da categoria em `text.inverse` e seta de direção; destino: pino `map.destination`; rota: linha 4 px `map.route` com pontas arredondadas; botão "Recentralizar" (IconButton `onMedia`) aparece após o usuário arrastar; alternativa textual obrigatória (ETA e distância) para leitor de tela.

### 3.5 ServiceCard, CategoryTile e ProviderCard

- ServiceCard `tile`: largura 160–200, capa 3:2 com raio `lg` superior, nome `title.sm` (2 linhas máx.), linha de preço `mono.md` + duração `caption`; Badge `label` no canto da capa; pressed escala 0,99.
- ServiceCard `row`: capa 56 raio `md`, nome, preço e chevron; usado em categorias e em "Pedir de novo".
- CategoryTile: ícone 28 em círculo 48 `primary.subtleBg`, rótulo `label.md` centrado, 2 linhas máx.; grade de 4 por linha com gutter 12.
- ProviderCard `tracking`: Avatar 48 com indicador, nome `title.sm`, linha `RatingStars display` + "· 312 serviços" em `caption`, Badge "Verificado" (`shield-check`), IconButtons chat e ajuda à direita; nunca exibe telefone.

### 3.6 PriceSummary e QuoteApprovalCard

- PriceSummary `full`: linhas `body.md` à esquerda e `mono.md` à direita com `tnum`; adicionais aprovados em linhas próprias com prefixo "+"; descontos com "−" em `success.fg`; divisor antes do total; total em `title.md` + `mono` 20; nota em `caption` ("Cobramos só quando o serviço terminar"). Valores em centavos → formatação `R$ 1.234,56` em um único utilitário (`formatBRL`).
- QuoteApprovalCard: cabeçalho com Avatar do prestador e StatusPill de validade; justificativa; fotos; itens; bloco de impacto (combinado, adicional, novo total); rodapé com `destructiveSoft` "Recusar" e `primary` "Aprovar {valor}"; estados finais trocam o rodapé por StatusPill grande e hora da decisão.

### 3.7 EvidenceUploader

- `camera`: abre câmera com guia de enquadramento por tipo (`BEFORE`, `AFTER`, `ODOMETER`, `VEHICLE_FRONT`…), contador "2 de 2", flash, troca de câmera; captura remove metadados de localização.
- `grid`: miniaturas 96 em 3 colunas, raio `md`; obrigatória faltando: célula tracejada `error.bg` com ícone `camera` e rótulo do que falta; enviando: barra de progresso inferior; falhou: ícone `alert` e toque para reenviar; offline: ícone `clock` e rótulo "Na fila".
- `signature`: área 100 % × 160 com fundo `bg.subtle`, traço 2 px `text.primary`, botão "Limpar"; exportada como PNG.
- Leitor de QR embutido com moldura e feedback háptico ao ler; falha de leitura permite digitar o código.

### 3.8 Toast, EmptyState e Skeleton

- Toast: fundo `bg.inverse`, texto `text.inverse` `body.md`, ícone 20 por variante, ação `label.lg` em `brand.300`; entra por baixo (mobile) ou canto inferior esquerdo (web) em 120 ms; some em 4 s; empilha no máximo 2; nunca contém erro que exija ação obrigatória (usar bloco inline).
- EmptyState: ilustração do conjunto próprio (linha 1,75, duas cores: `text.secondary` e `accent`) 120 de altura, título `title.sm` até 6 palavras, texto `body.md` até 2 linhas, um Button `secondary`.
- Skeleton: formas com `bg.subtle`, shimmer sutil de 1,2 s; composições prontas por tela (`HomeSkeleton`, `OrderSkeleton`, `ListSkeleton`); desaparece com fade de 200 ms ao chegar o conteúdo.

## 4. Layout

| Regra | Mobile (VÉLIO, VÉLIO Pro) | Web (/ops, /admin) |
|---|---|---|
| Grade | 4 colunas fluidas, gutter 12 | 12 colunas, gutter 24, máx. 1440 centralizado |
| Margens laterais | 16 (`space.4`) padrão; 20 (`space.5`) em folhas, cartões de destaque e telas de decisão (C-14, P-11) | 24 em páginas; 20 em painéis laterais |
| Áreas seguras | Respeitadas em topo e base; barra inferior = 56 + inset; barras fixas de ação = 16 + inset | — |
| Alvos de toque | Mínimo 44×44 pt; espaçamento mínimo de 8 entre alvos | Mínimo 32×32 com foco visível; linhas de tabela 44 |
| Largura máxima de leitura | 640 (`layout.maxContentWidth`) em tablets | 720 para formulários |
| Navegação lateral | — | 240 fixa; colapsa para 64 (ícones) abaixo de 1280 |
| Painel lateral | BottomSheet | 380 à direita; vira página inteira abaixo de 1024 |
| Barra fixa inferior | Fundo `bg.surface`, `elevation.2`, divisor superior; contém preço + ação ou ação única | Barra de ações no rodapé do formulário, fixa ao rolar |
| Densidade | Lista 56/72; cartão padding 16 | Tabela 44 por linha; formulário com rótulos acima |
| Orientação | Retrato; paisagem só no mapa operacional em tablet | — |
| Imagens | Capas 3:2; avatares circulares; fotos de evidência quadradas em miniatura e originais no visualizador | Idem |

Hierarquia vertical padrão de uma tela mobile: barra superior (44 + inset) → título ou hero → conteúdo rolável com seções separadas por 24 → barra fixa inferior quando houver ação principal. Nunca dois elementos fixos competindo (barra de ação e Toast se sobrepõem: o Toast sobe acima da barra).

## 5. Acessibilidade

| Área | Regra | Verificação |
|---|---|---|
| Contraste | Texto normal ≥ 4,5:1; texto grande (≥ 18 pt ou 14 pt negrito) e ícones informativos ≥ 3:1; os pares semânticos da seção 2 já cumprem (primário 6,0:1; secundário 6,6:1; sucesso 7,3:1; alerta 5,8:1; erro 5,1:1) | Teste automático de pares no CI com os tokens |
| Cor | Nunca única indicação: StatusPill tem texto; mapa tem legenda; estrelas têm número | Revisão de componente |
| Tamanhos dinâmicos | Todos os textos escalam até 200 %; layouts usam flex e quebra; `display` limitado a 140 % | Snapshot em 100/150/200 % |
| Leitor de tela | Botões: verbo + objeto ("Aprovar orçamento de 60 reais"); pills: "Status: a caminho"; timeline: "Etapa 3 de 5, concluída às 14h02"; mapa: resumo textual; imagens de evidência: "Foto antes, 1 de 2" | Auditoria por tela (10 §10) |
| Foco | Ordem lógica; anel 2 px `border.focus`; foco vai ao primeiro erro de formulário e ao título de folhas ao abrir | Teste por teclado (web) e por navegação sequencial (mobile) |
| Live regions | Mudanças de status, contagem regressiva (a cada 10 s, não a cada segundo) e Toast anunciados | Revisão |
| Movimento | Respeita "reduzir movimento": sem shimmer, sem pulso, transições por fade de 80 ms | Teste com a preferência ativa |
| Toque e gestos | Toda ação por gesto tem equivalente por botão (arrastar folha → botão fechar; deslizar item → menu) | Revisão |
| Tempo | Contagens regressivas (oferta, orçamento) têm a duração visível e, para o cliente, nunca menos de 30 min; prestador pode ajustar som e vibração, nunca reduzir abaixo do mínimo configurado pela plataforma | Configuração |
| Idioma | pt-BR com `lang` definido; números e datas formatados por utilitário único | Teste |
| Formulários | Rótulo visível sempre (não só placeholder); erro descreve como corrigir | Revisão |

## 6. Tom de voz e microcopy

Voz do VÉLIO: **direta, calma e competente**. Fala como um bom concierge: diz o que vai acontecer, quando e quanto custa, sem floreio. Nunca infantiliza, nunca grita.

| Regra | Faça | Evite |
|---|---|---|
| Curto | "Profissional encontrado" | "Ótimas notícias, encontramos um profissional para você!" |
| Verbo primeiro em ações | "Confirmar pedido", "Aceitar", "Gerar novo PIX" | "Clique aqui para confirmar" |
| Número antes de adjetivo | "Chega em 12 min" | "Chega rapidinho" |
| Sem exclamação, salvo uma por fluxo em sucesso final (opcional) | "Serviço concluído." | "Parabéns!!! Serviço concluído!" |
| Sem jargão interno | "Pedido", "Profissional", "Orçamento adicional" | "Ordem", "Prestador", "Quote" |
| Erro diz o que fazer | "Seu PIX expirou. Gere um novo para continuar" | "Erro 410" / "Algo deu errado" |
| Dinheiro completo | "R$ 150,00" | "150 reais", "R$150" |
| Tempo com previsão | "Devolução prevista: 16h30" | "Em breve" |
| Pergunta só quando há escolha | "Cancelar pedido? Taxa de R$ 15,00" | "Tem certeza?" |
| Primeira pessoa do plural para a plataforma | "Cobramos só quando o serviço terminar" | "O VÉLIO irá efetuar a cobrança" |
| Você, nunca "o usuário" | "Você pode aguardar ou cancelar sem custo" | "O usuário poderá aguardar" |
| Nome do profissional quando conhecido | "Carlos chegou" | "O profissional chegou" |
| Sem culpa | "Não conseguimos autorizar seu cartão" | "Seu cartão foi recusado" |
| Maiúscula só na primeira palavra | "Orçamento adicional" | "Orçamento Adicional" |

Glossário de termos exibidos: `03_PRODUCT_REQUIREMENTS_DOCUMENT.md` §15. Rótulos de status: `05_INFORMATION_ARCHITECTURE.md` §8. Modelos de notificação: idem §9. Todo texto exibido vive em `packages/contracts/labels` (status, enums) ou em `packages/ui/copy` (microcopy de componentes), nunca inline no componente.

## 7. Tokens compartilhados entre React Native e web

### 7.1 Fonte única: `packages/ui/tokens.ts`

```ts
// packages/ui/tokens.ts — única fonte; gerado a partir de tokens.json por `pnpm --filter ui build:tokens`
export const palette = { brand: { 50: '#EAF6F4', /* … */ 900: '#0B2826' }, neutral: { /* … */ }, success: { /* … */ }, warning: { /* … */ }, error: { /* … */ }, info: { /* … */ } } as const;

export const colorSchemes = {
  light: { bg: { page: palette.neutral[50], surface: palette.neutral[0], /* … */ }, text: { primary: palette.neutral[900], /* … */ }, primary: { bg: palette.brand[600], fg: palette.neutral[0], /* … */ }, /* … */ },
  dark:  { bg: { page: palette.neutral[950], surface: palette.neutral[900], /* … */ }, text: { primary: palette.neutral[50], /* … */ }, primary: { bg: palette.brand[400], fg: palette.neutral[950], /* … */ }, /* … */ },
} as const;

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;
export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;
export const type = { family: { sans: 'Inter', mono: 'JetBrains Mono' }, display: { lg: { size: 40, line: 48, weight: '700', tracking: -0.5 }, /* … */ }, /* … */ } as const;
export const elevation = { 0: null, 1: { ios: { y: 1, blur: 2, opacity: 0.06 }, android: 1, css: '0 1px 2px rgba(13,16,18,0.06), 0 0 1px rgba(13,16,18,0.04)' }, /* … */ } as const;
export const motion = { duration: { instant: 80, fast: 120, base: 200, slow: 320, deliberate: 480 }, easing: { standard: [0.2, 0, 0, 1] as const, /* … */ }, spring: { sheet: { damping: 28, stiffness: 320, mass: 1 } } } as const;
export const icon = { size: { sm: 16, md: 20, lg: 24, xl: 32 }, stroke: 1.75 } as const;
export const layout = { gutter: 16, gutterWide: 20, touchTarget: 44, maxContentWidth: 640, sidebarWidth: 240, panelWidth: 380 } as const;

export type ColorScheme = keyof typeof colorSchemes;
export type Theme = { scheme: ColorScheme; color: (typeof colorSchemes)[ColorScheme]; space: typeof space; radius: typeof radius; type: typeof type; elevation: typeof elevation; motion: typeof motion; icon: typeof icon; layout: typeof layout };
```

Regras: valores numéricos sem unidade (pt no RN, px na web); `as const` garante tipos literais e autocompletar; nenhum componente importa `palette` diretamente, só `theme.color.*`; `tokens.json` (seção 2.5) é a fonte editável e `tokens.ts` é gerado e versionado para que `packages/ui` não dependa de build em tempo de execução.

### 7.2 Consumo em React Native (`packages/ui/native`)

- `ThemeProvider` recebe `scheme: 'light' | 'dark' | 'system'` e expõe `useTheme()`; o esquema do sistema é lido por `Appearance` e observado.
- `createStyles((theme) => ({ … }))` memoiza `StyleSheet` por esquema; sombras convertem `elevation[n].ios` em `shadowOffset/shadowRadius/shadowOpacity` e `elevation[n].android` em `elevation`.
- Tipografia: `Text` do sistema recebe `variant="title.md"` e aplica `fontFamily`, `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing` e `allowFontScaling` com `maxFontSizeMultiplier` (2.0; 1.4 para `display`).
- Fontes carregadas por `expo-font` no bootstrap com fallback do sistema até carregar; `fontFamily` resolve para `Inter_600SemiBold` etc. por peso.
- Movimento: `motion.duration/easing` alimentam `react-native-reanimated` (`withTiming`, `withSpring`); `useReducedMotion()` troca por fade de 80 ms.
- Ícones: componente `Icon name="droplet" size="lg"` renderiza SVG do conjunto próprio com `stroke={icon.stroke}` e `color` do tema.

### 7.3 Consumo na web (`packages/ui/web`)

- Script `build:tokens` também gera `tokens.css` com variáveis CSS por esquema: `:root { --trilho-color-bg-page: #F6F8F8; --trilho-space-4: 16px; … }` e `[data-theme="dark"] { … }`; `@media (prefers-color-scheme: dark)` aplica o escuro quando `data-theme="system"`.
- Preset do Tailwind (`packages/ui/web/tailwind-preset.ts`) mapeia `colors`, `spacing`, `borderRadius`, `boxShadow`, `fontFamily`, `fontSize` e `transitionDuration/TimingFunction` para as variáveis CSS, de modo que `bg-primary text-primary-fg rounded-md shadow-2` usa os mesmos valores do mobile.
- Componentes web são os mesmos nomes (`Button`, `StatusPill`, `OrderStatusTimeline`…) implementados em React com as variáveis CSS; componentes exclusivos de web (tabela, navegação lateral, drawer) seguem os mesmos tokens.
- Fontes via `@font-face` auto-hospedadas (Inter e JetBrains Mono, licença OFL) com `font-display: swap`.
- Testes: snapshot visual por componente e esquema (claro/escuro) em ambas as plataformas; teste de contraste automatizado lê `colorSchemes` e falha o CI se um par semântico cair abaixo do mínimo.

### 7.4 Governança

| Regra | Detalhe |
|---|---|
| Mudança de token | PR em `tokens.json` + regeneração; mudança de valor semântico exige revisão de design e execução do teste de contraste |
| Novo componente | Entra em `packages/ui` com variantes, estados, história de uso e versão RN e web; telas não criam componentes locais com os mesmos nomes |
| Exceções de plataforma | Documentadas no próprio componente (`platform notes`); nunca divergem em cor, raio ou tipografia, apenas em comportamento nativo (haptics, teclado, câmera) |
| Versionamento | `packages/ui` segue semver interno do monorepo; mudanças que alteram tokens semânticos são `major` para os apps |
| Textos | Zero strings de interface dentro de `packages/ui` além de `packages/ui/copy` (rótulos de componentes como "Fechar", "Tentar novamente"); tudo o mais vem de `contracts` ou das telas |
