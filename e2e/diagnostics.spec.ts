import { expect, test } from '@playwright/test';

test('성능 오버레이는 명시적으로 켜며 정지 중에는 프레임을 만들지 않는다', async ({ page }) => {
  await page.goto('./?debug=1&view=143.5,92.5,96');
  const debug = page.locator('.chart-debug');
  await expect(debug).toContainText('LOD 2');
  await expect(debug).toContainText('FPS idle');
  await page.evaluate(() => document.fonts.ready);
  const idleFrames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const chart = document.querySelector('[role="application"]')!;
        let count = 0;
        const listener = () => count++;
        chart.addEventListener('chart:frame', listener);
        setTimeout(() => {
          chart.removeEventListener('chart:frame', listener);
          resolve(count);
        }, 400);
      }),
  );
  expect(idleFrames).toBe(0);
  expect(
    await page.evaluate(() => performance.getEntriesByName('chart:first-frame')[0]?.duration),
  ).toBeGreaterThan(0);
  await page.getByRole('application', { name: '핵종 지도', exact: true }).press('+');
  await expect(debug).not.toContainText('scale 96.00');
  expect(new URL(page.url()).searchParams.get('debug')).toBe('1');
  await page.goto('./');
  await expect(page.locator('[role="application"] canvas')).toHaveCount(2);
  await expect(debug).toHaveCount(0);
});

test('미니맵 클릭 이동과 색상 모드 갱신', async ({ page, isMobile }) => {
  test.skip(isMobile, '미니맵은 데스크톱에만 표시');
  await page.goto('./?view=143.5,92.5,96');
  const minimap = page.getByRole('img', { name: '미니맵' });
  await expect(minimap).toBeVisible();
  await minimap.click({ position: { x: 100, y: 67 } });
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('89.00,59.50,96.00');
  const before = await minimap.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.keyboard.press('c');
  await expect
    .poll(() => minimap.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()))
    .not.toBe(before);
});
