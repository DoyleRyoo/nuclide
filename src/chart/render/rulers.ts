import { elements } from '../../data/elements';
import { rulerStep } from '../lod';
import { screenX, screenY, visibleCells, type Frame } from './frame';
import { MAGIC_N_SET, MAGIC_Z_SET } from './guides';
import type { TextCache } from './text';

/** 눈금자 크기 (03 §6.4). 앱의 가용 영역 여백(왼쪽·아래)과 같다. */
export function rulerSize(compact: boolean): { width: number; height: number } {
  return compact ? { width: 36, height: 24 } : { width: 48, height: 28 };
}

// 라벨 문자열은 한 번만 만든다: Z 눈금자 "92 U", N 눈금자 "143"
const Z_LABELS = elements.map((e) => `${e.z} ${e.symbol}`);
const N_LABELS = Array.from({ length: 400 }, (_, n) => String(n));

export interface RulerMarks {
  hoverZ: number;
  hoverN: number;
  selectedZ: number;
  selectedN: number;
}

export function drawRulers(f: Frame, text: TextCache, marks: RulerMarks): void {
  const { ctx, theme, camera, viewport } = f;
  const { width: rw, height: rh } = rulerSize(f.compact);
  const W = viewport.width;
  const H = viewport.height;
  const { n0, n1, z0, z1 } = visibleCells(f);
  const fontSize = f.compact ? 10 : 12;
  const normal = text.font(fontSize, 500);
  const bold = text.font(fontSize, 700);
  const selectedText = theme.name === 'dark' ? '#0B0E13' : '#FFFFFF';
  text.reset(ctx);

  // 배경과 지도 쪽 경계선
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
    ctx.roundRect(x, y - 8, w, 16, 8);
    ctx.fill();
  };

  // Z 눈금자 (왼쪽): 라벨은 칸 중심에, 오른쪽 정렬
  const zStep = rulerStep(camera.s, 'z');
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, rw, H - rh);
  ctx.clip();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  text.reset(ctx);
  for (let z = z0; z <= z1; z++) {
    const selected = z === marks.selectedZ;
    const hovered = z === marks.hoverZ;
    if (z % zStep !== 0 && !selected && !hovered) continue;
    const y = screenY(f, z + 0.5);
    if (selected) pill(3, y, rw - 6, theme.accent);
    else if (hovered) pill(3, y, rw - 6, theme.accentWeak);
    const magic = MAGIC_Z_SET.has(z);
    text.use(ctx, magic ? bold : normal);
    ctx.fillStyle = selected ? selectedText : magic ? theme.accent : theme.textMuted;
    ctx.fillText(Z_LABELS[z] ?? String(z), rw - 6, y);
  }
  ctx.restore();

  // N 눈금자 (아래): 라벨은 칸 중심에, 가운데 정렬
  const nStep = rulerStep(camera.s, 'n');
  ctx.save();
  ctx.beginPath();
  ctx.rect(rw, H - rh, W - rw, rh);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  text.reset(ctx);
  const yLabel = H - rh / 2;
  for (let n = n0; n <= n1; n++) {
    const selected = n === marks.selectedN;
    const hovered = n === marks.hoverN;
    if (n % nStep !== 0 && !selected && !hovered) continue;
    const x = screenX(f, n + 0.5);
    const label = N_LABELS[n] ?? String(n);
    const magic = MAGIC_N_SET.has(n);
    const font = magic ? bold : normal;
    if (selected || hovered) {
      const w = text.measure(ctx, font, label) + 12;
      pill(x - w / 2, yLabel, w, selected ? theme.accent : theme.accentWeak);
    }
    text.use(ctx, font);
    ctx.fillStyle = selected ? selectedText : magic ? theme.accent : theme.textMuted;
    ctx.fillText(label, x, yLabel);
  }
  ctx.restore();

  // 왼쪽 아래 모서리
  text.reset(ctx);
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, H - rh, rw, rh);
  text.use(ctx, text.font(fontSize - 1, 600));
  ctx.fillStyle = theme.textSubtle;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Z / N', rw / 2, H - rh / 2);
  ctx.textBaseline = 'alphabetic';
}
