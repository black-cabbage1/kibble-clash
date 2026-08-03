# Kibble Clash 아키텍처

## 목표

게임 규칙을 Cocos Creator와 분리해 Node 테스트, 브라우저 그레이박스, Cocos UI가 같은 도메인 로직을 사용하도록 한다.

## 구조

```text
assets/
  scenes/
  scripts/
    domain/
      models/
      rules/
      rng/
      ai/
    application/
    presentation/
      components/
      view-models/
    platform/
      apps-in-toss/
      analytics/
      storage/
    config/
preview/
tests/
docs/
```

## 계층

### Domain

- Cocos, DOM, 네트워크, 로컬 저장소에 의존하지 않는다.
- 모든 상태 전이는 입력 상태와 명령을 받아 새 상태 또는 명시적 결과를 반환한다.
- Seeded RNG 상태를 게임 상태에 포함하거나 명시적으로 전달한다.
- 규칙 오류는 사용자 UI 문구가 아니라 도메인 오류 코드로 표현한다.

주요 모듈:

- `models/game-types.ts`: 게임 상태와 식별자
- `rng/seeded-rng.ts`: 재현 가능한 난수
- `rules/reward-deck.ts`: 보상 배치와 재순환
- `rules/dice.ts`: 주사위 굴림과 눈 집계
- `rules/turn.ts`: 선택 검증과 배치
- `rules/settlement.ts`: 동률 상쇄와 보상 지급
- `rules/game-engine.ts`: 라운드·경기 상태 전이
- `ai/choose-action.ts`: 가능한 행동만 반환하는 휴리스틱

### Application

- 사용자 명령과 AI 자동 진행을 조율한다.
- 도메인의 순수 함수를 호출한다.
- UI 애니메이션 완료에 게임 규칙을 종속시키지 않는다.
- 자동 진행 단계 수 상한으로 무한 루프를 탐지한다.

### Presentation

- 상태를 화면에 표시하고 명령을 Application으로 전달한다.
- Cocos Component는 도메인 모델을 직접 변경하지 않는다.
- 플레이어는 색상, 이름, 아이콘 문자, 문양으로 함께 구분한다.
- 중요한 결과는 항상 텍스트로 제공한다.

### Platform

- Apps in Toss 기능은 `platform/apps-in-toss`에 격리한다.
- 일반 브라우저에서는 지원 여부 확인 후 fallback한다.
- 분석은 `AnalyticsPort` 인터페이스와 `NoopAnalytics`만 MVP에 둔다.
- 확인되지 않은 플랫폼 API 이름은 구현하지 않는다.

## 상태 기계

```text
boot
→ home
→ roundSetup
→ awaitingHumanChoice | resolvingAiTurn
→ roundSettlement
→ roundResult
→ 다음 roundSetup 또는 matchResult
→ home 또는 새 게임
```

도메인 `GameState`는 게임 단계, 라운드, 현재 플레이어, 시작 플레이어, 주사위, 굴림, 밥그릇, 점수, 획득 카드, RNG 상태를 포함한다.

## 설정

`assets/scripts/config/game-config.ts`에 다음을 둔다.

- 플레이어 정의
- 라운드 수
- 시작 주사위 수
- 밥그릇 수
- 주사위 면 수
- 보상 카드 값과 장수
- 밥그릇 최소 보상
- AI 평가 가중치와 오차 범위
- 자동 진행 최대 단계

규칙 함수는 설정을 인자로 받아 테스트에서 작은 설정으로 교체할 수 있게 한다.

## 테스트

Vitest를 선택한다.

선택 이유:

- TypeScript를 별도 빌드 없이 테스트하기 쉽다.
- 순수 함수와 fixture 테스트에 적합하다.
- 브라우저 UI와 Cocos 코드에서 도메인 소스를 공유할 수 있다.
- Jest 호환 형태의 명확한 단언과 빠른 반복 실행을 제공한다.

테스트는 Cocos 런타임을 import하지 않는다. Cocos 결합부는 Creator 설치 후 컴파일과 수동 프리뷰로 별도 검증한다.

## 브라우저 그레이박스

Cocos 설치가 없는 동안 핵심 재미를 검증하기 위해 `preview/`에 최소 DOM UI를 둔다.

- 도메인과 Application 계층을 그대로 사용한다.
- Cocos 전용 UI를 대체하는 최종 제품이 아니다.
- 한 판 전체 흐름과 모바일 가로 레이아웃을 검증한다.
- Vite로 개발·빌드한다.

Cocos가 설치되면 동일한 ViewModel을 Cocos Component에 연결하고 브라우저 그레이박스와 결과 일치 테스트를 유지한다.

## 의존성 계획

런타임:

- 공식 예제와 동일한 `@apps-in-toss/web-framework`

개발:

- `typescript`
- `vite`
- `vitest`

패키지를 설치할 때 잠금 파일을 함께 관리하고, 실제 설치 버전과 취약점 결과를 보고한다.
