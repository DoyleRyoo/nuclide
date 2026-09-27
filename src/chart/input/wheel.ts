import type { Camera, ScreenPoint, Viewport } from '../types';
import { scrollBy, zoomAt } from '../camera';
export interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}
export function normalizeWheel(e: WheelInput, safeHeight: number): { dx: number; dy: number } {
  const factor = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? safeHeight * 0.9 : 1;
  let dx = e.deltaX * factor;
  let dy = e.deltaY * factor;
  if (e.shiftKey && dx === 0) {
    dx = dy;
    dy = 0;
  }
  return { dx, dy };
}
export function wheelCamera(
  c: Camera,
  e: WheelInput,
  p: ScreenPoint,
  v: Viewport,
  safeHeight: number,
  mode: 'scroll' | 'zoom',
  minScale: number,
): Camera {
  const { dx, dy } = normalizeWheel(e, safeHeight);
  if (e.ctrlKey || e.metaKey || (mode === 'zoom' && !e.shiftKey)) {
    const delta = Math.max(
      -100,
      Math.min(
        100,
        e.deltaMode === 1
          ? e.deltaY * 20
          : e.deltaMode === 2
            ? e.deltaY * safeHeight * 0.9
            : e.deltaY,
      ),
    );
    return zoomAt(c, 2 ** (-delta / 200), p, v, minScale);
  }
  return scrollBy(c, dx, dy);
}
