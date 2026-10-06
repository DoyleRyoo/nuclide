import type { LevelKind, StabilityClass } from '../../src/data/stability';
import type { DecayCategory, NuclearState, Nuclide } from '../../src/data/types';
import type { BuildResult } from './build';

/**
 * 개수 스냅샷 (04 §3, §11). 새 평가본을 넣으면 여기서 실패한다.
 * 차이를 검토한 뒤 값을 갱신한다 (04 §12).
 */
export const SNAPSHOT = {
  nubaseRows: 5843,
  ground: 3558,
  observed: 3340,
  iasExcluded: 186,
  excited: 2099,
  excitedByLetter: { m: 1378, n: 463, p: 201, q: 42, r: 11, x: 4 },
  nuclidesWithExcited: 1431,
  maxExcitedPerNuclide: 6,
  stableGround: 253,
  groundWithAbundance: 288,
  naturalRadioactive: 35,
  /** 모든 상태의 안정성 4단계 (존재하지 않는 16개 제외, 4차 검증 03과 같은 수) */
  stability: {
    stable: 182,
    'observationally-stable': 72,
    'natural-radioactive': 35,
    radioactive: 5352,
  } as Record<StabilityClass, number>,
  /** 들뜬 상태 종류 (4차 검증 02: 100 ns 이상 1,960, 미만 25) */
  levelKind: { isomer: 1960, short: 25, unknown: 98, 'non-existent': 16 } as Record<
    LevelKind,
    number
  >,
  estimatedGroundHalfLife: 369,
  estimatedGroundMassExcess: 1008,
  ameRows: 3558,
  bounds: { zMin: 0, zMax: 118, nMin: 0, nMax: 177 },
  primary: {
    'beta-': 1405,
    'beta+': 1131,
    alpha: 555,
    stable: 253,
    p: 122,
    sf: 60,
    n: 32,
  } as Partial<Record<DecayCategory, number>>,
  primaryObserved: {
    'beta-': 1378,
    'beta+': 1104,
    alpha: 469,
    stable: 253,
    p: 60,
    sf: 55,
    n: 21,
  } as Partial<Record<DecayCategory, number>>,
};

type Check = (fail: (message: string) => void) => void;

function expectEqual(fail: (m: string) => void, label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(`${label}: 기대 ${e}, 실제 ${a}`);
}

function countBy<T>(items: T[], pick: (item: T) => boolean) {
  return items.filter(pick).length;
}

function categoryCounts(nuclides: Nuclide[]) {
  const counts: Partial<Record<DecayCategory, number>> = {};
  for (const n of nuclides) counts[n.primary] = (counts[n.primary] ?? 0) + 1;
  return counts;
}

function sameCounts(
  fail: (m: string) => void,
  label: string,
  actual: Partial<Record<DecayCategory, number>>,
  expected: Partial<Record<DecayCategory, number>>,
) {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)] as DecayCategory[]);
  for (const k of keys) {
    if ((actual[k] ?? 0) !== (expected[k] ?? 0)) {
      fail(`${label} ${k}: 기대 ${expected[k] ?? 0}, 실제 ${actual[k] ?? 0}`);
    }
  }
}

