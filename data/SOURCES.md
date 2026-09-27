# 원본 데이터 출처

`data/raw/`의 파일은 받은 그대로 두고 고치지 않는다. 변환은 `npm run data:build`로만 한다 ([docs/04-data.md](../docs/04-data.md)).

## 파일

받은 날짜: 2026-09-26. 받은 곳: IAEA의 AMDC 미러 <https://www-nds.iaea.org/amdc/ame2020/> (원 배포처 <https://amdc.impcas.ac.cn/>). 파일 머리의 작성일은 2021-03-03.

| 파일                                                                           | 평가본     | 크기 (바이트) | SHA-256                                                            |
| ------------------------------------------------------------------------------ | ---------- | ------------- | ------------------------------------------------------------------ |
| [nubase_4.mas20.txt](https://www-nds.iaea.org/amdc/ame2020/nubase_4.mas20.txt) | NUBASE2020 | 761,906       | `1585a5eea86c5e17e90307c7e6e786d060049c4039e392a261ff6db977df9859` |
| [mass_1.mas20.txt](https://www-nds.iaea.org/amdc/ame2020/mass_1.mas20.txt)     | AME2020    | 472,648       | `e8599c6d7f724fac91934e59f1b9de8fb8f63e820f4b39456b790665ed2a3307` |
| [rct1.mas20.txt](https://www-nds.iaea.org/amdc/ame2020/rct1.mas20.txt)         | AME2020    | 511,515       | `e6ba1d2256f90053464c48e24d44691828dc49820ce64054aa418d834cc18e90` |
| [rct2_1.mas20.txt](https://www-nds.iaea.org/amdc/ame2020/rct2_1.mas20.txt)     | AME2020    | 510,935       | `78765c7b3f3c991ce2b6ff3b5c086a135aad1807d07819f806ab9a9150a4c2c7` |

- `rct1.mas20.txt`만 줄 끝이 CRLF다. 원본 그대로 두며, `.gitattributes`가 줄 끝 변환을 막는다.
- 같은 해시가 `src/data/generated/nuclides.json`의 `meta.sources`에 기록된다.

## 인용

- F.G. Kondev, M. Wang, W.J. Huang, S. Naimi, G. Audi, "The NUBASE2020 evaluation of nuclear physics properties", _Chinese Physics C_ **45**, 030001 (2021).
- W.J. Huang, M. Wang, F.G. Kondev, G. Audi, S. Naimi, "The AME2020 atomic mass evaluation (I)", _Chinese Physics C_ **45**, 030002 (2021).
- M. Wang, W.J. Huang, F.G. Kondev, G. Audi, S. Naimi, "The AME2020 atomic mass evaluation (II)", _Chinese Physics C_ **45**, 030003 (2021).

## 이용 조건

표시·재배포 조건은 공개 배포 전에 확인한다 ([docs/06-roadmap.md](../docs/06-roadmap.md)의 공개 전 확인 목록).
