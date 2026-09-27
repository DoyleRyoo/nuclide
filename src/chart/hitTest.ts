import type { Nuclide, NuclideIndex } from '../data/types';
import { toWorld } from './camera';
import type { Camera, ScreenPoint, Viewport } from './types';
export function atCell(
  index: NuclideIndex,
  n: number,
  z: number,
  showPredicted = true,
): Nuclide | null {
  if (n < 0 || z < 0 || n >= index.gridWidth || z >= index.gridHeight) return null;
  const i = index.grid[z * index.gridWidth + n];
  if (i === undefined || i < 0) return null;
  const cell = index.nuclides[i];
  return cell && (showPredicted || cell.observed) ? cell : null;
}
export function hitTest(
  index: NuclideIndex,
  p: ScreenPoint,
  c: Camera,
  v: Viewport,
  showPredicted = true,
): Nuclide | null {
  const w = toWorld(p, c, v);
  return atCell(index, Math.floor(w.x), Math.floor(w.y), showPredicted);
}
