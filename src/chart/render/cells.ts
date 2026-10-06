import { DEFAULT_ISOMER_MARKER_SECONDS, isomerMarker } from '../../data/stability';
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
  /** 이성질체 표식: 0 없음, 1 문턱 이상 이성질체, 2 그 이성질체가 안정 계열(¹⁸⁰ᵐTa) */
  private readonly isomer: Uint8Array;
  private isomerThreshold = NaN;
  private readonly index: NuclideIndex;
  private readonly rect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(index: NuclideIndex, isomerThreshold = DEFAULT_ISOMER_MARKER_SECONDS) {
    this.index = index;
    const size = index.nuclides.length;
    this.visible = new Int32Array(size);
    this.predicted = new Int32Array(size);
    this.sorted = new Int32Array(size);
    this.isomer = new Uint8Array(size);
    this.setIsomerThreshold(isomerThreshold);
  }

  /** 삼각형을 그릴 이성질체의 반감기 문턱(초). 바뀌었으면 true */
  setIsomerThreshold(seconds: number): boolean {
    if (seconds === this.isomerThreshold) return false;
    this.isomerThreshold = seconds;
    this.index.nuclides.forEach((n, i) => (this.isomer[i] = isomerMarker(n, seconds)));
    return true;
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

  /**
   * 자연 존재 띠·관측적 안정 점(s ≥ 8), 이성질체 삼각형(LOD ≥ 1) (03 §5.3).
   * 관측적 안정은 안정과 같은 색으로 칠하고 왼쪽 위의 작은 점으로만 구별한다 (공통 B 안정 기준).
   */
  private drawMarkers(f: Frame): void {
    const { ctx, camera, index, theme, colors } = f;
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

    // 점 색은 칸 글자색과 같다 (색 모드·테마마다 칸 바탕과 대비가 보장된다).
    const dot = Math.max(1.2, 0.06 * s);
    for (let k = 0; k < this.visibleCount; k++) {
      const i = this.visible[k]!;
      const n = index.nuclides[i]!;
      if (n.stability !== 'observationally-stable') continue;
      const r = cellRect(f, n.n, n.z, this.rect);
      ctx.fillStyle = colors.text[colors.index[i]!]!;
      ctx.beginPath();
      ctx.arc(r.x + 0.16 * s, r.y + 0.16 * s, dot, 0, Math.PI * 2);
      ctx.fill();
    }

    const alpha = lodOpacity(s, 1);
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 0.5;
    // 흰 삼각형: 이성질체 보유, 검은 삼각형: 자연에 있는 안정 이성질체(¹⁸⁰ᵐTa)
    for (const [marker, fill] of [
      [1, '#FFFFFF'],
      [2, '#111827'],
    ] as const) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let k = 0; k < this.visibleCount; k++) {
        const i = this.visible[k]!;
        if (this.isomer[i] !== marker) continue;
        const n = index.nuclides[i]!;
        const r = cellRect(f, n.n, n.z, this.rect);
        this.triangle(f, r, 0.2 * s);
      }
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private triangle(f: Frame, r: Rect, leg: number): void {
    const right = r.x + r.w;
    f.ctx.moveTo(right - leg, r.y);
    f.ctx.lineTo(right, r.y);
    f.ctx.lineTo(right, r.y + leg);
    f.ctx.closePath();
  }
}
