import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { hydrate } from '../data/hydrate';
import { buildIndex } from '../data/load';
import type { NuclideIndex, StoredDataset } from '../data/types';
import { contrast, hexToRgb, plasma, toHex, viridis } from '../theme/colormaps';
import { darkTheme, lightTheme } from '../theme/tokens';
import { computeColors, DECAY_ORDER, STEPS } from './colorModes';
import { keyAction } from './input/keyboard';
import { arrowBranches } from './render/overlay';

let index: NuclideIndex;
beforeAll(() => {
  const stored = JSON.parse(
    readFileSync(new URL('../data/generated/nuclides.json', import.meta.url), 'utf8'),
  ) as StoredDataset;
  index = buildIndex(hydrate(stored));
});

const idx = (id: string) => index.nuclides.indexOf(index.byId.get(id)!);

describe('색 지도', () => {
  it('viridis·plasma 근사식의 양 끝이 matplotlib 값과 가깝다', () => {
    const close = (a: string, b: string) =>
      hexToRgb(a).every((v, k) => Math.abs(v - hexToRgb(b)[k]!) <= 6);
    expect(close(toHex(viridis(0)), '#440154')).toBe(true);
    expect(close(toHex(viridis(1)), '#fde725')).toBe(true);
    expect(close(toHex(plasma(0)), '#0d0887')).toBe(true);
    expect(close(toHex(plasma(1)), '#f0f921')).toBe(true);
  });
});

describe('computeColors', () => {
  it('붕괴 모드: 주 붕괴 범주의 색, 안정 칸은 테마에 따라 뒤집힌다', () => {
    const light = computeColors(index, 'decay', lightTheme);
    const dark = computeColors(index, 'decay', darkTheme);
    const fe = idx('Fe-56');
    expect(light.fill[light.index[fe]!]).toBe('#111827');
    expect(dark.fill[dark.index[fe]!]).toBe('#E5E7EB');
    expect(DECAY_ORDER[light.index[idx('U-235')]!]).toBe('alpha');
    expect(light.fill[light.index[idx('C-14')]!]).toBe('#2563EB');
  });

  it('칸 글자 대비는 WCAG AA(4.5:1) 이상이다 (03 §3)', () => {
    for (const theme of [lightTheme, darkTheme]) {
      const { fill, text } = computeColors(index, 'decay', theme);
      fill.forEach((f, k) => {
        expect(contrast(hexToRgb(f), hexToRgb(text[k]!))).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  it('반감기 모드: 안정·미상은 특수 색, 나머지는 log10(초) 스케일', () => {
    const { index: table } = computeColors(index, 'halflife', lightTheme);
    expect(table[idx('Fe-56')]).toBe(STEPS + 1); // 안정
    const unknown = index.nuclides.findIndex((n) => n.halfLife.kind === 'unknown');
    expect(table[unknown]).toBe(STEPS); // 값 없음
    // 짧은 반감기일수록 낮은 단계
    expect(table[idx('Be-8')]!).toBeLessThan(table[idx('C-14')]!);
    // ²³⁸U 4.463 Gy → log10(초) ≈ 17.15 → (17.15 + 9) / 27 × 63 ≈ 61
    expect(table[idx('U-238')]).toBe(61);
    // ²⁰⁹Bi 20.1 Ey는 도메인 상한(10¹⁸ s)을 넘어 끝 색으로 클램프
    expect(table[idx('Bi-209')]).toBe(STEPS - 1);
  });

  it('결합에너지 모드: 7.0–8.8 MeV, ⁶²Ni가 가장 밝은 단계', () => {
    const { index: table } = computeColors(index, 'binding', lightTheme);
    expect(table[idx('Ni-62')]).toBe(STEPS - 1);
    expect(table[idx('H-1')]).toBe(0); // 7 MeV보다 작아 최저 색으로 클램프
  });
});

describe('keyAction (02 §7)', () => {
  const key = (
    k: string,
    mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {},
  ) =>
    keyAction({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });

  it('방향키는 이웃 선택, Shift + 방향키는 20% 이동', () => {
    expect(key('ArrowRight')).toEqual({ type: 'navigate', dn: 1, dz: 0 });
    expect(key('ArrowUp')).toEqual({ type: 'navigate', dn: 0, dz: 1 });
    expect(key('ArrowRight', { shiftKey: true })).toEqual({ type: 'pan', fx: -0.2, fy: 0 });
  });

  it('줌·전체 보기·열기, Ctrl 조합은 브라우저에 남긴다', () => {
    expect(key('+')).toEqual({ type: 'zoom', factor: 2 });
    expect(key('=')).toEqual({ type: 'zoom', factor: 2 });
    expect(key('-')).toEqual({ type: 'zoom', factor: 0.5 });
    expect(key('0')).toEqual({ type: 'fit' });
    expect(key('Enter')).toEqual({ type: 'activate' });
    expect(key('0', { ctrlKey: true })).toBeNull();
    expect(key('c')).toBeNull();
  });
});

describe('arrowBranches (03 §6.3)', () => {
  it('0.01 % 미만의 분기는 화살표를 생략한다 (²³⁵U의 클러스터 붕괴)', () => {
    expect(arrowBranches(index.byId.get('U-235')!).map((b) => b.mode)).toEqual(['A']);
  });

  it('분기비가 큰 순서, IT·SF는 제외, 세기 미상은 포함', () => {
    expect(arrowBranches(index.byId.get('Ta-180')!).map((b) => b.mode)).toEqual(['EC', 'B-']);
    expect(arrowBranches(index.byId.get('Au-177')!).map((b) => b.mode)).toEqual(['B+', 'A']);
  });
});
