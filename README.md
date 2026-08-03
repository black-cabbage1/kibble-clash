# 멍밥쟁탈전 (Kibble Clash)

강아지 네 마리가 여섯 개의 밥그릇을 두고 사료 포인트를 모으는 짧은 턴제 전략 게임이다.

현재 목표는 Apps in Toss용 최종 상용 게임이 아니라, 한 판을 끝까지 반복 플레이하며 핵심 규칙의 재미를 검증할 수 있는 그레이박스 MVP다.

## MVP 규칙

- 사용자 1명과 규칙 기반 AI 3명
- 밥그릇 6개
- 4라운드
- 라운드마다 플레이어당 주사위 8개
- 남은 주사위를 모두 굴린 뒤 나온 눈 하나를 선택
- 선택한 눈의 주사위를 같은 번호 밥그릇에 전부 배치
- 같은 영향력의 플레이어는 밥그릇 정산에서 모두 상쇄
- 살아남은 순위대로 큰 사료 보상 카드 한 장씩 획득

상세 규칙은 [게임 규칙](docs/game-rules.md)을 참고한다.

## 목표 환경

- Cocos Creator 3.8.7
- TypeScript
- Node.js 18 이상
- Apps in Toss Web Mobile
- 가로 화면

현재 구현은 Cocos가 아닌 Vite 기반 WebView 게임이다. Apps in Toss Web Framework 초기화와 `.ait` 번들 생성까지 검증했으며, Cocos Creator는 현재 빌드에 필요하지 않다.

앱이 토스 WebView에서 시작되면 공식 화면 방향 API를 즉시 호출해 landscape 모드로 전환한다.

## 실행

```powershell
npm install
npm run preview:dev
```

브라우저에 표시되는 로컬 주소로 접속한 뒤 `게임 시작`을 누른다.

## 검증 명령

```powershell
npm run typecheck
npm run test:run
npm run preview:build
npm run preview:serve
npm run build
```

현재 자동 테스트는 도메인 규칙, 캐릭터 선택, 턴 UI 흐름을 포함한 39개 항목을 검증한다. `npm run build`는 프로젝트 루트에 `kibble-clash.ait`를 생성한다.

## Apps in Toss 테스트

1. 앱인토스 콘솔의 `appName`, 표시 이름, 아이콘을 `granite.config.ts`와 동일하게 등록한다.
2. `npm run build`로 생성한 `kibble-clash.ait`를 콘솔에 업로드한다.
3. 콘솔의 `테스트하기`에서 QR 코드를 열어 최신 토스앱으로 확인한다.
4. 가로 게임은 샌드박스가 아닌 토스앱 QR 테스트에서 최종 검수한다.

## Cloudflare Pages

웹 버전은 다음 설정으로 Cloudflare Pages에 배포할 수 있다.

- 빌드 명령: `npm run pages:build`
- 출력 디렉터리: `dist/web`
- 환경 변수: 없음

Git 연동 및 Wrangler 직접 배포 방법은 [Cloudflare Pages 배포 문서](docs/cloudflare-pages.md)를 참고한다.

## 문서

- [게임 규칙](docs/game-rules.md)
- [아키텍처](docs/architecture.md)
- [플랫폼 확인](docs/platform-notes.md)
- [로드맵](docs/roadmap.md)
- [알려진 문제](docs/known-issues.md)
- [Cloudflare Pages 배포](docs/cloudflare-pages.md)

## 범위 밖

서버, 계정, 멀티플레이, 리더보드, 광고, 결제, 상점, 성장, 업적, 푸시, 개인정보 수집은 이번 MVP에 포함하지 않는다.

## 보안과 저장

- 비밀키를 저장소에 넣지 않는다.
- 외부 분석·광고 SDK를 설치하지 않는다.
- 게임 결과와 설정은 MVP에서 서버에 저장하지 않는다.
- 사용자 요청 없이 커밋·푸시·배포하지 않는다.
