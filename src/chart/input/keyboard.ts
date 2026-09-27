/** 지도에 포커스가 있을 때의 키 (02 §7). `/`, `?`, `c`, Esc는 앱이 처리한다. */
export type KeyAction =
  | { type: 'navigate'; dn: number; dz: number }
  | { type: 'pan'; fx: number; fy: number }
  | { type: 'zoom'; factor: number }
  | { type: 'fit' }
  | { type: 'activate' };

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

export function keyAction(e: KeyInput): KeyAction | null {
  // Ctrl/⌘ + `+`/`-`/`0`은 브라우저 확대에 남겨 둔다 (02 §3).
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const arrow = ARROWS[e.key];
  if (arrow) {
    // Shift + 방향키: 가용 영역의 20%만큼 화면 이동. fx·fy는 드래그 이동량(가용 폭·높이 비율)이라
    // → 키는 지도를 왼쪽으로 끌어 오른쪽(큰 N)을 보여 준다.
    return e.shiftKey
      ? { type: 'pan', fx: -arrow[0] * 0.2, fy: arrow[1] * 0.2 }
      : { type: 'navigate', dn: arrow[0], dz: arrow[1] };
  }
  switch (e.key) {
    case '+':
    case '=':
      return { type: 'zoom', factor: 2 };
    case '-':
    case '_':
      return { type: 'zoom', factor: 0.5 };
    case '0':
      return { type: 'fit' };
    case 'Enter':
    case ' ':
      return { type: 'activate' };
    default:
      return null;
  }
}
