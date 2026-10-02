# QA-01 — 지연 글꼴 E2E 실패의 원인

검증일: 2026-10-02 (Asia/Seoul). 기준 커밋 `7280849527dbc5819b1eb8700f7f1738137ec78d`. 제품·테스트 코드는 바꾸지 않았다. 진단은 저장소 밖에서 실행한 Playwright 관찰 스크립트로만 했다.

## 결론

**제품 결함이 아니라 테스트 전제가 이 PC 환경에서 성립하지 않아 생긴 실패다.** [확인됨: 아래 반사실 실험·CI 결과]

- `e2e/rulers.spec.ts:128`은 웹 글꼴(woff2)을 막아 두면 캔버스가 **폭이 다른 대체 글꼴**로 눈금을 재고, 글꼴이 풀리면 `--ruler-w`가 **반드시 바뀐다**고 가정한다.
- 이 PC에는 Pretendard가 사용자 글꼴로 설치되어 있다(`%LOCALAPPDATA%\Microsoft\Windows\Fonts\Pretendard-*.otf` 9개, 2026-08-24 설치). 앱 글꼴 목록 `"Pretendard Variable", Pretendard, …`의 두 번째 항목이 이 로컬 글꼴을 가리킨다(`src/theme/tokens.ts:69`).
- 그래서 웹 글꼴이 막혀 있는 동안에도 캔버스는 로컬 Pretendard로 재고, 웹 글꼴이 도착한 뒤에도 같은 글리프 폭이 나온다. 앱은 재측정을 실행하지만 결과 폭이 같아 `not.toBe(before)`가 5초 안에 충족되지 않는다.
- 같은 커밋의 GitHub Actions(ubuntu-latest, 로컬 Pretendard 없음) 전체 E2E는 성공했다.

1차 보고서의 QA-01(중간, 원인 미확정)은 **낮음 — 테스트 환경 의존, 제품 결함 아님**으로 다시 판정한다.

## 근거

### 1. 글꼴 측정값 (프로브 1)

[qa01-probe.json](evidence/qa01/qa01-probe.json), 스크립트 [qa01_probe.cjs.txt](evidence/qa01/qa01_probe.cjs.txt). 테스트와 같은 조건(woff2 지연, 390×844, `?nuclide=Og-294`)에서 웹 글꼴을 풀기 전과 후에 12px·700 굵기로 `"100"` 폭을 쟀다.

| 측정 글꼴 목록 (Chromium) | 해제 전 | 해제 후 |
| --- | --- | --- |
| 앱 목록 그대로 | 21.469 px | 21.469 px |
| 대체 글꼴만 (`-apple-system, …, "Segoe UI", …`) | 20.707 px | 20.707 px |
| `"Pretendard Variable"`만 | 20.865 px (브라우저 기본 글꼴) | 21.469 px |

해제 전 앱 목록의 폭(21.469)이 이미 웹 글꼴 적용 후 값과 같다. 대체 글꼴(Segoe UI)의 폭과는 다르다. 즉 웹 글꼴 대기 중에도 Pretendard 계열 글리프가 쓰였다. Firefox·WebKit·두 모바일 프로젝트도 같은 양상이다. WebKit은 막힌 14개 글꼴을 해제 전에 `error`로 표시했다가 해제 후 `loaded`로 바꿨다.

### 2. 재측정은 실행된다

같은 프로브에서 `CSSStyleDeclaration.setProperty('--ruler-w', …)` 호출을 기록했다. 웹 글꼴 해제 뒤 Chromium·Firefox·모바일 Chromium은 2회, WebKit·모바일 WebKit은 1회 다시 설정했다. 값은 매번 직전과 같았다. `ChartEngine.ts:167-174`의 `fonts.ready`·`loadingdone` 처리 경로가 동작한다는 뜻이다. [확인됨]

### 3. 반사실 실험 (프로브 2)

[qa01-probe2.json](evidence/qa01/qa01-probe2.json), 스크립트 [qa01_probe2.cjs.txt](evidence/qa01/qa01_probe2.cjs.txt). 프로브 브라우저가 받는 JS·CSS 응답에서 글꼴 목록의 로컬 `Pretendard` 항목만 존재하지 않는 이름으로 바꿔 **로컬 Pretendard가 없는 PC**를 흉내 냈다. 웹 글꼴 `Pretendard Variable`과 저장소 파일은 그대로다. 판정은 테스트와 같은 두 조건(폭 변화, `.map-meta` x > `--ruler-w`)으로 했다.

| 프로젝트 | 그대로: 해제 전 → 후 | 테스트 통과 | 로컬 글꼴 차단: 해제 전 → 후 | 테스트 통과 |
| --- | --- | --- | --- | --- |
| chromium | 64 → 64 px | 아니오 | 61 → 64 px | 예 |
| firefox | 62 → 62 px | 아니오 | 61 → 62 px | 예 |
| webkit | 64 → 64 px | 아니오 | 61 → 64 px | 예 |
| mobile-chromium | 64 → 64 px | 아니오 | 61 → 64 px | 예 |
| mobile-webkit | 64 → 64 px | 아니오 | 61 → 64 px | 예 |

‘그대로’ 열은 1차 E2E의 실패(Firefox 62px, 나머지 64px 유지)를 그대로 재현한다. 로컬 글꼴만 빼면 다섯 프로젝트 모두 두 조건을 만족한다.

### 4. CI

[ci-runs.json](evidence/qa01/ci-runs.json), [ci-run-36838331250-jobs.json](evidence/qa01/ci-run-36838331250-jobs.json) (GitHub 공개 API, 2026-10-02 조회).

- 실행 36838331250, 커밋 `7280849`, ubuntu-latest, 결론 `success`.
- `Run npm run test:e2e` 단계 성공 (2026-10-01T08:48:16Z ~ 08:54:14Z). `.github/workflows/ci.yml`은 Chromium·Firefox·WebKit을 모두 설치해 기본 E2E 전체를 돌린다.
- 한계: CI는 `retries: 2`다(`playwright.config.ts:14`). 단계 로그는 인증이 필요해 읽지 않았으므로 재시도 끝에 통과했을 가능성은 배제하지 못했다. [확인 불가: 로그]

## 남은 관찰

- 같은 글꼴에서 Chromium·WebKit은 64px, Firefox는 62px이다. 프로브의 폭 재계산식(`rulers.ts:27-66`과 같은 식)은 Firefox 값만 재현했고 Chromium·WebKit의 2px 차이는 원인을 찾지 않았다. 이번 결론은 앱이 실제로 설정한 값만 비교하므로 이 차이와 무관하다.
- 실제 사용자 화면에서 눈금과 지도 칸이 겹친다는 증거는 없다. 1차와 같이 확대 해석하지 않는다.

## 개선 제안 (적용하지 않음)

1. 테스트가 환경에 의존하지 않게 한다. 예: “폭이 바뀐다” 대신 “글꼴 적용 후 `--ruler-w`가 적용된 글꼴로 잰 기대 폭과 같다”를 확인하거나, 재측정 호출 자체를 확인한다.
2. 그 전까지는 E2E 안내에 “로컬에 Pretendard가 설치된 PC에서는 이 테스트가 실패한다”는 전제를 적는다.
3. 글꼴 목록에 로컬 `Pretendard`를 두는 것은 설치된 PC에서 화면을 일관되게 하는 합리적 선택이다. 바꿀 필요는 없다.
