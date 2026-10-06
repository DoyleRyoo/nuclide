import type { NuclideIndex } from '../../data/types';
import { formatAbundanceShort, minus } from '../../data/format';
import { getLod, lodOpacity } from '../lod';
import type { CellLayer } from './cells';
import { cellRect, type Frame, type Rect } from './frame';
import type { TextCache } from './text';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

interface CellText {
  mass: string;
  symbol: string;
  halfLife: string;
  decay1: string;
  decay2: string;
  jpi: string;
  abundance: string;
}

/** Jπ 칸 표기: `*`(측정 표시)와 `T=` 아이소스핀은 빼고 마이너스 기호를 바꾼다. `#`은 남긴다. */
function cellJpi(jpi: string | undefined): string {
  if (!jpi) return '';
  return minus(jpi.split(/\s+T=/)[0]!.replace(/\*/g, '').trim());
}

/**
 * 칸 안의 글자 (03 §5.2). 문자열은 로드할 때 한 번 만들어 두고 (05 §4.4),
 * LOD 전환 구간에서는 새로 나타나는 글자를 서서히 보인다 (02 §8).
 */
export class LabelLayer {
  private readonly texts: CellText[];
  private readonly rect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(index: NuclideIndex) {
    this.texts = index.nuclides.map((n) => {
      const label = index.labels.get(n.id);
      const [decay1 = '', decay2 = ''] = label?.decay.split('\n') ?? [];
      return {
        mass: String(n.a),
        symbol: n.symbol,
        halfLife: label?.halfLife ?? '',
        decay1,
        decay2,
        jpi: cellJpi(n.jpi),
        // 안정 칸은 반감기 줄에 이미 존재비를 쓴다.
        abundance:
          n.abundance && n.halfLife.kind !== 'stable' ? formatAbundanceShort(n.abundance) : '',
      };
    });
  }

  draw(f: Frame, cells: CellLayer, text: TextCache): void {
    const s = f.camera.s;
    const lod = getLod(s);
    if (lod === 0) return;
    const { ctx } = f;
    text.reset(ctx);
    ctx.textBaseline = 'alphabetic';
    for (let k = 0; k < cells.visibleCount; k++)
      this.drawCell(f, cells, text, cells.visible[k]!, lod, true);
    for (let k = 0; k < cells.predictedCount; k++) {
      this.drawCell(f, cells, text, cells.predicted[k]!, lod, false);
    }
    ctx.globalAlpha = 1;
  }

  private drawCell(
    f: Frame,
    cells: CellLayer,
    text: TextCache,
    i: number,
    lod: number,
    observed: boolean,
  ): void {
    const { ctx, camera } = f;
    const s = camera.s;
    const n = f.index.nuclides[i]!;
    const t = this.texts[i]!;
    const r = cellRect(f, n.n, n.z, this.rect);
    const base = cells.dimmed(f, i) ? 0.25 : 1;
    ctx.fillStyle = observed ? f.colors.text[f.colors.index[i]!]! : f.theme.textSubtle;
    const cx = r.x + r.w / 2;
    const maxWidth = 0.88 * s;

    if (lod === 1) {
      const size = clamp(0.36 * s, 11, 44);
      ctx.globalAlpha = base * lodOpacity(s, 1);
      this.drawName(f, text, t, cx, r.y + r.h / 2 + size * 0.35, size, maxWidth);
      return;
    }
    if (lod === 2) {
      ctx.globalAlpha = base;
      this.drawName(f, text, t, cx, r.y + 0.45 * s, clamp(0.26 * s, 11, 44), maxWidth);
      ctx.globalAlpha = base * lodOpacity(s, 2);
      ctx.textAlign = 'center';
      text.fillFitted(
        ctx,
        t.halfLife,
        cx,
        r.y + 0.75 * s,
        clamp(0.15 * s, 9, 22),
        9,
        maxWidth,
        500,
      );
      return;
    }
    ctx.globalAlpha = base;
    this.drawName(f, text, t, cx, r.y + 0.28 * s, clamp(0.19 * s, 11, 44), maxWidth);
    ctx.textAlign = 'center';
    text.fillFitted(ctx, t.halfLife, cx, r.y + 0.45 * s, clamp(0.11 * s, 9, 22), 9, maxWidth, 500);
    ctx.globalAlpha = base * lodOpacity(s, 3);
    const decaySize = clamp(0.09 * s, 9, 18);
    text.fillFitted(ctx, t.decay1, cx, r.y + 0.6 * s, decaySize, 9, maxWidth);
    text.fillFitted(ctx, t.decay2, cx, r.y + 0.73 * s, decaySize, 9, maxWidth);
    const small = clamp(0.08 * s, 9, 16);
    const inset = 0.08 * s;
    const half = r.w / 2 - inset;
    ctx.textAlign = 'left';
    text.fillFitted(ctx, t.jpi, r.x + inset, r.y + 0.9 * s, small, 9, half);
    ctx.textAlign = 'right';
    text.fillFitted(ctx, t.abundance, r.x + r.w - inset, r.y + 0.9 * s, small, 9, half);
  }

  /** 질량수(위첨자) + 원소 기호를 가운데에 (03 §5.2) */
  private drawName(
    f: Frame,
    text: TextCache,
    t: CellText,
    cx: number,
    baseline: number,
    size: number,
    maxWidth: number,
  ): void {
    const { ctx } = f;
    let symbolSize = size;
    let massSize = clamp(size * 0.62, 7, 28);
    let symbolFont = text.font(symbolSize, 700);
    let massFont = text.font(massSize, 600);
    let sw = text.measure(ctx, symbolFont, t.symbol);
    let mw = text.measure(ctx, massFont, t.mass);
    if (sw + mw > maxWidth) {
      const scale = maxWidth / (sw + mw);
      symbolSize = Math.max(11, symbolSize * scale);
      massSize = Math.max(7, massSize * scale);
      symbolFont = text.font(symbolSize, 700);
      massFont = text.font(massSize, 600);
      sw = text.measure(ctx, symbolFont, t.symbol);
      mw = text.measure(ctx, massFont, t.mass);
    }
    const x = cx - (sw + mw) / 2;
    ctx.textAlign = 'left';
    text.use(ctx, massFont);
    text.fill(ctx, t.mass, x, baseline - symbolSize * 0.38);
    text.use(ctx, symbolFont);
    text.fill(ctx, t.symbol, x + mw, baseline);
  }
}
