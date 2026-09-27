import { elements } from '../../src/data/elements';
import { applyAmeDetails, encodeMeasured, hydrate } from '../../src/data/hydrate';
import {
  AME_DETAIL_FIELDS,
  type AmeDetailField,
  type AmeDetailFile,
  type DecayCategory,
  type Measured,
  type NuclideDataset,
  type StoredDataset,
  type StoredNuclide,
  type StoredState,
} from '../../src/data/types';
import { parseMass, parseRct, type MassRow, type RctRow } from './parseAme';
import { parseNubase, STATE_LEVELS, type NubaseState } from './parseNubase';

export interface RawFile {
  name: string;
  file: string;
  sha256: string;
  text: string;
}

export interface RawSources {
  nubase: RawFile;
  mass: RawFile;
  rct1: RawFile;
  rct2: RawFile;
}

export interface BuildResult {
  /** generated/nuclides.json */
  stored: StoredDataset;
  /** generated/ame.json */
  ame: AmeDetailFile;
  /** 두 파일을 앱과 같은 방식(hydrate + applyAmeDetails)으로 펼친 모델. 검증 대상. */
  dataset: NuclideDataset;
  /** 검증에만 쓰는 파싱 통계 */
  stats: {
    nubaseRows: number;
    iasExcluded: number;
    excitedByLetter: Record<string, number>;
    massRows: number;
    rct1Rows: number;
    rct2Rows: number;
  };
  warnings: string[];
}

export const CATEGORIES: DecayCategory[] = [
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

const key = (z: number, a: number) => `${z}:${a}`;

/** 키 순서를 고정한 저장 상태 (결정적 출력) */
function toStored(row: NubaseState, level: number): StoredState {
  const state: Partial<StoredState> = {};
  if (level) state.level = level;
  if (row.exc) state.exc = row.exc;
  if (row.massExcess) state.massExcess = row.massExcess;
  state.halfLife = row.halfLife;
  if (row.jpi) state.jpi = row.jpi;
  state.decays = row.decays;
  if (row.abundance) state.abundance = row.abundance;
  if (row.discovery !== undefined) state.discovery = row.discovery;
  if (row.orderUncertain) state.orderUncertain = true;
  if (row.orderInverted) state.orderInverted = true;
  if (row.nonExistent) state.nonExistent = true;
  return state as StoredState;
}

function ameDetailRow(mass: MassRow, rct1: RctRow, rct2: RctRow): (string | null)[] {
  const [s2n, s2p, qAlpha, q2BetaMinus, qECp, qBetaMinusN] = rct1.values;
  const [sn, sp] = rct2.values;
  const values: Record<AmeDetailField, Measured | undefined> = {
    atomicMass: mass.atomicMass,
    qBetaMinus: mass.qBetaMinus,
    qAlpha,
    q2BetaMinus,
    qECp,
    qBetaMinusN,
    sn,
    sp,
    s2n,
    s2p,
  };
  return AME_DETAIL_FIELDS.map((field) => encodeMeasured(values[field]));
}

function unique<T extends { z: number; a: number }>(rows: T[], name: string) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const k = key(row.z, row.a);
    if (map.has(k)) throw new Error(`${name}: (Z, A) = (${row.z}, ${row.a}) 중복`);
    map.set(k, row);
  }
  return map;
}

