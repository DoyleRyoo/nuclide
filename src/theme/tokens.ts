export interface ThemeTokens {
  name: 'light' | 'dark';
  mapBg: string;
  surface: string;
  surfaceSolid: string;
  surfaceHover: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  accent: string;
  accentWeak: string;
  focusRing: string;
  magic: string;
  selOuter: string;
  selInner: string;
  hoverRing: string;
  cellStroke: string;
  cellNa: string;
  tooltipBg: string;
  shadow: string;
}
export const lightTheme: ThemeTokens = {
  name: 'light',
  mapBg: '#F3F4F6',
  surface: 'rgba(255,255,255,0.88)',
  surfaceSolid: '#FFFFFF',
  surfaceHover: '#EEF0F3',
  border: '#E2E5EA',
  text: '#111827',
  textMuted: '#4B5563',
  textSubtle: '#9CA3AF',
  accent: '#0F766E',
  accentWeak: 'rgba(15,118,110,0.12)',
  focusRing: '0 0 0 3px rgba(15,118,110,0.45)',
  magic: 'rgba(17,24,39,0.55)',
  selOuter: '#111827',
  selInner: '#FFFFFF',
  hoverRing: 'rgba(17,24,39,0.60)',
  cellStroke: 'rgba(0,0,0,0.10)',
  cellNa: '#D1D5DB',
  tooltipBg: '#111827',
  shadow: '0 4px 16px rgba(17,24,39,0.12)',
};
export const darkTheme: ThemeTokens = {
  name: 'dark',
  mapBg: '#0B0E13',
  surface: 'rgba(22,26,33,0.86)',
  surfaceSolid: '#161A21',
  surfaceHover: '#1F242D',
  border: '#2A303A',
  text: '#E7EAF0',
  textMuted: '#A3ACB9',
  textSubtle: '#6B7482',
  accent: '#2DD4BF',
  accentWeak: 'rgba(45,212,191,0.16)',
  focusRing: '0 0 0 3px rgba(45,212,191,0.5)',
  magic: 'rgba(231,234,240,0.50)',
  selOuter: '#FFFFFF',
  selInner: '#0B0E13',
  hoverRing: 'rgba(231,234,240,0.70)',
  cellStroke: 'transparent',
  cellNa: '#3A414D',
  tooltipBg: '#E7EAF0',
  shadow: '0 6px 24px rgba(0,0,0,0.45)',
};
export const themes = { light: lightTheme, dark: darkTheme };
export const FONT_FAMILY =
  '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif';
