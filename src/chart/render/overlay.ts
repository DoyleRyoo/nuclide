import { formatBranchShort } from '../../data/format';
import type { DecayBranch, Nuclide } from '../../data/types';
import { hexToRgb } from '../../theme/colormaps';
import { decayFill } from '../colorModes';
import { getLod } from '../lod';
import { cellRect, screenX, screenY, type Frame, type Rect } from './frame';
import { drawRulers } from './rulers';
import type { TextCache } from './text';

export interface OverlayState {
  selected: Nuclide | null;
  hovered: Nuclide | null;
  /** 검색 행·열 강조의 깜빡임 단계 (1.2초 동안 두 번) */
  highlightVisible: boolean;
}

const MAX_ARROWS = 5;
/** 이보다 작은 분기(예: ²³⁵U의 클러스터 붕괴 10⁻¹⁰ %)는 화살표를 생략한다. 패널에는 모두 나온다. */
const MIN_ARROW_PERCENT = 0.01;
const rect: Rect = { x: 0, y: 0, w: 0, h: 0 };

function rgba(hex: string, alpha: number): string {
  if (!hex.startsWith('#')) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * 붕괴 화살표에 쓸 분기: 딸핵이 정해지고 IT가 아닌 것 중 첫 분기, 값이 없는 분기
 * (미관측 ` ?`·세기 미상 `=?`), 0.01 % 이상인 분기를 분기비가 큰 순서로 최대 5개 (03 §6.3)
 */
export function arrowBranches(n: Nuclide): DecayBranch[] {
  return n.decays
    .filter(
      (b, i) =>
        b.daughter &&
        (b.daughter.dz !== 0 || b.daughter.dn !== 0) &&
        (i === 0 || b.pct === undefined || b.pct >= MIN_ARROW_PERCENT),
    )
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
    .slice(0, MAX_ARROWS);
}

/** overlay 레이어: 검색 강조, 호버 링, 붕괴 화살표, 선택 링, 눈금자 (05 §4.2) */
export function drawOverlay(f: Frame, state: OverlayState, text: TextCache): void {
  const { ctx, viewport, theme } = f;
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  const h = f.highlight;
  if (h && h.type !== 'decay' && state.highlightVisible) drawLineHighlight(f, h);
  if (state.hovered && state.hovered !== state.selected) {
    const r = cellRect(f, state.hovered.n, state.hovered.z, rect);
    ctx.strokeStyle = theme.hoverRing;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5);
  }
  if (state.selected) {
    drawArrows(f, state.selected, text);
    drawSelection(f, state.selected);
  }
  drawRulers(f, text, {
    hoverZ: state.hovered?.z ?? -1,
    hoverN: state.hovered?.n ?? -1,
    selectedZ: state.selected?.z ?? -1,
    selectedN: state.selected?.n ?? -1,
  });
}

/** 검색한 원소 행·동중성자핵 열의 경계 상자 (03 §5.4) */
function drawLineHighlight(
  f: Frame,
  h: { type: 'row'; z: number } | { type: 'column'; n: number },
) {
  const { ctx, index, theme } = f;
  let minN: number;
  let maxN: number;
  let minZ: number;
  let maxZ: number;
  if (h.type === 'row') {
    const row = index.rows.get(h.z);
    if (!row) return;
    [minN, maxN, minZ, maxZ] = [row.nMin, row.nMax, h.z, h.z];
  } else {
    const column = index.nuclides.filter((n) => n.n === h.n);
    if (!column.length) return;
    minN = maxN = h.n;
    minZ = Math.min(...column.map((n) => n.z));
    maxZ = Math.max(...column.map((n) => n.z));
  }
  const x0 = screenX(f, minN);
  const x1 = screenX(f, maxN + 1);
  const y0 = screenY(f, maxZ + 1);
  const y1 = screenY(f, minZ);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
}