export function buildDataset(raw: RawSources): BuildResult {
  const warnings: string[] = [];
  const nubase = parseNubase(raw.nubase.text);
  const massRows = parseMass(raw.mass.text);
  const rct1Rows = parseRct(raw.rct1.text, 'rct1');
  const rct2Rows = parseRct(raw.rct2.text, 'rct2');
  const mass = unique(massRows, 'mass');
  const rct1 = unique(rct1Rows, 'rct1');
  const rct2 = unique(rct2Rows, 'rct2');

  // (Z, A)로 기저·들뜬 상태 묶기
  const grounds = new Map<string, NubaseState>();
  const excitedRows = new Map<string, NubaseState[]>();
  const excitedByLetter: Record<string, number> = {};
  for (const row of nubase.states) {
    const k = key(row.z, row.a);
    if (!row.s) {
      if (grounds.has(k))
        throw new Error(`nubase:${row.line}: 기저 상태 중복 ${row.symbol}-${row.a}`);
      grounds.set(k, row);
    } else {
      excitedByLetter[row.s] = (excitedByLetter[row.s] ?? 0) + 1;
      excitedRows.set(k, [...(excitedRows.get(k) ?? []), row]);
    }
  }
  for (const list of excitedRows.values()) {
    const first = list[0]!;
    if (!grounds.has(key(first.z, first.a))) {
      throw new Error(`nubase:${first.line}: 기저 상태 없는 들뜬 상태`);
    }
  }

  const ordered = [...grounds.values()].sort((p, q) => p.z - q.z || p.a - q.a);
  const nuclides: StoredNuclide[] = [];
  const ameRows: (string | null)[][] = [];
  for (const row of ordered) {
    const k = key(row.z, row.a);
    const element = elements[row.z];
    if (!element || element.symbol !== row.symbol) {
      throw new Error(
        `nubase:${row.line}: 원소 기호 ${row.symbol}이 elements.ts의 Z=${row.z}(${element?.symbol})와 다름`,
      );
    }
    const joined = { mass: mass.get(k), rct1: rct1.get(k), rct2: rct2.get(k) };
    for (const [name, other] of Object.entries(joined)) {
      if (!other) throw new Error(`${name}: ${row.symbol}-${row.a} 행 없음`);
      if (other.symbol !== row.symbol) {
        throw new Error(`${name}: ${row.symbol}-${row.a}의 원소 기호가 ${other.symbol}`);
      }
    }
    const excited = (excitedRows.get(k) ?? []).map((ex) => {
      if (ex.symbol !== row.symbol)
        throw new Error(`nubase:${ex.line}: 원소 기호가 기저 상태와 다름`);
      return toStored(ex, STATE_LEVELS[ex.s]!);
    });
    excited.forEach((state, i) => {
      if (i > 0 && state.level! <= excited[i - 1]!.level!) {
        throw new Error(`${row.symbol}-${row.a}: 들뜬 상태 순서가 m, n, p, q, r, x 순이 아님`);
      }
    });
    const nuclide: StoredNuclide = { z: row.z, a: row.a, ...toStored(row, 0) };
    if (joined.mass!.bindingPerA) nuclide.bindingPerA = joined.mass!.bindingPerA;
    if (excited.length) nuclide.excited = excited;
    nuclides.push(nuclide);
    ameRows.push(ameDetailRow(joined.mass!, joined.rct1!, joined.rct2!));
  }
  for (const k of mass.keys()) if (!grounds.has(k)) warnings.push(`AME에만 있는 (Z:A) ${k}`);

  const sources = [raw.nubase, raw.mass, raw.rct1, raw.rct2].map(({ name, file, sha256 }) => ({
    name,
    file,
    sha256,
  }));
  const bounds = {
    zMin: Math.min(...nuclides.map((n) => n.z)),
    zMax: Math.max(...nuclides.map((n) => n.z)),
    nMin: Math.min(...nuclides.map((n) => n.a - n.z)),
    nMax: Math.max(...nuclides.map((n) => n.a - n.z)),
  };
  const stored: StoredDataset = {
    schemaVersion: 1,
    meta: { sources, counts: {}, bounds },
    nuclides,
  };
  const ame: AmeDetailFile = { schemaVersion: 1, fields: [...AME_DETAIL_FIELDS], rows: ameRows };

  const dataset = hydrate(stored);
  applyAmeDetails(dataset.nuclides, ame);
  const all = dataset.nuclides;
  const counts: Record<string, number> = {
    nubaseRows: nubase.rows.length,
    ground: all.length,
    observed: all.filter((n) => n.observed).length,
    excited: all.reduce((sum, n) => sum + n.excited.length, 0),
    iasExcluded: nubase.iasCount,
  };
  for (const cat of CATEGORIES) {
    const count = all.filter((n) => n.primary === cat).length;
    if (count) counts[`primary.${cat}`] = count;
  }
  stored.meta.counts = counts;

  return {
    stored,
    ame,
    dataset,
    stats: {
      nubaseRows: nubase.rows.length,
      iasExcluded: nubase.iasCount,
      excitedByLetter,
      massRows: massRows.length,
      rct1Rows: rct1Rows.length,
      rct2Rows: rct2Rows.length,
    },
    warnings,
  };
}

/**
 * 결정적 JSON: 키 순서는 생성 순서로 고정, 생성 시각 없음.
 * 핵종 하나를 한 줄로 써서 평가본을 바꿀 때 diff를 읽을 수 있게 한다.
 */
function linesJson<T extends object>(head: T, key: string, items: unknown[]): string {
  const headJson = JSON.stringify(head);
  const body = items.map((item) => JSON.stringify(item)).join(',\n');
  return `${headJson.slice(0, -1)},"${key}":[\n${body}\n]}\n`;
}

export function serializeStored({ nuclides, ...head }: StoredDataset): string {
  return linesJson(head, 'nuclides', nuclides);
}

export function serializeAme({ rows, ...head }: AmeDetailFile): string {
  return linesJson(head, 'rows', rows);
}
