# 기존 도구에서 범위 밖 과제 실행

검증일: 2026-10-02. 1차 [3단계](../conformity-inspection-2026-10-02/03-verdict.md)에서 LARAWEB은 접속 실패로 확인 불가였고, 시나리오 F·G는 앱의 v1 범위 밖이라 “공식 DB로 연결”을 제안했다. 이번에는 그 공식 도구에서 과제가 실제로 끝나는지 확인했다.

**사람의 조작 시간이나 성공률을 잰 것이 아니다.** 에이전트가 HTTP 요청으로 같은 화면·양식을 따라가 데이터에 도달하는지만 확인했다. 시간 비교는 실사용자 시험(CONTINUE 4번)에 남긴다.

## 결론

| 시나리오 | 도구 | 결과 | 경로 |
| --- | --- | --- | --- |
| F. 1173·1332 keV 피크 역검색 | LNHB LARAWEB | **성공** — 한 번의 검색으로 ⁶⁰Co 도달 | Find nuclides 양식에 에너지 구간 2개를 AND로 입력 |
| G. ⁵⁹Co(n,γ)⁶⁰Co 단면적 | KAERI Table of Nuclides | **성공** — ENDF/B-VIII.0 열중성자 포획 단면적 37.17 b | Co-59 → 평가 라이브러리 → Capture → Get data |

1차 3단계 비교표의 LARAWEB “확인 불가”는 “F 과제 완료 확인”으로 바뀐다. 앱과 함께 쓰는 흐름(지도에서 핵종 위치 확인 → 목적별 공식 DB)은 두 과제에서 실제로 성립한다. [확인됨]

## F — LARAWEB 감마 에너지 역검색

- 접속: `http://www.lnhb.fr/Laraweb/index.php` HTTP 200 (2026-10-02 11:44 KST). 같은 경로의 HTTPS는 연결되지 않았다. 페이지 제목은 “NUCLÉIDE-LARA on the web (2026)”.
- 양식: 왼쪽 프레임 `Choix_Lara.php`의 “Find nuclides”(`Result_Lara1.php`, POST)는 에너지 구간을 3개까지 받고 AND/OR를 고를 수 있다. [양식 HTML](evidence/tools/laraweb_choix.html)
- 입력: Energy 1 = 1172–1174 keV, Energy 2 = 1332–1334 keV, AND, 붕괴 모드 전체, X·γ·α 방출.
- 결과 [laraweb_F_result.html](evidence/tools/laraweb_F_result.html) (조회 시각 [laraweb_F_query_time.txt](evidence/tools/laraweb_F_query_time.txt)):

| 에너지 (keV) | 방출 세기 (%) | 핵종 |
| --- | --- | --- |
| 1173.228 | 99.8 | ⁶⁰Co |
| 1332.492 | 100.0 | ⁶⁰Co |
| 1174 / 1333.21 / 1333.7 / 1334 | 0.39 / 2.41 / 0.018 / 0.28 | ¹³³ᵐTe |

⁶⁰Co만 두 피크를 모두 높은 세기로 낸다. ¹³³ᵐTe도 조건에 걸리므로 사용자는 세기로 판단해야 한다. 사람의 조작은 양식 열기, 숫자 4개 입력, AND 선택, 검색 정도다. [추정: 조작 수]

## G — KAERI 중성자 포획 단면적

- 접속: `https://atom.kaeri.re.kr/nuchart/` HTTP 200 (2026-10-02 11:47 KST).
- ⁵⁹Co 페이지: 원자질량·질량초과·핵자당 결합에너지·존재비 100 %와 함께 “Neutron-induced Cross Sections”에 ENDF/B-VIII.0, ENDF/B-VII.1, ENDF/B-VII.0, JENDL-4.0, JEFF-3.2, JEFF-3.1, CENDL-3.1이 있다. [Co-59 페이지](evidence/tools/kaeri_co59.html)
- ENDF/B-VIII.0을 펼치면 반응별 목록에 “Capture cross sections Plot”(MT=102)이 있다. [목록](evidence/tools/kaeri_co59_endfb8_mf3.html)
- 그 화면의 “Get data”는 그림에 쓰인 점 데이터를 준다. [Co-59(n,g) ENDFB-8.0 데이터](evidence/tools/kaeri_co59_endfb8_mt102_data.txt), 21,556점.
- 0.0253 eV 점의 값: **37.1735 b**. 표에 그 에너지 점이 그대로 있어 보간하지 않았다.
- 사람의 조작은 핵종 찾기, 라이브러리 펼치기, Capture 그림, Get data 정도다. [추정: 조작 수]

앱에서는 F·G 모두 불가능하다(1차 확인). 이번 결과는 앱이 해당 핵종의 공식 DB 화면으로 바로 연결하는 기능(1차 3단계 P1 제안)의 실현 가능성을 보여 준다. LARAWEB은 HTTP만 응답했으므로 연결 주소는 다시 확인해야 한다.

## 한계

- LiveChart·NuDat에서 같은 과제를 같은 방식으로 돌려 보지는 않았다. 1차에서 확인한 메뉴·API 범위를 유지한다.
- LARAWEB은 DDEP 권고값 중심의 수록 범위를 갖는다. 모든 핵종의 역검색 가능성을 보증하지 않는다.
- 37.17 b는 ENDF/B-VIII.0 한 라이브러리의 값이다. 라이브러리 사이의 차이는 비교하지 않았다.
