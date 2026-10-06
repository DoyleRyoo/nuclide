import { describe, expect, it } from 'vitest';
import { parseDecayField } from './decayModes';
import { ameMeasured, parseMass, parseRct } from './parseAme';
import { parseHalfLife, parseNubaseLine } from './parseNubase';

describe('parseDecayField', () => {
  const parse = (field: string) => parseDecayField(field, 'test');

  it('IS를 붕괴 목록에서 떼어 자연 존재비로 둔다', () => {
    expect(parse('IS=0.7204 6;A=100;SF=7e-9 2')).toEqual({
      abundance: { v: '0.7204', u: '6' },
      decays: [
        { mode: 'A', rel: '=', value: '100' },
        { mode: 'SF', rel: '=', value: '7e-9', unc: '2' },
      ],
    });
  });

  it('04 §5.4 형식 예외를 처리한다', () => {
    expect(parse('B-=100[gs=0,m=100]').decays).toEqual([
      { mode: 'B-', rel: '=', value: '100', note: '[gs=0,m=100]' },
    ]);
    expect(parse('B+ ?; B+p ? 2p ?').decays.map((d) => [d.mode, d.rel])).toEqual([
      ['B+', '?'],
      ['B+p', '?'],
      ['2p', '?'],
    ]);
    expect(parse(' IT ?').decays).toEqual([{ mode: 'IT', rel: '?' }]);
    expect(parse('B+3p=0.13 +18-8').decays[0]).toMatchObject({ value: '0.13', unc: '+18-8' });
    expect(parse('B+p=83.4 13.2').decays[0]).toMatchObject({ value: '83.4', unc: '13.2' });
    expect(parse('IT=98.6 3[gs=0,m=98.6];B-=1.4 3').decays[0]).toEqual({
      mode: 'IT',
      rel: '=',
      value: '98.6',
      unc: '3',
      note: '[gs=0,m=98.6]',
    });
  });

  it('`=?`(관측, 세기 미상)와 ` ?`(미관측)를 구별한다', () => {
    expect(parse('B-=?;IT ?;B-n ?').decays).toEqual([
      { mode: 'B-', rel: '=' },
      { mode: 'IT', rel: '?' },
      { mode: 'B-n', rel: '?' },
    ]);
    expect(parse('B+= ?; IT ?').decays).toEqual([
      { mode: 'B+', rel: '=' },
      { mode: 'IT', rel: '?' },
    ]);
    expect(() => parse('B-=? 3')).toThrow();
    expect(() => parse('IS=?')).toThrow(/IS 값 없음/);
  });

  it('값 끝의 #은 추정 표시로 뗀다', () => {
    expect(parse('B+=100;A=3.310e-5#;B+A ?').decays[1]).toEqual({
      mode: 'A',
      rel: '=',
      value: '3.310e-5',
      est: true,
    });
    expect(parse('A~7.7e-9#').decays[0]).toMatchObject({ rel: '~', value: '7.7e-9', est: true });
  });

  it('모르는 토큰과 깨진 항목은 빌드를 실패시킨다', () => {
    expect(() => parse('XX=100')).toThrow(/알 수 없는 붕괴 토큰/);
    expect(() => parse('B-=abc')).toThrow(/숫자가 아님/);
    expect(() => parse('B- 100')).toThrow();
  });
});

describe('parseHalfLife', () => {
  it('값·단위·불확도·한계·추정을 원문으로 보존한다', () => {
    expect(parseHalfLife('704', 'My', '1', 't')).toEqual({
      kind: 'value',
      value: '704',
      unit: 'My',
      unc: '1',
    });
    expect(parseHalfLife('>912.4', 'ys', '', 't')).toEqual({
      kind: 'value',
      value: '912.4',
      unit: 'ys',
      rel: '>',
    });
    expect(parseHalfLife('5#', 'ms', '>620ns', 't')).toEqual({
      kind: 'value',
      value: '5',
      unit: 'ms',
      unc: '>620ns',
      est: true,
    });
  });

  it('안정·입자 비속박·미상도 한계 불확도를 보존한다', () => {
    expect(parseHalfLife('stbl', '', '>9.9Zy', 't')).toEqual({ kind: 'stable', unc: '>9.9Zy' });
    expect(parseHalfLife('p-unst', '', '', 't')).toEqual({ kind: 'particle-unbound' });
    expect(parseHalfLife('', '', '<26 ns', 't')).toEqual({ kind: 'unknown', unc: '<26 ns' });
  });

  it('모르는 단위는 빌드를 실패시킨다', () => {
    expect(() => parseHalfLife('5', 'Gs', '', 't')).toThrow(/알 수 없는 반감기 단위/);
  });
});

