import type { Measured } from '../../src/data/types';

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;

/** 1부터 세는 열 번호로 자른다. */
const col = (line: string, from: number, to: number) => line.slice(from - 1, to).trim();

/**
 * AME 수치 (04 §6.3): `#`은 소수점 자리에 들어간 추정 표시, `*`은 계산 불가.
 * 원문 숫자열은 보존하고 `#`만 소수점으로 되돌린다 (`-13736#` → `-13736`).
 */
export function ameMeasured(value: string, unc: string, where: string): Measured | undefined {
  if (!value || value === '*') return undefined;
  const est = value.includes('#');
  const v = value.replace('#', '.').replace(/\.$/, '');
  if (!NUMBER.test(v)) throw new Error(`${where}: 수치 형식이 예상과 다름 "${value}"`);
  const m: Measured = { v };
  const u = unc.replace('#', '.').replace(/\.$/, '');
  if (u) {
    if (!NUMBER.test(u)) throw new Error(`${where}: 불확도 형식이 예상과 다름 "${unc}"`);
    m.u = u;
  }
  if (est) m.est = true;
  return m;
}

export interface MassRow {
  z: number;
  a: number;
  symbol: string;
  massExcess?: Measured;
  bindingPerA?: Measured;
  qBetaMinus?: Measured;
  atomicMass?: Measured;
}

/** mass_1.mas20.txt (04 §6.1). 데이터는 `micro-u` 머리줄 다음 줄부터. */
export function parseMass(text: string): MassRow[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes('micro-u'));
  if (start < 0) throw new Error('mass: micro-u 머리줄을 찾지 못함');
  const rows: MassRow[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (!raw.trim()) continue;
    const where = `mass:${i + 1}`;
    const line = raw.padEnd(135);
    const n = Number(col(line, 5, 9));
    const z = Number(col(line, 10, 14));
    const a = Number(col(line, 15, 19));
    const symbol = col(line, 21, 23);
    if (![n, z, a].every(Number.isInteger) || n + z !== a || !/^[A-Za-z]+$/.test(symbol)) {
      throw new Error(`${where}: N·Z·A 열이 예상과 다름 "${raw.slice(0, 30)}"`);
    }
    if (col(line, 80, 81) !== 'B-') throw new Error(`${where}: B- 라벨 위치가 예상과 다름`);
    const row: MassRow = { z, a, symbol };
    const massExcess = ameMeasured(col(line, 29, 42), col(line, 43, 54), where);
    if (massExcess) row.massExcess = massExcess;
    const bindingPerA = ameMeasured(col(line, 55, 67), col(line, 69, 78), where);
    if (bindingPerA) row.bindingPerA = bindingPerA;
    const qBetaMinus = ameMeasured(col(line, 82, 94), col(line, 95, 105), where);
    if (qBetaMinus) row.qBetaMinus = qBetaMinus;
    // 원자 질량 = 정수부(107–109) + 소수부(111–123), 단위 μu.
    const whole = col(line, 107, 109);
    const fraction = col(line, 111, 123);
    const atomicMass = ameMeasured(fraction && whole + fraction, col(line, 124, 135), where);
    if (atomicMass) row.atomicMass = atomicMass;
    rows.push(row);
  }
  return rows;
}

export interface RctRow {
  z: number;
  a: number;
  symbol: string;
  values: (Measured | undefined)[];
}

const RCT_LINE = /^[ 0-9]\s*\d+ [ A-Za-z]{3}\s*\d+/;

/** rct1.mas20.txt, rct2_1.mas20.txt (04 §6.2). 값 12자 + 불확도 10자 × 6쌍. */
export function parseRct(text: string, name: string): RctRow[] {
  const rows: RctRow[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!RCT_LINE.test(raw)) return;
    const where = `${name}:${i + 1}`;
    const line = raw.padEnd(144);
    const a = Number(col(line, 2, 4));
    const symbol = col(line, 6, 8);
    const z = Number(col(line, 9, 11));
    if (!Number.isInteger(a) || !Number.isInteger(z) || !/^[A-Za-z]+$/.test(symbol)) {
      throw new Error(`${where}: A·원소·Z 열이 예상과 다름 "${raw.slice(0, 12)}"`);
    }
    const values: (Measured | undefined)[] = [];
    for (let k = 0; k < 6; k++) {
      const v = 13 + 22 * k;
      values.push(ameMeasured(col(line, v, v + 11), col(line, v + 12, v + 21), where));
    }
    rows.push({ z, a, symbol, values });
  });
  return rows;
}
