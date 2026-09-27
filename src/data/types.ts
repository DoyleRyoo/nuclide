/** 원문 문자열을 보존하는 측정값. 계산용 값과 표시용 문자열을 분리한다. */
export interface Measured {
  v: string;
  u?: string;
  est?: true;
  rel?: '<' | '>' | '~';
}

export type DecayCategory =
  | 'stable'
  | 'beta-'
  | 'beta+'
  | 'alpha'
  | 'sf'
  | 'p'
  | 'n'
  | 'it'
  | 'cluster'
  | 'other'
  | 'unknown';

export interface DecayBranch {
  mode: string;
  cat: DecayCategory;
  rel: '=' | '~' | '<' | '>' | '?';
  value?: string;
  unc?: string;
  est?: true;
  pct?: number;
  daughter?: { dz: number; dn: number };
  note?: string;
}

export interface HalfLife {
  kind: 'value' | 'stable' | 'unknown' | 'particle-unbound';
  value?: string;
  unit?: string;
  unc?: string;
  est?: true;
  rel?: '<' | '>' | '~';
  seconds?: number;
}

export interface NuclearState {
  id: string;
  level: number;
  exc?: Measured;
  massExcess?: Measured;
  halfLife: HalfLife;
  jpi?: string;
  decays: DecayBranch[];
  abundance?: Measured;
  discovery?: number;
  orderUncertain?: true;
  orderInverted?: true;
  /** 들뜬 에너지 칸이 `non-exist`: 보고됐지만 평가에서 존재하지 않는다고 본 상태 */
  nonExistent?: true;
}

export interface Nuclide extends NuclearState {
  z: number;
  n: number;
  a: number;
  symbol: string;
  primary: DecayCategory;
  observed: boolean;
  naturalRadioactive: boolean;
  excited: NuclearState[];
  ame?: {
    bindingPerA?: Measured;
    atomicMass?: Measured;
    qBetaMinus?: Measured;
    qEC?: Measured;
    qAlpha?: Measured;
    q2BetaMinus?: Measured;
    qECp?: Measured;
    qBetaMinusN?: Measured;
    sn?: Measured;
    sp?: Measured;
    s2n?: Measured;
    s2p?: Measured;
  };
}

export interface NuclideDataset {
  schemaVersion: 1;
  meta: {
    sources: { name: string; file: string; sha256: string }[];
    counts: Record<string, number>;
    bounds: { zMin: number; zMax: number; nMin: number; nMax: number };
  };
  nuclides: Nuclide[];
}

/*
 * 저장 형식 (src/data/generated/*.json). 원본에서 온 값만 담고, 표로 계산할 수 있는 값
 * (ID, N, 원소 기호, 초 단위 반감기, 붕괴 범주·딸핵·수치, 주 모드, 표식)은 hydrate.ts가 채운다.
 * 빌드 검증도 hydrate 결과에 대해 돌므로 앱이 보는 모델과 검증한 모델이 같다.
 */
export type StoredBranch = Pick<DecayBranch, 'mode' | 'rel' | 'value' | 'unc' | 'est' | 'note'>;
export type StoredHalfLife = Omit<HalfLife, 'seconds'>;

export interface StoredState {
  /** 들뜬 상태만 (1–6). 기저 상태는 생략 = 0 */
  level?: number;
  exc?: Measured;
  massExcess?: Measured;
  halfLife: StoredHalfLife;
  jpi?: string;
  decays: StoredBranch[];
  abundance?: Measured;
  discovery?: number;
  orderUncertain?: true;
  orderInverted?: true;
  nonExistent?: true;
}

export interface StoredNuclide extends StoredState {
  z: number;
  a: number;
  /** AME 핵자당 결합에너지. 색상 모드에 필요해 핵심 청크에 둔다. */
  bindingPerA?: Measured;
  excited?: StoredState[];
}

/** generated/nuclides.json: 시작할 때 불러오는 핵심 청크 */
export interface StoredDataset {
  schemaVersion: 1;
  meta: NuclideDataset['meta'];
  nuclides: StoredNuclide[];
}

/** QEC는 이웃 핵종의 Qβ−로 계산하므로 저장하지 않는다 (04 §6.3). */
export const AME_DETAIL_FIELDS = [
  'atomicMass',
  'qBetaMinus',
  'qAlpha',
  'q2BetaMinus',
  'qECp',
  'qBetaMinusN',
  'sn',
  'sp',
  's2n',
  's2p',
] as const;
export type AmeDetailField = (typeof AME_DETAIL_FIELDS)[number];

/**
 * generated/ame.json: 첫 차트 뒤에 불러오는 AME 상세 청크.
 * rows[i]는 nuclides.json의 i번째 핵종, 값은 `fields` 순서의 Measured 압축 문자열
 * (`"v u"`, 추정값은 `"v# u"`, 값 없음 = null).
 */
export interface AmeDetailFile {
  schemaVersion: 1;
  fields: AmeDetailField[];
  rows: (string | null)[][];
}

export interface NuclideIndex {
  dataset: NuclideDataset;
  nuclides: Nuclide[];
  /** grid[z * gridWidth + n], 비어 있는 좌표는 -1. */
  grid: Int16Array;
  gridWidth: number;
  gridHeight: number;
  byId: Map<string, Nuclide>;
  statesById: Map<string, { nuclide: Nuclide; state: NuclearState }>;
  rows: Map<number, { nMin: number; nMax: number }>;
  counts: Record<DecayCategory, number>;
  bounds: NuclideDataset['meta']['bounds'];
  searchEntries: { nuclide: Nuclide; text: string }[];
  labels: Map<string, { halfLife: string; decay: string }>;
}
