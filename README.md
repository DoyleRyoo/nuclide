# Nuclide Map · 핵종 지도

NUBASE2020·AME2020 평가 자료를 N(중성자 수)–Z(양성자 수) 평면에서 탐색하는 정적 웹앱입니다. React·TypeScript UI와 React에 의존하지 않는 Canvas 2D 엔진으로 구성합니다. 전체 설계와 우선순위는 [docs](docs/README.md)에 있습니다.

## 로컬 실행

Node.js 24와 npm을 사용합니다.

```sh
npm ci
npm run dev
```

프로덕션 빌드와 미리보기:

```sh
npm run build
npm run preview
```

Windows PowerShell에서 실행 정책 때문에 `npm.ps1`이 차단되면 `npm.cmd`와 `npx.cmd`를 사용하세요.

## 검증

```sh
npm run data:check
npm run lint
npm test
npm run build
npm run check:bundle
npx playwright install chromium firefox webkit
npm run test:e2e
```

Playwright는 빌드된 앱을 포트 4173에서 실행합니다. Chromium·Firefox·WebKit 데스크톱과 Chromium 모바일 뷰포트에서 검색, 선택, URL 복원, 키보드, 휠·드래그, 모바일 시트를 검사합니다. Linux에서 브라우저 의존성이 없으면 `npx playwright install --with-deps chromium firefox webkit`을 사용합니다. 브라우저 설치와 패키지 설치에는 네트워크가 필요합니다.

`check:bundle`은 `dist/`의 JavaScript를 gzip으로 측정합니다. 시작 데이터 청크 `nuclides-*.js`는 250 KiB, 첫 차트 뒤에 받는 AME 상세 청크 `ame-*.js`는 300 KiB, 나머지 앱 JavaScript 합계는 150 KiB가 상한입니다. 크기 검사는 실제 기기의 프레임 성능 측정을 대신하지 않습니다.

## 데이터

원본은 `data/raw/`, 생성 결과는 `src/data/generated/`의 `nuclides.json`(NUBASE + 핵자당 결합에너지)과 `ame.json`(나머지 AME 값)에 둡니다. 원본 파일을 교체한 뒤 다음 명령으로 다시 생성하고, 변경 내용을 검토합니다.

```sh
npm run data:build
npm run data:check
```

파일 출처·해시·인용은 [data/SOURCES.md](data/SOURCES.md), 필드 해석과 검증 규칙은 [데이터 설계](docs/04-data.md)를 확인하세요. `data:check`는 같은 원본에서 생성한 결과가 저장된 JSON과 일치하는지 확인합니다. 핵 데이터의 이용·재배포 조건은 공개 전에 별도로 확인해야 합니다.

## GitHub Pages

CI는 push와 pull request마다 데이터 재현성, 린트, 단위 테스트, 빌드, 번들 예산, 브라우저 테스트를 실행합니다. 하위 경로(`/nuclide-map/`)에서도 자산과 링크를 검사하도록 구성되어 있습니다.

배포 워크플로는 **수동 실행만** 제공합니다. [공개 전 확인 목록](docs/06-roadmap.md#5-공개-전-확인-목록)을 검토한 뒤 저장소의 Pages Source를 GitHub Actions로 설정하고 기본 브랜치에서 `Deploy GitHub Pages`를 실행합니다. `release_checks_complete`를 확인해야 배포 작업이 진행됩니다. 기본 경로는 `/<저장소 이름>/`이며 사용자 도메인은 `base_path`에 `/`를 지정합니다. 다른 정적 호스팅에서도 `VITE_BASE`를 지정해 `dist/`를 빌드할 수 있습니다.

워크플로를 추가하는 것만으로 원격 배포가 완료되지는 않습니다. Pages 설정 방식은 [GitHub 공식 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)를 따릅니다.

## 출시 전 확인

현재 구현·검증 상태와 남은 작업은 [구현 진행 현황](docs/PROGRESS.md)에 정리되어 있습니다. 자동화된 모바일 뷰포트 테스트와 별개로 실제 iPhone·Android·macOS 트랙패드 입력, 화면 낭독기, Lighthouse, 오프라인 재방문을 확인해야 합니다. 문서에 있는 모든 P1·P2 항목이 구현되었다는 의미는 아니며, 설계 문서의 목표와 실제 검증 완료 범위를 구분해야 합니다.
