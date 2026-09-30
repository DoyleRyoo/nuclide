import { expect, test } from '@playwright/test';
import { elements } from '../src/data/elements';

interface DrawnText {
  label: string;
  x: number;
  y: number;
  width: number;
  font: string;
  color: string;
  align: string;
}
declare global {
  interface Window {
    rulerDraws: DrawnText[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.rulerDraws = [];
    const originalFill = CanvasRenderingContext2D.prototype.fillText;
    const originalClear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.matches('.chart canvas:last-child')) window.rulerDraws = [];
      originalClear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.fillText = function (label, x, y) {
      if (this.canvas.matches('.chart canvas:last-child')) {
        window.rulerDraws.push({
          label,
          x,
          y,
          width: this.measureText(label).width,
          font: this.font,
          color: String(this.fillStyle),
          align: this.textAlign,
        });
      }
      originalFill.call(this, label, x, y);
    };
  });
});

test('실제 캔버스의 모든 원소 폭·두 칸 정렬·선택 여백·안전 영역과 클릭 경계', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  for (const width of [360, 390, 430, 844, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    for (const id of ['Og-294', 'Fm-257', 'Cm-248']) {
      await page.goto(`./?nuclide=${id}`);
      await expect(page.locator('.panel-header h2')).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      for (const safe of [0, 44]) {
        await page.evaluate(async (safe) => {
          document.documentElement.style.setProperty('--safe-left', `${safe}px`);
          document.documentElement.style.setProperty('--safe-bottom', '34px');
          window.dispatchEvent(new Event('resize'));
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        }, safe);
        await expect
          .poll(() =>
            page.evaluate(() => window.rulerDraws.filter((d) => d.align === 'right').length),
          )
          .toBeGreaterThan(2);
        const result = await page.evaluate(
          ({ elements, safe }) => {
            const canvas = document.querySelector<HTMLCanvasElement>('.chart canvas:last-child')!;
            const ctx = canvas.getContext('2d')!;
            const rows = window.rulerDraws.filter((d) => d.align === 'right');
            const number = rows.find((d) => /^\d+$/.test(d.label))!;
            const symbol = rows.find((d) => /^[A-Za-z]+$/.test(d.label))!;
            const fontSize = parseFloat(number.font.match(/[\d.]+px/)![0]);
            const p = Math.max(6, fontSize / 2);
            const failures: string[] = [];
            const fontBefore = ctx.font;
            for (const weight of [500, 700]) {
              ctx.font = number.font.replace(/^(\d+|bold)/, String(weight));
              for (const element of elements) {
                if (number.x - ctx.measureText(String(element.z)).width < safe + 2 + p - 0.01)
                  failures.push(String(element.z));
                if (
                  symbol.x - ctx.measureText(element.symbol).width <
                  number.x + fontSize * 0.3 - 0.01
                )
                  failures.push(element.symbol);
              }
            }
            ctx.font = fontBefore;
            const rw = parseFloat(
              getComputedStyle(document.querySelector('.app')!).getPropertyValue('--ruler-w'),
            );
            return {
              failures,
              rw,
              p,
              numberX: number.x,
              symbolX: symbol.x,
              numberXs: [...new Set(rows.filter((d) => /^\d+$/.test(d.label)).map((d) => d.x))],
              symbolXs: [
                ...new Set(rows.filter((d) => /^[A-Za-z]+$/.test(d.label)).map((d) => d.x)),
              ],
            };
          },
          { elements, safe },
        );
        expect(result.failures).toEqual([]);
        expect(result.numberXs).toEqual([result.numberX]);
        expect(result.symbolXs).toEqual([result.symbolX]);
        expect(result.rw - result.symbolX).toBeGreaterThanOrEqual(result.p + 2);
        await page.locator('.panel-close').click();
        // Fixed old widths (36/48) would allow this tap to select a map cell.
        await page.mouse.click(result.rw - 2, 300);
        await expect(page.locator('.info-panel')).toHaveCount(0);
        if (safe === 44 && id === 'Og-294')
          await page.screenshot({ path: info.outputPath(`ruler-${width}.png`) });
        // Restore the selected panel for the next safe-area case.
        await page.locator('.chart').press('Enter');
        await expect(page.locator('.info-panel')).toBeVisible();
      }
    }
  }
});

