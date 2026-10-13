import { darkTheme, lightTheme, themeToCssVars } from '@velio/ui';

function block(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join('');
  return `${selector}{${body}}`;
}

/** CSS gerado a partir dos tokens do design system: claro por padrão, escuro por preferência do sistema. */
export function themeCss(): string {
  const light = themeToCssVars(lightTheme);
  const dark = themeToCssVars(darkTheme);
  return [
    block(':root', { ...light, 'color-scheme': 'light' }),
    `@media (prefers-color-scheme: dark){${block(':root:not([data-theme="light"])', { ...dark, 'color-scheme': 'dark' })}}`,
    block(':root[data-theme="dark"]', { ...dark, 'color-scheme': 'dark' }),
  ].join('\n');
}