/** 선택: 1px 띄운 2px 바깥 링 + 1px 안쪽 링 + 강조색 그림자 (03 §5.4) */
function drawSelection(f: Frame, n: Nuclide) {
  const { ctx, theme } = f;
  const r = cellRect(f, n.n, n.z, rect);
  ctx.save();
  ctx.shadowColor = rgba(theme.accent, 0.5);
  ctx.shadowBlur = 12;
  ctx.strokeStyle = theme.selOuter;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  ctx.restore();
  ctx.strokeStyle = theme.selInner;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
}

/** 선택 칸 중심 → 딸핵 칸 중심 (03 §6.3) */
function drawArrows(f: Frame, n: Nuclide, text: TextCache) {
  const { ctx, camera, index, theme } = f;
  const s = camera.s;
  const width = Math.max(1.5, 0.04 * s);
  const head = Math.max(6, 0.18 * s);
  const lod = getLod(s);
  const xc = screenX(f, n.n + 0.5);
  const yc = screenY(f, n.z + 0.5);
  text.reset(ctx);
  for (const branch of arrowBranches(n)) {
    const dn = n.n + branch.daughter!.dn;
    const dz = n.z + branch.daughter!.dz;
    const inData =
      dn >= 0 && dz >= 0 && dn < index.gridWidth && dz < index.gridHeight
        ? index.grid[dz * index.gridWidth + dn]! >= 0
        : false;
    const x1c = screenX(f, dn + 0.5);
    const y1c = screenY(f, dz + 0.5);
    const length = Math.hypot(x1c - xc, y1c - yc);
    if (length < head * 1.5) continue;
    const ux = (x1c - xc) / length;
    const uy = (y1c - yc) / length;
    // 칸에 글자가 있으면(LOD ≥ 1) 선택 칸의 가장자리에서 출발해 글자를 가리지 않는다.
    const exit = lod >= 1 ? (0.5 * s) / Math.max(Math.abs(ux), Math.abs(uy)) : 0;
    const x0 = xc + ux * exit;
    const y0 = yc + uy * exit;
    // 화살촉 끝은 딸핵 칸 안쪽, 중심 글자를 가리지 않게 조금 앞에서 멈춘다.
    const tip = Math.min(0.3 * s, length / 3);
    const x1 = x1c - ux * tip;
    const y1 = y1c - uy * tip;
    const color = decayFill(branch.cat, theme);
    // 점선은 미관측 붕괴(` ?`)만. 관측됐지만 세기 미상(`=?`)은 실선이다.
    const dashed = branch.rel === '?' || !inData;

    if (!inData) {
      const r = cellRect(f, dn, dz, rect);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = theme.textMuted;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    // 같은 색 칸 위에서도 보이도록 테두리를 먼저 긋는다.
    for (const pass of [0, 1]) {
      ctx.setLineDash(dashed && pass === 1 ? [Math.max(4, width * 3), Math.max(3, width * 2)] : []);
      ctx.strokeStyle = pass === 0 ? rgba(theme.surfaceSolid, 0.85) : color;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = pass === 0 ? width + 2.5 : width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 - ux * head * 0.8, y1 - uy * head * 0.8);
      ctx.stroke();
      ctx.setLineDash([]);
      const spread = head * 0.45;
      const grow = pass === 0 ? 1.25 : 0;
      ctx.beginPath();
      ctx.moveTo(x1 + ux * grow, y1 + uy * grow);
      ctx.lineTo(x1 - ux * head - uy * (spread + grow), y1 - uy * head + ux * (spread + grow));
      ctx.lineTo(x1 - ux * head + uy * (spread + grow), y1 - uy * head - ux * (spread + grow));
      ctx.closePath();
      ctx.fill();
    }

    // LOD 2 이상: 화살표 가운데에 분기비 알약
    if (lod >= 2) {
      const label = formatBranchShort(branch);
      const font = text.font(12 * f.textScale, 600);
      const w = text.measure(ctx, font, label) + 12;
      const h = 12 * f.textScale + 8;
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      ctx.fillStyle = theme.surfaceSolid;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(mx - w / 2, my - h / 2, w, h, h / 2);
      ctx.fill();
      ctx.stroke();
      text.use(ctx, font);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      text.fill(ctx, label, mx, my);
      ctx.textBaseline = 'alphabetic';
    }
  }
  ctx.setLineDash([]);
}
