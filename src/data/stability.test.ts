import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyAmeDetails, hydrate } from './hydrate';
import { buildIndex } from './load';
import {
  allowedUnlistedDecays,
  isomerMarker,
  isReplenished,
  levelKindOf,
  stabilityOf,
} from './stability';
import type { AmeDetailFile, NuclearState, NuclideIndex, StoredDataset } from './types';

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./generated/${name}`, import.meta.url), 'utf8')) as T;

let index: NuclideIndex;
beforeAll(() => {
  index = buildIndex(hydrate(readJson<StoredDataset>('nuclides.json')));
  applyAmeDetails(index.nuclides, readJson<AmeDetailFile>('ame.json'));
});

const state = (s: Partial<NuclearState>): NuclearState => ({
  id: 'X-1',
  level: 1,
  halfLife: { kind: 'unknown' },
  decays: [],
  ...s,
});

describe('안정성 4단계 (공통 B 안정 기준)', () => {
  it('붕괴 관측 여부와 자연 존재비로 판정한다', () => {
    expect(stabilityOf(state({ halfLife: { kind: 'stable' } }))).toBe('stable');
    expect(stabilityOf(state({ halfLife: { kind: 'stable', unc: '>2.6Zy' } }))).toBe(
      'observationally-stable',
    );
    expect(
      stabilityOf(
        state({ halfLife: { kind: 'stable' }, decays: [{ mode: 'A', cat: 'alpha', rel: '?' }] }),
      ),
    ).toBe('observationally-stable');
    expect(
      stabilityOf(
        state({
          halfLife: { kind: 'value', value: '1.248', unit: 'Gy' },
          abundance: { v: '0.0117' },
        }),
      ),
    ).toBe('natural-radioactive');
    expect(stabilityOf(state({ halfLife: { kind: 'value', value: '5.70', unit: 'ky' } }))).toBe(
      'radioactive',
    );
  });

  it('지구 나이보다 훨씬 짧은 자연 존재 방사성은 계속 생성되는 것으로 본다', () => {
    const replenished = index.nuclides.filter(isReplenished).map((n) => n.id);
    expect(replenished).toEqual(['Th-230', 'Pa-231', 'U-234']);
    expect(isReplenished(index.byId.get('U-235')!)).toBe(false);
  });

  it('AME Q값으로 에너지상 가능하지만 목록에 없는 붕괴 (4차 검증 03)', () => {
    const gold = allowedUnlistedDecays(index, index.byId.get('Au-197')!);
    expect(gold.map((d) => d.mode)).toEqual(['A']);
    expect(Number(gold[0]!.q.v)).toBeGreaterThan(900);
    // 이미 `A ?`로 적힌 붕괴는 다시 적지 않는다
    expect(allowedUnlistedDecays(index, index.byId.get('Pb-208')!)).toEqual([]);
    // 방사성 핵종에는 쓰지 않는다
    expect(allowedUnlistedDecays(index, index.byId.get('U-238')!)).toEqual([]);
    const stableWithAlpha = index.nuclides.filter(
      (n) => n.stability === 'stable' && allowedUnlistedDecays(index, n).length,
    );
    expect(stableWithAlpha).toHaveLength(36);
  });
});

describe('들뜬 상태 종류와 지도 표식 (4차 검증 02)', () => {
  it('100 ns를 이성질체 기준으로 쓴다', () => {
    const kind = (h: NuclearState['halfLife']) => levelKindOf(state({ halfLife: h }));
    expect(kind({ kind: 'value', value: '6.0066', unit: 'h', seconds: 21_624 })).toBe('isomer');
    expect(kind({ kind: 'value', value: '92', unit: 'ns', seconds: 92e-9 })).toBe('short');
    expect(kind({ kind: 'value', value: '5', unit: 'ms', est: true, seconds: 5e-3 })).toBe(
      'isomer',
    );
    expect(kind({ kind: 'unknown', unc: '<26 ns' })).toBe('short');
    expect(kind({ kind: 'unknown' })).toBe('unknown');
    expect(kind({ kind: 'stable', unc: '>45 Py' })).toBe('isomer');
    expect(levelKindOf(state({ nonExistent: true }))).toBe('non-existent');
    expect(index.statesById.get('Pb-210m')!.state.levelKind).toBe('short');
  });

  it('문턱별 표식 핵종 수: 100 ns 1,355 · 1 s 585', () => {
    const marked = (t: number) => index.nuclides.filter((n) => isomerMarker(n, t) > 0).length;
    expect(marked(100e-9)).toBe(1355);
    expect(marked(1)).toBe(585);
    expect(marked(3600)).toBe(113);
  });

  it('1 s 문턱에서도 교육 대표 사례는 남는다', () => {
    for (const id of ['Tc-99', 'Ba-137', 'Co-60', 'Pa-234', 'Hf-178', 'Am-242']) {
      expect(isomerMarker(index.byId.get(id)!, 1), id).toBe(1);
    }
    // 자연에 있는 안정 이성질체 ¹⁸⁰ᵐTa는 따로 표시한다
    expect(isomerMarker(index.byId.get('Ta-180')!, 1)).toBe(2);
    expect(index.byId.get('Ta-180')!.naturalRadioactive).toBe(false);
  });
});
