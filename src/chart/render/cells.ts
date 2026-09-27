import type { NuclideIndex } from '../../data/types';
import { decayFill } from '../colorModes';
import { lodOpacity } from '../lod';
import { cellRect, cellStyle, visibleCells, type Frame, type Rect } from './frame';

const DIMMED = 0.25;
/** 강조 중에는 흐린 칸(true)을 먼저, 나머지(false)를 나중에 그린다. */
const HIGHLIGHT_PASSES = [true, false] as const;
const NORMAL_PASS = [false] as const;

/**
 * 칸 채우기·예측 칸 점선·표식 (03 §5, 05 §4.2–4.3).
 * 보이는 칸을 색 인덱스별로 계수 정렬해 색마다 fillStyle을 한 번만 바꾼다.
 * 버퍼는 미리 할당해 프레임마다 다시 쓴다.
 */
export class CellLayer {
  /** 이번 프레임에 보이는 관측 핵종 인덱스 (visibleCount개) */
  readonly visible: Int32Array;
  visibleCount = 0;
  /** 이번 프레임에 보이는 예측 핵종 인덱스 */
  readonly predicted: Int32Array;
  predictedCount = 0;
  private readonly sorted: Int32Array;
  private readonly counts = new Int32Array(256);
  private readonly offsets = new Int32Array(257);
  /** 들뜬 상태(존재하지 않는 상태 제외)가 있는 핵종 */
  private readonly hasIsomer: Uint8Array;
  private readonly rect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(index: NuclideIndex) {
    const size = index.nuclides.length;
    this.visible = new Int32Array(size);
    this.predicted = new Int32Array(size);
    this.sorted = new Int32Array(size);
    this.hasIsomer = Uint8Array.from(index.nuclides, (n) =>
      n.excited.some((s) => !s.nonExistent) ? 1 : 0,
    );
  }

  /** 범례 강조로 흐리게 그릴 핵종인지 */
  dimmed(f: Frame, i: number): boolean {
    const h = f.highlight;
    return h?.type === 'decay' && f.index.nuclides[i]!.primary !== h.category;
  }

  /** 보이는 칸을 모은다. 그리기 전에 한 번 부른다. */
  collect(f: Frame): void {
    const { index, showPredicted } = f;
    const { n0, n1, z0, z1 } = visibleCells(f);
    let vc = 0;
    let pc = 0;
    for (let z = z0; z <= z1; z++) {
      const row = index.rows.get(z);
      if (!row) continue;
      const start = Math.max(n0, row.nMin);
      const end = Math.min(n1, row.nMax);
      const base = z * index.gridWidth;
      for (let n = start; n <= end; n++) {
        const i = index.grid[base + n]!;
        if (i < 0) continue;
        if (index.nuclides[i]!.observed) this.visible[vc++] = i;
        else if (showPredicted) this.predicted[pc++] = i;
      }
    }
    this.visibleCount = vc;
    this.predictedCount = pc;
  }

  draw(f: Frame): void {
    const { ctx, theme, camera } = f;
    const s = camera.s;
    ctx.fillStyle = theme.mapBg;
    ctx.fillRect(0, 0, f.viewport.width, f.viewport.height);
    this.collect(f);
    this.fill(f);
    if (theme.cellStroke !== 'transparent' && s >= 4) this.stroke(f);
    this.drawPredicted(f);
    this.drawMarkers(f);
  }

  private path(f: Frame, i: number, radius: number): void {
    const n = f.index.nuclides[i]!;
    const r = cellRect(f, n.n, n.z, this.rect);
    if (radius > 0) f.ctx.roundRect(r.x, r.y, r.w, r.h, radius);
    else f.ctx.rect(r.x, r.y, r.w, r.h);
  }

  /** 계수 정렬 → 색마다 경로 하나로 채우기. 강조 중이면 흐린 칸을 먼저 그린다. */
  private fill(f: Frame): void {
    const { ctx, colors } = f;
    const { radius } = cellStyle(f.camera.s);
    const counts = this.counts;
    const offsets = this.offsets;
    const palette = colors.fill.length;
    counts.fill(0, 0, palette);
    for (let k = 0; k < this.visibleCount; k++) counts[colors.index[this.visible[k]!]!]!++;
    offsets[0] = 0;
    for (let c = 0; c < palette; c++) offsets[c + 1] = offsets[c]! + counts[c]!;
    counts.fill(0, 0, palette);
    for (let k = 0; k < this.visibleCount; k++) {
      const i = this.visible[k]!;
      const c = colors.index[i]!;
      this.sorted[offsets[c]! + counts[c]!++] = i;
    }
    const highlighting = f.highlight?.type === 'decay';
    for (const pass of highlighting ? HIGHLIGHT_PASSES : NORMAL_PASS) {
      ctx.globalAlpha = pass ? DIMMED : 1;
      for (let c = 0; c < palette; c++) {
        const from = offsets[c]!;
        const to = offsets[c + 1]!;
        if (from === to) continue;
        ctx.fillStyle = colors.fill[c]!;
        ctx.beginPath();
        for (let k = from; k < to; k++) {
          const i = this.sorted[k]!;
          if (highlighting && this.dimmed(f, i) !== pass) continue;
          this.path(f, i, radius);
        }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** 라이트 테마의 1px 칸 테두리 (노란 칸과 밝은 배경 구분) */
  private stroke(f: Frame): void {
    const { ctx } = f;
    const { radius } = cellStyle(f.camera.s);
    ctx.strokeStyle = f.theme.cellStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < this.visibleCount; k++) this.path(f, this.visible[k]!, radius);
    ctx.stroke();
  }

  /** 예측(미관측) 칸: 채우지 않고 1px 점선(4-3). 아주 작을 때는 옅게 채운다. */
  private drawPredicted(f: Frame): void {
    if (!this.predictedCount) return;
    const { ctx, camera } = f;
    const { radius } = cellStyle(camera.s);
    ctx.beginPath();
    for (let k = 0; k < this.predictedCount; k++) this.path(f, this.predicted[k]!, radius);
    if (camera.s < 4) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = f.theme.textSubtle;
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = f.theme.textSubtle;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** 자연 존재 띠(s ≥ 8), 이성질체 삼각형(LOD ≥ 1) (03 §5.3) */
  private drawMarkers(f: Frame): void {
    const { ctx, camera, index, theme } = f;
    const s = camera.s;
    if (s < 8) return;
    const band = Math.max(1, 0.12 * s);
    ctx.fillStyle = decayFill('stable', theme);
    ctx.beginPath();
    for (let k = 0; k < this.visibleCount; k++) {
      const i = this.visible[k]!;
      const n = index.nuclides[i]!;
      if (!n.naturalRadioactive) continue;
      const r = cellRect(f, n.n, n.z, this.rect);
      ctx.rect(r.x, r.y, r.w, band);
    }
    ctx.fill();

    const alpha = lodOpacity(s, 1);
    if (alpha <= 0) return;
    const leg = 0.2 * s;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let k = 0; k < this.visibleCount; k++) {
      const i = this.visible[k]!;
      if (!this.hasIsomer[i]) continue;
      const n = index.nuclides[i]!;
      const r = cellRect(f, n.n, n.z, this.rect);
      const right = r.x + r.w;
      ctx.moveTo(right - leg, r.y);
      ctx.lineTo(right, r.y);
      ctx.lineTo(right, r.y + leg);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
