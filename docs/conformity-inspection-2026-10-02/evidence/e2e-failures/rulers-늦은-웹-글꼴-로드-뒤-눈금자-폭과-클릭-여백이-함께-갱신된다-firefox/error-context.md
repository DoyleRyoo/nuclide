# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rulers.spec.ts >> 늦은 웹 글꼴 로드 뒤 눈금자 폭과 클릭 여백이 함께 갱신된다
- Location: e2e\rulers.spec.ts:128:1

# Error details

```
Error: expect(received).not.toBe(expected) // Object.is equality

Expected: not "62px"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic:
    - combobox "핵종 검색" [ref=e9]
    - button "설정" [ref=e10] [cursor=pointer]
  - application "핵종 지도" [ref=e15]
  - paragraph [ref=e17]: 방향키로 핵종 선택, Enter로 정보 열기, +와 −로 확대·축소, 0으로 전체 보기
  - generic:
    - text: 3,558
    - generic: 핵종 지도
    - text: NUBASE2020 + AME2020
  - button "전체 보기 (0)" [ref=e19] [cursor=pointer]
  - region "범례" [ref=e25]:
    - button "범례" [ref=e26] [cursor=pointer]
  - dialog "핵종 정보" [ref=e30]:
    - button "정보 패널 높이 변경" [ref=e31] [cursor=pointer]
    - generic [ref=e33]:
      - button "닫기" [ref=e34] [cursor=pointer]
      - generic [ref=e39]:
        - superscript [ref=e40]: "294"
        - text: Og
      - heading "오가네손-294" [level=2] [ref=e41]
      - paragraph [ref=e42]:
        - generic [ref=e43]: Oganesson-294
        - generic [ref=e44]: NUBASE2020
      - generic [ref=e45]:
        - generic [ref=e46]: Z 118
        - generic [ref=e47]: N 176
        - generic [ref=e48]: A 294
        - generic [ref=e49]: α 붕괴
      - navigation "핵종 지도" [ref=e50]:
        - button "N − 1" [ref=e51] [cursor=pointer]: N−1
        - button "N + 1" [ref=e55] [cursor=pointer]: N+1
        - button "Z + 1" [ref=e59] [cursor=pointer]: Z+1
        - button "Z − 1" [ref=e63] [cursor=pointer]: Z−1
    - generic [ref=e67]:
      - heading "기본 정보" [level=3] [ref=e68]
      - generic [ref=e69]:
        - generic [ref=e70]:
          - term [ref=e71]: 반감기
          - definition [ref=e72]: 0.7 ± 0.3 ms
        - generic [ref=e73]:
          - term [ref=e74]: 자연 존재비
          - definition [ref=e75]: —
        - generic [ref=e76]:
          - term [ref=e77]: 스핀·패리티
          - definition [ref=e78]: 0+
        - generic [ref=e79]:
          - term [ref=e80]: 발견 연도
          - definition [ref=e81]: "2004"
    - generic [ref=e82]:
      - heading "붕괴" [level=3] [ref=e83]
      - list [ref=e84]:
        - listitem [ref=e85]:
          - generic [ref=e86]: α
          - generic [ref=e87]: ~100 %
          - button [ref=e88] [cursor=pointer]:
            - text: →
            - generic [ref=e89]:
              - superscript [ref=e90]: "290"
              - text: Lv
        - listitem [ref=e91]:
          - generic [ref=e92]: SF
          - generic [ref=e93]: "?"
          - generic [ref=e94]: 자발 핵분열
    - generic [ref=e95]:
      - heading "질량·에너지 keV" [level=3] [ref=e96]:
        - text: 질량·에너지
        - generic [ref=e97]: keV
      - generic [ref=e98]:
        - generic [ref=e99]:
          - term [ref=e100]: 질량 초과
          - definition [ref=e101]: 199,320# ± 550
        - generic [ref=e102]:
          - term [ref=e103]: 원자 질량 (u)
          - definition [ref=e104]: 294.21398# ± 0.00059
        - generic [ref=e105]:
          - term [ref=e106]: 핵자당 결합에너지
          - definition [ref=e107]: 7,079# ± 2
        - generic [ref=e108]:
          - term [ref=e109]: Qα
          - definition [ref=e110]: 11,867 ± 31
        - generic [ref=e111]:
          - term [ref=e112]: QEC
          - definition [ref=e113]: 2,920# ± 810
        - generic [ref=e114]:
          - term [ref=e115]: Sn
          - definition [ref=e116]: 7,550# ± 900
        - generic [ref=e117]:
          - term [ref=e118]: Sp
          - definition [ref=e119]: 2,400# ± 960
        - generic [ref=e120]:
          - term [ref=e121]: S2p
          - definition [ref=e122]: 3,390# ± 940
    - generic [ref=e123]:
      - heading "데이터 출처" [level=3] [ref=e124]
      - paragraph [ref=e125]: NUBASE2020 · AME2020
      - button "링크 복사" [ref=e126] [cursor=pointer]
  - generic [ref=e130]: Og-294 · Z 118, N 176 · 선택됨
```

