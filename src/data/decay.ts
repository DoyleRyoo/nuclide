import type { DecayBranch, DecayCategory } from './types';

interface ModeInfo {
  cat: DecayCategory;
  /** 딸핵 변위 (ΔZ, ΔN). 핵분열·다중 클러스터는 없음. */
  d?: [dz: number, dn: number];
}

/**
 * NUBASE2020에 나오는 붕괴 토큰 전부 (04 §5.2). 빌드 스크립트는 여기 없는 토큰을 만나면 실패한다.
 * 빌드와 앱(hydrate)이 같은 표를 쓴다.
 */
export const DECAY_MODES: Record<string, ModeInfo> = {
  'B-': { cat: 'beta-', d: [1, -1] },
  '2B-': { cat: 'beta-', d: [2, -2] },
  'B-n': { cat: 'beta-', d: [1, -2] },
  'B-2n': { cat: 'beta-', d: [1, -3] },
  'B-3n': { cat: 'beta-', d: [1, -4] },
  'B-4n': { cat: 'beta-', d: [1, -5] },
  'B-p': { cat: 'beta-', d: [0, -1] },
  'B-d': { cat: 'beta-', d: [0, -2] },
  'B-t': { cat: 'beta-', d: [0, -3] },
  'B-A': { cat: 'beta-', d: [-1, -3] },
  'B-SF': { cat: 'beta-' },
  // 원본의 126Pd p 상태(`B=72 8;IT=28 8`)에만 나온다. 중성자 과잉 핵이므로 β−로 읽는다 (04 §13).
  // 다른 상태에 나오면 빌드 검증이 실패한다.
  B: { cat: 'beta-', d: [1, -1] },
  'B+': { cat: 'beta+', d: [-1, 1] },
  EC: { cat: 'beta+', d: [-1, 1] },
  'e+': { cat: 'beta+', d: [-1, 1] },
  'EC+B+': { cat: 'beta+', d: [-1, 1] },
  '2B+': { cat: 'beta+', d: [-2, 2] },
  'B+p': { cat: 'beta+', d: [-2, 1] },
  'B+2p': { cat: 'beta+', d: [-3, 1] },
  'B+3p': { cat: 'beta+', d: [-4, 1] },
  'B+A': { cat: 'beta+', d: [-3, -1] },
  'B+pA': { cat: 'beta+', d: [-4, -1] },
  'B+SF': { cat: 'beta+' },
  A: { cat: 'alpha', d: [-2, -2] },
  SF: { cat: 'sf' },
  p: { cat: 'p', d: [-1, 0] },
  '2p': { cat: 'p', d: [-2, 0] },
  '3p': { cat: 'p', d: [-3, 0] },
  n: { cat: 'n', d: [0, -1] },
  '2n': { cat: 'n', d: [0, -2] },
  '3n': { cat: 'n', d: [0, -3] },
  IT: { cat: 'it', d: [0, 0] },
  '12C': { cat: 'cluster', d: [-6, -6] },
  '14C': { cat: 'cluster', d: [-6, -8] },
  '18O': { cat: 'cluster', d: [-8, -10] },
  '20O': { cat: 'cluster', d: [-8, -12] },
  '20Ne': { cat: 'cluster', d: [-10, -10] },
  '22Ne': { cat: 'cluster', d: [-10, -12] },
  '23F': { cat: 'cluster', d: [-9, -14] },
  '24Ne': { cat: 'cluster', d: [-10, -14] },
  '25Ne': { cat: 'cluster', d: [-10, -15] },
  '28Mg': { cat: 'cluster', d: [-12, -16] },
  '30Mg': { cat: 'cluster', d: [-12, -18] },
  '32Si': { cat: 'cluster', d: [-14, -18] },
  '34Si': { cat: 'cluster', d: [-14, -20] },
  '24Ne+26Ne': { cat: 'cluster' },
  '28Mg+30Mg': { cat: 'cluster' },
  // IAS 행에만 나온다. IAS는 앱에서 제외하지만 표에는 남겨 둔다.
  d: { cat: 'other' },
  '3H': { cat: 'other' },
  '3He': { cat: 'other' },
};

const YEAR = 31_556_926; // 365.2422 d

/** 원본에 나오는 반감기 단위 21종 → 초 (04 §4.4). */
export const UNIT_SECONDS: Record<string, number> = {
  ys: 1e-24,
  zs: 1e-21,
  as: 1e-18,
  fs: 1e-15,
  ps: 1e-12,
  ns: 1e-9,
  us: 1e-6,
  ms: 1e-3,
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400,
  y: YEAR,
  ky: YEAR * 1e3,
  My: YEAR * 1e6,
  Gy: YEAR * 1e9,
  Ty: YEAR * 1e12,
  Py: YEAR * 1e15,
  Ey: YEAR * 1e18,
  Zy: YEAR * 1e21,
  Yy: YEAR * 1e24,
};

/** 주 붕괴 모드 판정 (04 §5.3). */
export function primaryCategory(stable: boolean, decays: DecayBranch[]): DecayCategory {
  if (stable) return 'stable';
  let best: DecayBranch | undefined;
  for (const branch of decays) {
    if (branch.rel === '<' || branch.pct === undefined || branch.pct < 50) continue;
    if (!best || branch.pct > best.pct!) best = branch;
  }
  return (best ?? decays[0])?.cat ?? 'unknown';
}
