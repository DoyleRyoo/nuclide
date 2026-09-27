import type { Camera } from './types';
export function interpolateCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    s: Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * t),
  };
}
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}
export class Animator {
  private tween: {
    from: Camera;
    to: Camera;
    start: number;
    duration: number;
    resolve: () => void;
    ease: (t: number) => number;
  } | null = null;
  get active(): boolean {
    return this.tween !== null;
  }
  /** 진행 중인 이동의 목적지 */
  get target(): Camera | null {
    return this.tween?.to ?? null;
  }
  cancel(): void {
    this.tween?.resolve();
    this.tween = null;
  }
  start(from: Camera, to: Camera, duration: number, ease = easeOutCubic): Promise<void> {
    this.cancel();
    return new Promise((resolve) => {
      this.tween = { from, to, start: performance.now(), duration, resolve, ease };
    });
  }
  update(now: number): Camera | null {
    const t = this.tween;
    if (!t) return null;
    const progress = t.duration <= 0 ? 1 : Math.min(1, (now - t.start) / t.duration);
    const value = interpolateCamera(t.from, t.to, t.ease(progress));
    if (progress === 1) {
      t.resolve();
      this.tween = null;
    }
    return value;
  }
}
