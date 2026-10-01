# LiveChart 비교 도구 — 무시된 파일 다시 만들기

`tools/livechart-diff/`의 아래 파일은 `.gitignore`에 들어 있어 저장소에 없다. 모두 내려받거나 스크립트로 다시 만들 수 있다. 저장소를 새로 받았으면 이 문서 순서대로 만든다.

| 파일                                    | 내용                                             | 만드는 방법                |
| --------------------------------------- | ------------------------------------------------ | -------------------------- |
| `livechart_ground_states.csv`           | IAEA LiveChart 바닥상태 전체 (참조 데이터)       | 2단계                      |
| `livechart_ground_states.csv.meta.json` | 위 CSV의 URL과 받은 시각                         | 2단계 (CSV와 같이 생김)    |
| `nuclides_export.json`                  | 앱 데이터를 비교용으로 내보낸 것                 | 1단계                      |
| `livechart_live/`                       | 단건 API로 받은 최신값 CSV 캐시                  | 3단계 (`--recheck`), 4단계 |
| `diff_out/`                             | 비교 결과 (`diff_report.md`, `diff_details.csv`) | 3단계                      |

## 준비

- Node.js 24 이상, 저장소 루트에서 `npm ci` (1단계가 `tsx`와 앱 소스를 쓴다)
- Python 3.8 이상 (표준 라이브러리만 사용, 추가 설치 없음)
- 인터넷: 2·3·4단계만 필요 (`nds.iaea.org`)
- 모든 명령은 **저장소 루트**에서 실행한다
- Windows에서 한글 출력이 깨지면 먼저 설정한다
  - Git Bash: `export PYTHONUTF8=1`
  - PowerShell: `$env:PYTHONUTF8 = "1"`

## 1. 앱 데이터 내보내기 → `nuclides_export.json`

```
npx tsx tools/livechart-diff/export_nuclides.ts
```

- 앱과 같은 경로로 읽는다: `src/data/generated/nuclides.json` → `hydrate()`, `ame.json` → `applyAmeDetails()`
- 정상 출력: `레코드 5657개 (바닥상태 3558 + 이성질체 2099)` (NUBASE2020 기준)
- `src/data/generated/*.json`이 바뀌면(`npm run data:build` 뒤) 다시 실행한다

## 2. 참조 데이터 받기 → `livechart_ground_states.csv`

```
python tools/livechart-diff/livechart_diff.py --download-only
```

- 받는 곳: `https://nds.iaea.org/relnsd/v1/data?fields=ground_states&nuclides=all` (CSV 약 900 KB)
- 이 단계를 건너뛰어도 3단계에서 파일이 없으면 자동으로 받는다
- 다시 받기: 3단계 명령에 `--refresh`를 붙인다 (`livechart_live/`도 함께 다시 받는다)
- 정상이면 3,386행이고 마지막 열 `Extraction_date`가 모두 같다

**받기가 막힐 때** (사내망·방화벽·인증서 오류)

1. 브라우저로 위 주소를 열어 CSV로 저장한다
2. 3단계 명령에 `--ref 저장한경로.csv`를 붙인다. 이때 `.meta.json`이 없으므로 보고서의 '받은 시각'은 파일 수정 시각으로 적힌다

HTTP 403이 나면 User-Agent 헤더가 필요하다 (스크립트는 이미 붙여 보낸다). 서버 응답이 느릴 때가 있다 (스크립트 제한 시간 300초).

## 3. 비교 실행 → `diff_out/`, `livechart_live/`

```
python tools/livechart-diff/livechart_diff.py --inspect tools/livechart-diff/nuclides_export.json
python tools/livechart-diff/livechart_diff.py tools/livechart-diff/nuclides_export.json --recheck
```

- `--inspect`: 필드 매핑만 확인한다 (인터넷 불필요). `Z·N 판별: 바닥상태 3558 · 이성질체 2099 · 판별 불가 0`이면 정상
- `--recheck`: 치명·높음이 나온 핵종(약 300개)을 LiveChart 단건 API로 다시 받아 최신값으로 비교한다
  - 받은 CSV는 `livechart_live/{질량수}{원소}.csv`(예: `137cs.csv`)로 남고, 다음 실행부터 다시 쓴다
  - 처음에는 요청 사이 0.5초 간격으로 받으므로 약 5분 걸린다
- 결과: `diff_out/diff_report.md`(요약 + 치명·높음 상위 → 검증 프롬프트 B-3에 붙여넣기), `diff_out/diff_details.csv`(전체)

**`--recheck`가 필요한 이유**: 일괄(`nuclides=all`) CSV는 서버에 고정된 스냅샷이다 (2026-10-01 확인 시 `Extraction_date` 2023-10-18, 다시 받아도 같은 파일). 단건 조회(`nuclides=137cs`)는 최신값을 준다. 2026-10-01 실행에서는 치명·높음 핵종 298개 중 60개가 스냅샷과 값이 달랐다 (예: ⁷⁶Ge 스냅샷 STABLE ↔ 최신 1.926E21 y). `--recheck`를 빼면 모든 핵종을 스냅샷 기준으로 비교한다.

## 4. (선택) 골든 세트 표 → `golden_set.md`

```
python tools/livechart-diff/golden_set.py
```

- 골든 테스트 핵종 22개의 '내 데이터 / 화면 표시 / LiveChart 참조값' 표를 `golden_set.md`에 쓴다
- 바닥상태는 `fields=ground_states`, 이성질체는 `fields=levels`로 받아 `livechart_live/`에 둔다 (예: `180ta_levels.csv`)
- 다시 받기: `--refresh`
- `golden_set.md`는 `.gitignore` 대상이 아니다 (커밋 여부는 선택). `.prettierignore`에 들어 있어 `format:check`에 걸리지 않는다

## 한 번에 다시 만들기

```
npx tsx tools/livechart-diff/export_nuclides.ts
python tools/livechart-diff/livechart_diff.py tools/livechart-diff/nuclides_export.json --recheck
python tools/livechart-diff/golden_set.py
```

참조를 새로 받으려면 두 번째 명령에 `--refresh`를 붙인다. 지우고 처음부터 만들 때는 `livechart_ground_states.csv*`, `livechart_live/`, `diff_out/`, `nuclides_export.json`을 지운 뒤 위 명령을 실행한다.
