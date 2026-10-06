/**
 * 데이터 청크를 동적 import로 불러와 실행용 색인을 만든다 (04 §7, 05 §6).
 *   nuclides.json — 핵심 청크. 차트를 그리기 전에 필요하다.
 *   ame.json      — AME 상세 청크. 첫 차트 뒤에 불러와 패널의 질량·에너지 값을 채운다.
 */
import {
  formatAbundanceShort,
  formatBranchShort,
  decayModeLabel,
  formatHalfLifeShort,
} from './format';
import { applyAmeDetails, hydrate } from './hydrate';
import { searchText } from './search';
import type {
  AmeDetailFile,
  DecayCategory,
  NuclearState,
  Nuclide,
  NuclideDataset,
  NuclideIndex,
  StoredDataset,
} from './types';

const CATEGORIES: DecayCategory[] = [
  'stable',
  'beta-',
  'beta+',
  'alpha',
  'sf',
  'p',
  'n',
  'it',
  'cluster',
  'other',
  'unknown',
];

/** 칸에 그릴 짧은 문자열 (03 §5.2): 반감기(안정 칸은 자연 존재비), 붕괴 모드 최대 2줄 */
function cellLabels(n: Nuclide): { halfLife: string; decay: string } {
  const halfLife =
    n.halfLife.kind === 'stable'
      ? n.abundance
        ? formatAbundanceShort(n.abundance)
        : ''
      : formatHalfLifeShort(n.halfLife);
  const decay = n.decays
    .slice(0, 2)
    .map((b) => `${decayModeLabel(b.mode)} ${formatBranchShort(b)}`)
    .join('\n');
  return { halfLife, decay };
}

export function buildIndex(dataset: NuclideDataset): NuclideIndex {
  const { nuclides } = dataset;
  const { bounds } = dataset.meta;
  const gridWidth = bounds.nMax + 1;
  const gridHeight = bounds.zMax + 1;
  const grid = new Int16Array(gridWidth * gridHeight).fill(-1);
  const byId = new Map<string, Nuclide>();
  const statesById = new Map<string, { nuclide: Nuclide; state: NuclearState }>();
  const rows = new Map<number, { nMin: number; nMax: number }>();
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<DecayCategory, number>;
  const labels = new Map<string, { halfLife: string; decay: string }>();
  const searchEntries: NuclideIndex['searchEntries'] = [];

  nuclides.forEach((nuclide, i) => {
    grid[nuclide.z * gridWidth + nuclide.n] = i;
    byId.set(nuclide.id, nuclide);
    statesById.set(nuclide.id, { nuclide, state: nuclide });
    for (const state of nuclide.excited) statesById.set(state.id, { nuclide, state });
    const row = rows.get(nuclide.z);
    if (row) {
      row.nMin = Math.min(row.nMin, nuclide.n);
      row.nMax = Math.max(row.nMax, nuclide.n);
    } else {
      rows.set(nuclide.z, { nMin: nuclide.n, nMax: nuclide.n });
    }
    counts[nuclide.primary]++;
    labels.set(nuclide.id, cellLabels(nuclide));
    searchEntries.push({ nuclide, text: searchText(nuclide) });
  });

  return {
    dataset,
    nuclides,
    grid,
    gridWidth,
    gridHeight,
    byId,
    statesById,
    rows,
    counts,
    bounds,
    searchEntries,
    labels,
  };
}

/**
 * 핵심 청크를 받아 색인을 만든다. 시간은 performance 항목으로 남긴다 (05 §8):
 *   data:load  — 청크 받기
 *   data:parse — JSON.parse
 *   data:index — hydrate + 색인 (예산 50 ms = 파싱 + 색인)
 *
 * JSON은 `?raw` 문자열로 받아 직접 JSON.parse한다. 그냥 import하면 Vite 8이 1 MB가 넘는
 * JS 객체 리터럴로 내보내는데, JS 파서가 그것을 읽는 데 JSON.parse보다 몇 배 오래 걸린다.
 */
export async function loadNuclides(): Promise<NuclideIndex> {
  performance.mark('data:start');
  const { default: text } = await import('./generated/nuclides.json?raw');
  performance.mark('data:loaded');
  const stored = JSON.parse(text) as StoredDataset;
  performance.mark('data:parsed');
  const index = buildIndex(hydrate(stored));
  performance.mark('data:indexed');
  performance.measure('data:load', 'data:start', 'data:loaded');
  performance.measure('data:parse', 'data:loaded', 'data:parsed');
  performance.measure('data:index', 'data:parsed', 'data:indexed');
  return index;
}

const ameLoads = new WeakMap<NuclideIndex, Promise<void>>();

/** AME 상세 값을 색인의 핵종에 채운다. 같은 색인에 여러 번 불러도 한 번만 받는다. */
export function loadAmeDetails(index: NuclideIndex): Promise<void> {
  let pending = ameLoads.get(index);
  if (!pending) {
    pending = import('./generated/ame.json?raw').then(({ default: text }) => {
      applyAmeDetails(index.nuclides, JSON.parse(text) as AmeDetailFile);
    });
    ameLoads.set(index, pending);
    pending.catch(() => ameLoads.delete(index));
  }
  return pending;
}
