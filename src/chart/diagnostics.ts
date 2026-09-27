import type { Camera, Lod } from './types';

const SAMPLE_LIMIT = 240;

/** 최근 240회만 보관한다. 정지 후 첫 프레임은 FPS 표본에서 제외한다. */
export class FrameMetrics {
  private readonly costs = new Float64Array(SAMPLE_LIMIT);
  private readonly intervals = new Float64Array(SAMPLE_LIMIT);
  private count = 0;
  private intervalCount = 0;
  private previousTime: number | null = null;

  record(time: number, cost: number, continuous: boolean): number | null {
    const interval =
      continuous && this.previousTime !== null && time > this.previousTime
        ? time - this.previousTime
        : null;
    this.costs[this.count++ % SAMPLE_LIMIT] = cost;
    if (interval !== null) this.intervals[this.intervalCount++ % SAMPLE_LIMIT] = interval;
    this.previousTime = time;
    return interval;
  }

  summary() {
    const costs = this.costs.slice(0, Math.min(this.count, SAMPLE_LIMIT)).sort();
    const intervals = this.intervals.slice(0, Math.min(this.intervalCount, SAMPLE_LIMIT)).sort();
    const p95 = (values: Float64Array) => values[Math.ceil(values.length * 0.95) - 1] ?? 0;
    const total = intervals.reduce((sum, value) => sum + value, 0);
    return {
      samples: costs.length,
      renderP95: p95(costs),
      intervalP95: p95(intervals),
      fps: total ? (1000 * intervals.length) / total : null,
    };
  }
}

export interface FrameSample {
  time: number;
  renderMs: number;
  intervalMs: number | null;
  cells: number;
  texts: number;
  lod: Lod;
  camera: Camera;
}

/** debug=1일 때만 생성. 별도 rAF 루프 없이 엔진이 그린 프레임을 관찰한다. */
export class ChartDiagnostics {
  private readonly element = document.createElement('pre');
  private readonly metrics = new FrameMetrics();
  private lastUpdate = -Infinity;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private latest: FrameSample | null = null;

  constructor(private readonly container: HTMLElement) {
    this.element.className = 'chart-debug';
    this.element.setAttribute('aria-hidden', 'true');
    container.append(this.element);
  }

  record(sample: Omit<FrameSample, 'intervalMs'>, continuous: boolean): void {
    this.latest = {
      ...sample,
      intervalMs: this.metrics.record(sample.time, sample.renderMs, continuous),
    };
    // 로컬 벤치마크가 구독한다. 일반 방문에는 이벤트나 표본을 만들지 않는다.
    this.container.dispatchEvent(new CustomEvent('chart:frame', { detail: this.latest }));
    if (sample.time - this.lastUpdate >= 250) {
      this.lastUpdate = sample.time;
      this.update(false);
    }
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.update(true), 250);
  }

  private update(idle: boolean): void {
    const sample = this.latest;
    if (!sample) return;
    const s = this.metrics.summary();
    const fps = idle ? 'idle' : s.fps === null ? '—' : s.fps.toFixed(1);
    const c = sample.camera;
    this.element.textContent = [
      `FPS ${fps} · interval p95 ${s.intervalP95.toFixed(2)} ms`,
      `Render ${sample.renderMs.toFixed(2)} ms · p95 ${s.renderP95.toFixed(2)} ms`,
      `Cells ${sample.cells} · text draws ${sample.texts} · LOD ${sample.lod}`,
      `N ${c.cx.toFixed(2)} · Z ${c.cy.toFixed(2)} · scale ${c.s.toFixed(2)}`,
      `Recent ${s.samples}/${SAMPLE_LIMIT} frames`,
    ].join('\n');
  }

  destroy(): void {
    clearTimeout(this.idleTimer);
    this.element.remove();
  }
}
