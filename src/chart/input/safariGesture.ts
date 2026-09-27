import type { ScreenPoint } from '../types';
type GestureEvent = Event & { scale: number; clientX: number; clientY: number };
export function bindSafariGesture(
  canvas: HTMLCanvasElement,
  zoom: (k: number, p: ScreenPoint) => void,
  cancel: () => void,
): () => void {
  let scale = 1;
  const start = (event: Event) => {
    event.preventDefault();
    scale = 1;
    cancel();
  };
  const change = (event: Event) => {
    event.preventDefault();
    const e = event as GestureEvent;
    const rect = canvas.getBoundingClientRect();
    if (e.scale > 0) zoom(e.scale / scale, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    scale = e.scale;
  };
  const end = (e: Event) => {
    e.preventDefault();
    scale = 1;
  };
  canvas.addEventListener('gesturestart', start, { passive: false });
  canvas.addEventListener('gesturechange', change, { passive: false });
  canvas.addEventListener('gestureend', end, { passive: false });
  return () => {
    canvas.removeEventListener('gesturestart', start);
    canvas.removeEventListener('gesturechange', change);
    canvas.removeEventListener('gestureend', end);
  };
}