test('늦은 웹 글꼴 로드 뒤 눈금자 폭과 클릭 여백이 함께 갱신된다', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*.woff2', async (route) => {
    await gate;
    await route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?nuclide=Og-294', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.chart canvas')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.rulerDraws.length)).toBeGreaterThan(0);
  const before = await page
    .locator('.app')
    .evaluate((node) => getComputedStyle(node).getPropertyValue('--ruler-w'));
  release();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect
    .poll(() =>
      page.locator('.app').evaluate((node) => getComputedStyle(node).getPropertyValue('--ruler-w')),
    )
    .not.toBe(before);
  const bounds = await page.locator('.map-meta').boundingBox();
  const width = await page
    .locator('.app')
    .evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue('--ruler-w')));
  expect(bounds!.x).toBeGreaterThan(width);
});

test('좁은 화면에서 선택 Z/N과 인접 호버가 16–21px 배율에서도 겹치지 않는다', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const scale of [16, 17, 18, 19, 20, 21]) {
    await page.goto(`./?nuclide=Pb-208&view=126.5,82.5,${scale}`);
    await expect(page.locator('.panel-header h2')).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.locator('.panel-close').click();
    const selected = await page.evaluate(() => ({
      x: window.rulerDraws.find((d) => d.align === 'center' && d.label === '126')!.x,
      y: window.rulerDraws.find((d) => d.align === 'right' && d.label === '82')!.y,
    }));
    for (const axis of ['z', 'n']) {
      await page.mouse.move(
        selected.x + (axis === 'n' ? scale : 0),
        selected.y - (axis === 'z' ? scale : 0),
      );
      await expect(page.locator('.map-tooltip')).toContainText(axis === 'z' ? 'Bi' : 'Pb');
      const labels = await page.evaluate(
        (axis) =>
          window.rulerDraws.filter(
            (d) => d.align === (axis === 'z' ? 'right' : 'center') && /^\d+$/.test(d.label),
          ),
        axis,
      );
      expect(labels.some((d) => d.label === (axis === 'z' ? '82' : '126'))).toBe(true);
      expect(labels.some((d) => d.label === (axis === 'z' ? '83' : '127'))).toBe(false);
      const sorted = labels
        .map((d) => ({
          center: axis === 'z' ? d.y : d.x,
          extent: axis === 'z' ? 20 : d.width + 12,
        }))
        .sort((a, b) => a.center - b.center);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.center - sorted[i - 1]!.center).toBeGreaterThanOrEqual(
          (sorted[i]!.extent + sorted[i - 1]!.extent) / 2 + 2 - 0.01,
        );
      }
    }
    if (scale === 16) await page.screenshot({ path: info.outputPath('adjacent-hover.png') });
  }
});

for (const theme of ['light', 'dark']) {
  test(`${theme}: 마법수와 일반 눈금은 같은 색이며 굵기만 다르다`, async ({ page }, info) => {
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          'nuclide-map:settings:v1',
          JSON.stringify({
            state: { theme, hintSeen: true },
            version: 1,
          }),
        ),
      theme,
    );
    await page.goto('./?view=82.5,50.5,24');
    await expect
      .poll(() => page.evaluate(() => window.rulerDraws.filter((d) => d.align === 'right').length))
      .toBeGreaterThan(4);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const rows = await page.evaluate(() => window.rulerDraws.filter((d) => d.align === 'right'));
    const magic = rows.find((d) => d.label === '50')!;
    const normal = rows.find((d) => /^\d+$/.test(d.label) && d.label !== '50')!;
    expect(magic.color).toBe(normal.color);
    expect(magic.font).toMatch(/^(700|bold) /);
    expect(normal.font).toMatch(/^500 /);
    await page.screenshot({ path: info.outputPath(`magic-${theme}.png`) });
  });
}
