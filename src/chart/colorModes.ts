import type { DecayCategory, NuclideIndex } from '../data/types';
import { hexToRgb, plasma, textOn, toHex, viridis } from '../theme/colormaps';
import type { ThemeTokens } from '../theme/tokens';
import type { ColorMode } from './types';

/** 붕괴 모드 팔레트 (03 §3). 안정 칸은 테마에 따라 뒤집힌다. */
export const DECAY_ORDER: DecayCategory[] = [
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

const DECAY_FILL: Record<DecayCategory, string> = {
  stable: '#111827',
  'beta-': '#2563EB',
  'beta+': '#DC2626',
  alpha: '#FACC15',
  sf: '#22C55E',
  p: '#F97316',
  n: '#7C3AED',
  it: '#94A3B8',
  cluster: '#DB2777',
  other: '#6B7280',
  unknown: '#6B7280',
};

const DECAY_TEXT: Record<DecayCategory, string> = {
  stable: '#FFFFFF',
  'beta-': '#FFFFFF',
  'beta+': '#FFFFFF',
  alpha: '#111827',
  sf: '#111827',
  p: '#111827',
  n: '#FFFFFF',
  it: '#111827',
  cluster: '#FFFFFF',
  other: '#FFFFFF',
  unknown: '#FFFFFF',
};

export function decayFill(cat: DecayCategory, theme: ThemeTokens): string {
  return cat === 'stable' && theme.name === 'dark' ? '#E5E7EB' : DECAY_FILL[cat];
}

export function decayText(cat: DecayCategory, theme: ThemeTokens): string {
  return cat === 'stable' && theme.name === 'dark' ? '#111827' : DECAY_TEXT[cat];
}

/** 연속 모드는 64단계로 양자화한다 (05 §4.3). */
export const STEPS = 64;

export interface ColorTable {
  /** 핵종 인덱스 → 팔레트 인덱스 */
  index: Uint8Array;
  fill: string[];
  text: string[];
}

/** 연속 스케일 도메인 (03 §4) */
export const HALF_LIFE_DOMAIN = { min: -9, max: 18 } as const; // log10(초)
export const BINDING_DOMAIN = { min: 7000, max: 8800 } as const; // keV

function continuous(map: (t: number) => [number, number, number], from: number) {
  const fill: string[] = [];
  const text: string[] = [];
  for (let i = 0; i < STEPS; i++) {
    const rgb = map(from + ((1 - from) * i) / (STEPS - 1));
    fill.push(toHex(rgb));
    text.push(textOn(rgb));
  }
  return { fill, text };
}

const step = (t: number) => Math.round(Math.max(0, Math.min(1, t)) * (STEPS - 1));

/** 색상 모드·테마가 바뀔 때 한 번 계산한다. */
export function computeColors(
  index: NuclideIndex,
  mode: ColorMode,
  theme: ThemeTokens,
): ColorTable {
  const { nuclides } = index;
  const table = new Uint8Array(nuclides.length);
  if (mode === 'halflife' || mode === 'binding') {
    const { fill, text } =
      mode === 'halflife' ? continuous(viridis, 0.08) : continuous(plasma, 0.1);
    const na = STEPS;
    const stable = STEPS + 1;
    fill.push(theme.cellNa, decayFill('stable', theme));
    text.push(textOn(hexToRgb(theme.cellNa)), decayText('stable', theme));
    nuclides.forEach((n, i) => {
      if (mode === 'halflife') {
        if (n.halfLife.kind === 'stable') table[i] = stable;
        else if (n.halfLife.seconds === undefined || n.halfLife.seconds <= 0) table[i] = na;
        else {
          const { min, max } = HALF_LIFE_DOMAIN;
          table[i] = step((Math.log10(n.halfLife.seconds) - min) / (max - min));
        }
      } else {
        const b = n.ame?.bindingPerA;
        if (!b) table[i] = na;
        else {
          const { min, max } = BINDING_DOMAIN;
          table[i] = step((Number(b.v) - min) / (max - min));
        }
      }
    });
    return { index: table, fill, text };
  }
  // 붕괴 모드 (발견 연도·자연 존재비 모드는 P2라 붕괴 모드로 그린다)
  nuclides.forEach((n, i) => {
    table[i] = DECAY_ORDER.indexOf(n.primary);
  });
  return {
    index: table,
    fill: DECAY_ORDER.map((c) => decayFill(c, theme)),
    text: DECAY_ORDER.map((c) => decayText(c, theme)),
  };
}
