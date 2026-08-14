# 멍밥쟁탈전 개발 작업 인수인계

최종 갱신: 2026-08-14

프로젝트: 멍밥쟁탈전(Kibble Clash) V1.5

공개 저장소: `https://github.com/black-cabbage1/kibble-clash`

개발 자료 저장소: `https://github.com/black-cabbage1/kibble-clash-workspace`

## 1. 현재 상태

- Vite + TypeScript 기반 Apps in Toss WebView 게임이다.
- 앱 시작 시 가로 화면을 요청하며 Safe Area를 반영한다.
- 사용자 1명과 AI 3명이 4라운드 동안 6개 밥그릇을 두고 경쟁한다.
- 2026-08-14 기준 타입 검사, 자동 테스트 100개, Vite 프로덕션 빌드와 `ait build`가 통과했다.
- 최신 Apps in Toss 빌드 deployment ID는 `019ffe21-6a85-7ebb-a355-faec749b219d`이다.
- `.ait`, `dist`, `node_modules`, `.env`는 Git에 저장하지 않는다.

## 2. 지금까지 완료한 작업

### 기본 게임과 UI

- 주사위 굴리기, 숫자 선택, 밥그릇 배치, Clash, 라운드 정산, 최종 순위 흐름 구현
- Seeded RNG와 규칙 기반 AI 구현
- AI 난이도 쉬움/보통/어려움과 영구 저장 구현
- 캐릭터 이름 최대 6자 설정 및 영구 저장 구현
- Game Center 리더보드 등록/열기 어댑터 구현
- 모바일 가로 화면, Safe Area, 접근성 이름, 키보드 조작 보완
- 효과음 교체 및 주사위 선택 효과음 추가
- 결과 화면 보상 포인트를 점수 결과판 오른쪽 위에 배치
- 개발 모드에서만 결과 화면 테스트 기능 노출
- 배포 버전에서는 포인트 상점 준비 중 버튼과 결과 화면 테스트 버튼을 숨김

### V1.5 STEP 1 — 포인트와 출석

- 게임 내 사료 점수와 분리된 영구 성장 포인트 도입
- 공통 API 구현: `getPointBalance`, `addPoints`, `spendPoints`, `canSpendPoints`
- 게임 최종 순위 보상: 1위 100P, 2위 70P, 3위 50P, 4위 35P, 5위 25P
- `gameSessionId` 기반 게임 보상 중복 지급 방지
- 로컬 캘린더 날짜 기준 일일 출석과 100P 보상 구현
- 출석 연타·재진입·재실행 중복 지급 방지
- 메인 화면 보유 포인트와 출석 UI, 결과 화면 보상 피드백 구현
- 거래 기록과 보상 세션 ID는 설정된 최대 개수까지만 보관

### V1.5 STEP 2 — 인터랙티브 튜토리얼

- 최초 안내, 나중에 하기, 메인 화면의 게임 방법 재진입 구현
- 실제 게임 UI를 재사용한 주사위 굴리기 → 숫자 선택 → 밥그릇 선택 흐름 구현
- 고정 주사위와 스크립트 AI를 이용해 Clash와 단독 점유를 확정적으로 체험
- 현재 행동 대상만 활성화하고 나머지 화면을 어둡게 처리하는 Spotlight 구현
- 튜토리얼 세션을 일반 게임 보상, 기록, Game Center와 분리
- 최초 완료 1회만 300P 지급
- 완료 후 즉시 게임을 시작하지 않고 메인/캐릭터 선택 흐름으로 연결
- 중간 종료, 다시 보기, 보상 중복 방지 구현

### V1.5 STEP 3 — 캐릭터 확장과 선택 UX