const snapshotChecks = ({ dataset, stats }: BuildResult): Check[] => {
  const all = dataset.nuclides;
  return [
    (fail) => expectEqual(fail, 'NUBASE 데이터 행', stats.nubaseRows, SNAPSHOT.nubaseRows),
    (fail) => expectEqual(fail, '기저 상태', all.length, SNAPSHOT.ground),
    (fail) =>
      expectEqual(
        fail,
        '관측 핵종',
        countBy(all, (n) => n.observed),
        SNAPSHOT.observed,
      ),
    (fail) => expectEqual(fail, '제외한 IAS', stats.iasExcluded, SNAPSHOT.iasExcluded),
    (fail) =>
      expectEqual(
        fail,
        '들뜬 상태',
        all.reduce((sum, n) => sum + n.excited.length, 0),
        SNAPSHOT.excited,
      ),
    (fail) => {
      for (const [letter, expected] of Object.entries(SNAPSHOT.excitedByLetter)) {
        expectEqual(fail, `들뜬 상태 ${letter}`, stats.excitedByLetter[letter] ?? 0, expected);
      }
      const extra = Object.keys(stats.excitedByLetter).filter(
        (l) => !(l in SNAPSHOT.excitedByLetter),
      );
      if (extra.length) fail(`스냅샷에 없는 상태 문자: ${extra.join(', ')}`);
    },
    (fail) =>
      expectEqual(
        fail,
        '들뜬 상태를 가진 핵종',
        countBy(all, (n) => n.excited.length > 0),
        SNAPSHOT.nuclidesWithExcited,
      ),
    (fail) =>
      expectEqual(
        fail,
        '핵종당 최대 들뜬 상태',
        Math.max(...all.map((n) => n.excited.length)),
        SNAPSHOT.maxExcitedPerNuclide,
      ),
    (fail) =>
      expectEqual(
        fail,
        '안정 기저 상태',
        countBy(all, (n) => n.halfLife.kind === 'stable'),
        SNAPSHOT.stableGround,
      ),
    (fail) =>
      expectEqual(
        fail,
        '자연 존재비가 있는 기저 상태',
        countBy(all, (n) => !!n.abundance),
        SNAPSHOT.groundWithAbundance,
      ),
    (fail) =>
      expectEqual(
        fail,
        '자연 존재 방사성 표식',
        countBy(all, (n) => n.naturalRadioactive),
        SNAPSHOT.naturalRadioactive,
      ),
    (fail) => {
      const states = all.flatMap((n) => [n, ...n.excited]);
      for (const [cls, expected] of Object.entries(SNAPSHOT.stability)) {
        expectEqual(
          fail,
          `안정성 ${cls}`,
          countBy(states, (s) => s.stability === cls),
          expected,
        );
      }
      const excited = all.flatMap((n) => n.excited);
      for (const [kind, expected] of Object.entries(SNAPSHOT.levelKind)) {
        expectEqual(
          fail,
          `들뜬 상태 ${kind}`,
          countBy(excited, (s) => s.levelKind === kind),
          expected,
        );
      }
    },
    (fail) =>
      expectEqual(
        fail,
        '추정 반감기(기저)',
        countBy(all, (n) => !!n.halfLife.est),
        SNAPSHOT.estimatedGroundHalfLife,
      ),
    (fail) =>
      expectEqual(
        fail,
        '추정 질량 초과(기저)',
        countBy(all, (n) => !!n.massExcess?.est),
        SNAPSHOT.estimatedGroundMassExcess,
      ),
    (fail) => {
      expectEqual(fail, 'AME mass 행', stats.massRows, SNAPSHOT.ameRows);
      expectEqual(fail, 'AME rct1 행', stats.rct1Rows, SNAPSHOT.ameRows);
      expectEqual(fail, 'AME rct2 행', stats.rct2Rows, SNAPSHOT.ameRows);
    },
    (fail) => expectEqual(fail, '좌표 범위', dataset.meta.bounds, SNAPSHOT.bounds),
    (fail) => sameCounts(fail, '주 붕괴 모드', categoryCounts(all), SNAPSHOT.primary),
    (fail) =>
      sameCounts(
        fail,
        '주 붕괴 모드(관측)',
        categoryCounts(all.filter((n) => n.observed)),
        SNAPSHOT.primaryObserved,
      ),
  ];
};

