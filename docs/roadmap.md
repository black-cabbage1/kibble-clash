# Kibble Clash 로드맵

## Phase 0 — 저장소 및 환경 확인

상태: 완료

- 로컬 도구 확인
- Cocos Creator 미설치 확인
- Apps in Toss 공식 Cocos 예제 확인
- 게임 검수·샌드박스 제약 확인
- `docs/platform-notes.md` 작성

## Phase 1 — 계획 문서

상태: 완료

- `README.md`
- `docs/game-rules.md`
- `docs/architecture.md`
- `docs/platform-notes.md`
- `docs/roadmap.md`

결정:

- 4라운드, 주사위 8개
- 도메인 로직과 UI 분리
- Seeded RNG
- Vitest
- Cocos 설치 전 임시 DOM 그레이박스

## Phase 2 — 순수 게임 로직

상태: 완료

- 프로젝트·테스트 도구 설정
- 데이터 모델
- Seeded RNG
- 보상 덱과 밥그릇 배치
- 턴과 주사위 배치
- 동률 상쇄와 보상 정산
- 라운드·경기 진행
- 규칙 기반 AI
- 요구된 최소 자동 테스트 21개

완료 조건:

- 모든 도메인 테스트 통과: 23개 통과
- 고정 시드 재현 확인
- 자동 AI 경기 무한 루프 방지 확인

## Phase 3 — 그레이박스 UI

상태: 완료

- Boot
- Home와 게임 방법
- Game
- Round Result
- Match Result
- 다시 하기
- 모바일 가로 레이아웃
- 색상 이외의 팀 구분
- 키보드와 터치 입력

완료 조건:

- 사용자와 AI가 한 판을 끝까지 진행하는 상태 흐름 연결
- 모든 주요 결과를 텍스트로 표시
- Vite 프로덕션 빌드 성공
- 로컬 HTTP 응답 200 확인
- 실제 브라우저 클릭 플레이와 다양한 화면 크기의 시각 검수는 남음

## Phase 4 — Apps in Toss WebView

상태: 로컬 구현 완료, 콘솔 QR 테스트 대기

- Apps in Toss Web Framework 초기화
- 게임용 WebView 설정
- 앱 시작 즉시 landscape 방향 요청
- 핀치줌과 스크롤 제스처 차단
- Apps in Toss 어댑터와 브라우저 fallback
- Vite WebView 빌드
- `ait build` 및 `.ait` 파일 생성
- 샌드박스 및 QR 테스트 절차 보완

차단:

- 앱인토스 콘솔 `appName` 확인 완료: `kibble-clash`
- 표시 이름 확인 완료: `멍밥쟁탈전`
- 로컬 앱 아이콘 적용 및 `.ait` 포함 확인
- 가로 게임은 샌드박스 미지원

준비 완료:

- `granite.config.ts`에 앱 이름, 브랜드, 게임 WebView 설정 추가
- Apps in Toss 플랫폼 인터페이스와 브라우저 fallback 추가
- `kibble-clash.ait` 생성 확인

## Phase 5 — 검증

상태: 자동 검증 완료, 실제 기기 검수 대기

- 전체 테스트
- TypeScript 검사
- 브라우저 프로덕션 빌드
- Apps in Toss WebView 및 `.ait` 빌드
- 한 판 반복 실행
- 알려진 문제 정리

완료:

- TypeScript 검사 통과
- 자동 테스트 32개 통과
- 서로 다른 시드 100개 경기 자동 완주
- Vite 프로덕션 빌드 성공
- `.ait` 빌드 성공
- 로컬 HTTP 200 응답 확인
- `docs/known-issues.md` 작성

미완료:

- 토스앱 QR 수동 플레이 검수
- 모바일 가로 화면과 Safe Area 실기기 검수

## MVP 이후

핵심 재미 검증 전에는 시작하지 않는다.

- 최종 캐릭터 아트
- 사운드와 햅틱
- 광고·결제
- 리더보드
- 성장·상점·업적
- 서버와 멀티플레이
