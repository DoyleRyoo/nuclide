import type { Lod } from './types';
export function getLod(scale: number): Lod {
  return scale < 32 ? 0 : scale < 64 ? 1 : scale < 128 ? 2 : 3;
}
export function lodOpacity(scale: number, level: 1 | 2 | 3): number {
  const threshold = 16 * 2 ** level;
  return Math.max(0, Math.min(1, (scale / threshold - 1) / 0.15));
}
export function rulerStep(
  scale: number,
  axis: 'n' | 'z',
  minSpacing = axis === 'n' ? 36 : 23,
): number {
  const steps = axis === 'n' ? [1, 2, 5, 10, 20, 50] : [1, 2, 5, 10, 20];
  return steps.find((step) => step * scale >= minSpacing) ?? Math.ceil(minSpacing / scale);
}
