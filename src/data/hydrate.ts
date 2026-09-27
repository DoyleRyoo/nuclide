import { DECAY_MODES, UNIT_SECONDS, primaryCategory } from './decay';
import { elements } from './elements';
import type {
  AmeDetailFile,
  DecayBranch,
  HalfLife,
  Measured,
  NuclearState,
  Nuclide,
  NuclideDataset,
  StoredBranch,
  StoredDataset,
  StoredHalfLife,
  StoredState,
} from './types';

/** "U-235", "Tc-99m", "Hf-178m2" */
export function stateId(symbol: string, a: number, level: number): string {
  return `${symbol}-${a}${level === 0 ? '' : level === 1 ? 'm' : `m${level}`}`;
}

/** Measured ↔ AME 상세 청크의 압축 문자열 (`"v u"`, 추정값 `"v# u"`) */
export function encodeMeasured(m: Measured | undefined): string | null {
  if (!m) return null;
  return `${m.v}${m.est ? '#' : ''}${m.u !== undefined ? ` ${m.u}` : ''}`;
}

export function decodeMeasured(s: string | null | undefined): Measured | undefined {
  if (!s) return undefined;
  const [value = '', u] = s.split(' ');
  const est = value.endsWith('#');
  const m: Measured = { v: est ? value.slice(0, -1) : value };
  if (u !== undefined) m.u = u;
  if (est) m.est = true;
  return m;
}

function hydrateBranch(stored: StoredBranch): DecayBranch {
  const info = DECAY_MODES[stored.mode];
  const branch: DecayBranch = { ...stored, cat: info?.cat ?? 'other' };
  if (stored.value !== undefined) branch.pct = Number(stored.value);
  if (info?.d) branch.daughter = { dz: info.d[0], dn: info.d[1] };
  return branch;
}

function hydrateHalfLife(stored: StoredHalfLife): HalfLife {
  const factor = stored.unit === undefined ? undefined : UNIT_SECONDS[stored.unit];
  if (stored.kind !== 'value' || stored.value === undefined || factor === undefined) {
    return { ...stored };
  }
  return { ...stored, seconds: Number(stored.value) * factor };
}

function hydrateState(stored: StoredState, symbol: string, a: number): NuclearState {
  const level = stored.level ?? 0;
  return {
    ...stored,
    id: stateId(symbol, a, level),
    level,
    halfLife: hydrateHalfLife(stored.halfLife),
    decays: stored.decays.map(hydrateBranch),
  };
}

/** 저장 형식 → 앱 모델 (04 §7). */
export function hydrate(stored: StoredDataset): NuclideDataset {
  const nuclides = stored.nuclides.map(({ z, a, bindingPerA, excited = [], ...groundStored }) => {
    const symbol = elements[z]?.symbol ?? `Z${z}`;
    const ground = hydrateState(groundStored, symbol, a);
    const states = excited.map((s) => hydrateState(s, symbol, a));
    const stable = ground.halfLife.kind === 'stable';
    const nuclide: Nuclide = {
      ...ground,
      z,
      n: a - z,
      a,
      symbol,
      primary: primaryCategory(stable, ground.decays),
      observed: ground.discovery !== undefined,
      // 기저 또는 들뜬 상태에 자연 존재비가 있고 기저 상태가 안정이 아님 (03 §5.3)
      naturalRadioactive: !stable && (!!ground.abundance || states.some((s) => !!s.abundance)),
      excited: states,
    };
    if (bindingPerA) nuclide.ame = { bindingPerA };
    return nuclide;
  });
  return { schemaVersion: stored.schemaVersion, meta: stored.meta, nuclides };
}

function negate(m: Measured): Measured {
  const v = m.v.startsWith('-') ? m.v.slice(1) : /^[0.]+$/.test(m.v) ? m.v : `-${m.v}`;
  return { ...m, v };
}

/** AME 상세 청크를 핵종에 붙이고 QEC(Z, A) = −Qβ−(Z−1, A)를 계산한다 (04 §6.3). */
export function applyAmeDetails(nuclides: Nuclide[], file: AmeDetailFile): void {
  if (file.rows.length !== nuclides.length) {
    throw new Error(`AME 상세 행 수 ${file.rows.length}이 핵종 수 ${nuclides.length}와 다름`);
  }
  nuclides.forEach((nuclide, i) => {
    const row = file.rows[i]!;
    const ame = (nuclide.ame ??= {});
    file.fields.forEach((field, k) => {
      const m = decodeMeasured(row[k]);
      if (m) ame[field] = m;
    });
  });
  const byZA = new Map(nuclides.map((n) => [`${n.z}:${n.a}`, n]));
  for (const nuclide of nuclides) {
    const qBetaMinus = byZA.get(`${nuclide.z - 1}:${nuclide.a}`)?.ame?.qBetaMinus;
    if (qBetaMinus) nuclide.ame!.qEC = negate(qBetaMinus);
  }
}
