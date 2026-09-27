import { expect, test } from '@playwright/test';
import { cpus, platform, release } from 'node:os';
import { writeFile } from 'node:fs/promises';
import type { FrameSample } from '../src/chart/diagnostics';

test('1920×1080 LOD별 이동과 연속 줌의 프레임 시간을 기록한다', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  const scenarios = [
    { name: 'LOD 0 pan', scale: 8, zoom: false },
    { name: 'LOD 1 pan', scale: 40, zoom: false },
    { name: 'LOD 2 pan', scale: 96, zoom: false },
    { name: 'LOD 3 pan', scale: 160, zoom: false },
    { name: 'LOD 0–3 zoom', scale: 8, zoom: true },
  ];
  const results = [];
  for (const scenario of scenarios) {
    await page.goto(`./?debug=1&view=82.5,56.5,${scenario.scale}`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.chart-debug')).toContainText('FPS idle');
    const samples = await page.evaluate(async ({ zoom }) => {
      const chart = document.querySelector<HTMLElement>('[role="application"]')!;
      const canvas = chart.querySelectorAll('canvas')[1]!;
      const samples: FrameSample[] = [];
      const record = (event: Event) => samples.push((event as CustomEvent<FrameSample>).detail);
      chart.addEventListener('chart:frame', record);
      // 정해진 경로의 입력을 rAF마다 전달한다. 모든 브라우저 성능 테스트는 직렬 실행한다.
      for (let i = 0; i < 180; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const direction = i < 90 ? 1 : -1;
        canvas.dispatchEvent(
          new WheelEvent('wheel', {
            deltaX: zoom ? 0 : direction * 2,
            deltaY: zoom ? -direction * 10 : direction,
            ctrlKey: zoom,
            clientX: 960,
            clientY: 540,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      chart.removeEventListener('chart:frame', record);
      return samples;
    }, scenario);
    expect(samples.length).toBeGreaterThan(100);
    const costs = samples.map((s) => s.renderMs).sort((a, b) => a - b);
    const intervals = samples
      .flatMap((s) => (s.intervalMs === null ? [] : [s.intervalMs]))
      .sort((a, b) => a - b);
    const percentile = (values: number[], p: number) => values[Math.ceil(values.length * p) - 1];
    results.push({
      scenario: scenario.name,
      samples: samples.length,
      lods: [...new Set(samples.map((s) => s.lod))].sort(),
      renderMedianMs: percentile(costs, 0.5),
      renderP95Ms: percentile(costs, 0.95),
      intervalMedianMs: percentile(intervals, 0.5),
      intervalP95Ms: percentile(intervals, 0.95),
      fps: (1000 * intervals.length) / intervals.reduce((sum, n) => sum + n, 0),
      maxCells: Math.max(...samples.map((s) => s.cells)),
      maxTextDraws: Math.max(...samples.map((s) => s.texts)),
      firstChartMs: await page.evaluate(
        () => performance.getEntriesByName('chart:first-frame')[0]?.duration,
      ),
    });
  }
  const report = {
    measuredAt: new Date().toISOString(),
    environment: {
      browser: browser.version(),
      os: `${platform()} ${release()}`,
      cpu: cpus()[0]?.model,
      viewport: page.viewportSize(),
      dpr: await page.evaluate(() => devicePixelRatio),
      headless: true,
    },
    note: '로컬 headless 관찰값. renderMs는 엔진과 동기 camera 구독자 비용이며 브라우저 합성·React commit을 포함하지 않는다. intervalMs와 FPS를 함께 확인. CI 성능 게이트 아님.',
    results,
  };
  const output = testInfo.outputPath('performance.json');
  await writeFile(output, JSON.stringify(report, null, 2));
  await testInfo.attach('performance', { path: output, contentType: 'application/json' });
  console.log(JSON.stringify(report, null, 2));
  await page.screenshot({ path: testInfo.outputPath('debug.png') });
});
