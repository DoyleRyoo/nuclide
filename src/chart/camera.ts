import type { Camera, Insets, ScreenPoint, Viewport, WorldPoint, WorldRect } from './types';
import { ZERO_INSETS } from './types';

export const MAX_SCALE = 256;
export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));
export function toScreen(p: WorldPoint, c: Camera, v: Viewport): ScreenPoint {
  return { x: (p.x - c.cx) * c.s + v.width / 2, y: v.height / 2 - (p.y - c.cy) * c.s };
}
export function toWorld(p: ScreenPoint, c: Camera, v: Viewport): WorldPoint {
  return { x: (p.x - v.width / 2) / c.s + c.cx, y: c.cy - (p.y - v.height / 2) / c.s };
}
export function safeArea(v: Viewport, i: Insets = ZERO_INSETS) {
  const left = clamp(i.left, 0, Math.max(0, v.width - 1));
  const top = clamp(i.top, 0, Math.max(0, v.height - 1));
  const right = Math.max(left + 1, v.width - i.right);
  const bottom = Math.max(top + 1, v.height - i.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
export function safeCenter(v: Viewport, i: Insets = ZERO_INSETS): ScreenPoint {
  const r = safeArea(v, i);
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}
export function fitCamera(r: WorldRect, v: Viewport, i: Insets = ZERO_INSETS): Camera {
  const a = safeArea(v, i);
  const s = Math.min(MAX_SCALE, a.width / (r.maxN - r.minN + 1), a.height / (r.maxZ - r.minZ + 1));
  const p = safeCenter(v, i);
  return {
    cx: (r.minN + r.maxN + 1) / 2 - (p.x - v.width / 2) / s,
    cy: (r.minZ + r.maxZ + 1) / 2 + (p.y - v.height / 2) / s,
    s,
  };
}
export function clampCamera(c: Camera, bounds: WorldRect, minScale: number): Camera {
  return {
    cx: clamp(c.cx, bounds.minN - 2, bounds.maxN + 3),
    cy: clamp(c.cy, bounds.minZ - 2, bounds.maxZ + 3),
    s: clamp(c.s, minScale, MAX_SCALE),
  };
}
export function zoomAt(
  c: Camera,
  factor: number,
  p: ScreenPoint,
  v: Viewport,
  minScale = 0.01,
): Camera {
  const w = toWorld(p, c, v);
  const s = clamp(c.s * factor, minScale, MAX_SCALE);
  return { cx: w.x - (p.x - v.width / 2) / s, cy: w.y + (p.y - v.height / 2) / s, s };
}
export function panBy(c: Camera, dx: number, dy: number): Camera {
  return { cx: c.cx - dx / c.s, cy: c.cy + dy / c.s, s: c.s };
}
export function scrollBy(c: Camera, dx: number, dy: number): Camera {
  return panBy(c, -dx, -dy);
}
export function visibleBounds(c: Camera, v: Viewport): WorldRect {
  const a = toWorld({ x: 0, y: v.height }, c, v);
  const b = toWorld({ x: v.width, y: 0 }, c, v);
  return {
    minN: Math.floor(a.x),
    maxN: Math.floor(b.x),
    minZ: Math.floor(a.y),
    maxZ: Math.floor(b.y),
  };
}
export function revealCell(c: Camera, n: number, z: number, v: Viewport, i: Insets): Camera {
  const a = safeArea(v, i);
  const p = toScreen({ x: n + 0.5, y: z + 0.5 }, c, v);
  const marginX = Math.min(24 + c.s / 2, a.width / 2);
  const marginY = Math.min(24 + c.s / 2, a.height / 2);
  const x = clamp(p.x, a.left + marginX, a.right - marginX);
  const y = clamp(p.y, a.top + marginY, a.bottom - marginY);
  return panBy(c, x - p.x, y - p.y);
}