const integrityChecks = ({ dataset }: BuildResult): Check[] => [
  (fail) => {
    const seen = new Set<string>();
    for (const n of dataset.nuclides) {
      for (const s of [n, ...n.excited]) {
        const k = `${n.z}:${n.a}:${s.level}`;
        if (seen.has(k)) fail(`(Z, A, level) 중복: ${k}`);
        seen.add(k);
      }
    }
  },
  (fail) => {
    const ids = new Set<string>();
    for (const n of dataset.nuclides) {
      for (const s of [n, ...n.excited]) {
        if (ids.has(s.id)) fail(`ID 중복: ${s.id}`);
        ids.add(s.id);
      }
    }
  },
  (fail) => {
    for (const n of dataset.nuclides)
      if (n.primary === 'unknown') fail(`${n.id}: 주 붕괴 모드 없음`);
  },
  (fail) => {
    for (const n of dataset.nuclides) if (!n.ame) fail(`${n.id}: AME 값 없음`);
  },
  (fail) => {
    // 부호 없는 `B` 토큰은 알려진 한 곳만 β−로 해석한다 (decayModes.ts).
    const bare = dataset.nuclides.flatMap((n) =>
      [n, ...n.excited].filter((s) => s.decays.some((d) => d.mode === 'B')).map((s) => s.id),
    );
    expectEqual(fail, '부호 없는 B 토큰 위치', bare, ['Pd-126m3']);
  },
  (fail) => {
    for (let i = 1; i < dataset.nuclides.length; i++) {
      const p = dataset.nuclides[i - 1]!;
      const q = dataset.nuclides[i]!;
      if (p.z > q.z || (p.z === q.z && p.n >= q.n)) fail(`정렬 순서 오류: ${p.id} → ${q.id}`);
    }
  },
];

function find(
  dataset: BuildResult['dataset'],
  id: string,
): { nuclide: Nuclide; state: NuclearState } {
  for (const nuclide of dataset.nuclides) {
    if (nuclide.id === id) return { nuclide, state: nuclide };
    const state = nuclide.excited.find((s) => s.id === id);
    if (state) return { nuclide, state };
  }
  throw new Error(`골든 레코드 ${id} 없음`);
}

const branchSummary = (s: NuclearState) =>
  s.decays.map((d) => `${d.mode}${d.rel === '?' ? ' ?' : `${d.rel}${d.value ?? '?'}`}`).join(';');

