/**
 * 상태별 안정성 4단계와 들뜬 상태 종류. 반감기 길이로 자르지 않고 원문 플래그로 판정한다
 * (docs/conformity_inspection.md 공통 B '안정 기준', 4차 검증 03·02).
 */
import { UNIT_SECONDS } from './decay';
import type { DecayBranch, Measured, NuclearState, Nuclide, NuclideIndex } from './types';

/**
 * stable                 붕괴 관측 없음, NUBASE에 붕괴 모드도 하한도 없음 (¹²C)
 * observationally-stable 붕괴 관측 없음, 하한(`>`)이나 미관측 모드(` ?`)가 있음 (²⁰⁸Pb, ¹⁸⁰ᵐTa)
 * natural-radioactive    붕괴 관측 + 자연 존재비 있음 (⁴⁰K, ²³⁸U, ²⁰⁹Bi)
 * radioactive            그 밖
 */
export type StabilityClass =
  'stable' | 'observationally-stable' | 'natural-radioactive' | 'radioactive';

/**
 * 들뜬 상태 종류. NUBASE2020 §2.2는 반감기 100 ns 이상을 이성질체로 수록하지만, 원문에는
 * 그보다 짧은 준위와 반감기가 없는 준위(AME용 p·q 준위 등)도 함께 있다.
 */
export type LevelKind = 'isomer' | 'short' | 'unknown' | 'non-existent';

/** NUBASE2020의 이성질체 수록 기준 (§2.2) */
export const ISOMER_MIN_SECONDS = 100e-9;

export function stabilityOf(s: NuclearState): StabilityClass {
  if (s.halfLife.kind === 'stable') {
    const lowerLimit = s.halfLife.unc?.startsWith('>');
    return lowerLimit || s.decays.some((d) => d.rel === '?') ? 'observationally-stable' : 'stable';
  }
  return s.abundance ? 'natural-radioactive' : 'radioactive';
}

/**
 * 문턱 비교에 쓰는 반감기(초): 안정은 무한대, 측정·추정·근삿값·하한은 그 값,
 * 상한(`<`)만 있거나 값이 없으면 undefined.
 */
export function lifetimeSeconds(s: NuclearState): number | undefined {
  if (s.halfLife.kind === 'stable') return Infinity;
  if (s.halfLife.rel === '<') return undefined;
  return s.halfLife.seconds;
}

/** 값 없이 상한만 있는 반감기 (`< 26 ns`)를 초로 */
function upperLimitSeconds(s: NuclearState): number | undefined {
  if (s.halfLife.rel === '<') return s.halfLife.seconds;
  const match = /^<\s*([\d.]+)\s*([A-Za-z]+)$/.exec(s.halfLife.unc ?? '');
  const factor = match && UNIT_SECONDS[match[2]!];
  return factor ? Number(match[1]) * factor : undefined;
}

export function levelKindOf(s: NuclearState): LevelKind {
  if (s.nonExistent) return 'non-existent';
  const seconds = lifetimeSeconds(s);
  if (seconds !== undefined) return seconds >= ISOMER_MIN_SECONDS ? 'isomer' : 'short';
  const limit = upperLimitSeconds(s);
  if (limit !== undefined && limit < ISOMER_MIN_SECONDS) return 'short';
  return 'unknown';
}

/**
 * 지도 이성질체 표식 문턱 (4차 검증 02). 기본 1 s: 표식 핵종이 1,424 → 585개로 줄고
 * ⁹⁹ᵐTc·¹³⁷ᵐBa·⁶⁰ᵐCo·²³⁴ᵐPa·¹⁷⁸ᵐ²Hf·²⁴²ᵐAm 같은 교육 사례는 모두 남는다.
 * 100 ns는 NUBASE2020의 수록 기준과 같다.
 */
export const ISOMER_MARKER_THRESHOLDS = [
  { seconds: 100e-9, label: '100 ns' },
  { seconds: 1e-6, label: '1 μs' },
  { seconds: 1e-3, label: '1 ms' },
  { seconds: 1, label: '1 s' },
  { seconds: 60, label: '1 min' },
] as const;
export const DEFAULT_ISOMER_MARKER_SECONDS = 1;

export const isomerThresholdLabel = (seconds: number) =>
  ISOMER_MARKER_THRESHOLDS.find((t) => t.seconds === seconds)?.label ?? `${seconds} s`;

