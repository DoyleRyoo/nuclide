import { themes, type ThemeTokens } from './tokens';
export function getTheme(mode: 'system' | 'light' | 'dark'): ThemeTokens {
  return themes[mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode];
}
export function applyTheme(theme: ThemeTokens): void {
  const root = document.documentElement;
  root.dataset.theme = theme.name;
  root.style.colorScheme = theme.name;
  for (const [key, value] of Object.entries(theme)) {
    if (key !== 'name') root.style.setProperty(`--${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value);
  }
}
