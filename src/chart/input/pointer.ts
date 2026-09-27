import type { ScreenPoint } from '../types';
import { releaseVelocity, type Sample } from './inertia';

interface PointerHost {
  point(event: { clientX: number; clientY: number }): ScreenPoint;
  cancel(): void;
  pan(dx: number, dy: number): void;
  zoom(factor: number, point: ScreenPoint, animated?: boolean): void;
  select(point: ScreenPoint): void;
  hover(point: ScreenPoint | null): void;
  release(velocity: { x: number; y: number } | null): void;
}
export function bindPointer(canvas: HTMLCanvasElement, host: PointerHost): () => void {
  const pointers = new Map<number, ScreenPoint>();
  let start: ScreenPoint | null = null;
  let previous: ScreenPoint | null = null;
  let dragging = false;
  let pinched = false;
  let samples: Sample[] = [];
  let lastTap: { x: number; y: number; time: number } | null = null;
  const down = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    canvas.parentElement?.focus({ preventScroll: true });
    host.cancel();
    const p = host.point(e);
    pointers.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) {
      start = previous = p;
      dragging = false;
      pinched = false;
      samples = [{ ...p, time: performance.now() }];
    } else {
      pinched = true;
      host.hover(null);
    }
  };
  const move = (e: PointerEvent) => {
    const p = host.point(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') host.hover(p);
      return;
    }
    if (pointers.size >= 2) {
      const before = [...pointers.values()].slice(0, 2);
      pointers.set(e.pointerId, p);
      const after = [...pointers.values()].slice(0, 2);
      const a = before[0]!,
        b = before[1]!,
        c = after[0]!,
        d = after[1]!;
      const oldMiddle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const newMiddle = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0) host.zoom(Math.hypot(c.x - d.x, c.y - d.y) / distance, oldMiddle);
      host.pan(newMiddle.x - oldMiddle.x, newMiddle.y - oldMiddle.y);
      canvas.style.cursor = 'grabbing';
      return;
    }
    pointers.set(e.pointerId, p);
    if (!start || !previous) return;
    if (
      !dragging &&
      Math.hypot(p.x - start.x, p.y - start.y) > (e.pointerType === 'touch' ? 8 : 4)
    ) {
      dragging = true;
      host.hover(null);
      // 임계 이동 이전의 거리도 포함하여 지도가 손가락 아래에 머문다.
      previous = start;
    }
    if (dragging) {
      host.pan(p.x - previous.x, p.y - previous.y);
      canvas.style.cursor = 'grabbing';
      const now = performance.now();
      samples.push({ ...p, time: now });
      samples = samples.filter((s) => now - s.time <= 100);
    }
    previous = p;
  };
  const up = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const p = host.point(e);
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (pointers.size) {
      start = previous = [...pointers.values()][0]!;
      dragging = true;
      samples = [];
      return;
    }
    if (!dragging && !pinched) {
      host.select(p);
      if (e.pointerType === 'touch') {
        const now = performance.now();
        if (
          lastTap &&
          now - lastTap.time <= 300 &&
          Math.hypot(lastTap.x - p.x, lastTap.y - p.y) <= 24
        ) {
          host.zoom(2, p, true);
          lastTap = null;
        } else lastTap = { ...p, time: now };
      }
    } else if (!pinched) host.release(releaseVelocity(samples, performance.now()));
    start = previous = null;
    dragging = false;
    pinched = false;
    samples = [];
    canvas.style.cursor = 'grab';
    if (e.pointerType === 'mouse') host.hover(p);
  };
  const cancel = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    start = previous = null;
    dragging = false;
    pinched = true;
    samples = [];
    host.cancel();
    host.hover(null);
    canvas.style.cursor = 'grab';
  };
  const leave = () => {
    if (!pointers.size) host.hover(null);
  };
  const double = (e: MouseEvent) => {
    e.preventDefault();
    host.cancel();
    host.zoom(e.shiftKey ? 0.5 : 2, host.point(e), true);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', cancel);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('dblclick', double);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('lostpointercapture', cancel);
    canvas.removeEventListener('pointerleave', leave);
    canvas.removeEventListener('dblclick', double);
  };
}
