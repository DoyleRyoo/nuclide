import { describe, expect, it } from 'vitest';
import {
  decayModeLabel,
  formatAbundance,
  formatAtomicMass,
  formatBranch,
  formatBranchShort,
  formatHalfLife,
  formatHalfLifeHuman,
  formatHalfLifeShort,
  formatMeasured,
  formatNumber,
  lastDigitUncertainty,
  nuclideLabel,
  roundAme,
  roundDecimal,
  shiftDecimal,
} from './format';
import { UNIT_SECONDS } from './decay';
import type { DecayBranch, HalfLife } from './types';

const branch = (b: Partial<DecayBranch>): DecayBranch => ({
  mode: 'A',
  cat: 'alpha',
  rel: '=',
  ...b,
});
const halfLife = (h: Omit<HalfLife, 'seconds'>): HalfLife => ({
  ...h,
  seconds: h.value && h.unit ? Number(h.value) * UNIT_SECONDS[h.unit]! : undefined,
});

describe('숫자 표시', () => {
  it('천 단위 쉼표, 긴 소수부 띄움, 마이너스 기호', () => {
    expect(formatNumber('40918.8')).toBe('40,918.8');
    expect(formatNumber('7590.9151')).toBe('7,590.9151');
    expect(formatNumber('-124.26')).toBe('−124.26');
    expect(formatNumber('235.0439281')).toBe('235.043 928 1');
    expect(formatNumber('0.000018')).toBe('0.000018');
  });

  it('십진 문자열 반올림은 부동소수 오차가 없다', () => {
    expect(roundDecimal('4678.0559', -2)).toBe('4678.06');
    expect(roundDecimal('0.6911', -2)).toBe('0.69');
    expect(roundDecimal('1.005', -2)).toBe('1.01');
    expect(roundDecimal('9.996', -2)).toBe('10.00');
    expect(roundDecimal('25323.190', 1)).toBe('25320');
    expect(roundDecimal('-0.001', -2)).toBe('0.00');
    expect(roundDecimal('5', -2)).toBe('5.00');
  });

  it('AME 값: 불확도 유효숫자 2자리 (3자리 이상일 때만)', () => {
    expect(roundAme({ v: '4678.0559', u: '0.6911' })).toEqual({ v: '4678.06', u: '0.69' });
    expect(roundAme({ v: '7590.91514', u: '0.00478' })).toEqual({ v: '7590.9151', u: '0.0048' });
    expect(roundAme({ v: '25323.190', u: '212.132' })).toEqual({ v: '25320', u: '210' });
    expect(roundAme({ v: '28667', u: '2000', est: true })).toEqual({
      v: '28667',
      u: '2000',
      est: true,
    });
    expect(formatMeasured({ v: '-124.2619', u: '0.8524' }, { round: true })).toBe('−124.26 ± 0.85');
  });

  it('원자 질량: μu를 반올림한 뒤 u로 (03 §7.6)', () => {
    expect(shiftDecimal('235043928.1', -6)).toBe('235.0439281');
    expect(shiftDecimal('1.2', -6)).toBe('0.0000012');
    expect(shiftDecimal('3030775', -6)).toBe('3.030775');
    expect(formatAtomicMass({ v: '235043928.117', u: '1.198' })).toBe(
      '235.043 928 1 ± 0.000 001 2',
    );
    expect(formatAtomicMass({ v: '3030775', u: '2147', est: true })).toBe('3.0308# ± 0.0021');
  });

  it('NUBASE 값은 원문 그대로, 추정값은 #', () => {
    expect(formatMeasured({ v: '40918.8', u: '1.1' })).toBe('40,918.8 ± 1.1');
    expect(formatMeasured({ v: '28670', u: '2000', est: true })).toBe('28,670# ± 2,000');
  });
});

