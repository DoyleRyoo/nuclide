import { DECAY_MODES } from '../../src/data/decay';
import type { Measured, StoredBranch } from '../../src/data/types';

const NUMBER = /^(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
const ENTRY = /^(.+?)\s*([=~<>?])\s*(.*)$/;

export interface ParsedDecays {
  decays: StoredBranch[];
  abundance?: Measured;
}

/** NUBASE 붕괴 필드(120–209열)를 해석한다 (04 §5.1, §5.4). */
export function parseDecayField(field: string, where: string): ParsedDecays {
  const decays: StoredBranch[] = [];
  let abundance: Measured | undefined;
  const entries = field
    .split(';')
    // `B+p ? 2p ?`처럼 `;`가 빠진 경우는 `?` 뒤에서 나눈다.
    .flatMap((piece) => piece.trim().split(/(?<=\?)\s+/))
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const match = ENTRY.exec(entry);
    if (!match) throw new Error(`${where}: 붕괴 항목을 해석할 수 없음 "${entry}"`);
    const mode = match[1]!.trim();
    let rel = match[2] as StoredBranch['rel'];
    let rest = match[3]!.trim();
    let note: string | undefined;
    const noteMatch = /\[[^\]]*\]/.exec(rest);
    if (noteMatch) {
      note = noteMatch[0];
      rest = (rest.slice(0, noteMatch.index) + rest.slice(noteMatch.index + note.length)).trim();
    }
    // `B-=?`, `B+= ?`: 관계가 '='이지만 값 대신 '?'가 온다.
    if (rel === '=' && rest === '?') {
      rel = '?';
      rest = '';
    }
    const parts = rest ? rest.split(/\s+/) : [];
    if (rel === '?' ? parts.length > 0 : parts.length < 1 || parts.length > 2) {
      throw new Error(`${where}: 붕괴 항목의 값 형식이 예상과 다름 "${entry}"`);
    }
    let value = parts[0];
    const unc = parts[1];
    const est = !!value?.endsWith('#');
    if (value && est) value = value.slice(0, -1);
    if (value !== undefined && !NUMBER.test(value)) {
      throw new Error(`${where}: 붕괴 항목의 값이 숫자가 아님 "${entry}"`);
    }
    if (unc !== undefined && !/^(?:\d+\.?\d*|\+\d+-\d+)$/.test(unc)) {
      throw new Error(`${where}: 붕괴 항목의 불확도 형식이 예상과 다름 "${entry}"`);
    }
    if (mode === 'IS') {
      if (abundance) throw new Error(`${where}: IS가 두 번 나옴`);
      if (value === undefined || rel === '?') throw new Error(`${where}: IS 값 없음`);
      abundance = { v: value };
      if (unc !== undefined) abundance.u = unc;
      if (est) abundance.est = true;
      if (rel !== '=') abundance.rel = rel;
      continue;
    }
    if (!DECAY_MODES[mode]) throw new Error(`${where}: 알 수 없는 붕괴 토큰 "${mode}"`);
    const branch: StoredBranch = { mode, rel };
    if (value !== undefined) branch.value = value;
    if (unc !== undefined) branch.unc = unc;
    if (est) branch.est = true;
    if (note) branch.note = note;
    decays.push(branch);
  }
  return abundance ? { decays, abundance } : { decays };
}
