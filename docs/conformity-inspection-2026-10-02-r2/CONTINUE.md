# 2차 진행 기록과 재개 안내

작성일: 2026-10-02. 요청은 1차 검증의 연속이며 **검증과 문서화만** 한다. 코드·데이터·테스트·설정은 바꾸지 않는다. 이 문서의 제안은 구현 권한을 뜻하지 않는다.

## 1차 남은 항목의 상태

| 1차 CONTINUE 번호 | 항목 | 2차 상태 |
| --- | --- | --- |
| 1 | QA-01 원인 구분 | **완료.** 로컬 Pretendard 때문에 테스트 전제가 깨짐. [01](01-qa01-font-test.md) |
| 2 | 318개 상위 플래그 분류 | **완료.** 원인 미확정 4건만 남음. [02](02-flag-classification.md) |
| 3 | 남은 골든 해석 (²⁴²ᵐAm, ²⁹⁴Og, ¹⁸⁰ᵐTa) | **완료.** [04](04-golden-abundance.md). 이성질체 2,099개 외부 전수 비교는 남음 |
| 4 | 목표 순위·실사용자 검증 | **미실행.** 개발자 결정과 외부 연락이 필요 |
| 5 | 도구 비교 보강 | **부분 완료.** LARAWEB F·KAERI G 데이터 도달 확인. 사람 시간 비교는 4번과 함께 남음. [05](05-tool-tasks.md) |

추가로 원문 선별 검사와 존재비 289개 CIAAW 전수 비교를 했고, 원문 오기 12건과 앱 표시 결함 1건을 찾았다. [03](03-source-data-errors.md)

## 3차 진행 결과 (2026-10-02)

아래 3·4·5·6번은 3차에서 진행했고(4번은 부분), 1·2·7번은 개발자 결정·별도 요청이 필요해 남았다. 결과와 새 우선순위는 [3차 CONTINUE](../conformity-inspection-2026-10-02-r3/CONTINUE.md)를 따른다. 이 절 아래는 2차 당시의 기록이다.

## 남은 일 — 우선순위

1. **목표 사용자 1·2순위 결정 (개발자).** 정해지면 1차 3단계의 4명(선택 5명)·5과제 시험을 한다. 실제 사람에게 연락하는 일은 별도 명시 요청 없이 하지 않는다.
2. **원문 오기 처리 방침 결정 (개발자).** 정정 목록을 둘지, AMDC에 알릴지 정한다. 외부 연락은 하지 않았다.
3. **B 33건 개별 확인.** 특히 ²⁴⁹No(57 μs 대 38.1 ms), ²⁷⁷Mt(9 s 대 4 ms), ²⁵²Lr(α 98 대 40 %), ¹⁹¹Pb(α 0.51 대 0.013 %). ENSDF 채택 문서에서 새 측정 문헌을 확인한다. 차기 평가본 반영 때의 근거가 된다.
4. **C 4건 원 논문 확인.** ⁹³Rh, ¹⁸⁸Pb, ¹⁵²Cs, ¹⁶¹Hf. [02 표](02-flag-classification.md)의 남은 질문을 본다.
5. **A2 51건에서 ¹³⁸Cs형 오기 찾기.** NUBASE 자체 참조가 없고 ENSDF 연도가 같은데 값이 다른 행을 우선 ENSDF 채택 문서와 대조한다. 선별 규칙으로는 잡히지 않는 유형이다.
6. **이성질체 2,099개 외부 비교.** LiveChart `levels` API를 쓸 때 분기비 연산자가 빠진다는 점(02 시사점 1)을 감안한다.
7. **수정 작업은 별도 요청이 있을 때만:** 정정 목록·빌드 검사 설계, ⁸⁴Sr 숫자 정규화, 존재비 구간 표시, E2E 지연 글꼴 테스트 전제 수정, 비교 도구의 연산자·평가 시점 처리.

## 다음 세션에서 반복하지 않아도 되는 작업

- 318건 분류 결과: [top318-classified.csv](evidence/flags/top318-classified.csv). 다시 돌릴 때는 [METHODS §3](METHODS.md)의 명령을 쓴다. NUBASE2020 PDF는 다시 받아 `pdftotext -raw`로 만든다(PDF SHA-256은 METHODS에 있음).
- CIAAW 84개 원소 페이지와 ENSDF 채택 문서 18개는 `evidence/`에 있다. 값이 바뀌었는지 볼 때만 다시 받는다.
- 원문 오기·표시 결함 13건의 앱 화면(핵종 패널 15개, ⁸⁴Sr 지도 칸)은 `evidence/flags/ui/`에 있다.

## 재개 시 환경

- 미리보기 서버: `npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort` (1차에 만든 `dist/` 사용, `data:build` 호출 없음). 백그라운드 실행 시간 제한에 걸리면 다시 띄운다.
- Playwright: `$env:PLAYWRIGHT_BROWSERS_PATH='D:\000_rd_workspace\998_nuclide\.playwright'`.
- Python: `C:\Users\caret_01\AppData\Local\Programs\Python\Python314\python.exe -B`. `tools/livechart-diff/livechart_diff.py`를 import하는 스크립트는 반드시 `-B`로 돌려 `__pycache__`를 만들지 않는다. Windows Python에는 `/c/...` 경로 대신 `C:/...` 경로를 넘긴다.
- 한글 인자를 `python -c`로 넘기면 콘솔 인코딩 때문에 깨진다. 스크립트 파일로 실행하고 `PYTHONUTF8=1`을 둔다.
- 이 PC에는 Pretendard가 사용자 글꼴로 설치되어 있다. `e2e/rulers.spec.ts:128`은 이 PC에서 항상 실패한다(01 문서).
- 새 증거는 다시 별도 폴더에 둔다. 같은 날 3차라면 `docs/conformity-inspection-2026-10-02-r3/`처럼 쓴다.

## 다음 세션 시작 문구

> docs/conformity-inspection-2026-10-02-r2/README.md와 CONTINUE.md를 읽고 남은 검증을 이어가 주세요. 코드·데이터·테스트·설정은 수정하지 말고 docs/에만 결과를 기록하세요. 기존 107개 파일 무변경 확인과 새 증거 폴더 구분을 유지하세요.
