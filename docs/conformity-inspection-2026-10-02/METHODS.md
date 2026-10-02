# 검증 방법·실행 기록·증거 안내

## 범위와 원칙

사용자 요청은 [conformity_inspection.md](../conformity_inspection.md)의 내용을 검증하고 docs/에 남기는 것이다. 첨부 문서의 역할·평가 기준은 작업 자료로 적용했으며, 문서 안의 개선 지시를 제품 수정 권한으로 해석하지 않았다. **코드·데이터·테스트·설정·기존 문서는 변경하지 않았다.** 새 보고서와 검증 증거는 이 폴더에 기록했다.

검증 기준은 커밋 `7280849527dbc5819b1eb8700f7f1738137ec78d`, 앱 0.1.0, Windows/PowerShell, Node v24.18.0, npm 11.16.0이다. 검증일은 2026-10-02(Asia/Seoul). 세 단계의 조사·판정 순서는 니즈/과학 → UI 시나리오 → 비교/최종 평가다.

사용한 증거 수준은 다음과 같다.

- **확인됨:** 로컬 코드/원본·직접 UI·저장된 응답·공식 웹 원문에서 확인한 사실.
- **추정:** 확인한 구조를 바탕으로 한 사용자 영향·비용·우선순위 가설.
- **확인 불가:** 목표 순위, 실제 사용자 효과, 접근하지 못한 도구, 개별 원문 평가 이력이 부족한 판단.

데이터 품질 점검에는 `data-analytics:analyze-data-quality`의 grain·키·결측 의미·버전·근거 분리 절차를 적용했다. UI는 `computer-use:computer-use`의 관찰 기반 조작 방식으로 확인했다. 외부 계정에 문서를 게시하거나 타인에게 메시지를 보내지 않았다.

## 1. 무변경 확인

시작 시 Git 상태는 깨끗했고 추적 파일 107개의 바이트 SHA-256을 [baseline-hashes.json](evidence/baseline-hashes.json)에 기록했다. 종료 시 같은 목록을 다시 해시하여 [integrity-results.json](evidence/integrity-results.json)과 비교한다. 이 목록에는 제품 코드, 원본·생성 데이터, 테스트·설정 및 기존 검증 문서가 포함된다.

검증 과정에서 기존 명령이 만든 `dist/`, `test-results/`, `playwright-report/` 등 무시되는 산출물이 존재한다. 브라우저 실행 파일은 승인된 설치로 `.playwright/`에 받았다. 이들은 제품 소스 수정이 아니다. 빌드는 `data:build`를 호출하지 않으며, 데이터는 `data:check`로만 검사했다. 새로 받은 IAEA 데이터는 docs/ 증거로만 보존했다.

## 2. 실행한 검사와 결과

| 검사 | 결과 | 증거·주의 |
| --- | --- | --- |
| `npm.cmd run data:check` | 통과 | [data-check.log](evidence/data-check.log), 원본 기반 생성 결과와 현재 자료 일치 |
| `npm.cmd test` | 8개 파일 / 71개 테스트 통과 | [unit-tests.log](evidence/unit-tests.log) |
| `npm.cmd run lint` | 통과 | [lint.log](evidence/lint.log) |
| `npm.cmd run build` | 통과 | [build.log](evidence/build.log), TypeScript noEmit + Vite/PWA |
| `npm.cmd run check:bundle` | 통과 | [bundle.log](evidence/bundle.log): gzip app 110.4/150 KiB, data 168.9/250 KiB, AME 254.6/300 KiB |
| `npm.cmd run test:e2e -- --workers=2` | **98 통과 / 12 건너뜀 / 5 실패**, 총 115 | [e2e-final.log](evidence/e2e-final.log), 약 5.7분. Chromium/Firefox/WebKit 및 두 mobile 프로젝트 |
| 전수 데이터 비교 | 원문 결과 재현 | 치명72/높음246/중간1,031/낮음795 **자동 플래그** |
| 골든 세트 직접 조회 | 22개 상태 검토 | [UI 값](evidence/ui-golden-panels.json), Cs 별도 txt, [구조화 비교](evidence/golden-comparison.json) |
| 신규 외부 참조 | API CSV 31개 | 조회 URL·KST 시각·SHA-256은 두 manifest |
| A~I 시나리오 | 부분/범위 밖/실패 구분 | [2단계](02-usability.md) |

