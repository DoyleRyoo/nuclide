/**
 * React와 분리된 Canvas 2D 차트 엔진 (05 §4).
 * 캔버스 2장(base: 칸·글자·선, overlay: 선택·호버·화살표·눈금자)을 겹치고,
 * 바뀐 것이 있을 때만 requestAnimationFrame을 한 번 예약해 그린다.
 */
import type { Nuclide, NuclideIndex } from '../data/types';
import type { ThemeTokens } from '../theme/tokens';
import { Animator, easeInOutCubic, easeOutCubic } from './animation';
import {
  clamp,
  clampCamera,
  fitCamera,
  MAX_SCALE,
  panBy,
  revealCell,
  safeArea,
  safeCenter,
  toScreen,
  toWorld,
  zoomAt,
} from './camera';
import { computeColors, type ColorTable } from './colorModes';
import { ChartDiagnostics } from './diagnostics';
import { atCell } from './hitTest';
import { inertiaDelta } from './input/inertia';
import { keyAction } from './input/keyboard';
import { bindPointer } from './input/pointer';
import { bindSafariGesture } from './input/safariGesture';
import { wheelCamera } from './input/wheel';
import { getLod } from './lod';
import { CellLayer } from './render/cells';
import type { Frame } from './render/frame';
import { GuideLayer } from './render/guides';
import { LabelLayer } from './render/labels';
import { drawOverlay } from './render/overlay';
import { rulerSize } from './render/rulers';
import { TextCache } from './render/text';
import type {
  Camera,
  ColorMode,
  Highlight,
  Hover,
  Insets,
  Lod,
  ScreenPoint,
  Viewport,
  WorldRect,
} from './types';

export interface ChartEngineOptions {
  container: HTMLElement;
  index: NuclideIndex;
  theme: ThemeTokens;
  colorMode: ColorMode;
  wheelMode: 'scroll' | 'zoom';
  reducedMotion: boolean;
}

export interface ChartEvents {
  /** 칸 클릭·탭. 빈 곳이면 null (선택 해제) */
  select: (id: string | null) => void;
  /** 방향키로 이웃 핵종으로 이동 */
  navigate: (id: string) => void;
  /** Enter / Space: 선택 핵종의 패널 열기 */
  activate: (id: string | null) => void;
  /** 마우스가 올라간 칸 (화면 좌표는 client 기준) */
  hover: (hover: Hover) => void;
  /** 카메라 변경, 프레임당 최대 1회 */
  camera: (camera: Camera, lod: Lod) => void;
}

/** 02 §2.4 데스크톱 기본 여백. 앱이 setSafeInsets로 바꾼다. */
const DEFAULT_INSETS: Insets = { top: 84, left: 48, right: 16, bottom: 28 };
const COMPACT_WIDTH = 768;
const HIGHLIGHT_BLINK_MS = 1200;

type Listeners = { [K in keyof ChartEvents]: Set<ChartEvents[K]> };

export class ChartEngine {
  private readonly container: HTMLElement;
  private readonly base: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly baseCtx: CanvasRenderingContext2D;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly index: NuclideIndex;
  private readonly world: WorldRect;
  private readonly cells: CellLayer;
  private readonly labels: LabelLayer;
  private readonly guides: GuideLayer;
  private readonly text = new TextCache();
  private readonly animator = new Animator();
  private readonly diagnostics: ChartDiagnostics | null;
  private readonly listeners: Listeners = {
    select: new Set(),
    navigate: new Set(),
    activate: new Set(),
    hover: new Set(),
    camera: new Set(),
  };
  private readonly cleanups: (() => void)[] = [];

  private theme: ThemeTokens;
  private colorMode: ColorMode;
  private colors: ColorTable;
  private wheelMode: 'scroll' | 'zoom';
  private reducedMotion: boolean;
  private showPredicted = true;
  private insets: Insets = DEFAULT_INSETS;
  private camera: Camera = { cx: 0, cy: 0, s: 1 };
  private viewport: Viewport = { width: 0, height: 0 };
  private dpr = 1;
  private fitted = false;

  private selected: Nuclide | null = null;
  private hovered: Nuclide | null = null;
  private highlight: Highlight | null = null;
  private highlightStart = 0;
  private inertia: { vx: number; vy: number; start: number; elapsed: number } | null = null;

  private frameId = 0;
  private inFrame = false;
  private baseDirty = true;
  private overlayDirty = true;
  private cameraChanged = false;
  private destroyed = false;
  private requestedAt = 0;
  private lastFrameEnd = -Infinity;
  private firstFrame = true;

