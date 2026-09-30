import { describe, expect, it } from 'vitest';
import { rulerStep } from '../lod';
import { rulerLabels } from './rulers';

describe('눈금자 충돌 우선순위', () => {
  it('16–21px와 눈금 간격 전환 경계에서 선택을 보존하고 2px 간격을 확보한다', () => {
    for (const height of [20, 21, 32, 34]) {
      for (const scale of [
        16,
        17,
        18,
        19,
        20,
        21,
        (height + 2) / 2 - 0.01,
        (height + 2) / 2,
        height + 1.99,
        height + 2,
      ]) {
        for (const selected of [91, 92, 93]) {
          const center = (z: number) => 400 - (z - 92) * scale;
          const labels = rulerLabels(
            70,
            110,
            rulerStep(scale, 'z', height + 2),
            selected,
            selected + 1,
            center,
            () => height,
            0,
            800,
          );
          expect(labels[0]).toBe(selected);
          const positions = labels.map(center).sort((a, b) => a - b);
          for (let i = 1; i < positions.length; i++)
            expect(positions[i]! - positions[i - 1]!).toBeGreaterThanOrEqual(height + 2 - 1e-8);
          if (scale < height + 2) expect(labels).not.toContain(selected + 1);
        }
      }
    }
  });

  it('N 세 자리 폭, 선택과 같은 호버, 화면 가장자리도 겹치거나 잘리지 않는다', () => {
    const width = (n: number) => String(n).length * 8 + 12;
    for (const scale of [16, 21, 37.99, 38, 64]) {
      const center = (n: number) => 100 + (n - 98) * scale;
      const labels = rulerLabels(
        90,
        120,
        rulerStep(scale, 'n', 38),
        100,
        100,
        center,
        width,
        64,
        430,
      );
      expect(labels.filter((n) => n === 100)).toHaveLength(1);
      const bounds = labels
        .map((n) => [center(n) - width(n) / 2, center(n) + width(n) / 2])
        .sort((a, b) => a[0]! - b[0]!);
      for (let i = 0; i < bounds.length; i++) {
        expect(bounds[i]![0]).toBeGreaterThanOrEqual(66);
        expect(bounds[i]![1]).toBeLessThanOrEqual(428);
        if (i) expect(bounds[i]![0]! - bounds[i - 1]![1]!).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
