import { UNIT_SECONDS } from '../../src/data/decay';
import type { Measured, StoredHalfLife } from '../../src/data/types';
import { parseDecayField, type ParsedDecays } from './decayModes';

/** 기저·이성질체 상태를 구분하는 NUBASE 문자 → 들뜬 상태 번호 (m, m2 … m6). */
export const STATE_LEVELS: Record<string, number> = { m: 1, n: 2, p: 3, q: 4, r: 5, x: 6 };
export const IAS_STATES = new Set(['i', 'j']);

export interface NubaseRow {
  line: number;
  a: number;
  z: number;
  symbol: string;
  /** 17열 문자. 빈 문자열 = 기저 상태 */
  s: string;
  massExcess?: Measured;
  exc?: Measured;
  nonExistent: boolean;
  orderUncertain: boolean;
  orderInverted: boolean;
  halfLife: StoredHalfLife;
  jpi?: string;
  discovery?: number;
  decayField: string;
}

export interface NubaseState extends Omit<NubaseRow, 'decayField'>, ParsedDecays {}

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;

/** 1부터 세는 열 번호로 자른다. */
const col = (line: string, from: number, to: number) => line.slice(from - 1, to).trim();

/** NUBASE 수치: 끝의 `#`은 계통성 추정 (04 §4.2). */
export function nubaseMeasured(value: string, unc: string, where: string): Measured | undefined {
  if (!value) return undefined;
  const est = value.endsWith('#');
  const v = est ? value.slice(0, -1) : value;
  if (!NUMBER.test(v)) throw new Error(`${where}: 수치 형식이 예상과 다름 "${value}"`);
  const m: Measured = { v };
  const u = unc.replace(/#$/, '');
  if (u) {
    if (!NUMBER.test(u)) throw new Error(`${where}: 불확도 형식이 예상과 다름 "${unc}"`);
    m.u = u;
  }
  if (est) m.est = true;
  return m;
}

/** 반감기 (04 §4.4). 초 환산은 앱의 hydrate가 한다. 모르는 단위는 빌드를 실패시킨다. */
export function parseHalfLife(
  raw: string,
  unitRaw: string,
  unc: string,
  where: string,
): StoredHalfLife {
  if (raw === 'stbl' || raw === 'p-unst' || !raw) {
    if (unitRaw) throw new Error(`${where}: 반감기 값 없이 단위만 있음 "${unitRaw}"`);
    // 값이 없어도 불확도 칸에 한계가 있을 수 있다 (예: 40Ca 안정 `>9.9Zy`, 18B 미상 `<26 ns`).
    const kind = raw === 'stbl' ? 'stable' : raw ? 'particle-unbound' : 'unknown';
    const h: StoredHalfLife = { kind };
    if (unc) h.unc = unc;
    return h;
  }
  const match = /^([<>~]?)(\d+\.?\d*|\.\d+)(#?)$/.exec(raw);
  if (!match) throw new Error(`${where}: 반감기 형식이 예상과 다름 "${raw}"`);
  if (!(unitRaw in UNIT_SECONDS)) throw new Error(`${where}: 알 수 없는 반감기 단위 "${unitRaw}"`);
  const rel = match[1] as '' | '<' | '>' | '~';
  const h: StoredHalfLife = { kind: 'value', value: match[2]!, unit: unitRaw };
  if (unc) h.unc = unc;
  if (match[3]) h.est = true;
  if (rel) h.rel = rel;
  return h;
}

/** nubase_4.mas20.txt의 한 행을 열 위치로 자른다 (04 §4.1). */
export function parseNubaseLine(rawLine: string, lineNo: number): NubaseRow {
  const where = `nubase:${lineNo}`;
  // 줄 끝 공백이 잘려 있으므로 209자로 채운 뒤 자른다.
  const line = rawLine.padEnd(209);
  const a = Number(col(line, 1, 3));
  const z = Number(col(line, 5, 7));
  const aEl = col(line, 12, 16);
  const s = line.charAt(16);
  const elMatch = /^(\d+)([A-Za-z]+)$/.exec(aEl);
  if (!Number.isInteger(a) || !Number.isInteger(z) || !elMatch || Number(elMatch[1]) !== a) {
    throw new Error(`${where}: A·Z·원소 열이 예상과 다름 "${rawLine.slice(0, 17)}"`);
  }
  if (s !== ' ' && !(s in STATE_LEVELS) && !IAS_STATES.has(s)) {
    throw new Error(`${where}: 알 수 없는 상태 문자 "${s}"`);
  }
  const excRaw = col(line, 43, 54);
  const nonExistent = excRaw === 'non-exist';
  const discoveryRaw = col(line, 115, 118);
  if (discoveryRaw && !/^\d{4}$/.test(discoveryRaw)) {
    throw new Error(`${where}: 발견 연도 형식이 예상과 다름 "${discoveryRaw}"`);
  }
  const row: NubaseRow = {
    line: lineNo,
    a,
    z,
    symbol: elMatch[2]!,
    s: s === ' ' ? '' : s,
    nonExistent,
    orderUncertain: line.charAt(67) === '*',
    orderInverted: line.charAt(68) === '&',
    halfLife: { kind: 'unknown' },
    decayField: col(line, 120, 209),
  };
  const massExcess = nubaseMeasured(col(line, 19, 31), col(line, 32, 42), where);
  if (massExcess) row.massExcess = massExcess;
  const exc = nonExistent ? undefined : nubaseMeasured(excRaw, col(line, 55, 65), where);
  if (exc) row.exc = exc;
  const jpi = col(line, 89, 102);
  if (jpi) row.jpi = jpi;
  if (discoveryRaw) row.discovery = Number(discoveryRaw);
  // IAS 행은 앱에서 제외하므로 반감기·붕괴 필드를 해석하지 않는다(반감기 불확도 칸에 T=가 섞여 있다).
  if (!IAS_STATES.has(s)) {
    row.halfLife = parseHalfLife(col(line, 70, 78), col(line, 79, 80), col(line, 82, 88), where);
  }
  return row;
}

export interface NubaseParse {
  rows: NubaseRow[];
  states: NubaseState[];
  iasCount: number;
}

export function parseNubase(text: string): NubaseParse {
  const rows: NubaseRow[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    rows.push(parseNubaseLine(line, i + 1));
  });
  const states: NubaseState[] = [];
  let iasCount = 0;
  for (const { decayField, ...row } of rows) {
    if (IAS_STATES.has(row.s)) {
      iasCount++;
      continue;
    }
    states.push({ ...row, ...parseDecayField(decayField, `nubase:${row.line}`) });
  }
  return { rows, states, iasCount };
}
