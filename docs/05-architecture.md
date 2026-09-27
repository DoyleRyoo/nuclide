# 05. 아키텍처

## 1. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 런타임 | Node.js 24 LTS(현재 설치 v24.16.0), npm 11 | 이미 설치되어 있고 별도 패키지 매니저가 필요 없다 |
| 언어 | TypeScript (strict) | 데이터 스키마·좌표 계산 실수를 타입으로 막는다 |
| 번들러·개발 서버 | Vite | 빠른 HMR, JSON 동적 import의 청크 분리, PWA 플러그인 |
| UI | React 19 | 패널·검색·범례·대화상자처럼 상태가 많은 UI를 컴포넌트로 관리. 60fps가 필요한 차트는 React 밖에서 그린다 |
| 차트 렌더링 | 직접 만든 Canvas 2D 엔진 (외부 의존성 없음) | 보이는 칸만 그리면 충분히 빠르고, LOD 텍스트를 자유롭게 제어할 수 있다 ([ADR-02](06-roadmap.md#4-결정-기록-adr)) |
| 상태 관리 | Zustand | 약 1 KB, React 밖(엔진)에서도 구독 가능 |
| 스타일 | CSS Modules + CSS 변수(토큰) | 토큰을 TS 한 곳에서 관리해 캔버스와 공유 |
| 아이콘 | lucide-react | 트리 셰이킹, 일관된 선 아이콘 |
| 글꼴 | `pretendard` (npm, dynamic subset) | 한글 UI 품질, 자체 호스팅이라 오프라인 가능 |
| PWA | vite-plugin-pwa (Workbox) | 오프라인 캐시, 설치 |
| 테스트 | Vitest, Testing Library, Playwright | 단위·컴포넌트·E2E |
| 코드 품질 | ESLint(flat config + typescript-eslint), Prettier | 표준 조합 |
| 스크립트 실행 | tsx | 데이터 빌드 스크립트도 TypeScript로 |
| 배포 | GitHub Pages + GitHub Actions | 무료 정적 호스팅 |

- 패키지는 구현을 시작하는 시점의 최신 안정판을 설치하고 `package-lock.json`으로 고정한다.
- Web Worker는 쓰지 않는다. 데이터가 작아 파싱·색인이 메인 스레드에서 50 ms 안에 끝난다.

## 2. 전체 구조

```
generated/nuclides.json --(dynamic import)--> data/load.ts --> NuclideIndex
generated/ame.json      --(첫 차트 뒤)------/
                                                               (grid, byId, rows, search index)
                                                                    |
                  +-------------------------------------------------+
                  v                                                 v
   ChartEngine (src/chart, no React)                     React UI (src/components)
   Camera | Input | Renderer | Animator  <-- ChartView -->  Search | Toolbar | Legend | Panel
                  ^        |                                        ^
     setters      |        | events: select / hover / camera        | subscribe
                  |        v                                        |
               Zustand store (selection, colorMode, theme, locale, settings)
                           |                         |
                           v                         v
                 urlState (history API)     localStorage (settings only)
```

- **ChartEngine**: 카메라, 입력, 캔버스 렌더링, 애니메이션. React를 모른다.
- **React UI**: 차트 위에 떠 있는 모든 UI. 카메라 값(초당 60번 바뀜)은 React 상태에 넣지 않는다.
- **ChartView**: 엔진을 만들고 없애며, 스토어와 엔진을 양방향으로 잇는 유일한 접점.

## 3. 폴더 구조

```
010_table_of_nuclide/
├─ my_thought.md                          # 최초 요구사항 메모 (보존)
├─ docs/                         # 설계 문서
├─ data/
│  ├─ raw/                       # 원본 평가 데이터 (수정 금지)
│  │  ├─ nubase_4.mas20.txt
│  │  ├─ mass_1.mas20.txt
│  │  ├─ rct1.mas20.txt
│  │  └─ rct2_1.mas20.txt
│  └─ SOURCES.md                 # 받은 URL·날짜·SHA-256·인용
├─ scripts/
│  └─ build-data/
│     ├─ index.ts                # 진입점: raw → generated JSON (--check 옵션)
│     ├─ parseNubase.ts
│     ├─ parseAme.ts
│     ├─ decayModes.ts           # 토큰 → 범주·딸핵 변위 표, 주 모드 판정
│     ├─ validate.ts             # 개수 스냅샷, 골든 레코드
│     └─ *.test.ts
├─ src/
│  ├─ main.tsx
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ store.ts                # Zustand
│  │  └─ urlState.ts
│  ├─ chart/                     # React 비의존 엔진
│  │  ├─ ChartEngine.ts
│  │  ├─ camera.ts               # 순수 함수: 변환, 줌, 이동, 클램프, 맞춤
│  │  ├─ lod.ts
│  │  ├─ hitTest.ts
│  │  ├─ colorModes.ts           # 모드별 색 인덱스 배열 + 팔레트
│  │  ├─ animation.ts
│  │  ├─ input/                  # pointer.ts, wheel.ts, keyboard.ts, safariGesture.ts, inertia.ts
│  │  └─ render/                 # Renderer.ts, cells.ts, labels.ts, markers.ts,
│  │                             # magic.ts, rulers.ts, arrows.ts, selection.ts
│  ├─ components/
│  │  ├─ ChartView.tsx
│  │  ├─ SearchBox/  Toolbar/  ZoomControls/  Legend/  Minimap/
│  │  ├─ InfoPanel/              # InfoPanel.tsx, sections/*
│  │  └─ Tooltip.tsx  Toast.tsx  HelpDialog.tsx  HintOverlay.tsx
│  ├─ data/
│  │  ├─ types.ts                # 04 §7 스키마 (스크립트와 공유)
│  │  ├─ elements.ts             # 원소 표 (04 §8)
│  │  ├─ load.ts                 # 동적 import + 색인 생성
│  │  ├─ search.ts               # 검색 파서·후보
│  │  ├─ format.ts               # 표시 규칙 (04 §9)
│  │  └─ generated/nuclides.json # data:build 결과 (커밋)
│  ├─ i18n/                      # index.ts, ko.ts, en.ts
│  ├─ theme/                     # tokens.ts, colormaps.ts, applyTheme.ts
│  └─ styles/global.css
├─ e2e/                          # Playwright
├─ public/                       # favicon.svg, icons/
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

단위 테스트는 대상 파일 옆에 `*.test.ts`로 둔다.

## 4. 차트 엔진

### 4.1 공개 API

```ts
export class ChartEngine {
  constructor(opts: {
    container: HTMLElement;              // 캔버스 2장을 넣을 요소
    index: NuclideIndex;
    theme: ThemeTokens;
    colorMode: ColorMode;
    wheelMode: 'scroll' | 'zoom';
    reducedMotion: boolean;
  });

  // 스토어 → 엔진
  setColorMode(mode: ColorMode): void;
  setTheme(theme: ThemeTokens): void;
  setSelected(id: string | null): void;
  setShowPredicted(show: boolean): void;
  setWheelMode(mode: 'scroll' | 'zoom'): void;
  setReducedMotion(on: boolean): void;
  setSafeInsets(insets: Insets): void;              // 02 §2.4
  setHighlight(h: Highlight | null): void;          // 범례 범주 / 검색 행·열

  // 카메라
  getCamera(): Camera;                              // { cx, cy, s }
  setCamera(c: Camera): void;
  zoomBy(k: number, anchor?: ScreenPoint): void;    // 버튼·키 (애니메이션)
  fitAll(): void;
  fitBounds(r: WorldRect): void;
  flyTo(t: { n: number; z: number; s?: number }): Promise<void>;

  // 엔진 → 스토어
  on(type: 'select', fn: (id: string | null) => void): () => void;   // 클릭·탭, 빈 곳 = null
  on(type: 'navigate', fn: (id: string) => void): () => void;        // 방향키로 이웃 선택
  on(type: 'activate', fn: (id: string | null) => void): () => void; // Enter / Space
  on(type: 'hover', fn: (h: { id: string; x: number; y: number } | null) => void): () => void;
  on(type: 'camera', fn: (c: Camera, lod: Lod) => void): () => void;  // 프레임당 최대 1회

  destroy(): void;
}
```

### 4.2 렌더링 파이프라인

**캔버스 2장**을 겹친다.

| 레이어 | 내용 | 다시 그리는 때 |
|---|---|---|
| base | 배경, 칸, 예측 칸 점선, 표식, 글자, 마법수 선, N=Z 선 | 카메라, 데이터, 색상 모드, 테마, 예측 표시, 글꼴 로드, 범례 강조 |
| overlay | 호버 링, 선택 링, 붕괴 화살표, 검색 강조, 눈금자 | 카메라, 호버, 선택, 강조 |

- 호버처럼 자주 바뀌는 것은 overlay만 다시 그리므로 싸다.
- 캔버스 픽셀 크기 = CSS 크기 × min(devicePixelRatio, 2). `ResizeObserver`로 크기 변화를 감지한다.
- **필요할 때만 그린다**: 변경이 생기면 `invalidate(layer)`로 표시하고 `requestAnimationFrame`을 한 번만 예약한다. 프레임에서 ① 애니메이션 진행 → ② 카메라 확정 → ③ 표시된 레이어만 그리기 → ④ 카메라가 바뀌었으면 `camera` 이벤트. 움직임이 없으면 rAF 루프도 없다.

base 레이어 그리기 순서: 배경 → 칸 채우기 → 예측 칸 점선 → 표식(자연 존재 띠, 이성질체 삼각형) → 글자(LOD ≥ 1) → 마법수 선 → N=Z 선.

### 4.3 컬링과 배칭

- **컬링**: 카메라에서 보이는 월드 사각형을 구해 N, Z 범위를 정수로 자르고 데이터 경계와 교차한다. 보이는 행마다 그 행의 N 범위와 겹치는 부분만 격자에서 읽는다. 최악(전체 보기)이어도 3,558칸이다.
- **색 배칭**: 색상 모드·테마가 바뀔 때 핵종마다 색 인덱스(`Uint8Array`)와 팔레트(연속 모드는 64단계로 양자화)를 미리 계산한다. 프레임마다 보이는 칸을 색 인덱스별로 계수 정렬(미리 할당한 `Int32Array` 버킷)한 뒤, 색마다 `fillStyle`을 한 번만 바꾸고 `fillRect`를 이어 부른다.
- **히트 테스트**: 화면 좌표 → 월드 좌표 → `grid[z][n]` 조회. 공간 색인이 필요 없다.

### 4.4 글자

- 칸에 쓸 문자열(질량수, 기호, 짧은 반감기, 붕괴 줄, Jπ, 존재비)은 데이터 로드 때 한 번 만들어 둔다. 프레임 안에서 문자열을 만들지 않는다.
- 폰트 문자열은 LOD·크기 단계(0.5px 단위로 반올림)별로 캐시하고, `measureText` 결과는 `폰트|문자열` 키로 캐시한다.
- LOD 전환 구간(02 §8)에서는 `globalAlpha`로 새 글자를 서서히 나타낸다.
- 측정 결과 프레임 예산을 넘으면, 이동·줌 중(LOD 3)에는 아래쪽 줄을 생략했다가 멈추면 다시 그리는 적응형 단순화를 넣는다(필요할 때만).

### 4.5 입력 처리

```
                 pointerdown                  move > 4px (touch 8px)
      Idle ────────────────────► Pressed ────────────────────────► Dragging
       ▲                           │ pointerup                        │ pointerup
       │                           ▼                                  ▼
       │                   click → hitTest → select        Inertia (P1) ──► Idle
       │                                                    (any new input cancels)
       │        2nd touch pointer
       └──── Pinching ◄──────────── Pressed / Dragging
```

| 모듈 | 역할 |
|---|---|
| `pointer.ts` | Pointer Events, `setPointerCapture`, 클릭/드래그 판별, 더블클릭·더블탭, 두 손가락 핀치 |
| `wheel.ts` | `passive: false`, `deltaMode` 정규화, Ctrl/⌘ 또는 "휠 = 줌" 모드면 줌, 아니면 이동, Shift 처리 |
| `safariGesture.ts` | `gesturestart/gesturechange/gestureend` (Safari 트랙패드 핀치) |
| `keyboard.ts` | 컨테이너 `keydown` — 02 §7의 표 |
| `inertia.ts` | 최근 100 ms 속도 추정, 지수 감속 |

규칙의 수치는 모두 [02-ux-interaction.md](02-ux-interaction.md)를 따른다.

### 4.6 애니메이션

- `Animator`가 카메라 트윈(시작·끝 카메라, 시간, 이징)을 하나만 관리한다. 새 입력이 오면 즉시 취소한다.
- 배율은 로그 공간에서, 중심은 선형으로 보간한다.
- 동작 줄이기 설정이면 시간을 0으로 바꿔 바로 이동한다.

## 5. 상태 관리

### 5.1 스토어

```ts
interface AppState {
  // 데이터
  status: 'loading' | 'ready' | 'error';
  index: NuclideIndex | null;

  // 선택·상호작용
  selectedId: string | null;             // 기저 상태 ID
  expandedStateId: string | null;        // 패널에서 펼친 들뜬 상태
  panelOpen: boolean;
  hovered: { id: string; x: number; y: number } | null;
  highlight: Highlight | null;

  // 설정 (localStorage에 저장)
  colorMode: 'decay' | 'halflife' | 'binding' | 'year' | 'abundance';
  theme: 'system' | 'light' | 'dark';
  locale: 'ko' | 'en';
  wheelMode: 'scroll' | 'zoom';
  showPredicted: boolean;
  hintSeen: boolean;
}
```

- **카메라는 스토어에 넣지 않는다.** 엔진이 소유하고, 필요한 곳(URL 동기화, 미니맵 사각형, 줌 버튼 비활성)은 엔진의 `camera` 이벤트를 직접 구독한다.

### 5.2 엔진 ↔ React 연결 (ChartView)

- 데이터가 준비되면 엔진을 한 번 만든다(`useEffect`), 언마운트할 때 `destroy()`.
- 스토어의 `colorMode`, `theme`, `selectedId`, `showPredicted`, `wheelMode`, `highlight`를 구독해 엔진 setter를 부른다.
- 엔진 이벤트 `select` → `store.select(id)`, `hover` → `store.setHovered(...)`.
- 패널·시트가 열리고 닫히거나 창 크기가 바뀌면 `setSafeInsets()`를 부른다.

### 5.3 URL 동기화 (`urlState.ts`)

- 시작 시 쿼리를 읽어 초기 선택·색상 모드·카메라를 정한다(02 §14).
- `selectedId`가 바뀌면 `pushState`, 카메라가 멈추면 300 ms 뒤 `replaceState`.
- `popstate`(뒤로 가기)가 오면 선택을 되돌린다.

### 5.4 설정 저장

- Zustand `persist` 미들웨어로 설정 필드만(`partialize`) 저장한다. 키 `nuclide-map:settings:v1`, 버전 번호로 마이그레이션.
- 선택·카메라는 저장하지 않는다(URL이 담당).

## 6. 데이터 로딩

```ts
const { default: text } = await import('./generated/nuclides.json?raw'); // 핵심 청크 (문자열)
const index = buildIndex(hydrate(JSON.parse(text))); // grid, byId, rows, 범주별 개수, 검색 색인, 칸 문자열
// 첫 차트 뒤: AME 상세 청크를 받아 핵종의 ame에 채우고 store.ameReady = true
await loadAmeDetails(index);
```

- 저장 형식과 hydrate는 [04 §7](04-data.md#7-출력-스키마), 청크를 나눈 이유는 [04 §10](04-data.md#10-빌드-파이프라인)과 ADR-14.
- JSON은 `?raw` 문자열로 받아 직접 `JSON.parse`한다. 그냥 `import`하면 Vite 8(Rolldown)이 `json.stringify` 설정과 달리 1 MB가 넘는 JS 객체 리터럴로 내보내, Chrome에서 모듈 평가에만 약 105 ms가 걸렸다. `?raw` + `JSON.parse`로 바꾼 뒤 파싱은 10–17 ms다. TypeScript가 큰 JSON의 타입을 추론하지 않는 부수 효과도 있다.
- 파싱 + 색인 예산: 데스크톱 50 ms 이내. `performance.measure` 항목 `data:load`(청크 받기), `data:parse`, `data:index`로 잰다. 2026-09-27 Chrome 측정: 파싱 10–17 ms + 색인 22–28 ms = 33–45 ms.
- 실패하면 `status: 'error'`와 [다시 시도] 버튼.

## 7. 테마와 다국어

- **테마**: `theme/tokens.ts`가 라이트·다크 토큰 객체를 내보낸다. `applyTheme()`이 `:root`에 CSS 변수와 `data-theme`을 넣고, "시스템" 설정이면 `matchMedia('(prefers-color-scheme: dark)')` 변화를 따른다. 같은 객체를 `engine.setTheme()`에 넘긴다.
- **다국어**: `i18n/ko.ts`(기준)와 `en.ts`의 평면 키 사전. `ko`의 키로 타입을 만들어 `en` 누락을 컴파일 오류로 잡는다. `useT()` 훅, `{name}` 치환, 숫자는 `Intl.NumberFormat`. 원소 이름은 사전이 아니라 `elements.ts`(`nameKo`/`nameEn`)에서 가져온다.
- 초기 언어(P1): 저장된 설정 → `navigator.language`가 `ko`로 시작하면 한국어 → 아니면 영어.

## 8. 성능 예산

| 항목 | 예산 | 확인 방법 |
|---|---|---|
| 프레임 — 데스크톱, 모든 LOD | ≤ 16.7 ms (p95) | 개발용 `?debug=1` 오버레이 |
| 프레임 — 중급 모바일 | ≤ 33 ms (p95) | 실기기 |
| 데이터 파싱 + 색인 | ≤ 50 ms (데스크톱) | `performance.mark` |
| 앱 JS | ≤ 150 KB gzip | CI 번들 크기 검사 |
| 데이터 청크 (nuclides, 시작 시) | ≤ 250 KB gzip | CI 번들 크기 검사 |
| AME 상세 청크 (ame, 첫 차트 뒤) | ≤ 300 KB gzip | CI 번들 크기 검사 |
| 클릭 → 패널 | ≤ 100 ms | E2E 측정 |

- `?debug=1` 오버레이: FPS, 프레임 시간, 그린 칸·글자 수, LOD, 카메라 값.
- 구현은 `chart/diagnostics.ts`. 최근 240개의 렌더 작업 시간·rAF 간격을 별도로 집계한다. 이전 프레임 종료 후 100 ms 안에 다음 그리기를 요청한 경우만 연속 프레임으로 계산하므로, 정지 시간은 FPS에서 제외하되 이미 예약된 프레임의 지연은 포함한다. DOM 표시는 최대 초당 4회, 250 ms 무입력 뒤에는 `idle`이며 별도 rAF를 만들지 않는다. 글자 수는 실제 `fillText` 호출 수다.
- debug 모드에서 차트 요소가 `chart:frame` 이벤트를 내보낸다. `renderMs`는 엔진 tick과 동기 `camera` 구독자(미니맵 포함) 실행 비용이며, React commit·브라우저 합성 시간은 제외된다. `intervalMs`와 함께 읽어야 한다. `chart:first-frame` PerformanceMeasure는 탐색 시작부터 첫 Canvas 그리기 명령이 끝날 때까지이며 실제 페인트 시점은 아니다.
- `npm run test:perf`는 별도 Playwright 설정으로 1920×1080 Chromium, 단일 worker, LOD 0–3 이동·왕복 줌을 측정한다. JSON과 스크린샷은 `test-results/`에 남긴다. CI 게이트로 쓰지 않는다.
- 렌더 루프 안에서는 객체·배열을 새로 만들지 않는다(미리 할당한 typed array 재사용).

## 9. PWA·오프라인 (P1)

- `vite-plugin-pwa`, `registerType: 'autoUpdate'`.
- 미리 캐시(precache): HTML, JS, CSS, 데이터 청크, 아이콘.
- 글꼴 파일은 쓰일 때 캐시(CacheFirst). Pretendard 서브셋 전체를 미리 받으면 수 MB라 피한다. 캐시에 없는 글자는 대체 글꼴로 보인다.
- 매니페스트: 이름 "Nuclide Map — 핵종 지도", `display: standalone`, 테마 색은 토큰에서, 아이콘 192/512px + maskable, `lang: ko`.

## 10. 보안

- 실행 중 외부 요청이 없다(데이터·글꼴·아이콘 모두 자체 호스팅).
- `index.html`의 CSP 메타 태그: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'none'`
- `dangerouslySetInnerHTML`, `eval`을 쓰지 않는다.

## 11. 빌드·배포·CI

| npm 스크립트 | 내용 |
|---|---|
| `dev` | Vite 개발 서버 |
| `build` | 타입 검사 + 프로덕션 빌드 (`tsc -b && vite build`) |
| `preview` | 빌드 결과 미리보기 |
| `data:build` | 원본 → `src/data/generated/nuclides.json` |
| `data:check` | 다시 만든 결과가 커밋된 파일과 같은지 확인 |
| `test` | Vitest (단위·컴포넌트) |
| `test:e2e` | Playwright |
| `lint` / `format` | ESLint / Prettier |

GitHub Actions:

- `ci.yml` (push, PR): `npm ci` → `data:check` → `lint` → 타입 검사 → `test` → `build` → 번들 크기 검사 → Playwright E2E(Chromium·Firefox·WebKit).
- `deploy.yml` (main에 push): 빌드 → `actions/upload-pages-artifact` → `actions/deploy-pages`.
- GitHub Pages 프로젝트 사이트는 `/<저장소 이름>/` 아래에서 열리므로 Vite `base`를 환경변수(`VITE_BASE`)로 받는다. 사용자 도메인을 쓰면 `/`.

## 12. 테스트 전략

| 수준 | 도구 | 대상 |
|---|---|---|
| 데이터 | Vitest | 열 자르기, `#` 처리, 단위 환산, 필드별 불확도 표기, 붕괴 토큰·딸핵, 주 모드 규칙, 골든 레코드, 개수 스냅샷 (04 §11) |
| 순수 로직 | Vitest | 카메라(무작위 입력으로 "줌 기준점의 월드 좌표가 줌 전후 같다" 속성 테스트), 히트 테스트, 클램프, LOD·페이드, 눈금 간격, 검색 파서(표 기반), URL 직렬화, 표시 포맷(반올림, 사람이 읽는 반감기) |
| 컴포넌트 | Vitest + Testing Library | 정보 패널(²³⁵U, ¹⁸⁰Ta, ⁹⁹Tc), 검색 자동완성 키보드 조작, 범례 |
| E2E | Playwright | 첫 화면 전체 보기, 휠 세로·가로 이동, Ctrl+휠 줌 기준점, 드래그 이동, 클릭 → 패널에 "우라늄-235", 빈 곳 클릭 해제, 키보드 조작, 검색 → 이동, URL 복원, 모바일 뷰포트 탭·하단 시트 |
| 시각 회귀 (P1) | Playwright 스크린샷 | LOD 0–3 × 라이트/다크, 고정 카메라 |
| 성능 | 수동 + debug 오버레이 | 정해진 경로로 이동·줌할 때 프레임 시간. CI 게이트는 번들 크기만 |

## 13. 코드 규칙

- 식별자는 영어, 주석과 문서는 한국어.
- TypeScript `strict` + `noUncheckedIndexedAccess`.
- `src/chart`는 React와 UI 컴포넌트를 import하지 않는다(ESLint `no-restricted-imports`로 강제).
- 사용자에게 보이는 문자열은 모두 i18n 사전을 거친다.
- 파일명: 컴포넌트는 PascalCase(`InfoPanel.tsx`), 나머지는 camelCase(`camera.ts`).
- 커밋: Conventional Commits (`feat:`, `fix:`, `docs:`, `data:`, `test:`, `chore:`).

## 14. 앱으로 확장

| 단계 | 방법 | 결과 |
|---|---|---|
| 1 (v1.0) | PWA | 데스크톱·Android 설치, iOS 홈 화면 추가, 오프라인 |
| 2 (필요 시) | Tauri 2로 `dist/` 포장 | Windows·macOS·Linux 설치 파일 |
| 3 (필요 시) | Capacitor로 `dist/` 포장 | iOS·Android 앱스토어 배포 |

이를 위해 처음부터 지키는 조건: 자산 경로를 `base`로 바꿀 수 있을 것, 서버 라우팅에 기대지 않을 것(쿼리 문자열), 실행 중 외부 요청이 없을 것, 터치·포인터 입력을 지원할 것.
