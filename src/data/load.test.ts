import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyAmeDetails, decodeMeasured, encodeMeasured, hydrate } from './hydrate';
import { buildIndex } from './load';
import { searchNuclides, type SearchResult } from './search';
import type { AmeDetailFile, NuclideIndex, StoredDataset } from './types';

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./generated/${name}`, import.meta.url), 'utf8')) as T;

let index: NuclideIndex;
beforeAll(() => {
  index = buildIndex(hydrate(readJson<StoredDataset>('nuclides.json')));
});

describe('buildIndex', () => {
  it('격자·ID·행 색인을 만든다', () => {
    expect(index.gridWidth).toBe(178);
    expect(index.gridHeight).toBe(119);
    const u235 = index.byId.get('U-235')!;
    expect(index.nuclides[index.grid[92 * index.gridWidth + 143]!]).toBe(u235);
    expect(index.grid[0]).toBe(-1); // Z = 0, N = 0
    expect(index.statesById.get('Tc-99m')?.nuclide.id).toBe('Tc-99');
    expect(index.rows.get(0)).toEqual({ nMin: 1, nMax: 1 });
    expect(index.counts.stable).toBe(253);
    expect(index.labels.get('U-235')).toEqual({ halfLife: '704 My', decay: 'α 100 %\nSF 7e−9 %' });
    expect(index.labels.get('Fe-56')?.halfLife).toBe('91.754 %');
  });

  it('핵심 청크에는 결합에너지만, 상세 청크를 붙이면 나머지 AME 값이 채워진다', () => {
    const dataset = hydrate(readJson<StoredDataset>('nuclides.json'));
    const u235 = dataset.nuclides.find((n) => n.id === 'U-235')!;
    expect(Object.keys(u235.ame!)).toEqual(['bindingPerA']);
    applyAmeDetails(dataset.nuclides, readJson<AmeDetailFile>('ame.json'));
    expect(u235.ame).toMatchObject({
      bindingPerA: { v: '7590.9151', u: '0.0048' },
      qAlpha: { v: '4678.0559', u: '0.6911' },
      qBetaMinus: { v: '-124.2619', u: '0.8524' },
      qEC: { v: '-1370.1184' },
    });
  });

  it('AME 압축 문자열을 되돌린다', () => {
    for (const m of [
      { v: '-13736', u: '2000', est: true as const },
      { v: '8.5' },
      { v: '1', u: '0.2' },
    ]) {
      expect(decodeMeasured(encodeMeasured(m))).toEqual(m);
    }
  });
});

describe('searchNuclides (FR-60, 02 §10)', () => {
  const first = (q: string) => searchNuclides(index, q)[0];
  const nuclide = (q: string) => {
    const r = first(q);
    return r?.type === 'nuclide' ? [r.id, r.stateId] : r;
  };

  it.each([
    'U-235',
    '235U',
    'u235',
    'u 235',
    '235-U',
    '우라늄-235',
    '우라늄 235',
    'uranium 235',
    'Uranium235',
    'Ｕ－２３５',
  ])('%s → U-235 한 개', (q) => {
    const results = searchNuclides(index, q);
    expect(results).toHaveLength(1);
    expect(nuclide(q)).toEqual(['U-235', undefined]);
  });

  it('후보에 표기·이름·반감기·범주를 싣는다', () => {
    expect(first('U-235')).toMatchObject({
      label: '²³⁵U',
      descriptionKo: '우라늄-235 · 704 My · α',
      descriptionEn: 'Uranium-235 · 704 My · α',
      category: 'alpha',
    });
  });

  it('이성질체는 기저 칸과 상태 ID를 돌려준다', () => {
    expect(nuclide('Tc-99m')).toEqual(['Tc-99', 'Tc-99m']);
    expect(nuclide('99mTc')).toEqual(['Tc-99', 'Tc-99m']);
    expect(nuclide('Hf-178m2')).toEqual(['Hf-178', 'Hf-178m2']);
    expect(first('Tc-99m')).toMatchObject({ label: '⁹⁹ᵐTc', category: 'it' });
  });

  it.each(['178m2Hf', '¹⁷⁸ᵐ²Hf', 'hf178m2', '178m2 Hf'])(
    '질량수 먼저 쓴 m2 표기도 같은 상태: %s (UX-02)',
    (q) => {
      expect(nuclide(q)).toEqual(['Hf-178', 'Hf-178m2']);
    },
  );

  it('없는 이성질체는 기저 상태로 말없이 바꾸지 않는다 (UX-01)', () => {
    const results = searchNuclides(index, 'Tc-99m2');
    expect(results[0]).toMatchObject({
      type: 'nuclide',
      id: 'Tc-99',
      missingState: '⁹⁹ᵐ²Tc',
      label: '⁹⁹Tc',
    });
    expect(results[0]).not.toHaveProperty('stateId');
    expect((results[0] as { descriptionKo: string }).descriptionKo).toMatch(/^⁹⁹ᵐ²Tc 상태 없음/);
    // 실제로 있는 상태를 후보로 준다
    expect(results.slice(1)).toEqual([
      expect.objectContaining({ id: 'Tc-99', stateId: 'Tc-99m', label: '⁹⁹ᵐTc' }),
    ]);
    // 들뜬 상태가 없는 핵종: 기저 상태 제안만
    expect(searchNuclides(index, '12mC')).toEqual([
      expect.objectContaining({ id: 'C-12', missingState: '¹²ᵐC' }),
    ]);
  });

  it('유효한 원소 기호 해석을 먼저 쓴다: 24mg → Mg-24', () => {
    expect(nuclide('24mg')).toEqual(['Mg-24', undefined]);
    expect(nuclide('258md')).toEqual(['Md-258', undefined]);
    expect(nuclide('258mMd')).toEqual(['Md-258', 'Md-258m']);
  });

  it('원소 → 행, N= → 열', () => {
    for (const q of ['U', '우라늄', 'uranium', 'Z=92', 'z92', '92']) {
      expect(first(q)).toMatchObject({ type: 'row', z: 92 });
    }
    const row = first('U') as Extract<SearchResult, { type: 'row' }>;
    expect(row.bounds).toEqual({
      minZ: 92,
      maxZ: 92,
      ...{ minN: index.rows.get(92)!.nMin, maxN: index.rows.get(92)!.nMax },
    });
    for (const q of ['N=126', 'n126', 'n=126']) {
      expect(first(q)).toMatchObject({ type: 'column', n: 126 });
    }
  });

  it('옛 이름·특수 이름', () => {
    expect(first('나트륨')).toMatchObject({ type: 'row', z: 11 });
    expect(first('요오드')).toMatchObject({ type: 'row', z: 53 });
    expect(nuclide('n')).toEqual(['n-1', undefined]);
    expect(nuclide('중성자')).toEqual(['n-1', undefined]);
    expect(nuclide('D')).toEqual(['H-2', undefined]);
    expect(nuclide('삼중수소')).toEqual(['H-3', undefined]);
  });

  it('대문자 N은 질소, 소문자 n은 중성자·열', () => {
    expect(first('N')).toMatchObject({ type: 'row', z: 7 });
    expect(nuclide('N15')).toEqual(['N-15', undefined]);
    expect(nuclide('N-14')).toEqual(['N-14', undefined]);
    expect(first('n15')).toMatchObject({ type: 'column', n: 15 });
  });

  it('접두어 후보는 최대 8개, 해석 실패는 빈 목록', () => {
    const partial = searchNuclides(index, 'U-23');
    expect(partial).toHaveLength(8);
    expect(partial.every((r) => r.type === 'nuclide' && r.id.startsWith('U-23'))).toBe(true);
    expect(searchNuclides(index, '우라')).toEqual([
      expect.objectContaining({ type: 'row', z: 92 }),
    ]);
    expect(searchNuclides(index, 'xyz')).toEqual([]);
    expect(searchNuclides(index, '   ')).toEqual([]);
    expect(searchNuclides(index, 'A=235')).toEqual([]);
  });
});