# Test source

```ts
  50  |     await page.setViewportSize({ width, height: 720 });
  51  |     for (const id of ['Og-294', 'Fm-257', 'Cm-248']) {
  52  |       await page.goto(`./?nuclide=${id}`);
  53  |       await expect(page.locator('.panel-header h2')).toBeVisible();
  54  |       await page.evaluate(() => document.fonts.ready.then(() => undefined));
  55  |       for (const safe of [0, 44]) {
  56  |         await page.evaluate(async (safe) => {
  57  |           document.documentElement.style.setProperty('--safe-left', `${safe}px`);
  58  |           document.documentElement.style.setProperty('--safe-bottom', '34px');
  59  |           window.dispatchEvent(new Event('resize'));
  60  |           await new Promise<void>((resolve) =>
  61  |             requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  62  |           );
  63  |         }, safe);
  64  |         await expect
  65  |           .poll(() =>
  66  |             page.evaluate(() => window.rulerDraws.filter((d) => d.align === 'right').length),
  67  |           )
  68  |           .toBeGreaterThan(2);
  69  |         const result = await page.evaluate(
  70  |           ({ elements, safe }) => {
  71  |             const canvas = document.querySelector<HTMLCanvasElement>('.chart canvas:last-child')!;
  72  |             const ctx = canvas.getContext('2d')!;
  73  |             const rows = window.rulerDraws.filter((d) => d.align === 'right');
  74  |             const number = rows.find((d) => /^\d+$/.test(d.label))!;
  75  |             const symbol = rows.find((d) => /^[A-Za-z]+$/.test(d.label))!;
  76  |             const fontSize = parseFloat(number.font.match(/[\d.]+px/)![0]);
  77  |             const p = Math.max(6, fontSize / 2);
  78  |             const failures: string[] = [];
  79  |             const fontBefore = ctx.font;
  80  |             for (const weight of [500, 700]) {
  81  |               ctx.font = number.font.replace(/^(\d+|bold)/, String(weight));
  82  |               for (const element of elements) {
  83  |                 if (number.x - ctx.measureText(String(element.z)).width < safe + 2 + p - 0.01)
  84  |                   failures.push(String(element.z));
  85  |                 if (
  86  |                   symbol.x - ctx.measureText(element.symbol).width <
  87  |                   number.x + fontSize * 0.3 - 0.01
  88  |                 )
  89  |                   failures.push(element.symbol);
  90  |               }
  91  |             }
  92  |             ctx.font = fontBefore;
  93  |             const rw = parseFloat(
  94  |               getComputedStyle(document.querySelector('.app')!).getPropertyValue('--ruler-w'),
  95  |             );
  96  |             return {
  97  |               failures,
  98  |               rw,
  99  |               p,
  100 |               numberX: number.x,
  101 |               symbolX: symbol.x,
  102 |               numberXs: [...new Set(rows.filter((d) => /^\d+$/.test(d.label)).map((d) => d.x))],
  103 |               symbolXs: [
  104 |                 ...new Set(rows.filter((d) => /^[A-Za-z]+$/.test(d.label)).map((d) => d.x)),
  105 |               ],
  106 |             };
  107 |           },
  108 |           { elements, safe },
  109 |         );
  110 |         expect(result.failures).toEqual([]);
  111 |         expect(result.numberXs).toEqual([result.numberX]);
  112 |         expect(result.symbolXs).toEqual([result.symbolX]);
  113 |         expect(result.rw - result.symbolX).toBeGreaterThanOrEqual(result.p + 2);
  114 |         await page.locator('.panel-close').click();
  115 |         // Fixed old widths (36/48) would allow this tap to select a map cell.
  116 |         await page.mouse.click(result.rw - 2, 300);
  117 |         await expect(page.locator('.info-panel')).toHaveCount(0);
  118 |         if (safe === 44 && id === 'Og-294')
  119 |           await page.screenshot({ path: info.outputPath(`ruler-${width}.png`) });
  120 |         // Restore the selected panel for the next safe-area case.
  121 |         await page.locator('.chart').press('Enter');
  122 |         await expect(page.locator('.info-panel')).toBeVisible();
  123 |       }
  124 |     }
  125 |   }
  126 | });
  127 | 
  128 | test('늦은 웹 글꼴 로드 뒤 눈금자 폭과 클릭 여백이 함께 갱신된다', async ({ page }) => {
  129 |   let release!: () => void;
  130 |   const gate = new Promise<void>((resolve) => {
  131 |     release = resolve;
  132 |   });
  133 |   await page.route('**/*.woff2', async (route) => {
  134 |     await gate;
  135 |     await route.continue();
  136 |   });
  137 |   await page.setViewportSize({ width: 390, height: 844 });
  138 |   await page.goto('./?nuclide=Og-294', { waitUntil: 'domcontentloaded' });
  139 |   await expect(page.locator('.chart canvas')).toHaveCount(2);
  140 |   await expect.poll(() => page.evaluate(() => window.rulerDraws.length)).toBeGreaterThan(0);
  141 |   const before = await page
  142 |     .locator('.app')
  143 |     .evaluate((node) => getComputedStyle(node).getPropertyValue('--ruler-w'));
  144 |   release();
  145 |   await page.evaluate(() => document.fonts.ready.then(() => undefined));
  146 |   await expect
  147 |     .poll(() =>
  148 |       page.locator('.app').evaluate((node) => getComputedStyle(node).getPropertyValue('--ruler-w')),
  149 |     )
> 150 |     .not.toBe(before);
      |          ^ Error: expect(received).not.toBe(expected) // Object.is equality
  151 |   const bounds = await page.locator('.map-meta').boundingBox();
  152 |   const width = await page
  153 |     .locator('.app')
  154 |     .evaluate((node) => parseFloat(getComputedStyle(node).getPropertyValue('--ruler-w')));
  155 |   expect(bounds!.x).toBeGreaterThan(width);
  156 | });
  157 | 
  158 | test('좁은 화면에서 선택 Z/N과 인접 호버가 16–21px 배율에서도 겹치지 않는다', async ({
  159 |   page,
  160 | }, info) => {
  161 |   test.setTimeout(60_000);
  162 |   await page.setViewportSize({ width: 390, height: 844 });
  163 |   for (const scale of [16, 17, 18, 19, 20, 21]) {
  164 |     await page.goto(`./?nuclide=Pb-208&view=126.5,82.5,${scale}`);
  165 |     await expect(page.locator('.panel-header h2')).toBeVisible();
  166 |     await page.evaluate(() => document.fonts.ready.then(() => undefined));
  167 |     await page.locator('.panel-close').click();
  168 |     const selected = await page.evaluate(() => ({
  169 |       x: window.rulerDraws.find((d) => d.align === 'center' && d.label === '126')!.x,
  170 |       y: window.rulerDraws.find((d) => d.align === 'right' && d.label === '82')!.y,
  171 |     }));
  172 |     for (const axis of ['z', 'n']) {
  173 |       await page.mouse.move(
  174 |         selected.x + (axis === 'n' ? scale : 0),
  175 |         selected.y - (axis === 'z' ? scale : 0),
  176 |       );
  177 |       await expect(page.locator('.map-tooltip')).toContainText(axis === 'z' ? 'Bi' : 'Pb');
  178 |       const labels = await page.evaluate(
  179 |         (axis) =>
  180 |           window.rulerDraws.filter(
  181 |             (d) => d.align === (axis === 'z' ? 'right' : 'center') && /^\d+$/.test(d.label),
  182 |           ),
  183 |         axis,
  184 |       );
  185 |       expect(labels.some((d) => d.label === (axis === 'z' ? '82' : '126'))).toBe(true);
  186 |       expect(labels.some((d) => d.label === (axis === 'z' ? '83' : '127'))).toBe(false);
  187 |       const sorted = labels
  188 |         .map((d) => ({
  189 |           center: axis === 'z' ? d.y : d.x,
  190 |           extent: axis === 'z' ? 20 : d.width + 12,
  191 |         }))
  192 |         .sort((a, b) => a.center - b.center);
  193 |       for (let i = 1; i < sorted.length; i++) {
  194 |         expect(sorted[i]!.center - sorted[i - 1]!.center).toBeGreaterThanOrEqual(
  195 |           (sorted[i]!.extent + sorted[i - 1]!.extent) / 2 + 2 - 0.01,
  196 |         );
  197 |       }
  198 |     }
  199 |     if (scale === 16) await page.screenshot({ path: info.outputPath('adjacent-hover.png') });
  200 |   }
  201 | });
  202 | 
  203 | for (const theme of ['light', 'dark']) {
  204 |   test(`${theme}: 마법수와 일반 눈금은 같은 색이며 굵기만 다르다`, async ({ page }, info) => {
  205 |     await page.addInitScript(
  206 |       (theme) =>
  207 |         localStorage.setItem(
  208 |           'nuclide-map:settings:v1',
  209 |           JSON.stringify({
  210 |             state: { theme, hintSeen: true },
  211 |             version: 1,
  212 |           }),
  213 |         ),
  214 |       theme,
  215 |     );
  216 |     await page.goto('./?view=82.5,50.5,24');
  217 |     await expect
  218 |       .poll(() => page.evaluate(() => window.rulerDraws.filter((d) => d.align === 'right').length))
  219 |       .toBeGreaterThan(4);
  220 |     await page.evaluate(() => document.fonts.ready.then(() => undefined));
  221 |     const rows = await page.evaluate(() => window.rulerDraws.filter((d) => d.align === 'right'));
  222 |     const magic = rows.find((d) => d.label === '50')!;
  223 |     const normal = rows.find((d) => /^\d+$/.test(d.label) && d.label !== '50')!;
  224 |     expect(magic.color).toBe(normal.color);
  225 |     expect(magic.font).toMatch(/^(700|bold) /);
  226 |     expect(normal.font).toMatch(/^500 /);
  227 |     await page.screenshot({ path: info.outputPath(`magic-${theme}.png`) });
  228 |   });
  229 | }
  230 | 
```