const goldenChecks = ({ dataset }: BuildResult): Check[] => {
  const get = (id: string) => find(dataset, id);
  return [
    (fail) => {
      const { nuclide } = get('n-1');
      expectEqual(fail, 'n-1 반감기', nuclide.halfLife, {
        kind: 'value',
        value: '609.8',
        unit: 's',
        unc: '0.6',
        seconds: 609.8,
      });
      expectEqual(fail, 'n-1 붕괴', branchSummary(nuclide), 'B-=100');
    },
    (fail) => {
      const { nuclide } = get('C-14');
      expectEqual(
        fail,
        'C-14 반감기',
        [nuclide.halfLife.value, nuclide.halfLife.unc, nuclide.halfLife.unit],
        ['5.70', '0.03', 'ky'],
      );
      expectEqual(fail, 'C-14 붕괴', branchSummary(nuclide), 'B-=100');
    },
    (fail) => {
      const { nuclide } = get('Fe-56');
      expectEqual(fail, 'Fe-56 반감기', nuclide.halfLife.kind, 'stable');
      expectEqual(fail, 'Fe-56 존재비', nuclide.abundance, { v: '91.754', u: '106' });
    },
    (fail) => {
      const tc = get('Tc-99').nuclide;
      expectEqual(fail, 'Tc-99 반감기', [tc.halfLife.value, tc.halfLife.unit], ['211.1', 'ky']);
      expectEqual(fail, 'Tc-99 주 모드', tc.primary, 'beta-');
      const { state } = get('Tc-99m');
      expectEqual(fail, 'Tc-99m 들뜬 에너지', state.exc?.v, '142.6836');
      expectEqual(
        fail,
        'Tc-99m 반감기',
        [state.halfLife.value, state.halfLife.unit],
        ['6.0066', 'h'],
      );
      expectEqual(fail, 'Tc-99m 붕괴', branchSummary(state), 'IT~100;B-=0.0037');
    },
    (fail) => {
      const ta = get('Ta-180').nuclide;
      expectEqual(fail, 'Ta-180 반감기', [ta.halfLife.value, ta.halfLife.unit], ['8.154', 'h']);
      expectEqual(fail, 'Ta-180 붕괴', branchSummary(ta), 'EC=85;B-=15');
      // 기저 상태(8.15 h)는 방사성이고 자연에 있는 것은 ¹⁸⁰ᵐTa다 (4차 검증 03).
      expectEqual(fail, 'Ta-180 자연 존재 표식', ta.naturalRadioactive, false);
      expectEqual(fail, 'Ta-180 안정성', ta.stability, 'radioactive');
      const { state } = get('Ta-180m');
      expectEqual(fail, 'Ta-180m 반감기', state.halfLife.kind, 'stable');
      expectEqual(fail, 'Ta-180m 존재비', state.abundance, { v: '0.01201', u: '32' });
      expectEqual(fail, 'Ta-180m 안정성', state.stability, 'observationally-stable');
    },
    (fail) => {
      // 공통 B '안정 기준'의 예시 (docs/conformity_inspection.md)
      const cases: [string, StabilityClass][] = [
        ['C-12', 'stable'],
        ['O-16', 'stable'],
        ['Pb-204', 'observationally-stable'],
        ['Pb-208', 'observationally-stable'],
        ['K-40', 'natural-radioactive'],
        ['Bi-209', 'natural-radioactive'],
        ['Te-130', 'natural-radioactive'],
        ['U-238', 'natural-radioactive'],
        ['U-234', 'natural-radioactive'],
        ['C-14', 'radioactive'],
      ];
      for (const [id, expected] of cases) {
        expectEqual(fail, `${id} 안정성`, get(id).state.stability, expected);
      }
    },
    (fail) => {
      const u = get('U-235').nuclide;
      expectEqual(
        fail,
        'U-235 반감기',
        [u.halfLife.value, u.halfLife.unc, u.halfLife.unit],
        ['704', '1', 'My'],
      );
      expectEqual(fail, 'U-235 존재비', u.abundance, { v: '0.7204', u: '6' });
      expectEqual(fail, 'U-235 첫 붕괴', branchSummary(u).split(';')[0], 'A=100');
      expectEqual(fail, 'U-235 주 모드', u.primary, 'alpha');
      expectEqual(fail, 'U-235 들뜬 상태 수', u.excited.length, 2);
      expectEqual(fail, 'U-235 AME B/A', u.ame?.bindingPerA?.v, '7590.9151');
      expectEqual(fail, 'U-235 자연 존재 표식', u.naturalRadioactive, true);
    },
    (fail) => {
      // `=?`(관측, 세기 미상)와 ` ?`(미관측)를 구별한다 (NUBASE2020 §2.5)
      expectEqual(fail, 'Na-18 붕괴', branchSummary(get('Na-18').nuclide), 'p=?');
      expectEqual(fail, 'Pb-206 붕괴', branchSummary(get('Pb-206').nuclide), 'A ?');
    },
    (fail) => {
      // 첫 항목 규칙만 쓰면 틀리는 사례 (04 §5.3)
      const cases: [string, DecayCategory][] = [
        ['Rb-73', 'p'],
        ['Au-177', 'beta+'],
        ['Cm-233', 'beta+'],
        ['Sg-271', 'sf'],
      ];
      for (const [id, expected] of cases) {
        expectEqual(fail, `${id} 주 모드`, get(id).nuclide.primary, expected);
      }
    },
  ];
};

/** 실패 목록을 돌려준다. 비어 있으면 통과. */
export function validate(result: BuildResult): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  for (const check of [
    ...snapshotChecks(result),
    ...integrityChecks(result),
    ...goldenChecks(result),
  ]) {
    try {
      check(fail);
    } catch (error) {
      fail((error as Error).message);
    }
  }
  return failures;
}
