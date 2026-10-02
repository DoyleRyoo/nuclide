# 핵종 지도 적합성 검증 3차 — 2026-10-02 (진행 중)

> **진행 중인 기록이다.** R3-1~R3-4는 끝났고, R3-5(이성질체 2,099개 외부 비교)는 LiveChart `levels` 자료를 받는 중이다. `04-isomers.md`, `evidence/isomer-compare.json`, `evidence/livechart-levels.zip`, 종료 무변경 확인은 R3-5가 끝난 뒤 추가한다. `evidence/livechart-levels-manifest.tsv`는 받는 도중의 상태다.

[2차 검증](../conformity-inspection-2026-10-02-r2/README.md)이 남긴 일 중 개발자 결정이 필요 없는 항목을 이어서 했다. **제품 코드·데이터·테스트·설정은 바꾸지 않았다.** 기준 커밋 `7280849527dbc5819b1eb8700f7f1738137ec78d`.

## 지금까지의 결과

| 문서 | 결과 |
| --- | --- |
| [R3-1 전 상태 재대조](01-full-reparse.md) | 독립 파서로 5,657개 상태 전체를 원문과 대조. ⁸⁴Sr 표기 1건 외 모든 필드 일치. 1차의 “딸 상태 feeding 저장 안 함” 서술을 정정(원문 주석 11건은 보존·표시됨) |
| [R3-2 같은 출처 선별](02-same-source-screen.md) | 바닥상태 반감기 1,417개·분기 497개에서 새 원문 오기 없음. ⁷⁶Sr ×100 차이는 2024 ENSDF가 앱 값과 같아 참조 쪽 구판 문제 |
| [R3-3·4 최신 평가·미확정](03-newer-evaluations.md) | B 33행 중 13행(12개 핵종)은 NUBASE2020 마감 후 새 측정 반영(예: ²⁴⁹No 앱 57 μs 대 ENSDF 38.1 ms). C 4건은 이력·근거 논문 정리 |
| R3-5 이성질체 | 진행 중. 부분 결과에서 ENSDF 쪽 단위 오류 1건 확인: ⁶⁴Mnᵐ ENSDF 2021 채택값 `440 ms`는 자체 주석의 두 측정(400 μs, 0.50 ms) 평균 439 μs와 맞지 않는다. 앱의 439 μs가 맞다 |

방법과 증거는 [METHODS.md](METHODS.md), 남은 일은 [CONTINUE.md](CONTINUE.md)에 있다.
