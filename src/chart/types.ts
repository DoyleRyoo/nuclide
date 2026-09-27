export interface Camera {
  cx: number;
  cy: number;
  s: number;
}
export interface ScreenPoint {
  x: number;
  y: number;
}
export interface WorldPoint {
  x: number;
  y: number;
}
/** 포함하는 셀 인덱스의 최솟값/최댓값. */
export interface WorldRect {
  minN: number;
  maxN: number;
  minZ: number;
  maxZ: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface Viewport {
  width: number;
  height: number;
}
export type ColorMode = 'decay' | 'halflife' | 'binding' | 'year' | 'abundance';
export type Lod = 0 | 1 | 2 | 3;
export type Highlight =
  { type: 'decay'; category: string } | { type: 'row'; z: number } | { type: 'column'; n: number };
export type Hover = { id: string; x: number; y: number } | null;
export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
