/**
 * 검색 파서·후보 (02 §10). 입력 문법:
 *   U-235 · U235 · 235U · 우라늄-235 · uranium 235   → 핵종
 *   Tc-99m · 99mTc · Hf-178m2                         → 이성질체 (기저 칸 + 상태 펼침)
 *   U · 우라늄 · uranium · 나트륨 · Z=92 · z92 · 92    → 원소 행
 *   N=126 · n126                                      → 동중성자핵 열
 *   n · neutron · 중성자 · D · 중수소 · T · 삼중수소     → 특수 이름
 */
import { primaryCategory } from './decay';
import { elements, type Element } from './elements';
import { categoryLabel, formatHalfLifeShort, nuclideLabel } from './format';
import type { DecayCategory, Nuclide, NuclideIndex } from './types';

export interface SearchBounds {
  minN: number;
  maxN: number;
  minZ: number;
  maxZ: number;
}

interface Described {
  label: string;
  descriptionKo: string;
  descriptionEn: string;
}

export type SearchResult =
  | ({ type: 'nuclide'; id: string; stateId?: string; category: DecayCategory } & Described)
  | ({ type: 'row'; z: number; bounds: SearchBounds } & Described)
  | ({ type: 'column'; n: number; bounds: SearchBounds } & Described);

export const MAX_RESULTS = 8;

/** 앞뒤 공백 제거, 전각 → 반각, 소문자, 공백·하이픈·밑줄 제거 */
export function normalizeQuery(query: string): string {
  return query
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_‐‑–—−]/g, '');
}

const SPECIAL: Record<string, { z: number; a: number }> = {
  n: { z: 0, a: 1 },
  neutron: { z: 0, a: 1 },
  중성자: { z: 0, a: 1 },
  d: { z: 1, a: 2 },
  deuterium: { z: 1, a: 2 },
  중수소: { z: 1, a: 2 },
  t: { z: 1, a: 3 },
  tritium: { z: 1, a: 3 },
  삼중수소: { z: 1, a: 3 },
};

/** 원소 이름·기호·별칭 → 원소. 중성자(Z = 0)는 핵종 특수 이름으로 따로 다룬다. */
const elementNames = new Map<string, Element>();
for (const element of elements) {
  if (element.z === 0) continue;
  for (const name of [element.symbol, element.nameEn, element.nameKo, ...(element.aliases ?? [])]) {
    elementNames.set(normalizeQuery(name), element);
  }
}

const elementName = (e: Element, locale: 'ko' | 'en') => (locale === 'ko' ? e.nameKo : e.nameEn);

/** "우라늄-235", "테크네튬-99m" */
function stateName(n: Nuclide, level: number, locale: 'ko' | 'en'): string {
  const element = elements[n.z];
  const name = element ? elementName(element, locale) : n.symbol;
  return `${name}-${n.a}${level ? `m${level > 1 ? level : ''}` : ''}`;
}

function nuclideResult(n: Nuclide, level = 0): SearchResult {
  const state = level ? n.excited.find((s) => s.level === level) : undefined;
  const target = state ?? n;
  const halfLife = formatHalfLifeShort(target.halfLife);
  const category = state
    ? primaryCategory(state.halfLife.kind === 'stable', state.decays)
    : n.primary;
  const describe = (locale: 'ko' | 'en') =>
    [stateName(n, state ? level : 0, locale), halfLife, categoryLabel(category, locale)]
      .filter(Boolean)
      .join(' · ');
  const result: SearchResult = {
    type: 'nuclide',
    id: n.id,
    category,
    label: nuclideLabel(n.symbol, n.a, state ? level : 0),
    descriptionKo: describe('ko'),
    descriptionEn: describe('en'),
  };
  if (state) result.stateId = state.id;
  return result;
}

function rowResult(index: NuclideIndex, z: number): SearchResult | undefined {
  const row = index.rows.get(z);
  const element = elements[z];
  if (!row || !element) return undefined;
  const count = index.nuclides.filter((n) => n.z === z).length;
  return {
    type: 'row',
    z,
    bounds: { minN: row.nMin, maxN: row.nMax, minZ: z, maxZ: z },
    label: `${element.symbol} · Z = ${z}`,
    descriptionKo: `${element.nameKo} · 핵종 ${count}개`,
    descriptionEn: `${element.nameEn} · ${count} nuclides`,
  };
}

function columnResult(index: NuclideIndex, n: number): SearchResult | undefined {
  const column = index.nuclides.filter((x) => x.n === n);
  if (!column.length) return undefined;
  const zs = column.map((x) => x.z);
  return {
    type: 'column',
    n,
    bounds: { minN: n, maxN: n, minZ: Math.min(...zs), maxZ: Math.max(...zs) },
    label: `N = ${n}`,
    descriptionKo: `동중성자핵 · 핵종 ${column.length}개`,
    descriptionEn: `Isotones · ${column.length} nuclides`,
  };
}

