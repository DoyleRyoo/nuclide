import { elements } from '../../data/elements';
import { rulerStep } from '../lod';
import { screenX, screenY, visibleCells, type Frame } from './frame';
import { MAGIC_N_SET, MAGIC_Z_SET } from './guides';
import type { TextCache } from './text';

const Z_NUMBERS = elements.map((e) => String(e.z));
const Z_SYMBOLS = elements.map((e) => e.symbol);
const N_LABELS = Array.from({ length: 400 }, (_, n) => String(n));

export interface RulerLayout {
  width: number;
  height: number;
  safeLeft: number;
  safeBottom: number;
  fontSize: number;
  padding: number;
  pillX: number;
  pillWidth: number;
  pillHeight: number;
  numberRight: number;
  symbolRight: number;
  nMinSpacing: number;
}

/** 실제 그리는 컨텍스트에서 측정한다. 안전 영역만 바뀌면 TextCache의 폭을 재사용한다. */
export function measureRulers(
  ctx: CanvasRenderingContext2D,
  text: TextCache,
  compact: boolean,
  maxZ: number,
  maxN: number,
  safeLeft = 0,
  safeBottom = 0,
  textScale = 1,
): RulerLayout {
  const fontSize = (compact ? 12 : 13) * textScale;
  const padding = Math.max(6, fontSize * 0.5);
  const gap = fontSize * 0.3;
  let a = 0;
  let b = 0;
  let nWidth = 0;
  text.reset(ctx);
  for (const weight of [500, 700] as const) {
    const font = text.font(fontSize, weight);
    for (let z = 0; z <= Math.max(118, maxZ); z++) {
      a = Math.max(a, text.measure(ctx, font, Z_NUMBERS[z] ?? String(z)));
      b = Math.max(b, text.measure(ctx, font, Z_SYMBOLS[z] ?? ''));
    }
    for (let n = 0; n <= maxN; n++) {
      nWidth = Math.max(nWidth, text.measure(ctx, font, N_LABELS[n] ?? String(n)));
    }
  }
  a = Math.ceil(a);
  b = Math.ceil(b);
  const pillX = Math.max(0, safeLeft) + 2;
  const pillWidth = a + gap + b + 2 * padding;
  const pillHeight = fontSize + 8;
  const symbolRight = pillX + pillWidth - padding;
  return {
    width: Math.ceil(pillX + pillWidth + 2),
    height: Math.max(compact ? 24 : 28, pillHeight + 4) + Math.max(0, safeBottom),
    safeLeft: Math.max(0, safeLeft),
    safeBottom: Math.max(0, safeBottom),
    fontSize,
    padding,
    pillX,
    pillWidth,
    pillHeight,
    symbolRight,
    numberRight: symbolRight - b - gap,
    nMinSpacing: Math.ceil(nWidth) + 2 * padding + 2,
  };
}

export interface RulerMarks {
  hoverZ: number;
  hoverN: number;
  selectedZ: number;
  selectedN: number;
}

/** 선택 → 호버 → 배수 눈금 순으로, 경계와 2px 간격을 만족하는 라벨만 예약한다. */
export function rulerLabels(
  from: number,
  to: number,
  step: number,
  selected: number,
  hovered: number,
  center: (value: number) => number,
  extent: (value: number) => number,
  min: number,
  max: number,
): number[] {
  const shown: number[] = [];
  const occupied: [number, number][] = [];
  const reserve = (value: number) => {
    if (value < from || value > to || shown.includes(value)) return;
    const half = extent(value) / 2;
    const start = center(value) - half;
    const end = start + 2 * half;
    if (start < min + 2 || end > max - 2) return;
    if (occupied.some(([a, b]) => start < b + 2 && end > a - 2)) return;
    shown.push(value);
    occupied.push([start, end]);
  };
  reserve(selected);
  reserve(hovered);
  for (let value = Math.ceil(from / step) * step; value <= to; value += step) reserve(value);
  return shown;
}

export function drawRulers(f: Frame, text: TextCache, marks: RulerMarks): void {
  const { ctx, theme, camera, viewport, rulers: r } = f;
  const { width: rw, height: rh } = r;
  const W = viewport.width;
  const H = viewport.height;
  const { n0, n1, z0, z1 } = visibleCells(f);
  const normal = text.font(r.fontSize, 500);
  const bold = text.font(r.fontSize, 700);
  const selectedText = theme.name === 'dark' ? '#0B0E13' : '#FFFFFF';
  text.reset(ctx);

  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, rw, H);
  ctx.fillRect(rw, H - rh, W - rw, rh);
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rw - 0.5, 0);
  ctx.lineTo(rw - 0.5, H - rh + 0.5);
  ctx.lineTo(W, H - rh + 0.5);
  ctx.stroke();

  const pill = (x: number, y: number, w: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y - r.pillHeight / 2, w, r.pillHeight, r.pillHeight / 2);
    ctx.fill();
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, rw, H - rh);
  ctx.clip();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  text.reset(ctx);
  const zLabels = rulerLabels(
    z0,
    z1,
    rulerStep(camera.s, 'z', r.pillHeight + 2),
    marks.selectedZ,
    marks.hoverZ,
    (z) => screenY(f, z + 0.5),
    () => r.pillHeight,
    0,
    H - rh,
  );
  for (const z of zLabels) {
    const selected = z === marks.selectedZ;
    const y = screenY(f, z + 0.5);
    if (selected) pill(r.pillX, y, r.pillWidth, theme.accent);
    else if (z === marks.hoverZ) pill(r.pillX, y, r.pillWidth, theme.accentWeak);
    text.use(ctx, MAGIC_Z_SET.has(z) ? bold : normal);
    ctx.fillStyle = selected ? selectedText : theme.textMuted;
    text.fill(ctx, Z_NUMBERS[z] ?? String(z), r.numberRight, y);
    text.fill(ctx, Z_SYMBOLS[z] ?? '', r.symbolRight, y);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(rw, H - rh, W - rw, rh);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  text.reset(ctx);
  const yLabel = H - rh + (rh - r.safeBottom) / 2;
  const nWidth = (n: number) =>
    text.measure(ctx, MAGIC_N_SET.has(n) ? bold : normal, N_LABELS[n] ?? String(n)) + 2 * r.padding;
  const nLabels = rulerLabels(
    n0,
    n1,
    rulerStep(camera.s, 'n', r.nMinSpacing),
    marks.selectedN,
    marks.hoverN,
    (n) => screenX(f, n + 0.5),
    nWidth,
    rw,
    W,
  );
  for (const n of nLabels) {
    const selected = n === marks.selectedN;
    const x = screenX(f, n + 0.5);
    if (selected || n === marks.hoverN) {
      const w = nWidth(n);
      pill(x - w / 2, yLabel, w, selected ? theme.accent : theme.accentWeak);
    }
    text.use(ctx, MAGIC_N_SET.has(n) ? bold : normal);
    ctx.fillStyle = selected ? selectedText : theme.textMuted;
    text.fill(ctx, N_LABELS[n] ?? String(n), x, yLabel);
  }
  ctx.restore();

  text.reset(ctx);
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, H - rh, rw, rh);
  text.use(ctx, text.font(Math.max(12, r.fontSize - 1), 600));
  ctx.fillStyle = theme.textSubtle;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  text.fill(ctx, 'Z / N', r.safeLeft + (rw - r.safeLeft) / 2, yLabel);
  ctx.textBaseline = 'alphabetic';
}
