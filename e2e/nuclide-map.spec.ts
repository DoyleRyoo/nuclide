import { expect, test, type Page } from '@playwright/test';

function map(page: Page) {
  return page.getByRole('application', { name: '핵종 지도', exact: true });
}

async function openUranium(page: Page) {
  await page.goto('./?nuclide=U-235&view=143.50,92.50,96');
  await expect(page.getByRole('heading', { name: '우라늄-235', exact: true })).toBeVisible();
}

function camera(page: Page) {
  const values = new URL(page.url()).searchParams.get('view')?.split(',').map(Number);
  if (!values || values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`유효한 카메라 쿼리가 없습니다: ${page.url()}`);
  }
  return { cx: values[0]!, cy: values[1]!, s: values[2]! };
}

test('첫 화면의 지도와 전체 보기 버튼을 로드한다', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('./');
  await expect(map(page)).toBeVisible();
  await expect(map(page).locator('canvas')).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: '핵종 검색' })).toBeVisible();
  await expect(page.getByRole('button', { name: /전체 보기/ })).toBeVisible();
  await expect(page.getByText('데이터를 불러오지 못했습니다', { exact: false })).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('검색 후보를 키보드로 선택하고 새로고침해 같은 핵종을 복원한다', async ({ page }) => {
  await page.goto('./');
  const search = page.getByRole('combobox', { name: '핵종 검색' });
  await search.fill('U-235');
  await expect(page.getByRole('option').filter({ hasText: '우라늄-235' })).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: '우라늄-235', exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('nuclide')).toBe('U-235');
  await page.reload();
  await expect(page.getByRole('heading', { name: '우라늄-235', exact: true })).toBeVisible();
});

test('핵종 칸 클릭이나 탭으로 선택하고 빈 곳에서 해제한다', async ({ page, isMobile }) => {
  await page.goto('./?view=143.50,92.50,96');
  await expect(map(page).locator('canvas')).toHaveCount(2);
  const box = await map(page).boundingBox();
  expect(box).not.toBeNull();
  const initial = camera(page);
  const x = box!.x + box!.width / 2 + (143.5 - initial.cx) * initial.s;
  const y = box!.y + box!.height / 2 - (92.5 - initial.cy) * initial.s;
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await expect(page.getByRole('heading', { name: '우라늄-235', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /전체 보기/ }).click();
  await expect.poll(() => camera(page).s).toBeLessThan(10);
  const fitted = camera(page);
  // 빈 칸 (N 90, Z 8): 차트 오른쪽 아래의 빈 삼각형. 범례(왼쪽 위)·미니맵(오른쪽 아래 끝)과 겹치지 않는다.
  const emptyX = box!.x + box!.width / 2 + (90.5 - fitted.cx) * fitted.s;
  const emptyY = box!.y + box!.height / 2 - (8.5 - fitted.cy) * fitted.s;
  if (isMobile) await page.touchscreen.tap(emptyX, emptyY);
  else await page.mouse.click(emptyX, emptyY);
  await expect(page.getByRole('heading', { name: '우라늄-235', exact: true })).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get('nuclide')).toBeNull();
});

test('잘못된 URL 상태도 정상 지도를 표시한다', async ({ page }) => {
  await page.goto('./?nuclide=invalid&color=unknown&view=NaN,Infinity,-1');
  await expect(map(page)).toBeVisible();
  await expect(map(page).locator('canvas')).toHaveCount(2);
  await page.getByRole('button', { name: /전체 보기/ }).click();
  await expect
    .poll(() => {
      const view = new URL(page.url()).searchParams.get('view');
      return view !== null && view.split(',').every((value) => Number.isFinite(Number(value)));
    })
    .toBe(true);
});

test('패널 닫기는 선택을 유지하고 Enter로 다시 연다', async ({ page, isMobile }) => {
  await openUranium(page);
  const panel = page.getByRole(isMobile ? 'dialog' : 'complementary', { name: '핵종 정보' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /닫기/ }).click();
  await expect(page.getByRole('heading', { name: '우라늄-235', exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('nuclide')).toBe('U-235');
  await map(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '우라늄-235', exact: true })).toBeVisible();
});

test('지도 방향키로 이웃을 선택하고 뒤로 가기로 선택을 복원한다', async ({ page }) => {
  await openUranium(page);
  await map(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => new URL(page.url()).searchParams.get('nuclide')).toBe('U-236');
  await expect(page.getByRole('heading', { name: '우라늄-236', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: '우라늄-235', exact: true })).toBeVisible();
});

test('휠 이동과 드래그는 선택을 바꾸지 않고 카메라를 이동한다', async ({ page, isMobile }) => {
  test.skip(isMobile, '데스크톱 마우스 입력 검증');
  await openUranium(page);
  const box = await map(page).boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * 0.4;
  const y = box!.y + box!.height * 0.5;
  const before = camera(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(80, 100);
  await expect.poll(() => camera(page).cx).toBeGreaterThan(before.cx);
  const afterWheel = camera(page);
  expect(afterWheel.cy).toBeLessThan(before.cy);
  expect(afterWheel.s).toBeCloseTo(before.s, 1);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 50, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => camera(page).cx).toBeLessThan(afterWheel.cx);
  await expect.poll(() => camera(page).cy).toBeGreaterThan(afterWheel.cy);
  expect(new URL(page.url()).searchParams.get('nuclide')).toBe('U-235');
});

test('Ctrl+휠은 포인터의 월드 좌표를 유지하면서 확대한다', async ({ page, isMobile }) => {
  test.skip(isMobile, '데스크톱 마우스 입력 검증');
  await openUranium(page);
  const box = await map(page).boundingBox();
  expect(box).not.toBeNull();
  const relativeX = box!.width * 0.4;
  const relativeY = box!.height * 0.45;
  const before = camera(page);
  const worldX = before.cx + (relativeX - box!.width / 2) / before.s;
  const worldY = before.cy - (relativeY - box!.height / 2) / before.s;
  await page.mouse.move(box!.x + relativeX, box!.y + relativeY);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(() => camera(page).s).toBeGreaterThan(before.s);
  const after = camera(page);
  expect(after.cx + (relativeX - box!.width / 2) / after.s).toBeCloseTo(worldX, 1);
  expect(after.cy - (relativeY - box!.height / 2) / after.s).toBeCloseTo(worldY, 1);
});

test('모바일 시트가 뷰포트 안에 있고 가로 스크롤이 없다', async ({ page, isMobile }) => {
  test.skip(!isMobile, '모바일 레이아웃 검증');
  await openUranium(page);
  const panel = page.getByRole('dialog', { name: '핵종 정보' });
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport!.width,
  );
  await panel.getByRole('button', { name: /닫기/ }).tap();
  await page.getByRole('button', { name: /전체 보기/ }).tap();
  await expect(panel).toHaveCount(0);
});