/** 원소 + 질량수 (+ 이성질체) 해석. `24mg` → Mg-24처럼 유효한 원소 기호 해석을 먼저 쓴다. */
function parseNuclide(q: string): { element: Element; a: number; level: number } | undefined {
  const levelOf = (m?: string) => (m ? (m === 'm' ? 1 : Number(m.slice(1))) : 0);
  // 원소 먼저: u235, tc99m, hf178m2, 우라늄235
  let match = /^([a-z]+|[가-힣]+)(\d+)(m[1-6]?)?$/.exec(q);
  if (match) {
    const element = elementNames.get(match[1]!);
    if (element) return { element, a: Number(match[2]), level: levelOf(match[3]) };
  }
  // 질량수 먼저: 235u, 99mtc, 178m2hf, 24mg
  match = /^(\d+)([a-z]+|[가-힣]+)$/.exec(q);
  if (match) {
    const a = Number(match[1]);
    const rest = match[2]!;
    const direct = elementNames.get(rest);
    if (direct) return { element: direct, a, level: 0 };
    const isomer = /^(m[1-6]?)(.+)$/.exec(rest);
    const element = isomer && elementNames.get(isomer[2]!);
    if (element) return { element, a, level: levelOf(isomer[1]) };
  }
  return undefined;
}

function findNuclide(index: NuclideIndex, z: number, a: number): Nuclide | undefined {
  const n = a - z;
  if (n < 0 || n >= index.gridWidth || z >= index.gridHeight) return undefined;
  const i = index.grid[z * index.gridWidth + n];
  return i !== undefined && i >= 0 ? index.nuclides[i] : undefined;
}

/** 해석한 결과를 먼저, 그다음 접두어 후보를 최대 8개까지 돌려준다. */
export function searchNuclides(index: NuclideIndex, query: string): SearchResult[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  // 대소문자로만 갈리는 경우: 소문자 n = 중성자·N 열, 대문자 N = 질소
  const raw = query.normalize('NFKC').trim();
  const nitrogen = raw.startsWith('N') && !raw.includes('=');

  // Z=92, z92, 92 → 원소 행
  const zMatch = /^(?:z=?)?(\d+)$/.exec(q);
  if (zMatch) {
    const row = rowResult(index, Number(zMatch[1]));
    return row ? [row] : [];
  }
  // N=126, n126 → 동중성자핵 열 (N15처럼 대문자이고 '='이 없으면 질소를 먼저 본다)
  const nMatch = /^n=?(\d+)$/.exec(q);
  const column = nMatch ? columnResult(index, Number(nMatch[1])) : undefined;
  if (nMatch && !nitrogen) return column ? [column] : [];
  // A=235 → 동중원소 강조는 P2
  if (/^a=\d+$/.test(q)) return [];

  const special = nitrogen && q === 'n' ? undefined : SPECIAL[q];
  if (special) {
    const n = findNuclide(index, special.z, special.a);
    return n ? [nuclideResult(n)] : [];
  }

  const parsed = parseNuclide(q);
  if (parsed) {
    const n = findNuclide(index, parsed.element.z, parsed.a);
    if (n) {
      const hasLevel = parsed.level && n.excited.some((s) => s.level === parsed.level);
      return [nuclideResult(n, hasLevel ? parsed.level : 0)];
    }
  }
  if (column) return [column];

  const element = elementNames.get(q);
  if (element) {
    const row = rowResult(index, element.z);
    return row ? [row] : [];
  }

  // 접두어 후보: "u23" → U-23x, "우라" → 우라늄
  const results: SearchResult[] = [];
  const seenRows = new Set<number>();
  for (const [name, e] of elementNames) {
    if (results.length >= MAX_RESULTS) break;
    if (name.startsWith(q) && !seenRows.has(e.z)) {
      const row = rowResult(index, e.z);
      if (row) results.push(row);
      seenRows.add(e.z);
    }
  }
  // 숫자가 있을 때만 핵종 후보를 더한다 ("우라" → 원소 행만, "u23" → U-23x).
  if (/\d/.test(q)) {
    for (const entry of index.searchEntries) {
      if (results.length >= MAX_RESULTS) break;
      if (entry.text.split(' ').some((key) => key.startsWith(q))) {
        results.push(nuclideResult(entry.nuclide));
      }
    }
  }
  return results;
}

/** 원소별 정규화한 기호·이름 (핵종마다 NFKC 정규화를 반복하지 않도록 미리 만든다) */
const elementKeys = elements.map((e) =>
  [e.symbol, e.nameKo, e.nameEn].map((name) => normalizeQuery(name)),
);

/** 검색 색인 문자열: "u235 우라늄235 uranium235 235u" */
export function searchText(n: Nuclide): string {
  const keys = elementKeys[n.z] ?? [n.symbol.toLowerCase()];
  return `${keys.map((key) => `${key}${n.a}`).join(' ')} ${n.a}${n.symbol.toLowerCase()}`;
}
