import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page, id = 'Ds-281') {
  await page.goto(`./?nuclide=${id}`);
  await expect(page.locator('.panel-header h2')).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function noHorizontalOverflow(page: Page, selector: string) {
  const errors = await page.locator(selector).evaluateAll((nodes) =>
    nodes
      .filter((node) => node.clientWidth && node.scrollWidth > node.clientWidth + 1)
      .map(
        (node) =>
          `${node.className}: ${node.scrollWidth}/${node.clientWidth}: ${[
            ...node.querySelectorAll('*'),
          ]
            .filter((n) => n.clientWidth && n.scrollWidth > n.clientWidth + 1)
            .map((n) => n.className + ':' + n.textContent?.slice(0, 80))
            .join('; ')}`,
      ),
  );
  expect(errors).toEqual([]);
}

for (const locale of ['ko', 'en']) {
  for (const theme of ['light', 'dark']) {
    test(`${locale}/${theme}: 입력 최소 크기와 좁은 화면·가로 화면 레이아웃`, async ({ page }) => {
      await page.addInitScript(
        ({ locale, theme }) => {
          localStorage.setItem(
            'nuclide-map:settings:v1',
            JSON.stringify({
              state: { locale, theme, hintSeen: true },
              version: 1,
            }),
          );
        },
        { locale, theme },
      );
      for (const [width, height] of [
        [360, 640],
        [390, 844],
        [430, 932],
        [767, 640],
        [768, 640],
        [844, 390],
        [932, 430],
        [1280, 720],
      ]) {
        await page.setViewportSize({ width: width!, height: height! });
        await ready(page);
        await page
          .locator(width! < 768 ? '.mobile-menu' : '.toolbar button:has(svg.lucide-settings-2)')
          .click();
        for (const input of await page.locator('.search-box input, select:visible').all()) {
          expect(
            await input.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
          ).toBeGreaterThanOrEqual(16);
        }
        const small = await page.locator('.app *').evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              if (
                !(node instanceof HTMLElement) ||
                node.closest('sup, .sr-only') ||
                !node.getClientRects().length
              )
                return false;
              return (
                [...node.childNodes].some(
                  (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
                ) && parseFloat(getComputedStyle(node).fontSize) < 12
              );
            })
            .map((node) => node.className || node.tagName),
        );
        expect(small).toEqual([]);
        await noHorizontalOverflow(
          page,
          '.app, .info-panel, .panel-header, .settings-popover, .chips',
        );
        const header = await page.locator('.app-header').boundingBox();
        expect(header!.x + header!.width).toBeLessThanOrEqual(width! + 1);
        expect(
          await page.evaluate(() => getComputedStyle(document.documentElement).touchAction),
        ).toBe('auto');
      }
    });
  }
}

test('시트 0·1·2: 긴 이름, 안전 영역, 200% 텍스트 크기에서 내부 콘텐츠 접근', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 640 });
  for (const locale of ['ko', 'en']) {
    await page.addInitScript((locale) => {
      localStorage.setItem(
        'nuclide-map:settings:v1',
        JSON.stringify({ state: { locale, hintSeen: true }, version: 1 }),
      );
    }, locale);
    for (const id of ['Ds-281', 'Rf-267', 'Og-294']) {
      await ready(page, id);
      for (const scale of [1, 2]) {
        for (const safeBottom of [0, 34]) {
          await page.evaluate(
            ({ scale, safeBottom }) => {
              document.documentElement.style.fontSize = `${16 * scale}px`;
              document.documentElement.style.setProperty('--safe-bottom', `${safeBottom}px`);
              window.dispatchEvent(new Event('resize'));
            },
            { scale, safeBottom },
          );
          for (const sheet of [2, 0, 1]) {
            await page.locator('.info-panel').evaluate((panel) => {
              panel.scrollTop = 0;
            });
            await page.locator('.sheet-handle').click();
            await expect(page.locator('.info-panel')).toHaveClass(new RegExp(`sheet-${sheet}`));
            await expect
              .poll(() =>
                page.locator('.info-panel').evaluate((panel) => {
                  const bounds = panel.getBoundingClientRect();
                  const bottom = bounds.bottom - parseFloat(getComputedStyle(panel).paddingBottom);
                  return ['.panel-symbol', 'h2'].every((selector) => {
                    const r = panel.querySelector(selector)!.getBoundingClientRect();
                    return (
                      r.top >= bounds.top &&
                      r.bottom <= bottom + 1 &&
                      r.left >= bounds.left &&
                      r.right <= bounds.right
                    );
                  });
                }),
              )
              .toBe(true);
            await noHorizontalOverflow(
              page,
              '.info-panel, .panel-header, .panel-section, .chips, .neighbor-controls',
            );
            await page.locator('.copy-button').scrollIntoViewIfNeeded();
            await expect(page.locator('.copy-button')).toBeVisible();
            if (id === 'Rf-267' && safeBottom === 34) {
              await page.locator('.info-panel').evaluate((panel) => {
                panel.scrollTop = 0;
              });
              await page.screenshot({
                path: info.outputPath(`${locale}-${scale}-sheet-${sheet}.png`),
              });
            }
          }
        }
      }
    }
  }
});

test('확대한 검색 결과·설정·도움말·범례는 스크롤로 접근 가능하다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await ready(page);
  await page.locator('.panel-close').click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
    window.dispatchEvent(new Event('resize'));
  });
  await page.locator('.search-box input').fill('U');
  await expect(page.locator('.search-results')).toBeVisible();
  await noHorizontalOverflow(page, '.search-results');
  await page.locator('.search-box input').press('Escape');
  await page.locator('.legend-heading').click();
  await noHorizontalOverflow(page, '.legend, .legend-body');
  await page.locator('.legend-markers').scrollIntoViewIfNeeded();
  await page.locator('.mobile-menu').click();
  await noHorizontalOverflow(page, '.settings-popover');
  await page.locator('.settings-popover > button').last().click();
  await expect(page.locator('.help-dialog')).toBeVisible();
  await noHorizontalOverflow(page, '.help-dialog');
  await page.locator('.help-dialog footer').scrollIntoViewIfNeeded();
  await expect(page.locator('.help-dialog footer')).toBeVisible();
});
