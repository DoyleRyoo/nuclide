/**
 * 연속 색상 스케일 (03 §4). matplotlib의 viridis·plasma를 6차 다항식으로 근사한 식
 * (Matt Zucker, CC0)으로 계산한다. 256단계 LUT와의 차이는 채널당 약 1/255 이하다.
 */
type Coefficients = readonly (readonly [number, number, number])[];

const VIRIDIS: Coefficients = [
  [0.2777273272234177, 0.005407344544966578, 0.3340998053353061],
  [0.1050930431085774, 1.404613529898575, 1.384590162594685],
  [-0.3308618287255563, 0.214847559468213, 0.09509516302823659],
  [-4.634230498983486, -5.799100973351585, -19.33244095627987],
  [6.228269936347081, 14.17993336680509, 56.69055260068105],
  [4.776384997670288, -13.74514537774601, -65.35303263337234],
  [-5.435455855934631, 4.645852612178535, 26.3124352495832],
];

const PLASMA: Coefficients = [
  [0.05873234392399702, 0.02333670892565664, 0.5433401826748754],
  [2.176514634195958, 0.2383834171260182, 0.7539604599784036],
  [-2.689460476458034, -7.455851135738909, 3.110799939717086],
  [6.130348345893603, 42.3461881477227, -28.51885465332158],
  [-11.10743619062271, -82.66631109428045, 60.13984767418263],
  [10.02306557647065, 71.41361770095349, -54.07218655560067],
  [-3.658713842777788, -22.93153465461149, 18.19190778539828],
];

export type Rgb = [number, number, number];

function evaluate(c: Coefficients, t: number): Rgb {
  const x = Math.max(0, Math.min(1, t));
  return [0, 1, 2].map((k) => {
    let v = 0;
    for (let i = c.length - 1; i >= 0; i--) v = v * x + c[i]![k]!;
    return Math.round(Math.max(0, Math.min(1, v)) * 255);
  }) as Rgb;
}

export const viridis = (t: number): Rgb => evaluate(VIRIDIS, t);
export const plasma = (t: number): Rgb => evaluate(PLASMA, t);

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex: string): Rgb {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 상대 휘도 */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_TEXT: Rgb = [0x11, 0x18, 0x27];
const LIGHT_TEXT: Rgb = [0xff, 0xff, 0xff];

/** 칸 글자색: #111827과 #FFFFFF 중 대비가 큰 쪽 (03 §4) */
export function textOn(fill: Rgb): string {
  return contrast(fill, DARK_TEXT) >= contrast(fill, LIGHT_TEXT) ? '#111827' : '#FFFFFF';
}
