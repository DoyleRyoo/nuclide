/**
 * 표시 규칙 (04 §9). 값은 원문 문자열에서 만들고 부동소수로 되돌리지 않는다.
 */
import type { DecayBranch, DecayCategory, HalfLife, Measured } from './types';

type Locale = 'ko' | 'en';

const MINUS = '−';
const NARROW_SPACE = ' ';
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '+': '⁺',
  m: 'ᵐ',
};

export function superscript(text: string | number): string {
  return String(text).replace(/[0-9+\-m]/g, (c) => SUPERSCRIPT[c] ?? c);
}

/** ²³⁵U, ⁹⁹ᵐTc, ¹⁷⁸ᵐ²Hf */
export function nuclideLabel(symbol: string, a: number, level = 0): string {
  return `${superscript(`${a}${level ? `m${level > 1 ? level : ''}` : ''}`)}${symbol}`;
}

/** 표시할 때 `-` → `−` (U+2212) */
export const minus = (text: string) => text.replace(/-/g, MINUS);

/**
 * 원문 숫자열을 표시용으로: 정수부 천 단위 쉼표, 소수부가 6자리를 넘으면 3자리씩 띄움,
 * 음수 부호는 U+2212.
 */
export function formatNumber(raw: string): string {
  const match = /^([-+]?)(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match) return minus(raw);
  const [, sign = '', int = '', frac] = match;
  // 원문의 불필요한 앞자리 0은 뗀다 (⁸⁴Sr `IS=00.56`).
  const grouped = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction =
    frac === undefined
      ? ''
      : `.${frac.length > 6 ? frac.replace(/(\d{3})(?=\d)/g, `$1${NARROW_SPACE}`) : frac}`;
  return `${sign === '-' ? MINUS : sign}${grouped || '0'}${fraction}`;
}

// ---- 십진 문자열 반올림 (부동소수 오차 없이) ----

/** 유효숫자 개수. 앞의 0은 빼고, 소수점이 없으면 뒤의 0도 뺀다 ("2000" → 1). */
function significantDigits(raw: string): number {
  const unsigned = raw.replace(/^[-+]/, '');
  const digits = unsigned.includes('.') ? unsigned.replace('.', '') : unsigned.replace(/0+$/, '');
  return digits.replace(/^0+/, '').length;
}

/** 가장 높은 유효 자릿수의 10의 지수. "0.6911" → −1, "212.132" → 2 */
function leadingExponent(raw: string): number {
  const [int = '', frac = ''] = raw.replace(/^[-+]/, '').split('.');
  const intDigits = int.replace(/^0+/, '');
  if (intDigits) return intDigits.length - 1;
  const zeros = /^0*/.exec(frac)![0].length;
  return -(zeros + 1);
}

/** 10^exp 자리에서 반올림(0.5는 0에서 먼 쪽). exp < 0이면 소수 −exp 자리를 남긴다. */
export function roundDecimal(raw: string, exp: number): string {
  const negative = raw.startsWith('-');
  const [int = '', frac = ''] = raw.replace(/^[-+]/, '').split('.');
  // 값 = digits × 10^(−frac.length). 10^exp 단위의 정수 units로 바꾼다.
  const digits = int + frac;
  const drop = frac.length + exp;
  let units: bigint;
  if (drop <= 0) {
    units = BigInt(digits || '0') * 10n ** BigInt(-drop);
  } else {
    const kept = digits.slice(0, Math.max(0, digits.length - drop));
    const firstDropped = Number(digits[digits.length - drop] ?? '0');
    units = BigInt(kept || '0') + (firstDropped >= 5 ? 1n : 0n);
  }
  let text: string;
  if (exp >= 0) {
    text = units === 0n ? '0' : `${units}${'0'.repeat(exp)}`;
  } else {
    const padded = units.toString().padStart(-exp + 1, '0');
    text = `${padded.slice(0, exp)}.${padded.slice(exp)}`;
  }
  return negative && units !== 0n ? `-${text}` : text;
}

/**
 * AME 값 반올림 (04 §9): 불확도를 유효숫자 2자리로, 값을 같은 자리로.
 * 불확도의 유효숫자가 3자리 이상일 때만 반올림한다.
 */
export function roundAme(m: Measured): Measured {
  const exp = ameExponent(m.u);
  if (exp === null) return m;
  return { ...m, v: roundDecimal(m.v, exp), u: roundDecimal(m.u!, exp) };
}

/** AME 반올림 자리(10의 지수). 반올림하지 않으면 null */
function ameExponent(u: string | undefined): number | null {
  if (!u || significantDigits(u) < 3) return null;
  return leadingExponent(u) - 1;
}

const REL: Record<string, string> = { '<': '< ', '>': '> ', '~': '~' };

