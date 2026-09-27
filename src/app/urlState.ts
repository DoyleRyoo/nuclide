import type { ColorMode } from './store';
export interface View {
  cx: number;
  cy: number;
  s: number;
}
export interface UrlState {
  id: string | null;
  color: ColorMode;
  view: View | null;
}
export function readUrl(search: string): UrlState {
  const params = new URLSearchParams(search);
  const raw = params.get('view')?.split(',');
  const numbers = raw?.map(Number);
  const valid =
    raw?.length === 3 && raw.every((v) => v.trim() !== '') && numbers?.every(Number.isFinite);
  const [cx, cy, s] = valid ? numbers! : [];
  const view =
    cx !== undefined &&
    cy !== undefined &&
    s !== undefined &&
    s > 0 &&
    s <= 256 &&
    cx >= -2 &&
    cx <= 180 &&
    cy >= -2 &&
    cy <= 121
      ? { cx, cy, s }
      : null;
  const color = params.get('color');
  return {
    id: params.get('nuclide'),
    color: color === 'halflife' || color === 'binding' ? color : 'decay',
    view,
  };
}
export function writeUrl(state: UrlState, push = false) {
  const url = new URL(location.href);
  if (state.id) url.searchParams.set('nuclide', state.id);
  else url.searchParams.delete('nuclide');
  if (state.color !== 'decay') url.searchParams.set('color', state.color);
  else url.searchParams.delete('color');
  if (state.view)
    url.searchParams.set(
      'view',
      [state.view.cx, state.view.cy, state.view.s].map((v) => v.toFixed(2)).join(','),
    );
  else url.searchParams.delete('view');
  if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', url);
}
