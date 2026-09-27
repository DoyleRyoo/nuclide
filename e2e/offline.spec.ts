import { expect, test } from '@playwright/test';

test('배포 경로의 PWA 캐시로 오프라인 새 탭에서 핵종과 AME 상세를 연다', async ({
  page,
  context,
  browserName,
  baseURL,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Playwright의 서비스 워커·오프라인 검증은 Chromium에서 실행',
  );
  const failures: string[] = [];
  await page.goto('./?nuclide=U-235');
  await expect(page.getByRole('heading', { name: '우라늄-235', exact: true })).toBeVisible();
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(baseURL);
  // 첫 설치가 끝난 뒤 재방문해야 활성 워커가 탐색을 제어한다.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
    return { url: link.href, data: await (await fetch(link.href)).json() };
  });
  expect(new URL(manifest.data.start_url, manifest.url).href).toBe(baseURL);
  expect(new URL(manifest.data.scope, manifest.url).href).toBe(baseURL);
  for (const icon of manifest.data.icons) {
    const response = await page.request.get(new URL(icon.src, manifest.url).href);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }

  await context.setOffline(true);
  await page.close();
  const offline = await context.newPage();
  offline.on('pageerror', (error) => failures.push(error.message));
  await offline.goto(new URL('?nuclide=U-235&color=binding', baseURL).href);
  await expect(offline.getByRole('heading', { name: '우라늄-235', exact: true })).toBeVisible();
  await expect(offline.locator('[role="application"] canvas')).toHaveCount(2);
  await expect(offline.getByText('235.043', { exact: false })).toBeVisible();
  const search = offline.getByRole('combobox', { name: '핵종 검색' });
  await search.fill('Tc-99m');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect.poll(() => new URL(offline.url()).searchParams.get('nuclide')).toBe('Tc-99m');
  await offline.reload();
  await expect(offline.getByRole('heading', { name: '테크네튬-99', exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});