/** "40,918.8 ± 1.1", 추정값은 "28,670# ± 2,000", AME 값은 `round`로 반올림 */
export function formatMeasured(m: Measured, options: { round?: boolean } = {}): string {
  const shown = options.round ? roundAme(m) : m;
  const value = `${m.rel ? REL[m.rel] : ''}${formatNumber(shown.v)}${m.est ? '#' : ''}`;
  return shown.u !== undefined ? `${value} ± ${formatNumber(shown.u)}` : value;
}

/** 십진 문자열의 소수점을 옮긴다. places < 0이면 10^|places|로 나눈 값 ("1.2", −6 → "0.0000012") */
export function shiftDecimal(raw: string, places: number): string {
  const sign = raw.startsWith('-') ? '-' : '';
  const [int = '', frac = ''] = raw.replace(/^[-+]/, '').split('.');
  const digits = int + frac;
  const point = int.length + places;
  let whole: string;
  let fraction: string;
  if (point <= 0) {
    whole = '0';
    fraction = '0'.repeat(-point) + digits;
  } else if (point >= digits.length) {
    whole = digits + '0'.repeat(point - digits.length);
    fraction = '';
  } else {
    whole = digits.slice(0, point);
    fraction = digits.slice(point);
  }
  whole = whole.replace(/^0+(?=\d)/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

/**
 * 원자 질량: AME의 μu 값을 반올림(§9)한 뒤 u로 바꾼다. "235.043 928 1 ± 0.000 001 2"
 * 10 μu 이상의 자리에서 반올림했으면 그 아래 0은 자리 채움이므로 u로 옮긴 뒤 잘라 낸다
 * (3 030 800 ± 2 100 μu → 3.0308 ± 0.0021 u).
 */
export function formatAtomicMass(m: Measured): string {
  const rounded = roundAme(m);
  const exp = ameExponent(m.u);
  const decimals = exp !== null && exp > 0 ? 6 - exp : undefined;
  const toU = (micro: string) => {
    const u = shiftDecimal(micro, -6);
    if (decimals === undefined) return u;
    const [int = '', frac = ''] = u.split('.');
    return decimals > 0 ? `${int}.${frac.slice(0, decimals).padEnd(decimals, '0')}` : int;
  };
  return formatMeasured({
    ...rounded,
    v: toU(rounded.v),
    ...(rounded.u !== undefined && { u: toU(rounded.u) }),
  });
}

/**
 * 마지막 자릿수 기준 불확도 → 절댓값 문자열 (04 §4.5).
 * ("0.7204", "6") → "0.0006", ("91.754", "106") → "0.106". 소수점이 있으면 이미 절댓값.
 */
export function lastDigitUncertainty(value: string, unc: string): string {
  if (unc.includes('.')) return unc;
  const mantissa = value.split(/e/i)[0]!;
  const decimals = mantissa.split('.')[1]?.length ?? 0;
  if (!decimals) return unc;
  const padded = unc.padStart(decimals + 1, '0');
  const int = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '');
  return `${int}.${padded.slice(-decimals)}`;
}

/** 칸 안의 짧은 자연 존재비: "0.7204 %". 원문의 앞자리 0은 뗀다 (⁸⁴Sr `00.56` → "0.56 %"). */
export const formatAbundanceShort = (m: Measured) => `${m.v.replace(/^0+(?=\d)/, '')} %`;

/** 자연 존재비: "0.7204 ± 0.0006" (불확도는 마지막 자릿수 기준) */
export function formatAbundance(m: Measured): string {
  const value = `${m.rel ? REL[m.rel] : ''}${formatNumber(m.v)}${m.est ? '#' : ''}`;
  return m.u ? `${value} ± ${formatNumber(lastDigitUncertainty(m.v, m.u))}` : value;
}

function formatUncertainty(value: string, unc: string): string {
  const asym = /^\+(\d+)-(\d+)$/.exec(unc);
  if (asym) {
    const plus = lastDigitUncertainty(value, asym[1]!);
    const minusPart = lastDigitUncertainty(value, asym[2]!);
    return ` +${formatNumber(plus)} ${MINUS}${formatNumber(minusPart)}`;
  }
  return ` ± ${formatNumber(lastDigitUncertainty(value, unc))}`;
}

const BRANCH_WORDS: Record<Locale, { unobserved: string; intensityUnknown: string }> = {
  ko: { unobserved: '미관측 (에너지상 가능)', intensityUnknown: '관측됨 · 세기 미상' },
  en: {
    unobserved: 'not observed (energetically allowed)',
    intensityUnknown: 'observed · intensity unknown',
  },
};

/**
 * 분기비: "100 %", "85 ± 3 %", "(7 ± 2) × 10⁻⁹ %", "~8 × 10⁻¹⁰ %", "< 0.004 %".
 * 값이 없으면 NUBASE2020 §2.5대로 미관측(` ?`)과 세기 미상(`=?`)을 구별해 쓴다.
 */
export function formatBranch(branch: DecayBranch, locale: Locale = 'ko'): string {
  if (branch.rel === '?') return BRANCH_WORDS[locale].unobserved;
  if (branch.value === undefined) return BRANCH_WORDS[locale].intensityUnknown;
  const rel = branch.rel === '=' ? '' : REL[branch.rel]!;
  const est = branch.est ? '#' : '';
  const [mantissa = '', exponent] = branch.value.split(/e/i);
  const unc = branch.unc ? formatUncertainty(mantissa, branch.unc) : '';
  if (exponent === undefined) return `${rel}${formatNumber(mantissa)}${est}${unc} %`;
  const power = `× 10${superscript(String(Number(exponent)))}`;
  const body = `${formatNumber(mantissa)}${est}${unc}`;
  return unc ? `${rel}(${body}) ${power} %` : `${rel}${body} ${power} %`;
}

/** 칸 안의 짧은 분기비: "100 %", "7e-9 %", 미관측 "?", 세기 미상 "? %" (03 §5.2) */
export function formatBranchShort(branch: DecayBranch): string {
  if (branch.rel === '?') return '?';
  if (branch.value === undefined) return '? %';
  const rel = branch.rel === '=' ? '' : branch.rel;
  return `${rel}${minus(branch.value)}${branch.est ? '#' : ''} %`;
}

/**
 * NUBASE2020의 `B+`는 전자 포획과 양전자 방출의 합(EC+β+)이고, 원문에 내역이 있으면
 * `EC`와 `e+`(양전자만)로 따로 준다. 합계를 양전자 비율로 읽지 않도록 이름을 바꿔 쓴다.
 */
const BETA_PLUS_LABELS: Record<string, string> = {
  'B+': 'EC+β+',
  'EC+B+': 'EC+β+',
  'e+': 'β+',
  '2B+': '2(EC+β+)',
};

/** 붕괴 토큰 표기: B- → β−, B+ → EC+β+, e+ → β+, A → α, B-A → β−α, B+p → (EC+β+)p */
export function decayModeLabel(mode: string): string {
  return (
    BETA_PLUS_LABELS[mode] ??
    mode.replace(/B-/g, `β${MINUS}`).replace(/B\+/g, '(EC+β+)').replace(/A$/, 'α')
  );
}

/** 분기 목록에 EC+β+ 합계가 있는지 (정의 안내를 붙일지 정할 때) */
export const hasBetaPlusTotal = (branches: DecayBranch[]) =>
  branches.some((b) => b.mode.includes('B+'));

const CATEGORY_LABELS: Record<Locale, Record<DecayCategory, string>> = {
  ko: {
    stable: '안정',
    'beta-': `β${MINUS}`,
    'beta+': 'β+/EC',
    alpha: 'α',
    sf: 'SF',
    p: 'p',
    n: 'n',
    it: 'IT',
    cluster: '클러스터',
    other: '기타',
    unknown: '미상',
  },
  en: {
    stable: 'stable',
    'beta-': `β${MINUS}`,
    'beta+': 'β+/EC',
    alpha: 'α',
    sf: 'SF',
    p: 'p',
    n: 'n',
    it: 'IT',
    cluster: 'cluster',
    other: 'other',
    unknown: 'unknown',
  },
};

/** 범주의 짧은 표기 (검색 후보, 툴팁) */
export const categoryLabel = (cat: DecayCategory, locale: Locale) => CATEGORY_LABELS[locale][cat];

// ---- 반감기 ----

/** 단위 표기: `us` → `μs`, `m` → `min`, 나머지는 원문 (04 §9) */
export function formatUnit(unit: string): string {
  return unit === 'us' ? 'μs' : unit === 'm' ? 'min' : unit;
}

/** 한계형 불확도 `>620ns` → `> 620 ns` */
function formatLimit(unc: string): string | undefined {
  const match = /^([<>~])\s*([\d.]+)\s*([A-Za-z]+)$/.exec(unc);
  if (!match) return undefined;
  const [, rel, value, unit] = match;
  return `${REL[rel!]}${formatNumber(value!)} ${formatUnit(unit!)}`;
}

const HALF_LIFE_WORDS: Record<Locale, Record<'stable' | 'particle-unbound' | 'unknown', string>> = {
  ko: { stable: '안정', 'particle-unbound': '입자 비속박', unknown: '미상' },
  en: { stable: 'Stable', 'particle-unbound': 'Particle-unbound', unknown: 'Unknown' },
};

/** 패널용 반감기: "704 ± 1 My", "25.7 min", "5# ms (> 620 ns)", "안정 (> 9.9 Zy)", "< 26 ns" */
export function formatHalfLife(h: HalfLife, locale: Locale = 'ko'): string {
  const limit = h.unc ? formatLimit(h.unc) : undefined;
  if (h.kind !== 'value' || h.value === undefined || h.unit === undefined) {
    // 미상이어도 한계가 있으면 그 한계가 정보다 (예: 18B `< 26 ns`).
    if (h.kind === 'unknown' && limit) return limit;
    const word = HALF_LIFE_WORDS[locale][h.kind === 'value' ? 'unknown' : h.kind];
    return limit ? `${word} (${limit})` : word;
  }
  const value = `${h.rel ? REL[h.rel] : ''}${formatNumber(h.value)}${h.est ? '#' : ''}`;
  const unit = formatUnit(h.unit);
  if (!h.unc) return `${value} ${unit}`;
  if (limit) return `${value} ${unit} (${limit})`;
  const unc = h.unc.replace(/#$/, '');
  const asym = /^\+([\d.]+)-([\d.]+)$/.exec(unc);
  if (asym) return `${value} +${formatNumber(asym[1]!)} ${MINUS}${formatNumber(asym[2]!)} ${unit}`;
  return `${value} ± ${formatNumber(unc)} ${unit}`;
}

/** 칸·툴팁용 짧은 반감기: "704 My", "5# ms", "> 912.4 ys". 값이 없으면 한계 또는 빈 문자열 */
export function formatHalfLifeShort(h: HalfLife): string {
  if (h.kind !== 'value' || h.value === undefined || h.unit === undefined) {
    return h.kind === 'unknown' && h.unc ? (formatLimit(h.unc) ?? '') : '';
  }
  return `${h.rel ? REL[h.rel] : ''}${h.value}${h.est ? '#' : ''} ${formatUnit(h.unit)}`;
}

const YEAR_SECONDS = 31_556_926;

/** 3자리 유효숫자로 반올림한 정수 */
const round3 = (x: number) => Number(x.toPrecision(3));

function koreanLargeNumber(x: number): string {
  const units: [number, string][] = [
    [1e12, '조'],
    [1e8, '억'],
    [1e4, '만'],
  ];
  let rest = Math.round(x);
  const parts: string[] = [];
  for (const [size, name] of units) {
    const count = Math.floor(rest / size);
    if (count) parts.push(`${count.toLocaleString('ko-KR')}${name}`);
    rest -= count * size;
  }
  if (rest) parts.push(rest.toLocaleString('ko-KR'));
  return parts.join(' ');
}

function englishLargeNumber(x: number): string {
  const units: [number, string][] = [
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
  ];
  for (const [size, name] of units) {
    if (x >= size) return `${Number((x / size).toPrecision(3)).toLocaleString('en-US')} ${name}`;
  }
  return x.toLocaleString('en-US');
}

/**
 * 사람이 읽는 반감기 (P1, 04 §9). 1분 미만이나 값이 없으면 빈 문자열.
 * ²³⁵U → "≈ 7억 400만 년" / "≈ 704 million years"
 */
export function formatHalfLifeHuman(h: HalfLife, locale: Locale = 'ko'): string {
  const s = h.seconds;
  if (h.kind !== 'value' || s === undefined || s < 60) return '';
  const ko = locale === 'ko';
  if (s < 86_400) {
    const minutes = Math.round(s / 60);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (!hours) return ko ? `≈ ${mins}분` : `≈ ${mins} min`;
    return ko ? `≈ ${hours}시간 ${mins}분` : `≈ ${hours} h ${mins} min`;
  }
  const years = s / YEAR_SECONDS;
  if (years < 1) {
    const days = Math.round(s / 86_400);
    return ko ? `≈ ${days}일` : `≈ ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (years >= 1e16) {
    const [mantissa, exponent] = years.toExponential(2).split('e');
    const power = `${Number(mantissa)} × 10${superscript(String(Number(exponent)))}`;
    return ko ? `≈ ${power} 년` : `≈ ${power} years`;
  }
  const rounded = round3(years);
  // 아라비아 숫자에는 '년'을 붙여 쓰고, 만·억·조 단위 뒤에는 띄운다: "5,700년", "7억 400만 년"
  if (ko) {
    return rounded < 1e4
      ? `≈ ${rounded.toLocaleString('ko-KR')}년`
      : `≈ ${koreanLargeNumber(rounded)} 년`;
  }
  return `≈ ${englishLargeNumber(rounded)} ${rounded === 1 ? 'year' : 'years'}`;
}
