# Cloudflare Pages 배포

이 프로젝트는 서버 기능이 없는 정적 Vite 앱으로 배포한다.

## Git 연동 설정

Cloudflare 대시보드에서 Workers & Pages의 새 Pages 프로젝트를 만들고 저장소를 연결한다.

| 항목 | 값 |
| --- | --- |
| 프로젝트 이름 | `kibble-clash` |
| 프로덕션 브랜치 | 실제 배포에 사용할 브랜치 |
| 루트 디렉터리 | 저장소가 이 프로젝트 자체라면 비워 둠 |
| 빌드 명령 | `npm run pages:build` |
| 빌드 출력 디렉터리 | `dist/web` |
| Node.js | 18 이상 |

환경 변수와 비밀키는 필요하지 않다.

## 로컬 빌드

```powershell
npm install
npm run pages:build
```

배포 대상은 `dist/web`이며 다음 파일이 포함되어야 한다.

- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `assets/`와 게임 이미지 디렉터리

## Wrangler 직접 배포

Cloudflare 로그인을 마친 환경에서는 다음 명령을 사용한다.

```powershell
npx wrangler login
npm run pages:build
npm run pages:deploy
```

Pages 직접 업로드 명령은 `dist/web`을 명시적으로 전달한다. 이미 대시보드에서 같은 이름의 프로젝트를 별도 설정한 경우에는 배포 전에 프로젝트 이름을 맞춘다.

## Workers Builds 화면을 사용한 경우

Cloudflare의 Git 연결 과정에서 별도의 **Deploy command** 입력란이 보이고 기본 명령이 `npx wrangler deploy`라면 Workers Builds 정적 자산 방식이다. 현재 `wrangler.toml`은 이 방식도 지원한다.

| 항목 | 값 |
| --- | --- |
| Build command | `npm run pages:build` |
| Deploy command | `npx wrangler deploy` |
| Version command | 비워 둠 |

`[assets]` 설정이 `dist/web`을 배포하며, `not_found_handling = "single-page-application"` 설정이 존재하지 않는 경로를 SPA의 `index.html`로 연결한다. Workers Builds에서는 Pages용 `_redirects` 파일을 함께 사용하지 않는다.

## 배포 후 확인

1. 첫 화면과 캐릭터 선택 화면이 정상적으로 열린다.
2. 새로고침 후에도 `index.html`로 복귀한다.
3. 한 판을 끝까지 진행할 수 있다.
4. 개발자 도구에서 이미지와 JavaScript 요청에 404가 없다.
5. 서비스 워커 업데이트를 위해 필요하면 기존 사이트 데이터를 한 번 지운다.

Apps in Toss `.ait` 빌드와 Cloudflare Pages 웹 배포는 서로 독립적이다. Pages 배포에는 `kibble-clash.ait`를 업로드하지 않는다.
