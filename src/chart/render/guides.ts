import type { NuclideIndex } from '../../data/types';
import { getLod } from '../lod';
import { screenX, screenY, type Frame } from './frame';
import type { TextCache } from './text';

export const MAGIC_Z = [2, 8, 20, 28, 50, 82] as const;
export const MAGIC_N = [2, 8, 20, 28, 50, 82, 126] as const;
export const MAGIC_Z_SET = new Set<number>(MAGIC_Z);
export const MAGIC_N_SET = new Set<number>(MAGIC_N);

interface Span {
  at: number;
  from: number;
  to: number;
  label: string;
}

const LABEL_HEIGHT = 12;

/** 마법수 선 (03 §6.1)과 N = Z 기준선 (03 §6.2). 선의 길이는 데이터에서 한 번 계산한다. */
export class GuideLayer {
  private readonly rows: Span[];
  private readonly columns: Span[];
  /** 라벨을 그릴 순서: 큰 마법수 먼저 (겹치면 작은 마법수 라벨을 생략) */
  private readonly labelOrder: { span: Span; row: boolean }[];
  /** 이번 프레임에 그린 라벨 사각형 (x, y, w, h) × 개수. 미리 할당해 다시 쓴다. */
  private readonly placed: Float64Array;
  private readonly diagonal: number;

  constructor(index: NuclideIndex) {
    this.rows = MAGIC_Z.flatMap((z) => {
      const row = index.rows.get(z);
      return row ? [{ at: z, from: row.nMin - 0.5, to: row.nMax + 1.5, label: `Z=${z}` }] : [];
    });
    const columns = new Map<number, { zMin: number; zMax: number }>();
    for (const n of index.nuclides) {
      const c = columns.get(n.n);
      if (c) {
        c.zMin = Math.min(c.zMin, n.z);
        c.zMax = Math.max(c.zMax, n.z);
      } else columns.set(n.n, { zMin: n.z, zMax: n.z });
    }
    this.columns = MAGIC_N.flatMap((n) => {
      const c = columns.get(n);
      return c ? [{ at: n, from: c.zMin - 0.5, to: c.zMax + 1.5, label: `N=${n}` }] : [];
    });
    this.labelOrder = [
      ...this.rows.map((span) => ({ span, row: true })),
      ...this.columns.map((span) => ({ span, row: false })),
    ].sort((a, b) => b.span.at - a.span.at);
    this.placed = new Float64Array(this.labelOrder.length * 4);
    this.diagonal = Math.min(index.bounds.zMax, index.bounds.nMax) + 0.5;
  }

  /** 이미 그린 라벨과 겹치지 않으면 자리를 잡는다. */
  private place(count: number, x: number, y: number, w: number, h: number): boolean {
    const p = this.placed;
    for (let i = 0; i < count; i++) {
      const k = i * 4;
      if (
        x < p[k]! + p[k + 2]! &&
        x + w > p[k]! &&
        y < p[k + 1]! + p[k + 3]! &&
        y + h > p[k + 1]!
      ) {
        return false;
      }
    }
    const k = count * 4;
    p[k] = x;
    p[k + 1] = y;
    p[k + 2] = w;
    p[k + 3] = h;
    return true;
  }

  draw(f: Frame, text: TextCache): void {
    const { ctx, theme, camera } = f;
    const lod = getLod(camera.s);

    ctx.strokeStyle = theme.magic;
    // 1.5px 고정이 기본이지만, 칸이 아주 작으면(s < 6) 두 줄이 붙어 굵은 띠가 되므로 가늘게 한다.
    ctx.lineWidth = Math.max(0.75, Math.min(1.5, camera.s / 4));
    ctx.beginPath();
    // 마법수 Z 행은 y = Z, Z + 1에 가로선 두 개, N 열은 x = N, N + 1에 세로선 두 개
    for (const r of this.rows) {
      const x0 = screenX(f, r.from);
      const x1 = screenX(f, r.to);
      const ya = screenY(f, r.at);
      const yb = screenY(f, r.at + 1);
      ctx.moveTo(x0, ya);
      ctx.lineTo(x1, ya);
      ctx.moveTo(x0, yb);
      ctx.lineTo(x1, yb);
    }
    for (const c of this.columns) {
      const y0 = screenY(f, c.from);
      const y1 = screenY(f, c.to);
      const xa = screenX(f, c.at);
      const xb = screenX(f, c.at + 1);
      ctx.moveTo(xa, y0);
      ctx.lineTo(xa, y1);
      ctx.moveTo(xb, y0);
      ctx.lineTo(xb, y1);
    }
    ctx.stroke();

    // N = Z: 칸 중심을 잇는 점선. LOD 3에서는 글자와 겹쳐 생략한다.
    if (lod < 3) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = theme.textSubtle;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(screenX(f, 0.5), screenY(f, 0.5));
      ctx.lineTo(screenX(f, this.diagonal), screenY(f, this.diagonal));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // 라벨: LOD 0–1에서 선 끝에 "Z=50", "N=82"
    if (lod > 1) return;
    // Z 라벨은 행 오른쪽 끝, N 라벨은 열 위쪽 끝. 겹치면 작은 마법수 라벨을 생략한다.
    text.reset(ctx);
    const font = text.font(11, 500);
    text.use(ctx, font);
    ctx.fillStyle = theme.textMuted;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let count = 0;
    for (const { span, row } of this.labelOrder) {
      const w = text.measure(ctx, font, span.label);
      const x = row ? screenX(f, span.to) + 4 : screenX(f, span.at + 0.5) - w / 2;
      const y = row ? screenY(f, span.at + 0.5) : screenY(f, span.to) - 4 - LABEL_HEIGHT / 2;
      if (!this.place(count, x, y - LABEL_HEIGHT / 2, w, LABEL_HEIGHT)) continue;
      count++;
      text.fill(ctx, span.label, x, y);
    }
    ctx.textBaseline = 'alphabetic';
  }
}