describe('parseNubaseLine', () => {
  it('열 위치로 자른다 (공백으로 나누지 않는다)', () => {
    const row = parseNubaseLine(
      '177 0791   177Aum -21356         10         190          7       AD     1.193  s 0.013  11/2-*        19          1975 A=60 10;B+ ?',
      1,
    );
    expect(row).toMatchObject({
      a: 177,
      z: 79,
      symbol: 'Au',
      s: 'm',
      massExcess: { v: '-21356', u: '10' },
      exc: { v: '190', u: '7' },
      halfLife: { kind: 'value', value: '1.193', unit: 's', unc: '0.013' },
      jpi: '11/2-*',
      discovery: 1975,
      decayField: 'A=60 10;B+ ?',
    });
  });

  it('non-exist 들뜬 상태와 순서 표시를 읽는다', () => {
    const row = parseNubaseLine(
      '076 0291   76Cu m                          non-exist             RN     1.27   s 0.30   (1,3)         95          1990 B-=100',
      1,
    );
    expect(row.nonExistent).toBe(true);
    expect(row.exc).toBeUndefined();
    const flagged = parseNubaseLine(
      '180 0731   180Tam -48858.3        1.6        75.3        1.4     RQ   stbl       >45 Py 9-            15          1940 IS=0.01201 32;B- ?',
      1,
    );
    expect(flagged.halfLife).toEqual({ kind: 'stable', unc: '>45 Py' });
  });
});

describe('AME', () => {
  it('#은 소수점 자리의 추정 표시, *은 값 없음', () => {
    expect(ameMeasured('-13736#', '2000#', 't')).toEqual({ v: '-13736', u: '2000', est: true });
    expect(ameMeasured('*', '', 't')).toBeUndefined();
    expect(ameMeasured('4678.0559', '0.6911', 't')).toEqual({ v: '4678.0559', u: '0.6911' });
  });

  it('mass_1: 원자 질량 정수부와 소수부를 잇는다', () => {
    const text = [
      'header',
      '                                   (keV)                  (keV)                    (keV)                        (micro-u)',
      '  51  143   92  235 U         40918.782       1.116      7590.9151     0.0048  B-   -124.2619     0.8524  235 043928.117       1.198',
      '  -3    0    3    3 Li  -pp   28667#       2000#        -2267#       667#      B-      *                    3 030775#       2147#',
    ].join('\n');
    const [u, li] = parseMass(text);
    expect(u).toEqual({
      z: 92,
      a: 235,
      symbol: 'U',
      massExcess: { v: '40918.782', u: '1.116' },
      bindingPerA: { v: '7590.9151', u: '0.0048' },
      qBetaMinus: { v: '-124.2619', u: '0.8524' },
      atomicMass: { v: '235043928.117', u: '1.198' },
    });
    expect(li?.qBetaMinus).toBeUndefined();
    expect(li?.atomicMass).toEqual({ v: '3030775', u: '2147', est: true });
  });

  it('rct: 값 12자 + 불확도 10자 × 6쌍, CRLF도 읽는다', () => {
    const text =
      '1 A  elt  Z        S(2n)\r\n0  3 H    1    8481.7963    0.0009      *                     *                -13717#     2000#          *                     *\r\n';
    const [row] = parseRct(text, 'rct1');
    expect(row).toMatchObject({ z: 1, a: 3, symbol: 'H' });
    expect(row?.values).toEqual([
      { v: '8481.7963', u: '0.0009' },
      undefined,
      undefined,
      { v: '-13717', u: '2000', est: true },
      undefined,
      undefined,
    ]);
  });
});
