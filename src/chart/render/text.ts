import { FONT_FAMILY } from '../../theme/tokens';

/**
 * 글꼴 문자열과 measureText 결과를 캐시한다 (05 §4.4).
 * 크기는 0.5px 단위로 반올림해 캐시 적중률을 높인다.
 */
export class TextCache {
  private fonts = new Map<number, string>();
  /** 글꼴 → 문자열 → 폭. 키를 이어 붙이지 않아 프레임 안에서 문자열을 만들지 않는다. */
  private widths = new Map<string, Map<string, number>>();
  private widthCount = 0;
  /** 컨텍스트마다 마지막으로 넣은 글꼴. ctx.font는 읽을 때 정규화되므로 비교에 쓰지 않는다. */
  private current = new WeakMap<CanvasRenderingContext2D, string>();

  /** 필요할 때만 ctx.font를 바꾼다 (글꼴 문자열 파싱은 비싸다). */
  use(ctx: CanvasRenderingContext2D, font: string): void {
    if (this.current.get(ctx) !== font) {
      ctx.font = font;
      this.current.set(ctx, font);
    }
  }

  /** 캔버스 크기 변경·save/restore 뒤처럼 ctx 상태가 바뀌었을 수 있을 때 */
  reset(ctx: CanvasRenderingContext2D): void {
    this.current.delete(ctx);
  }

  font(size: number, weight: 400 | 500 | 600 | 700 = 400): string {
    const rounded = Math.round(size * 2) / 2;
    const key = weight * 1000 + rounded;
    let font = this.fonts.get(key);
    if (!font) {
      font = `${weight} ${rounded}px ${FONT_FAMILY}`;
      this.fonts.set(key, font);
    }
    return font;
  }

  /** ctx.font를 font로 바꾸고 폭을 잰다. */
  measure(ctx: CanvasRenderingContext2D, font: string, text: string): number {
    let byText = this.widths.get(font);
    if (!byText) {
      byText = new Map();
      this.widths.set(font, byText);
    }
    let width = byText.get(text);
    if (width === undefined) {
      if (++this.widthCount > 50_000) this.clear();
      this.use(ctx, font);
      width = ctx.measureText(text).width;
      byText.set(text, width);
    }
    return width;
  }

  /** 글꼴이 바뀌면(웹 글꼴 로드) 측정값을 버린다. */
  clear(): void {
    this.widths.clear();
    this.widthCount = 0;
  }

  /**
   * 폭 maxWidth 안에 들도록 가운데 정렬로 쓴다: 넘치면 최소 크기까지 줄이고,
   * 그래도 넘치면 `…`로 자른다 (03 §5.2).
   */
  fillFitted(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    size: number,
    minSize: number,
    maxWidth: number,
    weight: 400 | 500 | 600 | 700 = 400,
  ): void {
    if (!text) return;
    let font = this.font(size, weight);
    let width = this.measure(ctx, font, text);
    if (width > maxWidth && size > minSize) {
      const shrunk = Math.max(minSize, (size * maxWidth) / width);
      font = this.font(shrunk, weight);
      width = this.measure(ctx, font, text);
    }
    let shown = text;
    if (width > maxWidth) {
      let end = text.length - 1;
      while (end > 0 && this.measure(ctx, font, `${text.slice(0, end)}…`) > maxWidth) end--;
      shown = end > 0 ? `${text.slice(0, end)}…` : '';
      if (!shown) return;
    }
    this.use(ctx, font);
    ctx.fillText(shown, x, y);
  }
}
