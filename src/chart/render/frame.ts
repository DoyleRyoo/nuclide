import type { NuclideIndex } from '../../data/types';
import type { ThemeTokens } from '../../theme/tokens';
import type { ColorTable } from '../colorModes';
import type { Camera, Highlight, Viewport } from '../types';

/** 한 프레임을 그리는 데 필요한 상태. 렌더 함수는 이 값만 읽는다. */
export interface Frame {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  viewport: Viewport;
  theme: ThemeTokens;
  index: NuclideIndex;
  colors: ColorTable;
  showPredicted: boolean;
  highlight: Highlight | null;
  /** 좁은 화면 (눈금자 크기) */
  compact: boolean;
}

/** 월드 x(= N) → 화면 x */
export const screenX = (f: Frame, x: number) =>
  (x - f.camera.cx) * f.camera.s + f.viewport.width / 2;
/** 월드 y(= Z) → 화면 y */
export const screenY = (f: Frame, y: number) =>
  f.viewport.height / 2 - (y - f.camera.cy) * f.camera.s;

/** 보이는 칸 범위를 데이터 경계와 교차한다 (05 §4.3 컬링). */
export function visibleCells(f: Frame) {
  const { camera: c, viewport: v, index } = f;
  const halfW = v.width / 2 / c.s;
  const halfH = v.height / 2 / c.s;
  return {
    n0: Math.max(index.bounds.nMin, Math.floor(c.cx - halfW)),
    n1: Math.min(index.bounds.nMax, Math.floor(c.cx + halfW)),
    z0: Math.max(index.bounds.zMin, Math.floor(c.cy - halfH)),
    z1: Math.min(index.bounds.zMax, Math.floor(c.cy + halfH)),
  };
}

/** 칸 사이 간격·모서리 (03 §5.1) */
export function cellStyle(s: number): { gap: number; radius: number; snap: boolean } {
  if (s < 6) return { gap: 0, radius: 0, snap: s >= 8 };
  if (s < 32) return { gap: 1, radius: 0, snap: s >= 8 };
  return { gap: Math.min(4, Math.round(0.04 * s)), radius: Math.min(0.06 * s, 6), snap: true };
}

/**
 * 칸 (n, z)의 화면 사각형. s ≥ 8이면 경계를 기기 픽셀에 맞춘다.
 * 결과는 재사용 객체에 쓴다 (프레임 안에서 객체를 만들지 않는다).
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function cellRect(f: Frame, n: number, z: number, out: Rect): Rect {
  const { gap, snap } = cellStyle(f.camera.s);
  let x0 = screenX(f, n);
  let x1 = screenX(f, n + 1);
  let y0 = screenY(f, z + 1);
  let y1 = screenY(f, z);
  if (snap) {
    x0 = Math.round(x0);
    x1 = Math.round(x1);
    y0 = Math.round(y0);
    y1 = Math.round(y1);
  }
  const half = gap / 2;
  out.x = x0 + half;
  out.y = y0 + half;
  out.w = Math.max(0.5, x1 - x0 - gap);
  out.h = Math.max(0.5, y1 - y0 - gap);
  return out;
}
