# 2차 검증 방법·재현·증거 안내

## 범위와 원칙

1차 [CONTINUE.md](../conformity-inspection-2026-10-02/CONTINUE.md)의 남은 심층 검증 1·2·3·5번을 이어서 했다. 4번(목표 사용자 순위·실사용자 시험)은 개발자 결정과 외부 연락이 필요해 하지 않았다.

- **제품 코드·데이터·테스트·설정·기존 추적 문서는 바꾸지 않았다.** 새 기록은 이 폴더에만 있다. 1차 폴더는 [README.md](../conformity-inspection-2026-10-02/README.md)와 [CONTINUE.md](../conformity-inspection-2026-10-02/CONTINUE.md)에 2차 결과로 가는 안내만 덧붙였고 1차 보고서 01~03과 증거는 그대로다.
- 진단·비교 스크립트는 저장소 밖(세션 임시 폴더)에서 실행한 뒤 재현용으로 이 폴더 `evidence/`에 복사했다. 스크립트는 저장소 파일을 읽기만 한다. Node 스크립트는 `.cjs.txt`로 보존했다. CI의 `eslint .`가 `docs/` 아래 `.cjs`도 검사해 `require()`를 오류로 막기 때문이며, 내용은 실행한 파일과 바이트 단위로 같다. 실행하려면 `.cjs`로 복사해서 쓴다. Python은 `-B`(바이트코드 미생성)로 실행해 `tools/` 아래에 `__pycache__`가 생기지 않게 했다.
- 외부 자료는 공개 웹·API에서 읽기 요청만 했다. LARAWEB 검색 양식에 POST 한 번을 보냈다. 외부 계정·사람에게 연락하거나 게시하지 않았다.
- 근거 라벨은 1차와 같다: [확인됨] 직접 확인, [추정] 간접 근거, [확인 불가] 자료 없음.

환경: Windows 11, Node v24.18.0, Python 3.14.6, @playwright/test 1.63.0(브라우저는 1차에 설치한 `.playwright/`), pdftotext 4.06(xpdf). 기준 커밋 `7280849527dbc5819b1eb8700f7f1738137ec78d`.

## 1. 무변경 확인

1차 [baseline-hashes.json](../conformity-inspection-2026-10-02/evidence/baseline-hashes.json)의 추적 파일 107개를 시작·중간·종료에 다시 해시했다. 종료 결과는 [integrity-results.json](evidence/integrity-results.json)이다. `git status`에는 두 검증 폴더(미추적)만 나온다.

## 2. QA-01 진단

```powershell
npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort   # 1차에 만든 dist/ 그대로
$env:PLAYWRIGHT_BROWSERS_PATH='D:\000_rd_workspace\998_nuclide\.playwright'
Copy-Item evidence/qa01/qa01_probe.cjs.txt  $env:TEMP/qa01_probe.cjs
Copy-Item evidence/qa01/qa01_probe2.cjs.txt $env:TEMP/qa01_probe2.cjs
node $env:TEMP/qa01_probe.cjs  <출력.json>   # 글꼴 상태·측정값·--ruler-w 설정 기록
node $env:TEMP/qa01_probe2.cjs <출력.json>   # 그대로 / 로컬 Pretendard 차단 반사실 비교
```

- 두 프로브는 `addInitScript`로 `fillText`·`setProperty('--ruler-w')`·`loadingdone`을 관찰만 한다. 테스트와 같이 `**/*.woff2` 응답을 붙잡아 두었다가 푼다.
- 반사실 실험은 프로브 브라우저가 받는 `/assets/*.js|css` 응답에서 글꼴 목록의 `Pretendard,` 항목만 `__NoLocalPretendard__,`로 바꾼다. 디스크의 `dist/`는 바꾸지 않는다.
- 로컬 글꼴 설치 여부는 `%LOCALAPPDATA%\Microsoft\Windows\Fonts`와 HKCU 글꼴 레지스트리로 확인했다.
- CI 결과는 GitHub 공개 API(`/repos/DoyleRyoo/nuclide/actions/runs`, `/actions/runs/36838331250/jobs`)에서 인증 없이 받았다. 단계 로그는 인증이 필요해 받지 않았다.

## 3. 318건 분류

```bash
curl -o NUBASE2020.pdf https://www-nds.iaea.org/amdc/ame2020/NUBASE2020.pdf
pdftotext -raw NUBASE2020.pdf nubase2020-raw.txt        # Table I 행·주석용
python -B evidence/flags/classify_flags.py nubase2020-raw.txt top318-classified.csv top318-summary.json
python -B evidence/flags/audit.py top318-classified.csv  # 분류별 표본 감사
```

| 입력 | 내용 |
| --- | --- |
| 플래그 | 1차 `evidence/livechart-diff/diff_details.csv`의 치명·높음 318행 |
| 앱 값 | 1차 `evidence/nuclides-export.json` |
| NUBASE2020 원문 | `data/raw/nubase_4.mas20.txt`. 앱 파서와 독립된 고정 열 파서로 읽음 |
| NUBASE2020 논문 | SHA-256 `e60a8dc17c96e443c394d8cbc5906e8be689c435300eed1fd215cdc9647148d2`. `-raw` 텍스트로 Table I 행(참조 키·갱신 코드)과 주석을 읽음. `-layout` 텍스트는 위첨자 때문에 행이 섞여 쓰지 않음 |
| LiveChart | 1차와 같은 `tools/livechart-diff/livechart_ground_states.csv`(2026-10-01)와 `livechart_live/` 단건 캐시. 1차 diff 메모에 “단건 API”가 있으면 캐시를 씀 |
| 묶음 정의 | `tools/livechart-diff/livechart_diff.py`의 `canon_mode`·`mode_family`를 읽기 전용으로 import |

