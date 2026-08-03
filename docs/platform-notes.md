# Kibble Clash 플랫폼 확인 기록

- 확인일: 2026-07-30
- 상태: Apps in Toss WebView 로컬 빌드 완료
- 원칙: Apps in Toss 관련 API와 설정은 공식 문서 또는 공식 예제에서 확인된 범위만 사용한다.

## 로컬 환경

| 항목 | 확인 결과 | 판정 |
|---|---|---|
| 운영체제 | Windows / PowerShell | 지원 대상으로 유지 |
| Git | 2.54.0.windows.1 | 사용 가능 |
| Node.js | 24.18.0 | 공식 예제의 18 이상 조건 충족. 실제 패키지 호환성은 설치·빌드로 검증 필요 |
| npm | 11.16.0 | 사용 가능 |
| Python | 3.12.10 | 보조 도구에 사용 가능 |
| Cocos Creator | 명령 및 일반 설치 경로에서 찾지 못함 | 현재 Vite WebView 빌드에는 불필요 |
| VS Code | 설치 확인 | 편집 가능 |
| Apps in Toss AX | 아직 확인하지 않음 | 선택 도구이며 필수 전제 아님 |

현재 저장소에는 마스터 프롬프트 외 프로젝트 파일이 없었다. 2026-07-30에 `main` 브랜치의 빈 Git 저장소로 초기화했다.

## 공식 Cocos 예제

- 저장소: https://github.com/toss/apps-in-toss-cocos-examples
- 확인한 기본 예제:
  - `apps-in-toss-basic-example`
  - Cocos Creator 3.8.7
  - Node.js 18 이상
  - npm
  - `@apps-in-toss/web-framework`
- 확인한 예제 `package.json`:
  - Cocos 프로젝트 빌드: `cocos:build`
  - 앱인토스 번들 빌드: `ait build`
  - 개발 서버: `granite dev`
- 확인한 `granite.config.ts`:
  - `appName`, `brand.displayName`, `brand.primaryColor`, `brand.icon`
  - `webViewProps.type: "game"`
  - `bounces: false`
  - `pullToRefreshEnabled: false`
  - `allowsBackForwardNavigationGestures: false`

공식 예제의 현재 `package.json`은 `@apps-in-toss/web-framework`를 `^2.4.7`로 선언한다. 실제 설치 시점의 해석 버전은 잠금 파일로 고정하고 설치 결과를 기록해야 한다.

## Windows 개발 제약

공식 Cocos 예제의 `cocos:dev`, `cocos:build` 스크립트는 macOS 경로를 사용한다. 공식 README도 Windows에서는 스크립트를 그대로 사용할 수 없다고 안내한다.

Windows에서는 설치된 `CocosCreator.exe`를 직접 호출해야 한다.

```powershell
"C:\CocosDashboard\resources\.editors\Creator\3.8.7\CocosCreator.exe" --project .
```

설치 경로는 환경에 따라 달라질 수 있으므로 실제 경로를 확인한 뒤 로컬 전용 명령 또는 문서로 관리한다. 존재하지 않는 경로를 프로젝트 스크립트에 확정하지 않는다.

## 게임 검수 선반영 항목

공식 게임 출시 가이드:

- https://developers-apps-in-toss.toss.im/checklist/app-game.html

그레이박스부터 반영할 항목:

- 최초 화면이 10초 이내에 열린다.
- 우측 상단 닫기 기능과 모든 화면의 이탈 경로를 고려한다.
- Safe Area와 iOS Dynamic Island를 침범하지 않는다.
- 인게임 화면은 풀스크린으로 구현한다.
- 가로 모드가 의도대로 작동해야 한다.
- 운영체제 뒤로가기 제스처에 의존하지 않는다.
- 터치·화면 전환 반응이 2초 이상 지연되지 않는다.
- 메모리와 네트워크 사용량이 비정상적으로 증가하지 않는다.
- 종료 시 확인 모달 요구를 플랫폼 어댑터 설계에 반영한다.
- 색상만으로 플레이어와 상태를 구분하지 않는다.
- 사운드가 없더라도 모든 결과를 이해할 수 있게 한다.

