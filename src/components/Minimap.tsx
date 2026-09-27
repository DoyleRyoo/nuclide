import { useEffect, useRef } from 'react';
import type { ChartEngine } from '../chart/ChartEngine';
import type { NuclideIndex } from '../data/types';
import type { ThemeTokens } from '../theme/tokens';
import { useT } from '../i18n';
import { useAppStore } from '../app/store';

const colors: Record<string, string> = {
  stable: '#111827',
  'beta-': '#2563eb',
  'beta+': '#dc2626',
  alpha: '#facc15',
  sf: '#22c55e',
  p: '#f97316',
  n: '#7c3aed',
};
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
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      ctx.clearRect(0, 0, 200, 134);
      for (const n of index.nuclides) {
        if (!n.observed && !show) continue;
        ctx.globalAlpha = n.observed ? 1 : 0.25;
        ctx.fillStyle =
          n.primary === 'stable' && theme.name === 'dark'
            ? '#e5e7eb'
            : colors[n.primary] || '#6b7280';
        ctx.fillRect((n.n / 178) * 200, 134 - ((n.z + 1) / 119) * 134, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
      const c = engine.getCamera();
      const width = window.innerWidth / c.s;
      const height = window.innerHeight / c.s;
      ctx.strokeStyle = theme.name === 'dark' ? '#2dd4bf' : '#0f766e';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        ((c.cx - width / 2) / 178) * 200,
        134 - ((c.cy + height / 2) / 119) * 134,
        (width / 178) * 200,
        (height / 119) * 134,
      );
    };
    draw();
    return engine.on('camera', draw);
  }, [engine, index, theme, show]);
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    engine.setCamera({
      ...engine.getCamera(),
      cx: ((e.clientX - rect.left) / rect.width) * 178,
      cy: 119 - ((e.clientY - rect.top) / rect.height) * 119,
    });
  }
  return (
    <div className="minimap card">
      <canvas
        ref={canvas}
        width={200}
        height={134}
        role="img"
        aria-label={t('minimap')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) move(e);
        }}
      />
    </div>
  );
}