판정 순서와 규칙은 [02 문서](02-flag-classification.md)에 있다. 수동 확인 14건(L·P·R·N·C)과 ¹³⁸Cs는 NNDC NuDat의 ENSDF 채택 문서 15개를 받아 읽었다(`getdatasetClassic.jsp?nucleus=…&unc=NDS`, 1초 간격). [manifest](evidence/flags/nndc/manifest.tsv)

`-raw`에서 그리스 문자가 빠지므로 Table I의 붕괴 기호는 `+`/`-`만 남는다. 원문 오기 판단에 쓴 행은 ASCII 원문과 함께 대조했다.

## 4. 원문 선별 검사

```bash
python -B evidence/flags/nubase_consistency.py nubase2020-consistency.json   # 분기 합·Q값 부호·β+ 합계 ≥ EC
python -B evidence/flags/nubase_format_scan.py nubase2020-format-scan.json   # 불확도 자릿수·선행 0
python -B evidence/flags/source_errata_excerpt.py <임시폴더> source-errata-evidence.json
```

- Q값은 1차 앱 내보내기의 `ame.qBetaMinus/qEC/qAlpha`다. 앱은 QEC를 이웃 핵의 Qβ⁻에서 유도한다(1차 확인). 3σ 밖일 때만 모순으로 본다.
- NUBASE2016 원문: `https://www-nds.iaea.org/amdc/ame2016/nubase2016.txt`, SHA-256 `f3d08e4af75892ec4626805ca3465b7925144d53e0bfee713f664c2abd4dd7c4`(2026-10-02 11:37 KST). 행 발췌만 [source-errata-evidence.json](evidence/flags/source-errata-evidence.json)에 남겼다.
- IAEA AMDC 미러의 `nubase_4.mas20.txt`를 2026-10-02 11:30 KST에 다시 받아 저장소 원본과 SHA-256이 같음을 확인했다. AMDC 색인 페이지는 [사본](evidence/sources/amdc_index_2026-10-02.html)으로 남겼다.

## 5. 앱 화면 확인

```powershell
Copy-Item evidence/flags/ui_capture.cjs.txt $env:TEMP/ui_capture.cjs
Copy-Item evidence/flags/sr84_cell.cjs.txt  $env:TEMP/sr84_cell.cjs
node $env:TEMP/ui_capture.cjs evidence/flags/ui              # 원문 오기 핵종 9개 패널
node $env:TEMP/ui_capture.cjs evidence/flags/ui Sr-84        # ⁸⁴Sr 패널
node $env:TEMP/ui_capture.cjs evidence/flags/ui Rh-115,Ta-187,Ge-86,In-121m2,Si-30  # 불확도 자릿수 항목
node $env:TEMP/sr84_cell.cjs D:/000_rd_workspace/998_nuclide/docs/conformity-inspection-2026-10-02-r2/evidence/flags/ui/cell-Sr-84.png # 지도 칸 라벨
```

1280×900, ko-KR, 밝은 테마, Chromium. 패널 `innerText`와 PNG를 저장했다.

## 6. 골든·존재비

- ENSDF 채택 문서(²⁴²Am, ²⁹⁴Og, ¹⁸⁰Ta)와 CIAAW Ta 페이지: [manifest](evidence/golden/manifest.tsv).
- CIAAW 원소 페이지 84개: [manifest](evidence/golden/ciaaw/manifest.tsv), 1초 간격.
- `python -B evidence/golden/ciaaw_compare.py evidence/golden/ciaaw ciaaw-vs-app.json`. 구간 원소는 앱 값을 `(a+b)/2`, `(b−a)/√12`와 비교하고, 값(불확도) 원소는 2σ와 불확도 크기 비를 본다. CIAAW 일부 행의 빠진 `</td>`를 허용한다.

## 7. 기존 도구 과제

LARAWEB·KAERI에 보낸 요청과 응답 해시는 [tools/manifest.tsv](evidence/tools/manifest.tsv)에 있다. 사람의 조작 시간을 잰 것이 아니다.

## 증거 목록

| 폴더 | 내용 |
| --- | --- |
| [evidence/qa01/](evidence/qa01/) | 프로브 2개와 결과, CI 실행·작업 응답 |
| [evidence/flags/](evidence/flags/) | 318건 분류 CSV·요약, 표본 감사, 원문 선별 결과, 원문 오기 발췌, 스크립트 |
| [evidence/flags/nndc/](evidence/flags/nndc/) | 수동 확인 15개 핵종의 ENSDF 채택 문서 |
| [evidence/flags/ui/](evidence/flags/ui/) | 앱 패널 텍스트·PNG, ⁸⁴Sr 지도 칸 |
| [evidence/golden/](evidence/golden/) | ENSDF 문서 3개, CIAAW 84개 원소, 비교 결과 |
| [evidence/tools/](evidence/tools/) | LARAWEB·KAERI 응답 |
| [evidence/sources/](evidence/sources/) | AMDC 색인 사본 |