E2E 통과가 과학 의미의 정확성을 보증하지 않는다. 기존 71개 단위 테스트가 SCI-01~05를 모두 검증하도록 작성된 것도 아니다. 성능 전용 `test:perf`는 실행하지 않았고 기본 E2E 설정도 `performance.spec.ts`를 제외한다. 이번 결과를 FPS·로딩 시간·모든 지원 환경 성능 인증으로 확대하지 않는다.

### 초기 실패와 최종 실행 구분

1. `e2e.log`: 브라우저 실행 파일 미설치로 실패했다. 제품 결함 수에 포함하지 않았다.
2. 공식 Playwright 브라우저를 설치한 기록은 `browser-install.log`다.
3. `e2e-installed.log`: 샌드박스 실행에서 Firefox 진행이 멈춰 중단했다. 완료된 테스트 묶음으로 세지 않는다.
4. 승인을 받은 외부 실행의 `e2e-final.log`가 최종 판정이다. 이를 이전 결과와 합산하지 않았다.

5개 실패는 모두 `e2e/rulers.spec.ts:128`의 글꼴 지연 시나리오다. 실패 시점·스크린샷·trace는 [e2e-failures/](evidence/e2e-failures/)에 복사했다. trace의 네트워크 기록을 읽어 각 프로젝트에서 woff2 14개가 HTTP 200임을 확인했다([요약](evidence/e2e-font-network.json)). 이 검사는 파일 전송 성공만 입증하며 글꼴 적용 시점이나 눈금 재계산의 성공을 직접 입증하지 않는다. 원인 미확정 상태를 [QA-01](02-usability.md)에 기록했다.

## 3. 전수 비교 재현

작업 폴더에서 실행한 핵심 명령은 다음과 같다. 같은 경로에 다시 실행하면 **이 검증의 증거를 덮어쓰므로**, 후속 검증은 날짜가 다른 docs/ 폴더로 출력 경로를 바꾼다.

```powershell
node --import tsx tools/livechart-diff/export_nuclides.ts docs/conformity-inspection-2026-10-02/evidence/nuclides-export.json
& 'C:\Users\caret_01\AppData\Local\Programs\Python\Python314\python.exe' -B tools/livechart-diff/livechart_diff.py docs/conformity-inspection-2026-10-02/evidence/nuclides-export.json --ref tools/livechart-diff/livechart_ground_states.csv --recheck --out docs/conformity-inspection-2026-10-02/evidence/livechart-diff
```

기존 스냅샷과 이번 실행을 구분하기 위해 입력과 출력을 아래에 기록한다.

| 역할 | 파일·사용 방식 |
| --- | --- |
| 앱 값 | 이번 실행에서 생성한 `evidence/nuclides-export.json`, 5,657개 상태 |
| 전체 참조 | `tools/livechart-diff/livechart_ground_states.csv`, 기존 2026-10-01 수신본 |
| 재확인 캐시 | `tools/livechart-diff/`에 기존 보존된 단건 자료 298개를 재사용. 이번 신규 조회 아님 |
| 출력 | `evidence/livechart-diff/diff_report.md`, `diff_details.csv` |

기저 상태 Z/N으로 3,357개를 매칭하고 들뜬 상태 2,099개는 기본 전수 비교에서 제외한다. 전수 도구의 판정 규칙은 반감기·질량·존재비의 참조 2σ 등이며, 새로운 골든 표는 기본 참조 불확도 범위와 한계값 양립 여부를 별도로 적었다. 양쪽 불확도·상관을 결합한 통계 검정은 아니다.

원본에 있는 상위 플래그 318건의 원인을 이번에 모두 확정하지 않았다. 102Zr/131Cd/140I의 ln2 비율 경보와 He5 폭 변환, 상태 배정, 모드 상위 3개 제한 등을 표본으로 해석했다. 세부 주의점은 1단계 §6에 있다.

## 4. 신규 참조와 골든 세트

IAEA endpoint는 `https://nds.iaea.org/relnsd/v1/data`다. 새 조회는 21개 `ground_states`, 5개 `levels`, 5개 `decay_rads` CSV로 이루어진다. 원래 문서의 모든 골든 핵종에, 단위 혼동 경보 3개와 Ba-137 준위·방출 참조를 더했다.