describe('자연 존재비·분기비', () => {
  it('마지막 자릿수 기준 불확도를 절댓값으로 바꾼다', () => {
    expect(lastDigitUncertainty('0.7204', '6')).toBe('0.0006');
    expect(lastDigitUncertainty('91.754', '106')).toBe('0.106');
    expect(lastDigitUncertainty('45.2', '16')).toBe('1.6');
    expect(lastDigitUncertainty('40', '6')).toBe('6');
    expect(lastDigitUncertainty('83.4', '13.2')).toBe('13.2');
    expect(formatAbundance({ v: '0.7204', u: '6' })).toBe('0.7204 ± 0.0006');
  });

  it('분기비 표기 (04 §4.5, §9)', () => {
    expect(formatBranch(branch({ value: '100' }))).toBe('100 %');
    expect(formatBranch(branch({ value: '7e-9', unc: '2' }))).toBe('(7 ± 2) × 10⁻⁹ %');
    expect(formatBranch(branch({ value: '5.5e-5', unc: '2' }))).toBe('(5.5 ± 0.2) × 10⁻⁵ %');
    expect(formatBranch(branch({ rel: '~', value: '8e-10' }))).toBe('~8 × 10⁻¹⁰ %');
    expect(formatBranch(branch({ rel: '<', value: '0.004' }))).toBe('< 0.004 %');
    expect(formatBranch(branch({ value: '83.4', unc: '13.2' }))).toBe('83.4 ± 13.2 %');
    expect(formatBranch(branch({ value: '0.13', unc: '+18-8' }))).toBe('0.13 +0.18 −0.08 %');
    expect(formatBranch(branch({ value: '3.310e-5', est: true }))).toBe('3.310# × 10⁻⁵ %');
    expect(formatBranch(branch({ rel: '?' }))).toBe('?');
    expect(formatBranchShort(branch({ value: '7e-9', unc: '2' }))).toBe('7e−9 %');
  });

  it('붕괴 토큰과 핵종 표기', () => {
    expect(decayModeLabel('B-')).toBe('β−');
    expect(decayModeLabel('B+p')).toBe('β+p');
    expect(decayModeLabel('B-A')).toBe('β−α');
    expect(decayModeLabel('A')).toBe('α');
    expect(decayModeLabel('14C')).toBe('14C');
    expect(nuclideLabel('U', 235)).toBe('²³⁵U');
    expect(nuclideLabel('Tc', 99, 1)).toBe('⁹⁹ᵐTc');
    expect(nuclideLabel('U', 235, 2)).toBe('²³⁵ᵐ²U');
  });
});

describe('반감기', () => {
  it('패널 표기', () => {
    expect(formatHalfLife(halfLife({ kind: 'value', value: '704', unit: 'My', unc: '1' }))).toBe(
      '704 ± 1 My',
    );
    expect(formatHalfLife(halfLife({ kind: 'value', value: '25.7', unit: 'm', unc: '0.1' }))).toBe(
      '25.7 ± 0.1 min',
    );
    expect(
      formatHalfLife(halfLife({ kind: 'value', value: '5', unit: 'ms', unc: '>620ns', est: true })),
    ).toBe('5# ms (> 620 ns)');
    expect(formatHalfLife(halfLife({ kind: 'value', value: '912.4', unit: 'ys', rel: '>' }))).toBe(
      '> 912.4 ys',
    );
    expect(formatHalfLife({ kind: 'stable', unc: '>9.9Zy' }, 'ko')).toBe('안정 (> 9.9 Zy)');
    expect(formatHalfLife({ kind: 'stable' }, 'en')).toBe('Stable');
    expect(formatHalfLife({ kind: 'unknown', unc: '<26 ns' })).toBe('< 26 ns');
    expect(formatHalfLife({ kind: 'particle-unbound' })).toBe('입자 비속박');
  });

  it('칸·툴팁 표기', () => {
    expect(
      formatHalfLifeShort(halfLife({ kind: 'value', value: '704', unit: 'My', unc: '1' })),
    ).toBe('704 My');
    expect(formatHalfLifeShort(halfLife({ kind: 'value', value: '1.5', unit: 'us' }))).toBe(
      '1.5 μs',
    );
    expect(formatHalfLifeShort({ kind: 'stable' })).toBe('');
  });

  it('사람이 읽는 반감기 (P1)', () => {
    const u235 = halfLife({ kind: 'value', value: '704', unit: 'My' });
    expect(formatHalfLifeHuman(u235, 'ko')).toBe('≈ 7억 400만 년');
    expect(formatHalfLifeHuman(u235, 'en')).toBe('≈ 704 million years');
    expect(formatHalfLifeHuman(halfLife({ kind: 'value', value: '6.0066', unit: 'h' }), 'ko')).toBe(
      '≈ 6시간 0분',
    );
    expect(formatHalfLifeHuman(halfLife({ kind: 'value', value: '77.236', unit: 'd' }), 'ko')).toBe(
      '≈ 77일',
    );
    expect(formatHalfLifeHuman(halfLife({ kind: 'value', value: '5.70', unit: 'ky' }), 'ko')).toBe(
      '≈ 5,700년',
    );
    expect(formatHalfLifeHuman(halfLife({ kind: 'value', value: '2.25', unit: 'Yy' }), 'ko')).toBe(
      '≈ 2.25 × 10²⁴ 년',
    );
    expect(formatHalfLifeHuman(halfLife({ kind: 'value', value: '30', unit: 's' }), 'ko')).toBe('');
  });
});