광고, 공유 리워드, 결제, 리더보드는 이번 MVP 범위에서 제외한다.

## 샌드박스와 실제 토스앱 테스트

공식 샌드박스 문서:

- https://developers-apps-in-toss.toss.im/development/test/sandbox.html

확인 사항:

- 전용 샌드박스 앱을 사용한다.
- 최소 OS는 Android 7, iOS 16이다.
- 라이브 환경은 HTTPS만 지원한다.
- 스킴 형식은 `intoss://{appName}`이다.
- **샌드박스 앱은 가로 버전 게임 테스트를 지원하지 않는다.**
- 따라서 Kibble Clash의 가로 모드 최종 확인은 앱 번들을 업로드한 뒤 토스앱 QR 테스트로 진행해야 한다.

토스앱 QR 테스트 문서:

- https://developers-apps-in-toss.toss.im/development/test/toss.html

앱인토스 번들은 `npm run build`로 생성하며 결과는 `.ait` 파일이다. `kibble-clash.ait` 생성까지 확인했으며, 콘솔 등록값 확인과 업로드 및 QR 테스트가 남아 있다.

## 브라우저 fallback 원칙

- 게임 도메인은 Apps in Toss SDK에 의존하지 않는다.
- 플랫폼 기능은 `assets/scripts/platform/apps-in-toss/` 아래 어댑터로 격리한다.
- 일반 브라우저에서는 지원 여부 확인 후 no-op 또는 명시적 fallback을 사용한다.
- 존재가 확인되지 않은 SDK API 이름을 미리 만들지 않는다.
- 분석 이벤트는 인터페이스만 두고 외부 분석 도구를 설치하지 않는다.

## 화면 방향

- 앱 엔트리 코드가 실행되는 즉시 공식 `setDeviceOrientation({ type: 'landscape' })` API를 호출한다.
- 게임 전체가 가로 화면이므로 게임 내부 화면 전환에서는 세로 방향으로 복구하지 않는다.
- 토스 네이티브 브리지가 없는 일반 브라우저에서는 호출 실패를 안전하게 처리하고 반응형 가로 프리뷰를 유지한다.
- 실제 방향 전환과 Safe Area는 가로 게임을 지원하는 토스앱 QR 테스트에서 최종 확인한다.

## 확인된 차단 요소

1. 앱인토스 콘솔 QR 테스트 미실행
   - 확인 완료: `appName`은 `kibble-clash`, 표시 이름은 `멍밥쟁탈전`
   - 확인 완료: 로컬 아이콘이 `.ait` 번들에 포함됨
   - 사용자 조치: `.ait` 업로드 후 토스앱 QR 테스트
2. 가로 게임 샌드박스 미지원
   - 영향: 실제 가로 모드는 토스앱 QR 환경에서 검증해야 함
3. 공식 웹 프레임워크 전이 의존성 보안 감사
   - 설치 버전: `@apps-in-toss/web-framework@2.10.8`
   - `npm audit --omit=dev` 결과: low 13, moderate 1, high 55, critical 1
   - 직접 의존성 취약점으로 표시된 항목은 없고 프레임워크 전이 의존성에서 발생
   - `@fastify/middie` critical 항목은 자동 수정 불가로 표시됨
   - 영향: 로컬 그레이박스 진행은 가능하나 출시 빌드 전 공식 패키지 업데이트와 실제 번들 포함 여부를 재검토해야 함
   - 호환성 검증 없이 `npm audit fix --force`를 실행하지 않음

## 결정

- 규칙 충돌은 상세 규칙과 완료 기준에 맞춰 **4라운드, 플레이어당 주사위 8개**를 MVP 기본값으로 사용한다.
- 현재 제품 런타임은 Cocos가 아닌 Vite 기반 WebView로 확정한다.
- Cocos Creator는 별도의 전환 요청이 없는 한 설치 전제로 두지 않는다.
- UI는 Cocos 결합 전에도 핵심 흐름을 검증할 수 있도록 상태·명령 계층을 먼저 구현한다.
- 현재 보안 감사 결과가 해소되거나 실제 배포 번들 영향이 확인되기 전에는 출시 가능 상태로 판정하지 않는다.