- [manifest.json](evidence/livechart-fresh/manifest.json): ground_states/levels 26개 요청의 URL, 조회 시각, 파일명, SHA-256.
- [radiation-manifest.json](evidence/livechart-fresh/radiation-manifest.json): Cs-137 β−/γ, K-40/F-18/Cu-64 β+/EC의 5개 요청.
- CSV의 `Extraction_date`, `ensdf_publication_cut-off` 등을 실제 파일 그대로 보존했다. 조회일과 평가 cutoff는 서로 다른 날짜다.
- `levels` 응답에는 동일한 `unc_hl` 이름이 두 번 등장한다. 열 순서를 보존하거나 뒤의 열을 별도 이름으로 바꾸어 원문 단위 불확도와 초 환산 불확도를 구분했다.
- 방출 에너지·세기, 준위 feeding, 붕괴 모드 합계는 서로 다른 물리량으로 비교했다.
- CIAAW Li/Pb 페이지는 원소별 시료 변동 설명을 확인하는 데 사용했다. 원자량 구간을 개별 동위원소 원자질량 오차로 대체하지 않았다.

새 API 응답은 과거 값의 정오를 자동 결정하는 기준이 아니다. 사용한 평가본과 수록 정책이 다를 수 있다. Am-242m SF 한계, Og-294 SF, Ta-180m 존재비처럼 응답만으로 판단할 수 없는 부분은 명시적으로 보류했다.

## 5. 데이터 프로파일 산정

`src/data/generated/nuclides.json`을 기존 `hydrate()`로 읽고 `ame.json`을 기존 `applyAmeDetails()`로 결합했다. 기저 상태와 `excited`를 상태 단위로 펼쳐 다음을 집계했다. 제품 모듈을 파일 수정 없이 일회성 Node/tsx로 가져와 계산했다. 결과는 [data-profile.json](evidence/data-profile.json)에 있다.

| 지표 | 산정 의미 |
| --- | --- |
| 상태·관측 수 | 원본 생성 메타데이터 및 상태 전개 수. 앱의 observed는 발견 연도 기반이라는 정의를 유지 |
| 중복 | 펼친 상태 ID의 중복. 기저 Z/N만으로 이성질체를 중복이라고 세지 않음 |
| 유효성 | A=Z+N, 번호·기호 대응, 음수 핵자 수 점검 |
| 반감기 품질 표시 | est, rel, unc의 부등호·비대칭 문자열·사용 단위 집계. 항목 간 중복 가능 |
| Jπ | 원문 문자열의 괄호·# 집계. 분류가 상호 배타적이라고 가정하지 않음 |
| 관측 세기 미상 | NUBASE 원본 붕괴 필드에서 `=?`(공백 허용)를 찾음. 155는 **상태 수가 아닌 붕괴 항목 수** |
| 존재비·AME 제공 | 값 존재 여부. 인공 핵종의 존재비 없음은 결측 결함으로 세지 않음 |

무결성·원본 재현 검사와 외부 평가본의 수치 비교는 독립적인 검사다. 전자가 통과했다고 후자가 모두 일치하는 것은 아니다.

## 6. 화면 관찰과 조작 수

기존 빌드를 `npm.cmd run preview -- --port 4173 --strictPort`로 열고 Chrome에서 실제 검색·선택·딸 링크·상태 펼침·링크 복사·도움말·확대를 조작했다. DOM 문자열과 PNG는 같은 로컬 앱에서 수집했다. 본문에 쓴 수치 표기는 화면 그대로이며, 줄바꿈·얇은 자릿수 구분 공백은 표 가독성을 위해 생략한 곳이 있다.

조작 수는 문자열 입력 전체 1회, Enter 1회, 클릭 1회로 정의했다. 여러 개별 조회를 묶은 합계와 연속 경로를 구별했다. 읽기·스크롤·포커스·테스트 도구 작업은 포함하지 않아 **인간의 총 작업 시간/전체 클릭 수가 아니다.**

`scenario-D-chain.json`은 15개 핵종 패널의 단계별 기록(step 2~16), `search-forms.json`은 입력 형식별 후보, `scenario-I-copied-url.txt`는 실제 복사된 내용이다. hover PNG는 기존 E2E의 390×844 viewport 캡처다. 실기기 촬영이나 전용 사슬 기능의 캡처라고 부르지 않았다.

## 7. 남은 검증과 재개

[CONTINUE.md](CONTINUE.md)에 완료 범위, 미확정 항목, 우선 재개 순서와 수정 금지 제약을 남겼다. 후속 세션에서도 현재 증거를 먼저 읽고 같은 수집을 불필요하게 반복하지 않는다.

외부 DB 웹페이지의 사용 절차·가격·기능은 변할 수 있다. 이번 비교는 2026-10-02 공식 자료에서 확인한 범위이며, 실제 도구 간 속도·정확성 비교 실험은 별도다. 법적 재배포 허용 여부는 판정하지 않았다.