  constructor(options: ChartEngineOptions) {
    this.container = options.container;
    this.index = options.index;
    this.theme = options.theme;
    this.colorMode = options.colorMode;
    this.wheelMode = options.wheelMode;
    this.reducedMotion = options.reducedMotion;
    const { bounds } = this.index;
    this.world = { minN: bounds.nMin, maxN: bounds.nMax, minZ: bounds.zMin, maxZ: bounds.zMax };
    this.colors = computeColors(this.index, this.colorMode, this.theme);
    this.cells = new CellLayer(this.index);
    this.labels = new LabelLayer(this.index);
    this.guides = new GuideLayer(this.index);

    this.base = this.createCanvas();
    this.overlay = this.createCanvas();
    this.base.style.pointerEvents = 'none';
    this.overlay.style.cursor = 'grab';
    this.baseCtx = this.base.getContext('2d', { alpha: false })!;
    this.overlayCtx = this.overlay.getContext('2d')!;
    this.container.append(this.base, this.overlay);
    this.diagnostics =
      new URLSearchParams(location.search).get('debug') === '1'
        ? new ChartDiagnostics(this.container)
        : null;

    this.resize();
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.container);
    this.cleanups.push(() => observer.disconnect());
    this.bindInput();

    // 웹 글꼴이 로드되면 한 번 다시 그린다 (03 §2.2).
    document.fonts?.ready.then(() => {
      if (this.destroyed) return;
      this.text.clear();
      this.invalidate();
    });
  }

  // ---------- 이벤트 ----------

  on<K extends keyof ChartEvents>(type: K, fn: ChartEvents[K]): () => void {
    const set = this.listeners[type] as Set<ChartEvents[K]>;
    set.add(fn);
    return () => set.delete(fn);
  }

  private emit<K extends keyof ChartEvents>(type: K, ...args: Parameters<ChartEvents[K]>): void {
    for (const fn of this.listeners[type] as Set<(...a: Parameters<ChartEvents[K]>) => void>) {
      fn(...args);
    }
  }

  // ---------- 스토어 → 엔진 ----------

  setColorMode(mode: ColorMode): void {
    if (mode === this.colorMode) return;
    this.colorMode = mode;
    this.colors = computeColors(this.index, mode, this.theme);
    this.invalidate();
  }

  setTheme(theme: ThemeTokens): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.colors = computeColors(this.index, this.colorMode, theme);
    this.invalidate();
  }

  setSelected(id: string | null): void {
    const next = id ? (this.index.byId.get(id) ?? null) : null;
    if (next === this.selected) return;
    this.selected = next;
    // 선택 칸이 가용 영역 밖이면 보이게 되는 최소 거리만큼 이동 (02 §6.1).
    // 이미 다른 이동(fly-to 등)이 진행 중이면 그 이동에 맡긴다.
    if (next && !this.animator.active && this.fitted) {
      const target = revealCell(this.camera, next.n, next.z, this.viewport, this.insets);
      if (target.cx !== this.camera.cx || target.cy !== this.camera.cy)
        void this.animateTo(target, 300);
    }
    this.invalidate(false);
  }

  setShowPredicted(show: boolean): void {
    if (show === this.showPredicted) return;
    this.showPredicted = show;
    if (this.hovered && !this.hovered.observed && !show) this.setHovered(null, null);
    this.invalidate();
  }

  setWheelMode(mode: 'scroll' | 'zoom'): void {
    this.wheelMode = mode;
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    if (on) this.inertia = null;
  }

  setSafeInsets(insets: Insets): void {
    const same =
      insets.top === this.insets.top &&
      insets.right === this.insets.right &&
      insets.bottom === this.insets.bottom &&
      insets.left === this.insets.left;
    if (same) return;
    this.insets = { ...insets };
    this.applyCamera(this.camera);
    // 패널·시트가 열려 선택 칸을 가리면 보이게 되는 최소 거리만큼 옮긴다 (02 §6.1).
    // fly-to 중이면 그 목적지를 기준으로 고친다.
    if (this.selected && this.fitted) {
      const from = this.animator.target ?? this.camera;
      const target = revealCell(from, this.selected.n, this.selected.z, this.viewport, this.insets);
      if (target.cx !== from.cx || target.cy !== from.cy) void this.animateTo(target, 300);
    }
    this.invalidate();
  }

  setHighlight(highlight: Highlight | null): void {
    // 범례 범주 강조는 칸을 흐리게 하므로 base를, 행·열 강조는 overlay만 다시 그린다.
    const baseChanged = highlight?.type === 'decay' || this.highlight?.type === 'decay';
    this.highlight = highlight;
    this.highlightStart = performance.now();
    this.invalidate(baseChanged);
  }

  // ---------- 카메라 ----------

  getCamera(): Camera {
    return { ...this.camera };
  }

  getViewport(): Viewport {
    return { ...this.viewport };
  }

  setCamera(camera: Camera): void {
    this.stopMotion();
    this.applyCamera(camera);
    this.fitted = true;
  }

  zoomBy(factor: number, anchor?: ScreenPoint): void {
    this.stopMotion();
    const point = anchor ?? safeCenter(this.viewport, this.insets);
    void this.animateTo(zoomAt(this.camera, factor, point, this.viewport, this.minScale()), 200);
  }

  fitAll(): void {
    this.fitBounds(this.world);
  }

  fitBounds(rect: WorldRect): void {
    this.stopMotion();
    void this.animateTo(fitCamera(rect, this.viewport, this.insets), 400);
  }

  /** 칸 (n, z)를 가용 영역 중심으로. 시간은 거리에 비례해 300–800 ms (02 §15). */
  flyTo(target: { n: number; z: number; s?: number }): Promise<void> {
    this.stopMotion();
    const s = clamp(target.s ?? this.camera.s, this.minScale(), MAX_SCALE);
    const center = safeCenter(this.viewport, this.insets);
    const to: Camera = {
      cx: target.n + 0.5 - (center.x - this.viewport.width / 2) / s,
      cy: target.z + 0.5 + (center.y - this.viewport.height / 2) / s,
      s,
    };
    const distance =
      Math.hypot(to.cx - this.camera.cx, to.cy - this.camera.cy) * Math.min(s, this.camera.s);
    const duration = clamp(300 + distance * 0.25, 300, 800);
    return this.animateTo(to, duration, easeInOutCubic);
  }

  // ---------- 정리 ----------

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    this.animator.cancel();
    this.diagnostics?.destroy();
    for (const cleanup of this.cleanups) cleanup();
    for (const set of Object.values(this.listeners)) set.clear();
    this.base.remove();
    this.overlay.remove();
  }

  // ---------- 내부: 카메라 ----------

  /** 배율 하한 = 0.8 × 전체가 들어가는 배율 (02 §2.5) */
  private minScale(): number {
    return 0.8 * fitCamera(this.world, this.viewport, this.insets).s;
  }

  private applyCamera(next: Camera): void {
    if (![next.cx, next.cy, next.s].every(Number.isFinite) || next.s <= 0) return;
    const c = clampCamera(next, this.world, this.minScale());
    if (c.cx === this.camera.cx && c.cy === this.camera.cy && c.s === this.camera.s) return;
    this.camera = c;
    this.cameraChanged = true;
    this.invalidate();
  }

  private animateTo(target: Camera, duration: number, ease = easeOutCubic): Promise<void> {
    const to = clampCamera(target, this.world, this.minScale());
    if (this.reducedMotion || duration <= 0) {
      this.animator.cancel();
      this.applyCamera(to);
      return Promise.resolve();
    }
    const done = this.animator.start(this.camera, to, duration, ease);
    this.schedule();
    return done;
  }

  private stopMotion(): void {
    this.animator.cancel();
    this.inertia = null;
  }

  // ---------- 내부: 그리기 ----------

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    return canvas;
  }

  /** 캔버스 픽셀 크기 = CSS 크기 × min(devicePixelRatio, 2) (05 §4.2) */
  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(0, Math.round(rect.width));
    const height = Math.max(0, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width === this.viewport.width && height === this.viewport.height && dpr === this.dpr)
      return;
    this.viewport = { width, height };
    this.dpr = dpr;
    for (const canvas of [this.base, this.overlay]) {
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    }
    this.text.reset(this.baseCtx);
    this.text.reset(this.overlayCtx);
    // 카메라 좌표가 같아도 미니맵의 현재 영역은 새 크기로 갱신해야 한다.
    this.cameraChanged = true;
    if (!width || !height) return;
    if (!this.fitted) {
      // 첫 화면: 전체 보기 (02 §2.5)
      this.camera = fitCamera(this.world, this.viewport, this.insets);
      this.cameraChanged = true;
      this.fitted = true;
    }
    this.applyCamera(this.camera);
    this.invalidate();
  }

  private invalidate(base = true): void {
    if (base) this.baseDirty = true;
    this.overlayDirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.frameId || this.destroyed || this.inFrame) return;
    if (this.diagnostics) this.requestedAt = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  private frame(ctx: CanvasRenderingContext2D): Frame {
    return {
      ctx,
      camera: this.camera,
      viewport: this.viewport,
      theme: this.theme,
      index: this.index,
      colors: this.colors,
      showPredicted: this.showPredicted,
      highlight: this.highlight,
      compact: this.viewport.width < COMPACT_WIDTH,
    };
  }

  /** ① 애니메이션 진행 → ② 카메라 확정 → ③ 표시된 레이어만 그리기 → ④ camera 이벤트 (05 §4.2) */
  private readonly tick = (now: number): void => {
    this.frameId = 0;
    if (this.destroyed) return;
    const started = this.diagnostics ? performance.now() : 0;
    const continuous = this.requestedAt - this.lastFrameEnd < 100;
    this.text.drawCount = 0;
    this.inFrame = true;
    const animated = this.animator.update(now);
    if (animated) this.applyCamera(animated);
    if (this.inertia) this.stepInertia(now);
    const blinking =
      this.highlight !== null &&
      this.highlight.type !== 'decay' &&
      now - this.highlightStart < HIGHLIGHT_BLINK_MS;
    if (blinking) this.overlayDirty = true;

    const drewBase = this.baseDirty && this.viewport.width > 0 && this.viewport.height > 0;
    if (this.viewport.width && this.viewport.height) {
      if (this.baseDirty) this.drawBase();
      if (this.overlayDirty) this.drawOverlay(now);
      if (this.firstFrame) {
        this.firstFrame = false;
        performance.measure('chart:first-frame', { start: 0, end: performance.now() });
      }
    }
    this.baseDirty = false;
    this.overlayDirty = false;
    this.inFrame = false;
    if (this.cameraChanged) {
      this.cameraChanged = false;
      this.emit('camera', this.getCamera(), getLod(this.camera.s));
    }
    if (this.diagnostics) {
      const ended = performance.now();
      this.diagnostics.record(
        {
          time: now,
          renderMs: ended - started,
          cells: drewBase ? this.cells.visibleCount + this.cells.predictedCount : 0,
          texts: this.text.drawCount,
          lod: getLod(this.camera.s),
          camera: this.getCamera(),
        },
        continuous,
      );
      this.lastFrameEnd = ended;
    }
    if (this.animator.active || this.inertia || blinking) this.schedule();
  };

  private drawBase(): void {
    const ctx = this.baseCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const f = this.frame(ctx);
    this.cells.draw(f);
    this.labels.draw(f, this.cells, this.text);
    this.guides.draw(f, this.text);
  }

  private drawOverlay(now: number): void {
    const ctx = this.overlayCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const elapsed = now - this.highlightStart;
    // 1.2초 동안 300 ms 간격으로 두 번 깜빡인 뒤 켜 둔다.
    const highlightVisible = elapsed >= HIGHLIGHT_BLINK_MS || Math.floor(elapsed / 300) % 2 === 0;
    drawOverlay(
      this.frame(ctx),
      { selected: this.selected, hovered: this.hovered, highlightVisible },
      this.text,
    );
  }

  // ---------- 내부: 입력 ----------

  /** 눈금자 위는 지도 칸으로 치지 않는다. */
  private inRuler(p: ScreenPoint): boolean {
    const { width, height } = rulerSize(this.viewport.width < COMPACT_WIDTH);
    return p.x < width || p.y > this.viewport.height - height;
  }

  private hitTest(p: ScreenPoint): Nuclide | null {
    if (this.inRuler(p)) return null;
    const w = toWorld(p, this.camera, this.viewport);
    return atCell(this.index, Math.floor(w.x), Math.floor(w.y), this.showPredicted);
  }

  private localPoint(e: { clientX: number; clientY: number }): ScreenPoint {
    const rect = this.overlay.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private setHovered(nuclide: Nuclide | null, p: ScreenPoint | null): void {
    if (nuclide === this.hovered) return;
    this.hovered = nuclide;
    this.overlay.style.cursor = nuclide ? 'pointer' : 'grab';
    if (nuclide && p) {
      const rect = this.overlay.getBoundingClientRect();
      this.emit('hover', { id: nuclide.id, x: p.x + rect.left, y: p.y + rect.top });
    } else this.emit('hover', null);
    this.invalidate(false);
  }

  private stepInertia(now: number): void {
    const inertia = this.inertia!;
    const elapsed = now - inertia.start;
    const dx = inertiaDelta(inertia.vx, inertia.elapsed, elapsed);
    const dy = inertiaDelta(inertia.vy, inertia.elapsed, elapsed);
    inertia.elapsed = elapsed;
    this.applyCamera(panBy(this.camera, dx, dy));
    const speed = Math.hypot(inertia.vx, inertia.vy) * Math.exp(-elapsed / 325);
    if (speed < 0.01) this.inertia = null;
  }

  private bindInput(): void {
    const canvas = this.overlay;
    this.cleanups.push(
      bindPointer(canvas, {
        point: (e) => this.localPoint(e),
        cancel: () => this.stopMotion(),
        pan: (dx, dy) => this.applyCamera(panBy(this.camera, dx, dy)),
        zoom: (factor, point, animated) => {
          const next = zoomAt(this.camera, factor, point, this.viewport, this.minScale());
          if (animated) void this.animateTo(next, 250);
          else this.applyCamera(next);
        },
        select: (p) => {
          if (this.inRuler(p)) return;
          this.emit('select', this.hitTest(p)?.id ?? null);
        },
        hover: (p) => this.setHovered(p ? this.hitTest(p) : null, p),
        release: (v) => {
          if (!v || this.reducedMotion) return;
          this.inertia = { vx: v.x, vy: v.y, start: performance.now(), elapsed: 0 };
          this.schedule();
        },
      }),
    );
    this.cleanups.push(
      bindSafariGesture(
        canvas,
        (k, p) => this.applyCamera(zoomAt(this.camera, k, p, this.viewport, this.minScale())),
        () => this.stopMotion(),
      ),
    );

    // 휠: 캔버스 위에서만 브라우저 확대·스크롤을 막는다 (02 §3–4).
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.stopMotion();
      const p = this.localPoint(e);
      const height = safeArea(this.viewport, this.insets).height;
      this.applyCamera(
        wheelCamera(this.camera, e, p, this.viewport, height, this.wheelMode, this.minScale()),
      );
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    this.cleanups.push(() => canvas.removeEventListener('wheel', wheel));

    const keydown = (e: KeyboardEvent) => {
      if (e.target !== this.container) return;
      const action = keyAction(e);
      if (!action) return;
      e.preventDefault();
      this.stopMotion();
      switch (action.type) {
        case 'navigate': {
          const next = this.neighbor(action.dn, action.dz);
          if (next) this.emit('navigate', next.id);
          break;
        }
        case 'pan': {
          const area = safeArea(this.viewport, this.insets);
          const target = panBy(this.camera, action.fx * area.width, action.fy * area.height);
          void this.animateTo(target, 200);
          break;
        }
        case 'zoom':
          this.zoomBy(action.factor, this.selectedAnchor());
          break;
        case 'fit':
          this.fitAll();
          break;
        case 'activate':
          this.emit('activate', this.selected?.id ?? null);
          break;
      }
    };
    this.container.addEventListener('keydown', keydown);
    this.cleanups.push(() => this.container.removeEventListener('keydown', keydown));
  }

  /** 키 줌의 기준점: 선택 칸이 화면 안에 있으면 그 칸, 아니면 가용 영역 중심 (02 §3) */
  private selectedAnchor(): ScreenPoint | undefined {
    if (!this.selected) return undefined;
    const p = toScreen(
      { x: this.selected.n + 0.5, y: this.selected.z + 0.5 },
      this.camera,
      this.viewport,
    );
    const a = safeArea(this.viewport, this.insets);
    return p.x >= a.left && p.x <= a.right && p.y >= a.top && p.y <= a.bottom ? p : undefined;
  }

  /**
   * 방향키 이동 (02 §7): 같은 행·열에서 그 방향으로 가장 가까운 핵종.
   * 선택이 없으면 가용 영역 중심에 가장 가까운 핵종.
   */
  private neighbor(dn: number, dz: number): Nuclide | null {
    const from = this.selected;
    if (!from) {
      const c = toWorld(safeCenter(this.viewport, this.insets), this.camera, this.viewport);
      let best: Nuclide | null = null;
      let bestDistance = Infinity;
      for (const n of this.index.nuclides) {
        if (!n.observed && !this.showPredicted) continue;
        const d = (n.n + 0.5 - c.x) ** 2 + (n.z + 0.5 - c.y) ** 2;
        if (d < bestDistance) {
          best = n;
          bestDistance = d;
        }
      }
      return best;
    }
    const limit = Math.max(this.index.gridWidth, this.index.gridHeight);
    for (let step = 1; step < limit; step++) {
      const found = atCell(this.index, from.n + dn * step, from.z + dz * step, this.showPredicted);
      if (found) return found;
    }
    return null;
  }
}