- 기존 5종에 몰티즈, 포메라니안, 비숑프리제 추가하여 총 8종 구성
- 캐릭터 이미지, 아바타, 승리 이미지와 공통 시각 설정 등록
- 캐릭터 목록을 4×2 형태로 배치하고 작은 화면 크기를 보정
- 캐릭터 선택 후 화면 전환 없이 설정 레이어에서 이름과 AI 난이도를 변경
- 설정 레이어 버튼을 `게임 시작`, `다시 선택`으로 구성
- 주사위 숫자 선택 UI를 큰 화면과 작은 가로 화면 모두 확대

### V1.5 STEP 4 — 새 친구 합류

- 진도믹스를 기본 합류 캐릭터로 지정
- 나머지 7종을 사용자가 원하는 순서로 합류 가능
- 합류 순서별 공통 비용: 500, 1,000, 1,500, 2,000, 2,500, 3,000, 3,500P
- 견종별 가격이 아니라 현재 합류한 친구 수로 다음 비용을 계산
- 포인트 차감, 캐릭터 합류, 거래 기록을 한 번의 저장으로 원자적 처리
- 중복 합류, 잔액 부족, 잘못된 캐릭터 ID, 모든 친구 완료 상태 방어
- 미합류 캐릭터는 목록에 표시하되 실제 `disabled` 버튼으로 선택 차단
- AI 캐릭터 풀은 사용자 합류 상태와 분리하여 전체 캐릭터를 계속 사용
- 친구 수와 포인트 진행도를 분리한 합류 진행 카드 구현
- 포인트 부족 시 `친구 만나기` 버튼 비활성화 및 부족 이유 제공
- 친구 선택 → 합류 확인 → 합류 완료 → 이름 설정/플레이 흐름 구현
- 친구 후보 수가 7개에서 1개까지 줄어도 중앙 정렬되는 반응형 Grid 구현
- 친구 모달을 게임 설정 모달의 2열 규칙과 분리하여 버튼 세로 확대 문제 해결
- 합류 확인 및 완료 화면의 강아지 이미지를 최대 125px로 축소
- 모든 8종 합류 시 완료 문구만 표시하고 합류 버튼 제거

## 3. 영구 저장 구조

저장 키는 `kibble-clash:progress`이며 현재 버전은 3이다.

```ts
type ProgressState = {
  version: 3;
  points: { balance: number };
  attendance: { lastClaimDate: string | null };
  tutorial: {
    completed: boolean;
    rewardClaimed: boolean;
    promptDismissed: boolean;
  };
  characters: { unlockedIds: CharacterId[] };
  rewards: { claimedGameSessionIds: string[] };
  transactions: PointTransaction[];
};
```

- 이전 버전 데이터는 읽을 때 기본값을 채워 V3 형태로 보정한다.
- 기존 사용자는 포인트 0P, 진도믹스 합류 상태로 안전하게 시작한다.
- 잘못된 캐릭터 ID는 저장 데이터에서 제외한다.
- 브라우저 `localStorage` 데이터는 Git이나 다른 PC로 자동 동기화되지 않는다.

## 4. 주요 확장 API

```ts
getPointBalance()
addPoints(amount, reason, metadata?)
spendPoints(amount, reason, metadata?)
canSpendPoints(amount)
claimDailyAttendance()
claimGameReward(gameSessionId, rank, amount)
completeTutorial()
getUnlockedCharacterIds()
isCharacterUnlocked(characterId)
getNextFriendJoinCost()
joinCharacter(characterId)
```

포인트 밸런스는 `assets/scripts/config/point-config.ts` 한 곳에서 관리한다.

## 5. 개발 환경 전용 동작

- `import.meta.env.DEV`인 로컬 개발 서버에서는 포인트가 50,000P보다 적으면 50,000P까지 자동 보충된다.
- 테스트 지급 사유는 `PointReason.DEV_TEST_GRANT`로 구분한다.
- 프로덕션 빌드에서는 개발 포인트 보충이 실행되지 않는다.
- 결과 화면 테스트와 준비 중 UI 역시 배포 환경에서는 노출하지 않는다.

## 6. 검증 현황

마지막 확인 결과:

- `npm run typecheck`: 통과
- `npm run test:run`: 13개 테스트 파일, 100개 테스트 통과
- `npm run build`: Vite 및 Apps in Toss 빌드 통과
- `git diff --check`: 통과

자동 테스트 범위에는 게임 엔진, 주사위 레이아웃, 캐릭터 선택, 이름 저장, AI 난이도, 리더보드 점수, 포인트·출석·튜토리얼·친구 합류 중복 방지가 포함된다.

## 7. 다음 PC에서 시작하기

```powershell
git clone https://github.com/black-cabbage1/kibble-clash-workspace.git
cd kibble-clash-workspace
git remote rename origin workspace
git remote add origin https://github.com/black-cabbage1/kibble-clash.git
npm install
npm run typecheck
npm run test:run
npm run preview:dev
```

작업 전에는 항상 다음을 실행한다.

```powershell
git pull workspace main
```

작업 후 비공개 workspace에 동기화한다.

```powershell
git add .
git commit -m "Describe the change"
git push workspace main
```

`main`은 비공개 workspace 전체 자료용으로 사용한다. 공개 저장소에는 workspace 전용 자료가 섞이지 않도록 별도의 `public-main` 브랜치를 사용한다.

```powershell
git fetch origin
git switch public-main
git cherry-pick <공개할-게임-소스-커밋>
git push origin public-main:main
git switch main
```

각 PC에서 원격 저장소 이름은 다음처럼 맞춘다.

```text
origin    공개 배포용 kibble-clash
workspace 비공개 전체 작업용 kibble-clash-workspace
```

최초 한 번 로컬 공개 브랜치를 만들 때는 다음을 실행한다.

```powershell
git fetch origin
git branch public-main origin/main
```

## 8. 추후 진행 예정 작업

### 출시 전 우선 검수

- Toss 앱 QR 테스트로 실제 iPhone/Android 가로 화면 확인
- 320, 375, 390, 430px 폭에서 캐릭터 선택·친구 합류·튜토리얼·결과 화면 직접 확인
- Safe Area와 우측 상단 Toss 닫기 영역 충돌 확인
- 친구 후보 7/5/3/1개 상태와 포인트 부족/충족/전체 완료 상태 수동 확인
- 앱 재실행 후 포인트, 출석, 튜토리얼, 합류 상태 유지 확인
- Game Center 실제 로그인·점수 등록·리더보드 열기 확인
- 효과음 음량, 중복 재생, 무음 설정과 저사양 기기 성능 확인
- 접근성 스크린리더와 포커스 이동 실기기 확인

### 제품·밸런스 후속 작업

- 게임별·출석·튜토리얼·친구 합류 포인트 밸런스 플레이테스트
- 신규 사용자 튜토리얼 이탈률과 1분 내 완료 여부 검증
- 친구 합류 진행도와 문구 사용성 검증
- README와 기존 로드맵의 오래된 MVP/테스트 개수 정보 갱신
- 필요 시 포인트 명칭과 아이콘 최종 확정
- 필요 시 포인트 거래 내역 디버깅 도구 추가

### 현재 범위 밖이며 별도 기획이 필요한 항목

- 서버 계정과 기기 간 실제 사용자 진행 동기화
- 광고 보상, 결제, 포인트 구매
- 연속 출석, 주간 출석, 출석 캘린더
- 포인트 상점과 추가 소비처
- 업적, 푸시 알림
- 온라인 멀티플레이

## 9. 작업 자료 위치

- `assets/modify/`: 기능 요구사항과 수정 요청 원문
- `problem/`: UI 문제 확인용 캡처
- `tools/`: 리소스 제작·변환 도구
- `assets/art/store/`: 앱 로고, 썸네일 및 원본 이미지
- `docs/`: 구조, 규칙, 플랫폼, 배포 및 본 인수인계 문서

공개 저장소에는 실행·빌드에 필요한 파일만 유지하고, 위 작업 원본 자료는 비공개 workspace에서 관리한다.
