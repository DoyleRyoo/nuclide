import { useEffect, useRef } from 'react';
import type { ChartEngine } from '../chart/ChartEngine';
import type { NuclideIndex } from '../data/types';
import type { ThemeTokens } from '../theme/tokens';
import { useT } from '../i18n';
import { useAppStore } from '../app/store';
import { computeColors } from '../chart/colorModes';

const WIDTH = 200;
const HEIGHT = 134;
export default function Minimap({
  engine,
  index,
  theme,
}: {
  engine: ChartEngine;
  index: NuclideIndex;
  theme: ThemeTokens;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const t = useT();
  const show = useAppStore((s) => s.showPredicted);
  const colorMode = useAppStore((s) => s.colorMode);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    // 칸은 설정이 바뀔 때만 그린다. 카메라 이동은 비트맵 복사 + 영역 사각형만.
    const bitmap = document.createElement('canvas');
    bitmap.width = WIDTH;
    bitmap.height = HEIGHT;
    const base = bitmap.getContext('2d');
    if (!base) return;
    const colors = computeColors(index, colorMode, theme);
    const sx = WIDTH / index.gridWidth;
    const sy = HEIGHT / index.gridHeight;
    index.nuclides.forEach((n, i) => {
      if (!n.observed && !show) return;
      base.globalAlpha = n.observed ? 1 : 0.25;
      base.fillStyle = colors.fill[colors.index[i]!]!;
      base.fillRect(n.n * sx, HEIGHT - (n.z + 1) * sy, sx, sy);
    });
    const draw = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(bitmap, 0, 0);
      const c = engine.getCamera();
      const viewport = engine.getViewport();
      const width = viewport.width / c.s;
      const height = viewport.height / c.s;
      const x = (c.cx - width / 2) * sx;
      const y = HEIGHT - (c.cy + height / 2) * sy;
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(x, y, width * sx, height * sy);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, width * sx, height * sy);
    };
    draw();
    return engine.on('camera', draw);
  }, [engine, index, theme, show, colorMode]);
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    engine.setCamera({
      ...engine.getCamera(),
      cx: ((e.clientX - rect.left) / rect.width) * index.gridWidth,
      cy: (1 - (e.clientY - rect.top) / rect.height) * index.gridHeight,
    });
  }
  return (
    <div className="minimap card">
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={t('minimap')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e);
        }}
      />
    </div>
  );
}
