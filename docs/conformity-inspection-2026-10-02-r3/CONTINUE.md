# 3차 진행 기록과 재개 안내

작성일: 2026-10-02. 요청은 2차 검증의 연속이며 **검증과 docs/ 기록만** 한다. 코드·데이터·테스트·설정은 바꾸지 않는다. 이 문서의 제안은 구현 권한을 뜻하지 않는다.

## 2차 남은 항목의 상태

| 2차 CONTINUE | 항목 | 3차 상태 |
| --- | --- | --- |
| 1 | 목표 사용자 1·2순위 결정 | **미실행.** 개발자 결정 필요 |
| 2 | 원문 오기 처리 방침 | **미실행.** 개발자 결정 필요. 외부 연락 안 함 |
| 3 | B 33건 개별 확인 | **완료.** 13행은 NUBASE 마감 후 새 측정, 17행은 같은 자료의 다른 평가, 2행 경계, 1행 계산값. [03](03-newer-evaluations.md) |
| 4 | C 4건 원 논문 | **부분 완료.** 이력·근거 논문(DOI)·가설 정리. 원 논문 본문은 읽지 않음. [03](03-newer-evaluations.md) |
| 5 | ¹³⁸Cs형 오기 찾기 | **완료(바닥상태 전체).** 새 원문 오기 없음. [02](02-same-source-screen.md) |
| 6 | 이성질체 2,099개 외부 비교 | **완료.** [04](04-isomers.md) |
| 7 | 수정 작업 | **미실행.** 별도 요청 필요 |

추가로 독립 파서로 전 상태를 재대조했다([01](01-full-reparse.md)). 1차 기록 하나(딸 상태 feeding을 저장하지 않는다는 서술)를 정정했다.

## 남은 일 — 우선순위

1. **목표 사용자 1·2순위 결정 (개발자).** 그 뒤 1차 3단계의 실사용자 시험(4~5명, 5과제). 외부 연락은 별도 명시 요청이 있어야 한다.
2. **데이터 갱신 정책 결정 (개발자).** NUBASE2020 유지 + 표시 / ENSDF 최신값 덮어쓰기 / 차기 NUBASE 대기 중 하나. 대상 목록은 2차 03(원문 오기 12건), 3차 03(B1 12개 핵종), 3차 04(이성질체 차이 목록).
3. **이성질체 차이의 개별 원 자료 확인.** 3차 04에서 “NUBASE 자체 근거 없음”으로 남은 항목을 ENSDF 채택 문서로 확인한다(¹³⁸Cs형 오기 후보).
4. **C 4건 원 논문 본문 확인.** ⁹³Rh(2004De40), ¹⁸⁸Pb, ¹⁵²Cs(1987Ra12), ¹⁶¹Hf.
5. **수정 작업은 별도 요청이 있을 때만:** 정정 목록·빌드 검사, ⁸⁴Sr 표기, 존재비 구간 표시, feeding 주석 풀어 쓰기·이성질체 링크, E2E 글꼴 테스트 전제, 비교 도구 개선(연산자 손실, 평가 시점, NuDat 재확인).

## 다음 세션에서 반복하지 않아도 되는 작업

- 전 상태 재대조 결과: [full-reparse.json](evidence/full-reparse.json).
- 이성질체 비교 원본: LiveChart `levels` 1,431개는 [livechart-levels.zip](evidence/livechart-levels.zip)에 있다. 값이 바뀌었는지 볼 때만 다시 받는다(약 50분 소요).
- NuDat ENSDF 채택 문서 41개: [nndc/](evidence/nndc/).

## 재개 시 환경

- 미리보기 서버: `npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort` (`dist/` 사용).
- Playwright: `$env:PLAYWRIGHT_BROWSERS_PATH='D:\000_rd_workspace\998_nuclide\.playwright'`.
- Python: `C:\Users\caret_01\AppData\Local\Programs\Python\Python314\python.exe -B`, `PYTHONUTF8=1`. Windows Python에는 `C:/...` 경로를 넘긴다.
- NUBASE2020 Table I 텍스트가 필요한 스크립트(R3-2, R3-5)는 PDF를 받아 `pdftotext -raw`로 만든다(PDF SHA-256은 2차 METHODS).
- 새 증거는 다시 별도 폴더에 둔다(예: `docs/conformity-inspection-2026-10-02-r4/` 또는 다음 날짜 폴더).

## 다음 세션 시작 문구

> docs/conformity-inspection-2026-10-02-r3/README.md와 CONTINUE.md를 읽고 남은 검증을 이어가 주세요. 코드·데이터·테스트·설정은 수정하지 말고 docs/에만 결과를 기록하세요. 기존 107개 파일 무변경 확인과 새 증거 폴더 구분을 유지하세요.
