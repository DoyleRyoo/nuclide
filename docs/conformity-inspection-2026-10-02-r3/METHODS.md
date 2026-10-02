# 3차 검증 방법·재현·증거 안내

## 범위와 원칙

2차 [CONTINUE.md](../conformity-inspection-2026-10-02-r2/CONTINUE.md)의 남은 일 중 개발자 결정이 필요 없는 항목을 했다.

| 2차 CONTINUE | 3차 |
| --- | --- |
| 1 목표 사용자 순위 | 하지 않음 (개발자 결정) |
| 2 원문 오기 처리 방침 | 하지 않음 (개발자 결정·외부 연락) |
| 3 B 33건 확인 | [03](03-newer-evaluations.md) |
| 4 C 4건 확인 | [03](03-newer-evaluations.md) |
| 5 A2에서 ¹³⁸Cs형 오기 찾기 | 바닥상태 전체로 넓혀 [02](02-same-source-screen.md) |
| 6 이성질체 외부 비교 | [04](04-isomers.md) |
| 7 수정 작업 | 하지 않음 (별도 요청 필요) |
| (추가) 독립 파서 전 상태 대조 | [01](01-full-reparse.md) |

- **제품 코드·데이터·테스트·설정·기존 추적 문서는 바꾸지 않았다.** 1·2차 폴더에는 3차로 가는 안내만 덧붙였다.
- 스크립트는 저장소 파일을 읽기만 한다. Python은 `-B`로 실행해 `tools/` 아래에 `__pycache__`가 생기지 않게 했다.
- 외부 자료는 공개 웹·API에 읽기 요청만 했다(NuDat 문서 1초 간격, LiveChart `levels` 1초 간격). 외부 사람·계정에 연락하거나 게시하지 않았다.
- 근거 라벨: [확인됨] 직접 확인, [추정] 간접 근거, [확인 불가] 자료 없음.

환경은 2차와 같다(Windows 11, Node v24.18.0, Python 3.14.6, @playwright/test 1.63.0, pdftotext 4.06). 기준 커밋 `7280849527dbc5819b1eb8700f7f1738137ec78d`.

## 무변경 확인

1차 [baseline-hashes.json](../conformity-inspection-2026-10-02/evidence/baseline-hashes.json)의 107개 파일을 시작·종료에 다시 해시했다(스크립트는 2차 [integrity.py](../conformity-inspection-2026-10-02-r2/evidence/integrity.py)). 결과 [integrity-results.json](evidence/integrity-results.json).

## R3-1 독립 파서 전 상태 대조

```bash
python -B evidence/full_reparse.py docs/conformity-inspection-2026-10-02/evidence/nuclides-export.json full-reparse.json
```

- 원문 고정 열(질량초과 19–31, 들뜬 에너지 43–54, 순서 표시 68·69, 반감기 70–88, Jπ 89–102, 발견 연도 115–118, 붕괴 120–209)을 앱 코드와 무관하게 읽는다.
- 상태는 (Z, N, 원문 상태 번호 i = 앱 `level`)로 짝짓는다. IAS(i = 8, 9)는 앱이 수록하지 않으므로 뺀다.
- 화면 확인: 2차 [ui_capture.cjs.txt](../conformity-inspection-2026-10-02-r2/evidence/flags/ui_capture.cjs.txt)로 `Ne-24,Ga-77,In-114m2,In-118m2` 패널을 저장했다([ui/](evidence/ui/)).

## R3-2 같은 출처 선별

```bash
python -B evidence/same_source_screen.py <NUBASE2020.pdf의 pdftotext -raw 텍스트> same-source-screen.json
```

NUBASE2020 PDF는 2차 METHODS의 SHA-256과 같은 파일을 썼다. LiveChart는 1차와 같은 일괄 스냅샷과 단건 캐시(단건 우선). 확인용 NuDat 문서 11개는 [nndc/](evidence/nndc/).

## R3-3·R3-4 최신 평가·미확정

```bash
python -B evidence/b_class_review.py evidence/nndc ../conformity-inspection-2026-10-02-r2/evidence/flags/top318-classified.csv b-class-review.json
python -B evidence/b_group.py b-class-review.json b-class-groups.json
```

- NuDat `getdatasetClassic.jsp?nucleus=…&unc=NDS` 문서에서 바닥상태 행의 반감기·분기 칸과 툴팁 주석, 일반 주석을 읽는다. 반감기 열 위치는 머리행에서 찾는다(초중핵 문서는 Jπ 열이 없다).
- NUBASE2012: `https://www-nds.iaea.org/amdc/ame2012/nubase.mas12`, SHA-256 `4e6ae12f3dc9f5d8393a97e20af499b49bdd0ca50ffc12963a2d91a670884f45` (2026-10-02 13:47 KST). 행 비교에만 쓰고 파일은 보존하지 않았다.
- NSR 키는 `nsrlink.jsp?KEY,B`가 넘겨 주는 출판사 주소에서 DOI·제목만 기록했다([nsr/](evidence/nsr/)).

## R3-5 이성질체

```bash
python -B evidence/fetch_levels.py docs/conformity-inspection-2026-10-02/evidence/nuclides-export.json <저장 폴더> livechart-levels-manifest.tsv
python -B evidence/isomer_compare.py docs/conformity-inspection-2026-10-02/evidence/nuclides-export.json <저장 폴더> isomer-compare.json
```

- LiveChart API 안내: `nuclides=all`은 `ground_states`에만 허용된다. 이성질체가 있는 1,431개 핵종마다 `fields=levels&nuclides=<A><기호>`를 1초 간격으로 받았다. 요청 URL·시각·HTTP·크기·SHA-256은 [livechart-levels-manifest.tsv](evidence/livechart-levels-manifest.tsv), 원본 CSV 묶음은 [livechart-levels.zip](evidence/livechart-levels.zip).
- `levels` CSV에는 `unc_hl` 열이 두 번 나온다. 첫째는 ENSDF식, 둘째는 초 단위로 대칭화한 값이며 비교에는 둘째를 쓴다(1차 METHODS와 같은 주의).
- 짝짓기·판정 규칙은 [04](04-isomers.md)에 있다.

## 증거 목록

| 경로 | 내용 |
| --- | --- |
| [evidence/full-reparse.json](evidence/full-reparse.json) | R3-1 필드별 대조 결과와 변환 목록 |
| [evidence/same-source-screen.json](evidence/same-source-screen.json) | R3-2 후보 |
| [evidence/b-class-review.json](evidence/b-class-review.json), [b-class-groups.json](evidence/b-class-groups.json) | R3-3 핵종별 현재 ENSDF와 근거 문헌 |
| [evidence/nndc/](evidence/nndc/) | NuDat ENSDF 채택 문서 40개와 manifest |
| [evidence/nsr/](evidence/nsr/) | NSR 키 → DOI |
| [evidence/ui/](evidence/ui/) | feeding 주석 화면 |
| [evidence/livechart-levels-manifest.tsv](evidence/livechart-levels-manifest.tsv), [livechart-levels.zip](evidence/livechart-levels.zip) | R3-5 원본 |
| [evidence/isomer-compare.json](evidence/isomer-compare.json) | R3-5 결과 |