/** 지도 삼각형: 반감기가 문턱 이상인 들뜬 상태가 있으면 1, 그 상태가 안정 계열이면 2 */
export function isomerMarker(n: Nuclide, thresholdSeconds: number): 0 | 1 | 2 {
  let marker: 0 | 1 | 2 = 0;
  for (const s of n.excited) {
    if (s.nonExistent || (lifetimeSeconds(s) ?? 0) < thresholdSeconds) continue;
    if (s.halfLife.kind === 'stable') return 2;
    marker = 1;
  }
  return marker;
}

const EARTH_AGE_SECONDS = 4.54e9 * UNIT_SECONDS.y!;

/**
 * 자연 존재 방사성이지만 지구가 생길 때부터 남은 것일 수 없는 상태: 그 뒤 남은 비율
 * 2^−(지구 나이/T½)이 10⁻¹²보다 작다 (T½ < 약 1.1억 년). ²³⁰Th·²³¹Pa·²³⁴U처럼 붕괴 계열에서
 * 계속 생긴다. 32개 원시 핵종 중 가장 짧은 ²³⁵U(7억 년)와는 충분히 떨어져 있다.
 */
export function isReplenished(s: NuclearState): boolean {
  const seconds = s.halfLife.seconds;
  return (
    s.stability === 'natural-radioactive' &&
    seconds !== undefined &&
    2 ** -(EARTH_AGE_SECONDS / seconds) < 1e-12
  );
}

export interface AllowedDecay {
  mode: 'A' | 'B-' | 'EC' | '2B-' | '2EC';
  q: Measured;
}

/** Q가 측정값이고 3σ로 양수인지 */
function positive(q: Measured | undefined): q is Measured {
  if (!q || q.est) return false;
  return Number(q.v) - 3 * Number(q.u ?? 0) > 0;
}

/** Q 부호 반전: QEC(Z, A) = −Qβ−(Z−1, A), Q2EC(Z, A) = −Q2β−(Z−2, A) (04 §6.3) */
export function negate(m: Measured): Measured {
  const v = m.v.startsWith('-') ? m.v.slice(1) : /^[0.]+$/.test(m.v) ? m.v : `-${m.v}`;
  return { ...m, v };
}

/** 그 붕괴가 NUBASE 목록에 이미 있는지. NUBASE의 B+는 EC 포함, 2B+는 2EC 포함이다. */
const LISTED: Record<AllowedDecay['mode'], (d: DecayBranch) => boolean> = {
  A: (d) => d.mode === 'A',
  'B-': (d) => d.mode === 'B-',
  EC: (d) => ['B+', 'EC', 'e+', 'EC+B+'].includes(d.mode),
  '2B-': (d) => d.mode === '2B-',
  '2EC': (d) => d.mode === '2B+',
};

/**
 * 안정 계열 기저 상태에 대해 AME2020 Q값으로는 에너지상 가능하지만 NUBASE2020 붕괴 목록에 없는
 * 붕괴. 4차 검증 03: ¹⁹⁷Au 등 36개가 α만 해당한다. 핵분열·클러스터·양성자 방출 같은 이론상
 * 붕괴는 세지 않는다 (공통 B '양성자 붕괴 같은 이론상 붕괴는 무시').
 * AME 상세 청크를 불러온 뒤에만 값이 있다.
 */
export function allowedUnlistedDecays(index: NuclideIndex, n: Nuclide): AllowedDecay[] {
  if (n.halfLife.kind !== 'stable' || !n.ame) return [];
  const at = (z: number) => {
    const dn = n.a - z;
    if (z < 0 || dn < 0 || z >= index.gridHeight || dn >= index.gridWidth) return undefined;
    const i = index.grid[z * index.gridWidth + dn]!;
    return i >= 0 ? index.nuclides[i] : undefined;
  };
  const q2EC = at(n.z - 2)?.ame?.q2BetaMinus;
  const candidates: [AllowedDecay['mode'], Measured | undefined][] = [
    ['A', n.ame.qAlpha],
    ['B-', n.ame.qBetaMinus],
    ['EC', n.ame.qEC],
    ['2B-', n.ame.q2BetaMinus],
    ['2EC', q2EC && negate(q2EC)],
  ];
  return candidates.flatMap(([mode, q]) =>
    positive(q) && !n.decays.some(LISTED[mode]) ? [{ mode, q }] : [],
  );
}
