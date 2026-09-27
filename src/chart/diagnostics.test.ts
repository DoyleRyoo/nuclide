import { describe, expect, it } from 'vitest';
import { FrameMetrics } from './diagnostics';

describe('프레임 성능 집계', () => {
  it('그리기 비용과 프레임 간격을 구분하고 정지 시간을 제외한다', () => {
    const metrics = new FrameMetrics();
    expect(metrics.record(100, 2, false)).toBeNull();
    expect(metrics.record(120, 3, true)).toBe(20);
    expect(metrics.record(5000, 4, false)).toBeNull();
    expect(metrics.record(5020, 5, true)).toBe(20);
    expect(metrics.summary()).toEqual({ samples: 4, renderP95: 5, intervalP95: 20, fps: 50 });
  });

  it('연속 프레임이 지연되면 긴 간격도 FPS에 반영한다', () => {
    const metrics = new FrameMetrics();
    metrics.record(0, 1, false);
    metrics.record(500, 5, true);
    expect(metrics.summary()).toMatchObject({ intervalP95: 500, fps: 2 });
  });

  it('최근 240개의 표본으로 메모리와 p95 범위를 제한한다', () => {
    const metrics = new FrameMetrics();
    metrics.record(0, 999, false);
    for (let i = 1; i <= 240; i++) metrics.record(i * 20, i <= 228 ? 2 : 10, true);
    expect(metrics.summary()).toEqual({ samples: 240, renderP95: 2, intervalP95: 20, fps: 50 });
  });
});
