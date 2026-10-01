/**
 * 앱이 쓰는 핵종 데이터를 livechart_diff.py 입력용 JSON으로 내보낸다.
 *   npx tsx tools/livechart-diff/export_nuclides.ts [출력 경로]
 *   (기본 출력: tools/livechart-diff/nuclides_export.json)
 *
 * 앱과 같은 경로로 읽는다 (src/data/load.ts):
 *   generated/nuclides.json → hydrate() → buildIndex()
 *   generated/ame.json → applyAmeDetails() (QEC 계산 포함)
 * 비교용 값은 화면에 보이는 값 기준이다.
 *   - 반감기·질량 초과·존재비: 화면이 원문 문자열을 그대로 보여 주므로 원문 값
 *   - 원자 질량: 화면처럼 반올림(04 §9)하고 μu → u로 바꾼 값
 *   - J^π: 화면처럼 `*`(측정 배지)를 뗀 값. `#`은 '추정' 배지로 보이므로 남긴다
 * `*_display` 필드는 패널에 보이는 문자열 그대로다 (format.ts).
 * 이성질체는 바닥상태의 excited[]에서 펼쳐 별도 레코드(is_isomer: true)로 둔다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decayModeLabel,
  formatAbundance,
  formatAtomicMass,
  formatBranch,
  formatHalfLife,
  formatHalfLifeHuman,
  formatMeasured,
} from '../../src/data/format';
import { applyAmeDetails, hydrate } from '../../src/data/hydrate';
import { buildIndex } from '../../src/data/load';
import type {
  AmeDetailFile,
  HalfLife,
  Measured,
  NuclearState,
  Nuclide,
  StoredDataset,
} from '../../src/data/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const GENERATED = join(ROOT, 'src', 'data', 'generated');
const out = process.argv[2] ?? join(HERE, 'nuclides_export.json');

const readJson = <T>(name: string) => JSON.parse(readFileSync(join(GENERATED, name), 'utf8')) as T;
const stored = readJson<StoredDataset>('nuclides.json');
const index = buildIndex(hydrate(stored));
applyAmeDetails(index.nuclides, readJson<AmeDetailFile>('ame.json'));

/** 한계형 불확도 `>620ns`, `<99 ns` → `>620 ns` */
function limitText(unc: string | undefined): string | null {
  const match = unc && /^([<>~])\s*([\d.]+)\s*([A-Za-z]+)$/.exec(unc);
  return match ? `${match[1]}${match[2]} ${match[3]}` : null;
}

/**
 * 비교용 반감기 문자열. 화면의 짧은 표기(칸·툴팁)와 같은 모양: "704 My", "5# ms", ">912.4 ys".
 * 값이 없고 한계만 있으면 화면처럼 그 한계를 반감기로 본다 (18B: "<26 ns").
 */
function halfLifeText(h: HalfLife): string | null {
  if (h.kind === 'value' && h.value !== undefined && h.unit !== undefined) {
    return `${h.rel ?? ''}${h.value}${h.est ? '#' : ''} ${h.unit}`;
  }
  return h.kind === 'unknown' ? limitText(h.unc) : null;
}

