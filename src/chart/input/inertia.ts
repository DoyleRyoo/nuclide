export interface Sample {
  x: number;
  y: number;
  time: number;
}
export function releaseVelocity(
  samples: readonly Sample[],
  now: number,
): { x: number; y: number } | null {
  const recent = samples.filter((s) => now - s.time <= 100);
  const first = recent[0],
    last = recent[recent.length - 1];
  if (!first || !last || last.time <= first.time || now - last.time > 60) return null;
  const dx = (last.x - first.x) / (last.time - first.time);
  const dy = (last.y - first.y) / (last.time - first.time);
  const speed = Math.hypot(dx, dy);
  if (speed < 0.2) return null;
  const factor = Math.min(1, 4 / speed);
  return { x: dx * factor, y: dy * factor };
}
export function inertiaDelta(v: number, previous: number, now: number): number {
  return v * 325 * (Math.exp(-previous / 325) - Math.exp(-now / 325));
}