/** 화면 표시 문자열 → 숫자 문자열 ("235.043 928 1 ± 0.000 001 2" → "235.0439281") */
function displayNumber(text: string): string {
  return text
    .split('±')[0]!
    .replace(/[\s,#]/g, '')
    .replace(/−/g, '-');
}

const jpiDisplay = (jpi: string | undefined) =>
  jpi
    ? `${jpi.replace(/[*#]/g, '').replace(/-/g, '−')}${jpi.includes('*') ? ' [측정]' : ''}${jpi.includes('#') ? ' [추정]' : ''}`
    : null;

const measuredDisplay = (m: Measured | undefined, round = false) =>
  m ? formatMeasured(m, { round }) : null;

function stateRecord(nuclide: Nuclide, state: NuclearState) {
  const h = state.halfLife;
  const atomicMass = state.level === 0 ? nuclide.ame?.atomicMass : undefined;
  const atomicMassDisplay = atomicMass ? formatAtomicMass(atomicMass) : null;
  return {
    id: state.id,
    z: nuclide.z,
    n: nuclide.n,
    a: nuclide.a,
    symbol: nuclide.symbol,
    level: state.level,
    is_isomer: state.level > 0,
    exc_kev: state.exc?.v ?? null,
    non_existent: state.nonExistent ?? false,
    order_inverted: state.orderInverted ?? false,
    order_uncertain: state.orderUncertain ?? false,
    observed: state.level === 0 ? nuclide.observed : null,
    primary: state.level === 0 ? nuclide.primary : null,

    stable: h.kind === 'stable',
    half_life: halfLifeText(h),
    half_life_kind: h.kind,
    half_life_est: h.est ?? false,
    half_life_limit: limitText(h.unc),
    half_life_seconds: h.seconds ?? null,
    half_life_display: formatHalfLife(h, 'ko'),
    half_life_human: formatHalfLifeHuman(h, 'ko') || null,

    decay_modes: state.decays.map((b) => ({
      mode: b.mode,
      ratio: b.pct ?? null,
      rel: b.rel,
      est: b.est ?? false,
      display: `${decayModeLabel(b.mode)} ${formatBranch(b)}`,
    })),
    decay_display: state.decays
      .map((b) => `${decayModeLabel(b.mode)} ${formatBranch(b)}`)
      .join('; '),

    mass_excess_kev: state.massExcess?.v ?? null,
    mass_excess_est: state.massExcess?.est ?? false,
    mass_excess_display: measuredDisplay(state.massExcess),

    atomic_mass_u: atomicMassDisplay ? displayNumber(atomicMassDisplay) : null,
    atomic_mass_est: atomicMass?.est ?? false,
    atomic_mass_uu_raw: atomicMass?.v ?? null,
    atomic_mass_display: atomicMassDisplay,

    abundance_pct: state.abundance?.v ?? null,
    abundance_display: state.abundance ? `${formatAbundance(state.abundance)} %` : null,

    jpi: state.jpi?.replace(/\*/g, '') ?? null,
    jpi_display: jpiDisplay(state.jpi),

    cell_label: state.level === 0 ? (index.labels.get(nuclide.id) ?? null) : null,
    ame:
      state.level === 0
        ? Object.fromEntries(
            (['bindingPerA', 'qAlpha', 'qBetaMinus', 'qEC', 'sn', 'sp', 's2n', 's2p'] as const)
              .filter((key) => nuclide.ame?.[key])
              .map((key) => {
                const m = nuclide.ame![key]!;
                return [
                  key,
                  {
                    v: m.v,
                    u: m.u ?? null,
                    est: m.est ?? false,
                    display: measuredDisplay(m, true),
                  },
                ];
              }),
          )
        : null,
  };
}

const records = index.nuclides.flatMap((nuclide) => [
  stateRecord(nuclide, nuclide),
  ...nuclide.excited.map((state) => stateRecord(nuclide, state)),
]);

const meta = {
  generator: 'tools/livechart-diff/export_nuclides.ts',
  sources: stored.meta.sources,
  note: '비교용 값 = 화면 표시 기준. 원자 질량은 반올림 후 u. *_display = 패널 문자열',
  counts: {
    records: records.length,
    ground: index.nuclides.length,
    isomers: records.length - index.nuclides.length,
  },
};
// 레코드 하나를 한 줄로 (generated/*.json과 같은 방식, diff로 읽기 쉽게)
writeFileSync(
  out,
  `{"meta":${JSON.stringify(meta)},"nuclides":[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`,
);
console.log(
  `내보냄: ${relative(ROOT, out).replaceAll('\\', '/')} · 레코드 ${records.length}개 ` +
    `(바닥상태 ${index.nuclides.length} + 이성질체 ${records.length - index.nuclides.length})`,
);
