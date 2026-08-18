import './style.css';
import {
  createGameConfigForCharacter,
} from '../assets/scripts/config/game-config';
import {
  ART_PATHS,
  CHARACTER_VISUALS,
  characterVisual,
} from '../assets/scripts/config/character-visual-config';
import type {
  BowlSettlement,
  CharacterId,
  GameConfig,
  GameState,
  PlayerState,
  AiDifficulty,
} from '../assets/scripts/domain/models/game-types';
import { chooseAiAction } from '../assets/scripts/domain/ai/choose-action';
import { createMatchResultViewModel } from '../assets/scripts/application/match-result-view-model';
import { leaderboardScoreFromPlayers } from '../assets/scripts/application/leaderboard-score';
import { getDifficultyRecommendation } from '../assets/scripts/application/difficulty-recommendation';
import { isOfficialRankingEligible } from '../assets/scripts/application/official-ranking';
import {
  canRoll,
  canSelectBowl,
  initialTurnPhase,
  type TurnPhase,
} from '../assets/scripts/application/turn-flow';
import { availableFaces } from '../assets/scripts/domain/rules/dice';
import { pipPositions } from '../assets/scripts/application/dice-pips';
import { chooseFace, continueAfterRound, createGame } from '../assets/scripts/domain/rules/game-engine';
import {
  loadSelectedCharacter,
  saveSelectedCharacter,
} from '../assets/scripts/platform/storage/selected-character-storage';
import { loadAiDifficulty, saveAiDifficulty } from '../assets/scripts/platform/storage/ai-difficulty-storage';
import {
  loadCharacterNames,
  MAX_CHARACTER_NAME_LENGTH,
  normalizeCharacterName,
  saveCharacterName,
} from '../assets/scripts/platform/storage/character-name-storage';
import { setupGameOrientation } from '../assets/scripts/platform/apps-in-toss/mini-game-platform';
import {
  isSoundEnabled,
  playSound,
  scheduleSound,
  setSoundEnabled,
  stopAllSounds,
} from '../assets/scripts/platform/audio/sound-manager';
import {
  EMPTY_GAME_SAFE_AREA,
  subscribeToGameSafeArea,
  type GameSafeAreaInsets,
} from '../assets/scripts/platform/apps-in-toss/game-safe-area';
import {
  isGameCenterSupported,
  openLeaderboard,
  submitLeaderboardScore,
} from '../assets/scripts/platform/apps-in-toss/game-center-leaderboard';
import { POINT_CONFIG, POINT_LABEL, gamePointReward } from '../assets/scripts/config/point-config';
import {
  claimDailyAttendance,
  addPoints,
  completeTutorial,
  dismissTutorialPrompt,
  claimGameReward,
  formatPoints,
  getPointBalance,
  getUnlockedCharacterIds,
  getNextFriendJoinCost,
  hasClaimedAttendance,
  isCharacterUnlocked,
  joinCharacter,
  DEFAULT_UNLOCKED_CHARACTER_ID,
  PointReason,
  shouldShowTutorialPrompt,
} from '../assets/scripts/application/point-service';
import {
  TUTORIAL_CLASH_FACE,
  TUTORIAL_SUCCESS_FACE,
  createTutorialConfig,
  createTutorialGame,
  placeTutorialHumanDice,
  runScriptedClashAi,
  runScriptedSuccessAi,
  type TutorialStep,
} from '../assets/scripts/application/tutorial-session';

// 토스 WebView가 게임 화면을 그리기 시작하자마자 가로 방향으로 전환한다.
const restoreOrientation = setupGameOrientation();
window.addEventListener('pagehide', () => {
  cancelTurnTimers();
  stopAllSounds();
  restoreOrientation();
}, { once: true });

const isAppsInTossHost = /(^|\.)((private-)?apps\.tossmini\.com)$/i.test(window.location.hostname);
const showResultTestButton = import.meta.env.DEV
  || new URLSearchParams(window.location.search).has('resultTest');
if ('serviceWorker' in navigator && !isAppsInTossHost) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA caching is optional in local previews and unsupported browser contexts.
    });
  }, { once: true });
}

type Screen = 'home' | 'rules' | 'character-select' | 'game';
const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function requireAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (root === null) throw new Error('앱 루트가 없습니다.');
  return root;
}

const app = requireAppRoot();
let screen: Screen = 'home';
let state: GameState | null = null;
let nextSeed = 20260730;
let skipClashPresentation = false;
let reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let aiTurnTimer: number | null = null;
let turnTimer: number | null = null;
let roundIntermissionTimer: number | null = null;
let roundIntermissionRound: number | null = null;
let turnPhase: TurnPhase = 'waiting';
type RollPresentation = 'rolling' | 'result-shown' | 'grouped';

const RESULT_SHOWN_DURATION_MS = 1_000;
const GROUPED_RESULT_DURATION_MS = 1_500;
const aiDebugEnabled = window.location.hostname === 'localhost'
  && new URLSearchParams(window.location.search).has('aiDebug');

let rollPresentation: RollPresentation = 'rolling';
let selectedRollFace: number | null = null;
let sessionVersion = 0;
let selectedCharacterId = loadSelectedCharacter();
if (!isCharacterUnlocked(selectedCharacterId)) selectedCharacterId = DEFAULT_UNLOCKED_CHARACTER_ID;
const DEV_TEST_POINT_BALANCE = 50_000;
if (import.meta.env.DEV && getPointBalance() < DEV_TEST_POINT_BALANCE) {
  addPoints(DEV_TEST_POINT_BALANCE - getPointBalance(), PointReason.DEV_TEST_GRANT);
}
let characterNames = loadCharacterNames();
let selectedAiDifficulty = loadAiDifficulty();
type CharacterSelectStep = 'character' | 'gameSettings';
let characterSelectStep: CharacterSelectStep = 'character';
let isEditingCharacterName = false;
type FriendJoinFlow = 'closed' | 'choose' | 'confirm' | 'complete';
let friendJoinFlow: FriendJoinFlow = 'closed';
let friendJoinCandidateId: CharacterId | null = null;
let friendJoinSpent = 0;
let difficultyDialogOpen = false;
let pendingAiDifficulty: AiDifficulty = selectedAiDifficulty;
let activeGameConfig: GameConfig = createGameConfigForCharacter(selectedCharacterId, characterNames);
let homeDialog: 'rules' | 'settings' | null = null;
let homeDialogTriggerAction: 'open-rules' | 'open-settings' | null = null;
let gameSafeArea: GameSafeAreaInsets = EMPTY_GAME_SAFE_AREA;
type LeaderboardSubmissionStatus = 'idle' | 'submitting' | 'submitted' | 'failed' | 'unsupported' | 'ineligible';
let leaderboardSubmissionStatus: LeaderboardSubmissionStatus = 'idle';
let leaderboardScore: number | null = null;
let leaderboardSubmittedSession: number | null = null;
let leaderboardOpenFailed = false;
let gameSessionId: string | null = null;
let currentGameReward = 0;
let attendanceFeedback = false;
let attendanceFeedbackTimer: number | null = null;
let sessionMode: 'normal' | 'tutorial' = 'normal';
let tutorialStep: TutorialStep | null = null;
let tutorialIntroOpen = shouldShowTutorialPrompt();
let tutorialExitConfirm = false;
let tutorialRewardEarned = 0;

function createGameSessionId(): string {
  try { return globalThis.crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random()}`; }
}

function applySafeArea(): void {
  app.querySelectorAll<HTMLElement>('.screen').forEach((screenElement) => {
    screenElement.style.setProperty('--app-safe-top', `${gameSafeArea.top}px`);
    screenElement.style.setProperty('--app-safe-right', `${gameSafeArea.right}px`);
    screenElement.style.setProperty('--app-safe-bottom', `${gameSafeArea.bottom}px`);
    screenElement.style.setProperty('--app-safe-left', `${gameSafeArea.left}px`);
  });
}

subscribeToGameSafeArea((insets) => {
  gameSafeArea = insets;
  applySafeArea();
});
window.addEventListener('resize', () => {
  if (sessionMode === 'tutorial') window.requestAnimationFrame(positionTutorialSpotlight);
});

function playerById(playerId: string): PlayerState {
  const player = state?.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) throw new Error(`플레이어를 찾을 수 없습니다: ${playerId}`);
  return player;
}

function dogAvatar(
  player: Pick<PlayerState, 'id' | 'symbol' | 'characterId' | 'name'>,
  extraClass = '',
): string {
  const visual = characterVisual(player.characterId);
  return `<span class="dog-avatar team-${player.id} ${extraClass}">
    <img class="asset-image avatar-art avatar-select-fallback" src="${visual.selectImage}" alt="${player.name}">
    <img class="asset-image avatar-art avatar-primary" src="${visual.avatarImage}" alt="">
    <span class="avatar-fallback" aria-hidden="true"><i class="ear left"></i><i class="ear right"></i><b>${player.symbol}</b></span>
  </span>`;
}

function playerBadge(player: PlayerState): string {
  return `<article class="player-card team-${player.id}">
    ${dogAvatar(player)}
    <div class="player-name"><strong>${player.name}</strong><span>${player.kind === 'human' ? '나' : 'AI'}</span></div>
    <dl><div><dt>점수</dt><dd>${player.score}</dd></div><div><dt>주사위</dt><dd>${player.remainingDice}</dd></div></dl>
  </article>`;
}

function gamePlayerChip(player: PlayerState): string {
  const isCurrent = state?.players[state.currentPlayerIndex]?.id === player.id;
  const isHuman = player.kind === 'human';
  return `<li class="game-player-chip team-${player.id} ${isCurrent ? 'is-current' : ''} ${isHuman ? 'is-human' : ''}">
    ${dogAvatar(player, 'game-hud-avatar')}
    <span><strong>${player.name}</strong><small>${isHuman ? '<b class="human-chip-label">나</b>' : ''}주사위 ${player.remainingDice}</small></span>
    <b class="game-player-score"><span>${player.score}</span><small>점</small></b>
  </li>`;
}

function homeTemplate(): string {
  const pointBalance = getPointBalance();
  const attendanceClaimed = hasClaimedAttendance();
  const tutorialIntro = tutorialIntroOpen ? `<section class="home-dialog-backdrop tutorial-intro-backdrop">
    <div class="home-dialog tutorial-intro" role="dialog" aria-modal="true" aria-labelledby="tutorial-intro-title">
      <p class="eyebrow">WELCOME, PUP!</p>
      <h2 id="tutorial-intro-title">멍밥쟁탈전에 처음 왔구나!</h2>
      <p>밥그릇을 차지하는 방법을 짧게 알려줄게.<br><strong>약 1분이면 끝나!</strong></p>
      <div class="tutorial-intro-actions"><button class="primary" data-action="start-tutorial">게임 방법 배우기</button><button data-action="dismiss-tutorial">나중에 하기</button></div>
    </div>
  </section>` : '';
  const dialog = homeDialog === null ? '' : `<section class="home-dialog-backdrop" data-action="close-home-dialog">
    <div class="home-dialog" role="dialog" aria-modal="true" aria-labelledby="home-dialog-title" data-dialog-panel>
      <button class="home-dialog-close" data-action="close-home-dialog" aria-label="닫기">×</button>
      ${homeDialog === 'rules' ? `<p class="eyebrow">HOW TO PLAY</p><h2 id="home-dialog-title">게임 방법</h2>
        <ol class="home-rule-list">
          <li><b>1</b><span>남은 주사위를 모두 굴립니다.</span></li>
          <li><b>2</b><span>숫자 하나를 골라 같은 숫자의 주사위를 전부 놓습니다.</span></li>
          <li><b>3</b><span>같은 개수로 맞선 강아지는 모두 상쇄됩니다.</span></li>
          <li><b>4</b><span>살아남은 순서대로 큰 사료 보상을 받습니다.</span></li>
        </ol>` : `<p class="eyebrow">SETTINGS</p><h2 id="home-dialog-title">설정</h2>
        <button class="motion-setting" data-action="toggle-motion" aria-pressed="${reduceMotion}">
          <span><strong>동작 줄이기</strong><small>캐릭터와 장식의 움직임을 줄입니다.</small></span>
          <b>${reduceMotion ? '켜짐' : '꺼짐'}</b>
        </button>
        <button class="motion-setting sound-setting" data-action="toggle-sound" role="switch"
          aria-checked="${isSoundEnabled()}" aria-label="효과음, ${isSoundEnabled() ? '켜짐' : '꺼짐'}">
          <span><strong>효과음</strong><small>게임 효과음을 재생합니다.</small></span>
          <b>${isSoundEnabled() ? '켜짐' : '꺼짐'}</b>
        </button>`}
    </div>
  </section>`;
  return `<main class="home home-v3 screen">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="point-balance" aria-label="보유 포인트 ${pointBalance.toLocaleString('ko-KR')}"><span>포인트</span><strong>${formatPoints(pointBalance)}</strong></div>
      <div class="home-decoration decoration-left" aria-hidden="true">●　·　●</div>
      <div class="home-decoration decoration-right" aria-hidden="true">◆　·　◆</div>
      <div class="home-character-group" aria-label="멍밥쟁탈전 출전 강아지">
        ${CHARACTER_VISUALS.filter((visual) => visual.featuredOnHome).map((visual, index) => `<img class="home-group-dog home-dog-${index + 1} asset-image" src="${visual.selectImage}" alt="${visual.displayName}">`).join('')}
      </div>
      <div class="home-logo">
        <h1 id="home-title">멍밥쟁탈전</h1>
        <p>KIBBLE CLASH</p>
      </div>
      <p class="home-tagline-v3">주사위를 굴려 최고의 밥그릇을 차지하세요!</p>
      <section class="attendance-card ${attendanceClaimed ? 'is-claimed' : ''}" aria-label="${attendanceClaimed ? '오늘 출석 완료' : `오늘 출석하기, 보상 ${POINT_CONFIG.attendanceReward} 포인트`}">
        <span><strong>오늘의 출석 보상</strong><small>+${formatPoints(POINT_CONFIG.attendanceReward)}</small></span>
        <button data-action="claim-attendance" ${attendanceClaimed ? 'disabled' : ''}>${attendanceClaimed ? '출석 완료 ✓' : '출석하기'}</button>
      </section>
      ${attendanceFeedback ? `<div class="point-toast" role="status" aria-live="polite">출석 완료! <strong>+${formatPoints(POINT_CONFIG.attendanceReward)}</strong></div>` : ''}
      <nav class="home-actions" aria-label="메인 메뉴">
        <button class="primary home-start" data-action="select-character">게임 시작</button>
        <span>
          <button data-action="start-tutorial">게임 방법</button>
          ${showResultTestButton ? '<button class="point-shop-placeholder" disabled aria-label="포인트 상점, 준비 중"><strong>포인트 상점</strong><small>준비 중</small></button>' : ''}
          <button data-action="open-settings">설정</button>
        </span>
        ${showResultTestButton ? '<button class="result-preview-button" data-action="preview-match-result">결과 화면 테스트</button>' : ''}
      </nav>
    </section>
    ${dialog}
    ${tutorialIntro}
  </main>`;
}

function rulesTemplate(): string {
  const rules = [
    '라운드 시작 전에 여섯 밥그릇의 사료 보상을 확인해요.',
    '굴린 주사위 중 나온 숫자 하나를 골라요.',
    '같은 숫자의 주사위를 해당 밥그릇에 모두 놓아요.',
    '가장 많이 놓은 강아지부터 큰 사료 카드를 받아요.',
    '같은 개수로 맞붙은 강아지는 모두 충돌해 보상을 받지 못해요.',
    '4라운드 뒤 사료 점수가 가장 높은 강아지가 이겨요.',
  ];
  return `<main class="rules screen paper-panel">
    <header class="screen-heading"><div><p class="eyebrow">HOW TO PLAY</p><h1>게임 방법</h1></div><button data-action="home">집으로</button></header>
    <ol class="rule-grid">${rules.map((rule, index) => `<li><b>${index + 1}</b><span>${rule}</span></li>`).join('')}</ol>
    <button class="primary wide" data-action="select-character">강아지 고르기</button>
  </main>`;
}

function characterSelectTemplate(): string {
  const difficultyCopy: Record<AiDifficulty, [string, string]> = {
    easy: ['쉬움', '가볍게 즐기기 좋아요.'],
    normal: ['보통', '보상과 경쟁 상황을 고려해 플레이해요.'],
    hard: ['어려움', '전략적인 AI · 공식 랭킹 참여'],
  };
  const selectedVisual = characterVisual(selectedCharacterId);
  const selectedCustomName = characterNames[selectedCharacterId] ?? '';
  const displayName = selectedCustomName || selectedVisual.displayName;
  const unlockedIds = new Set(getUnlockedCharacterIds());
  const lockedVisuals = CHARACTER_VISUALS.filter((visual) => !unlockedIds.has(visual.id));
  const nextJoinCost = getNextFriendJoinCost();
  const pointBalance = getPointBalance();
  const joinReady = nextJoinCost !== null && pointBalance >= nextJoinCost;
  const joinCandidate = friendJoinCandidateId === null ? null : characterVisual(friendJoinCandidateId);
  const settingsDialog = characterSelectStep === 'gameSettings' ? `<section class="character-settings-backdrop">
    <div class="character-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="character-settings-title">
      <header><p class="eyebrow">GAME SETTINGS</p><h2 id="character-settings-title" tabindex="-1">이번 게임 설정</h2></header>
      <section class="selected-character-summary character-${selectedVisual.id}" aria-label="선택한 캐릭터 ${displayName}">
        <span class="selected-character-art"><img class="asset-image" src="${selectedVisual.selectImage}" alt=""></span>
        <div><small>선택한 댕댕이</small><strong>${displayName}</strong><span>${selectedVisual.displayName}</span></div>
      </section>
      ${isEditingCharacterName
        ? `<label class="character-name-editor is-editing" for="character-name-input">
            <span><b>이름</b><small>${selectedVisual.displayName} · 최대 ${MAX_CHARACTER_NAME_LENGTH}자</small></span>
            <span class="character-name-input-wrap"><input id="character-name-input" data-character-name="${selectedCharacterId}"
              value="${selectedCustomName}" placeholder="${selectedVisual.displayName}" maxlength="${MAX_CHARACTER_NAME_LENGTH}" inputmode="text"
              autocomplete="off" aria-label="${selectedVisual.displayName} 이름 입력"><button type="button" data-action="finish-name-edit">완료</button></span>
          </label>`
        : `<section class="character-name-display" aria-labelledby="character-name-label">
            <span><b id="character-name-label">이름</b><small>${selectedVisual.displayName} · 최대 ${MAX_CHARACTER_NAME_LENGTH}자</small></span>
            <button data-action="edit-character-name" aria-label="${selectedVisual.displayName} 이름 변경"><strong>${displayName}</strong><i aria-hidden="true">✎</i></button>
          </section>`}
      <section class="difficulty-picker" aria-labelledby="difficulty-title">
        <strong id="difficulty-title">AI 난이도</strong>
        <div role="radiogroup" aria-label="AI 난이도">
          ${(Object.entries(difficultyCopy) as [AiDifficulty, [string, string]][]).map(([value, [label]]) => `<button role="radio" aria-checked="${selectedAiDifficulty === value}" class="${selectedAiDifficulty === value ? 'selected' : ''}" data-difficulty="${value}">${label}${isOfficialRankingEligible(value) ? '<em class="official-ranking-badge">🏆 공식 랭킹</em>' : ''}</button>`).join('')}
        </div>
        <small>${difficultyCopy[selectedAiDifficulty][1]}</small>
      </section>
      <div class="character-settings-actions"><button class="primary" data-action="confirm-character">게임 시작</button><button data-action="choose-another-character">다시 선택</button></div>
    </div>
  </section>` : '';
  const joinDialog = friendJoinFlow === 'closed' ? '' : `<section class="character-settings-backdrop friend-join-backdrop">
    <div class="character-settings-dialog friend-join-dialog" role="dialog" aria-modal="true" aria-labelledby="friend-join-title">
      ${friendJoinFlow === 'choose' ? `<header><p class="eyebrow">NEW FRIEND</p><h2 id="friend-join-title" tabindex="-1">어떤 친구를 만나볼까?</h2><small>이번 합류에는 ${formatPoints(nextJoinCost ?? 0)}가 필요해요.</small></header>
        <div class="friend-candidate-grid">${lockedVisuals.map((visual) => `<button data-join-candidate="${visual.id}" aria-label="${visual.displayName} 친구 선택"><img src="${visual.selectImage}" alt=""><strong>${visual.displayName}</strong></button>`).join('')}</div>
        <button class="friend-join-close" data-action="close-friend-join">다음에 만나기</button>` : ''}
      ${friendJoinFlow === 'confirm' && joinCandidate !== null ? `<header><p class="eyebrow">JOIN TOGETHER</p><h2 id="friend-join-title" tabindex="-1">${joinCandidate.displayName}와 함께할까?</h2></header>
        <img class="friend-join-hero is-confirm" src="${joinCandidate.selectImage}" alt="${joinCandidate.displayName}">
        <div class="friend-join-balance"><span>현재 ${formatPoints(pointBalance)}</span><b>→</b><strong>합류 후 ${formatPoints(pointBalance - (nextJoinCost ?? 0))}</strong></div>
        <p>친구 합류에 <b>${formatPoints(nextJoinCost ?? 0)}</b>를 사용할게요.</p>
        <div class="character-settings-actions"><button class="primary" data-action="confirm-friend-join">함께하기</button><button data-action="choose-friend-again">다시 선택</button></div>` : ''}
      ${friendJoinFlow === 'complete' && joinCandidate !== null ? `<header><p class="eyebrow">WELCOME!</p><h2 id="friend-join-title" tabindex="-1">새 친구가 합류했어요!</h2></header>
        <img class="friend-join-hero is-complete" src="${joinCandidate.selectImage}" alt="${joinCandidate.displayName}">
        <p><b>${joinCandidate.displayName}</b>와 이제 함께 게임할 수 있어요.</p>
        <small>${formatPoints(friendJoinSpent)}를 사용했어요.</small>
        <div class="character-settings-actions"><button class="primary" data-action="name-new-friend">이름 정하기</button><button data-action="play-with-new-friend">이 친구로 플레이</button></div>` : ''}
    </div>
  </section>`;
  return `<main class="character-select character-select-step-one ${characterSelectStep === 'gameSettings' ? 'has-settings-dialog' : ''} screen" style="--select-bg: url('${ART_PATHS.characterSelectBackground}')">
    <header class="select-heading">
      <div><p class="eyebrow">CHOOSE YOUR DOG</p><h1>내 댕댕이 선택!</h1></div>
      <button data-action="home">뒤로</button>
    </header>
    <div class="character-personalization">
      <div class="character-grid" role="radiogroup" aria-label="플레이 캐릭터">
        ${CHARACTER_VISUALS.map((visual) => {
          const checked = visual.id === selectedCharacterId;
          const unlocked = unlockedIds.has(visual.id);
          return `<button class="character-card character-${visual.id} ${checked ? 'selected' : ''} ${unlocked ? '' : 'is-locked'}"
            ${unlocked ? `role="radio" aria-checked="${checked}" data-character="${visual.id}" aria-label="${visual.displayName}, ${checked ? '선택됨, ' : ''}함께하는 친구"` : `disabled aria-disabled="true" aria-label="${visual.displayName}, 아직 함께하지 않은 친구"`}>
            <span class="selection-state">${unlocked ? (checked ? '✓' : '') : '🔒'}</span>
            <span class="select-art-wrap">
              <img class="asset-image select-art" src="${visual.selectImage}" alt="${visual.displayName}">
              <span class="select-fallback" aria-hidden="true">${visual.symbol}</span>
            </span>
            <strong>${characterNames[visual.id] ?? visual.displayName}</strong>
            <span>${visual.personalityText}</span>
          </button>`;
        }).join('')}
      </div>
      <section class="friend-progress-card ${nextJoinCost === null ? 'is-complete' : ''}" aria-label="친구 합류 진행도">
        ${nextJoinCost === null ? `<div><strong>🎉 모든 댕댕이 친구들이 함께하고 있어요!</strong><span>함께하는 친구 ${unlockedIds.size} / ${CHARACTER_VISUALS.length}</span></div>`
          : `<div class="friend-progress-copy"><strong>다음 친구 합류</strong><span>함께하는 친구 ${unlockedIds.size} / ${CHARACTER_VISUALS.length}</span></div>
            <div class="friend-point-progress"><b>${Math.min(pointBalance, nextJoinCost).toLocaleString('ko-KR')} / ${formatPoints(nextJoinCost)}</b>
              <progress max="${nextJoinCost}" value="${Math.min(pointBalance, nextJoinCost)}" aria-label="다음 친구까지 ${nextJoinCost}포인트 중 ${Math.min(pointBalance, nextJoinCost)}포인트"></progress>
              <small id="friend-join-status">${joinReady ? '🎉 새 친구를 만날 준비가 됐어요!' : `다음 친구를 만나려면 ${nextJoinCost - pointBalance}포인트가 더 필요해요.`}</small>
            </div>
            <button class="primary" data-action="open-friend-join" ${joinReady ? '' : 'disabled aria-disabled="true"'} aria-describedby="friend-join-status" aria-label="${joinReady ? '친구 만나기' : `친구 만나기, ${nextJoinCost - pointBalance}포인트가 더 필요함`}">친구 만나기</button>`}
      </section>
    </div>
    <button class="primary select-start" data-action="open-game-settings">이 캐릭터 선택</button>
    ${settingsDialog}
    ${joinDialog}
  </main>`;
}

function rewardCards(rewards: number[], showTutorialRanks = false): string {
  const sortedRewards = [...rewards].sort((a, b) => b - a);
  const accessibleLabel = sortedRewards.map((reward, index) => `${index + 1}등 ${reward}점`).join(', ');
  return `<div class="reward-cards game-rewards ${showTutorialRanks ? 'tutorial-target tutorial-ranked-rewards' : ''}"
    aria-label="${showTutorialRanks ? `순위별 사료 보상, ${accessibleLabel}` : `사료 카드 ${rewards.join(', ')}점`}">
    ${sortedRewards.map((reward, index) => `<span title="${reward}점 사료 카드" ${showTutorialRanks ? 'aria-hidden="true"' : ''}>
      ${showTutorialRanks ? `<small aria-hidden="true">${index + 1}등</small>` : ''}
      <img class="asset-image reward-art" src="${ART_PATHS.reward(reward)}" alt=""><b>${reward}</b>
    </span>`).join('')}
  </div>`;
}

function bowlStatus(face: number): {
  kind: 'empty' | 'leader' | 'tie';
  label: string;
  leaderIds: string[];
} {
  if (state === null) return { kind: 'empty', label: '비어 있음', leaderIds: [] };
  const entries = Object.entries(state.bowls[face - 1]?.placements ?? {})
    .filter(([, count]) => count > 0);
  if (entries.length === 0) return { kind: 'empty', label: '비어 있음', leaderIds: [] };
  const maximum = Math.max(...entries.map(([, count]) => count));
  const leaderIds = entries.filter(([, count]) => count === maximum).map(([playerId]) => playerId);
  return leaderIds.length > 1
    ? { kind: 'tie', label: 'KIBBLE CLASH!', leaderIds }
    : { kind: 'leader', label: '', leaderIds };
}

function bowlTemplate(face: number): string {
  if (state === null) return '';
  const bowl = state.bowls[face - 1];
  if (bowl === undefined) return '';
  const status = bowlStatus(face);
  const tokens = state.players
    .filter((player) => (bowl.placements[player.id] ?? 0) > 0)
    .map((player) => {
      const count = bowl.placements[player.id] ?? 0;
      const isLeader = status.leaderIds.includes(player.id);
      return `<li class="game-token team-${player.id} ${status.kind === 'tie' && isLeader ? 'is-clashing' : ''}"
        title="${player.name} 주사위 ${face}, ${count}개 배치">
        ${dogAvatar(player, 'game-token-avatar')}
        <b>×${count}</b>
        ${status.kind === 'tie' && isLeader ? '<span class="token-status" aria-hidden="true">⚡</span>' : ''}
        <span class="sr-only">${player.name} 토큰 ${count}개${isLeader ? `, ${status.label}` : ''}</span>
      </li>`;
    }).join('');
  const human = state.players.find((player) => player.kind === 'human');
  const tutorialPlacementTarget = sessionMode === 'tutorial'
    && ((tutorialStep === 'select-clash-bowl' && face === TUTORIAL_CLASH_FACE)
      || (tutorialStep === 'select-success-bowl' && face === TUTORIAL_SUCCESS_FACE));
  const tutorialClashTarget = sessionMode === 'tutorial'
    && tutorialStep === 'clash' && face === TUTORIAL_CLASH_FACE;
  const tutorialTarget = tutorialPlacementTarget || tutorialClashTarget;
  const rewardLabel = [...bowl.rewards].sort((left, right) => right - left)
    .map((reward, index) => `${index + 1}등 ${reward}점`).join(', ');
  return `<article class="bowl-card game-bowl status-${status.kind} ${tutorialTarget ? 'tutorial-target' : ''}"
    data-bowl-face="${face}" ${tutorialPlacementTarget ? 'role="button" tabindex="0"' : ''} aria-label="${face}번 밥그릇, 순위별 보상 ${rewardLabel}${tutorialPlacementTarget ? ', 여기에 주사위 놓기' : ''}">
    <div class="game-bowl-top">
      <span class="bowl-number" aria-label="${face}번 밥그릇">${face}</span>
      ${rewardCards(bowl.rewards, sessionMode === 'tutorial' && tutorialStep === 'reward-intro' && face === TUTORIAL_CLASH_FACE)}
      ${status.kind === 'tie' ? `<span class="bowl-status"><b>${status.label}</b></span>` : ''}
    </div>
    <div class="bowl-shape">
      <img class="asset-image bowl-art" src="${ART_PATHS.bowl(face)}" alt="${face}번 밥그릇">
      <ul class="placed-tokens">${tokens}</ul>
      ${human === undefined ? '' : `<div class="pending-placement team-${human.id}" hidden>
        ${dogAvatar(human, 'game-token-avatar')}<b>×<span>0</span></b><small>배치 예정</small>
      </div>`}
    </div>
  </article>`;
}

function dieMarkup(value: number, index = 0, rolling = false): string {
  return `<span class="stage-die${rolling ? ' is-tumbling' : ''}" style="--roll-index:${index}" aria-hidden="true">
    ${pipPositions(value).map((position) => `<i class="pip pip-${position}"></i>`).join('')}
  </span>`;
}

function diceTiles(values: number[]): string {
  return `<div class="rolled-dice" aria-label="주사위 결과 ${values.join(', ')}">
    ${values.map((value, index) => dieMarkup(value, index)).join('')}
  </div>`;
}

function groupedDiceChips(counts: readonly number[], interactive = false, disabled = false): string {
  const chips = counts.flatMap((count, index) => {
    if (count <= 0) return [];
    const face = index + 1;
    const content = `<span class="die-face-icon" aria-hidden="true">${DIE_FACES[index]}</span><b aria-hidden="true">×${count}</b>`;
    const selected = selectedRollFace === face;
    const tutorialExpected = tutorialStep === 'select-clash-dice' ? TUTORIAL_CLASH_FACE
      : tutorialStep === 'select-success-dice' ? TUTORIAL_SUCCESS_FACE : null;
    const choiceDisabled = disabled || (sessionMode === 'tutorial' && tutorialExpected !== null && face !== tutorialExpected);
    return [interactive
      ? `<button class="die-choice ${selected ? 'is-selected' : ''} ${tutorialExpected === face ? 'tutorial-target' : ''}" data-face="${face}" aria-label="주사위 ${face}, ${count}개" aria-pressed="${selected}" ${choiceDisabled ? 'disabled' : ''}>${content}<span class="selection-check" aria-hidden="true">✓</span></button>`
      : `<span class="roll-result-chip" aria-label="주사위 ${face}, ${count}개">${content}</span>`];
  });
  return `<div class="grouped-dice-results">${chips.join('')}</div>`;
}

function rollingDiceTiles(): string {
  const values = [3, 6, 2];
  return `<div class="rolled-dice is-rolling" aria-label="주사위를 굴리는 중">
    ${values.map((value, index) => dieMarkup(value, index, true)).join('')}
  </div>`;
}

function idleDiceTiles(): string {
  return `<div class="rolled-dice is-idle" aria-hidden="true">${[2, 5, 3].map((value, index) => dieMarkup(value, index)).join('')}</div>`;
}

function rollOverlay(): string {
  if (state === null || (turnPhase !== 'roll-ready' && turnPhase !== 'rolling')) return '';
  const isResult = turnPhase === 'rolling' && rollPresentation !== 'rolling';
  const isGrouped = turnPhase === 'rolling' && rollPresentation === 'grouped';
  const dice = turnPhase === 'roll-ready'
    ? idleDiceTiles()
    : isResult
      ? isGrouped
        ? groupedDiceChips(state.currentRoll.counts)
        : diceTiles(state.currentRoll.values)
      : rollingDiceTiles();
  return `<section class="turn-roll-overlay ${turnPhase === 'rolling' ? 'is-active' : 'is-ready'} ${isResult ? 'is-result' : ''} ${isGrouped ? 'is-grouped' : ''}"
    aria-live="assertive" ${rollPresentation === 'rolling' && turnPhase === 'rolling' ? 'aria-busy="true"' : ''}>
    <div class="turn-roll-card team-${state.players[state.currentPlayerIndex]?.id ?? ''}">
      <p class="eyebrow">${isResult ? 'ROLL RESULT' : 'YOUR TURN'}</p>
      <h2>${isResult ? '주사위 결과 확정!' : turnPhase === 'rolling' ? '데구르르…' : '내 차례예요!'}</h2>
      <div class="overlay-dice-window">${dice}</div>
      ${turnPhase === 'roll-ready'
        ? `<button class="primary roll-button overlay-roll-button ${sessionMode === 'tutorial' ? 'tutorial-target' : ''}" data-action="roll-dice"><b>ROLL</b><span>주사위 굴리기</span></button>`
        : `<small>${isResult ? '이제 놓을 숫자를 선택하세요.' : '주사위를 굴리고 있어요.'}</small>`}
    </div>
  </section>`;
}

function gameTemplate(): string {
  if (state === null) return '';
  const current = state.players[state.currentPlayerIndex];
  const humanPanel = turnPhase === 'roll-ready'
    ? `<section class="dice-tray game-dice-tray dice-stage is-overlay-waiting" aria-hidden="true">
      <div class="roll-prompt"><p class="eyebrow">DICE YARD</p><h2>턴 시작 준비</h2></div>
    </section>`
    : turnPhase === 'rolling'
      ? `<section class="dice-tray game-dice-tray dice-stage is-overlay-waiting" aria-hidden="true">
        <div class="roll-prompt"><p class="eyebrow">DICE YARD</p><h2>주사위 연출 중</h2></div>
      </section>`
      : turnPhase === 'resolving'
        ? `<section class="dice-tray game-dice-tray dice-stage is-resolving" aria-live="polite" aria-busy="true">
          <div class="roll-prompt"><p class="eyebrow">PLACEMENT</p><h2>밥그릇에 놓는 중…</h2><small>선택 결과를 반영하고 있어요.</small></div>
          <div class="choice-buttons">${groupedDiceChips(state.currentRoll.counts, true, true)}</div>
        </section>`
        : `<section class="dice-tray game-dice-tray dice-stage has-result" aria-label="현재 주사위 결과">
      <div class="roll-summary"><div><p class="eyebrow">ROLL RESULT</p><h2>놓을 숫자를 고르세요</h2></div></div>
      <div class="choice-buttons">
        ${groupedDiceChips(state.currentRoll.counts, true)}
      </div>
    </section>`;
  const diceActionPanel = current?.kind === 'human'
    ? humanPanel
    : `<section class="dice-tray game-dice-tray dice-stage is-waiting" aria-live="polite" aria-label="${current?.name ?? '다른 플레이어'} 차례">
      <div class="dice-stage-window is-disabled">${idleDiceTiles()}</div>
      ${current === undefined ? '' : dogAvatar(current, 'waiting-turn-avatar')}
      <div><p class="eyebrow">OTHER PLAYER'S TURN</p><h2>차례를 기다리는 중…</h2><small>${current?.name ?? ''}의 선택이 진행되고 있어요.</small></div>
    </section>`;
  return `<main class="game game-v3 screen ${sessionMode === 'tutorial' ? 'is-tutorial' : ''}">
    <header class="game-header game-v3-header">
      ${sessionMode === 'tutorial' ? '<button class="tutorial-exit" data-action="exit-tutorial" aria-label="튜토리얼 나가기">나가기</button>' : ''}
      <div class="round-pill"><span>ROUND</span><strong>${state.round}</strong><small>/ ${activeGameConfig.rounds}</small></div>
      <div class="turn-banner team-${current?.id ?? ''}" aria-live="polite">
        ${current === undefined ? '' : dogAvatar(current, 'game-turn-avatar')}<span>지금 차례</span><strong>${current?.name ?? ''}</strong>
      </div>
    </header>
    <section class="yard-board game-yard-board" style="--game-bg: url('${ART_PATHS.gameBackground}')">
      <aside class="game-player-hud" aria-label="플레이어 점수">
        <p>SCORE</p>
        <ul>${state.players.map(gamePlayerChip).join('')}</ul>
      </aside>
      <section class="bowls" aria-label="밥그릇 배치 현황">${Array.from({ length: 6 }, (_, index) => bowlTemplate(index + 1)).join('')}</section>
    </section>
    ${diceActionPanel}
    ${rollOverlay()}
    ${roundIntermissionOverlay()}
    ${tutorialOverlay()}
  </main>`;
}

function roundIntermissionOverlay(): string {
  if (state === null || roundIntermissionRound !== state.round) return '';
  const isFirstRound = state.round === 1;
  const isFinalRound = state.round === activeGameConfig.rounds;
  const accessibleLabel = isFinalRound
    ? `마지막 라운드, 총 ${activeGameConfig.rounds}라운드 중 ${state.round}라운드`
    : `${state.round}라운드, 총 ${activeGameConfig.rounds}라운드`;
  return `<aside class="round-intermission ${isFinalRound ? 'is-final' : ''}" style="--round-intermission-duration: ${roundIntermissionDuration(state.round)}ms"
    role="status" aria-live="assertive" aria-atomic="true" aria-label="${accessibleLabel}">
    <div class="round-intermission-card" aria-hidden="true">
      <span>${isFinalRound ? 'FINAL ROUND' : 'ROUND'}</span>
      <strong>${state.round} <small>/ ${activeGameConfig.rounds}</small></strong>
      ${isFirstRound ? `<p>${activeGameConfig.rounds}라운드가 끝나면<br>최종 승자가 결정돼요!</p>` : ''}
    </div>
  </aside>`;
}

function tutorialOverlay(): string {
  if (sessionMode !== 'tutorial' || tutorialStep === null) return '';
  const copy: Record<TutorialStep, [string, string]> = {
    'game-goal': ['1/6', '사료를 가장 많이 모은 강아지가 승리해요!'],
    'reward-intro': ['2/6', '높은 숫자부터 준비된 순위 보상을 받아요. 꼭 1등이 아니어도 점수를 받을 수 있어요!'],
    'roll-clash': ['3/6', '직접 숫자를 골라볼까요?'],
    'select-clash-dice': ['3/6', '⚀ ×2를 골라봐요.'],
    'select-clash-bowl': ['3/6', '강조된 1번 밥그릇에 놓아봐요!'],
    clash: ['4/6', '같은 숫자가 만나면 CLASH! 충돌한 주사위는 제외되고, 남은 주사위 중 높은 숫자부터 순위 보상을 받아요.'],
    'roll-success': ['5/6', '이번엔 같은 수량을 피해볼까요?'],
    'select-success-dice': ['5/6', '⚂ ×1을 골라봐요!'],
    'select-success-bowl': ['5/6', '3번 밥그릇에 놓아봐요!'],
    success: ['5/6', '좋아요! 이제 결과를 확인해볼까요?'],
    'round-result': ['6/6', '높은 숫자뿐 아니라 CLASH를 피하는 것도 중요해요!'],
    complete: ['완료', '준비 완료! 이제 밥그릇을 차지하러 가볼까?'],
  };
  const [progress, message] = copy[tutorialStep];
  const spotlightVisible = tutorialStep === 'reward-intro'
    || tutorialStep === 'roll-clash'
    || tutorialStep === 'select-clash-dice'
    || tutorialStep === 'select-clash-bowl'
    || tutorialStep === 'clash'
    || tutorialStep === 'roll-success'
    || tutorialStep === 'select-success-dice'
    || tutorialStep === 'select-success-bowl';
  const action = tutorialStep === 'game-goal'
    ? '<button class="primary" data-action="tutorial-show-rewards">다음</button>'
    : tutorialStep === 'reward-intro'
      ? '<button class="primary" data-action="tutorial-start-practice">직접 해보기</button>'
      : tutorialStep === 'clash'
        ? '<button class="primary" data-action="tutorial-after-clash">다음</button>'
    : tutorialStep === 'success'
      ? '<button class="primary" data-action="tutorial-show-result">결과 보기</button>'
      : tutorialStep === 'round-result'
        ? '<button class="primary" data-action="complete-tutorial">튜토리얼 완료</button>'
        : tutorialStep === 'complete'
          ? '<div class="tutorial-complete-actions"><button class="primary" data-action="tutorial-choose-character">강아지 선택</button><button data-action="tutorial-home">홈으로</button></div>'
          : '';
  const reward = tutorialStep === 'complete' && tutorialRewardEarned > 0
    ? `<div class="tutorial-reward"><span>튜토리얼 완료 보상</span><strong>+${formatPoints(tutorialRewardEarned)}</strong></div>` : '';
  const confirm = tutorialExitConfirm ? `<div class="tutorial-exit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tutorial-exit-title">
    <h2 id="tutorial-exit-title">튜토리얼을 그만볼까요?</h2><p>언제든 게임 방법에서 다시 볼 수 있어요.</p>
    <div><button data-action="continue-tutorial">계속하기</button><button data-action="confirm-exit-tutorial">나가기</button></div>
  </div>` : '';
  const coachContent = tutorialStep === 'complete'
    ? `<div class="tutorial-complete-copy"><small>🎉</small><h2>튜토리얼 완료!</h2><p>이제 원하는 강아지를 골라<br>진짜 게임을 시작해볼까요?</p></div>${reward}${action}`
    : `<small>튜토리얼 ${progress}</small><strong>${message}</strong>${reward}${action}`;
  return `<aside class="tutorial-guide step-${tutorialStep}" role="region" aria-live="polite" aria-label="튜토리얼 ${progress}">
    ${spotlightVisible ? '<span class="tutorial-spotlight" aria-hidden="true"></span>' : ''}
    <div class="tutorial-coach" tabindex="-1">${coachContent}</div>
    ${confirm}
  </aside>`;
}

function positionTutorialSpotlight(): void {
  const spotlight = app.querySelector<HTMLElement>('.tutorial-spotlight');
  const target = app.querySelector<HTMLElement>('.tutorial-target');
  if (spotlight === null || target === null) return;
  const rect = target.getBoundingClientRect();
  const padding = target.classList.contains('tutorial-ranked-rewards') ? 14 : 7;
  const isRollButtonTarget = target.matches('.roll-button, .overlay-roll-button');
  const spotlightOffsetY = isRollButtonTarget ? 4 : 0;
  spotlight.style.left = `${rect.left - padding}px`;
  spotlight.style.top = `${rect.top - padding - spotlightOffsetY}px`;
  spotlight.style.width = `${rect.width + padding * 2}px`;
  spotlight.style.height = `${rect.height + padding * 2}px`;
  spotlight.style.borderRadius = isRollButtonTarget
    ? '999px'
    : `${Math.min(24, Math.max(12, rect.height / 4))}px`;
  spotlight.classList.add('is-positioned');

  const coach = app.querySelector<HTMLElement>('.tutorial-coach');
  if (coach === null) return;
  const coachRect = coach.getBoundingClientRect();
  const viewportPadding = 12;
  const safeTop = Math.max(viewportPadding, gameSafeArea.top + viewportPadding);
  const safeBottom = Math.max(viewportPadding, gameSafeArea.bottom + viewportPadding);
  const gap = 14;
  const spaceAbove = rect.top - safeTop;
  const placeAbove = spaceAbove >= coachRect.height + gap;
  const desiredTop = placeAbove ? rect.top - coachRect.height - gap : rect.bottom + gap;
  const maximumTop = window.innerHeight - safeBottom - coachRect.height;
  const top = Math.max(safeTop, Math.min(desiredTop, maximumTop));
  const desiredLeft = rect.left + rect.width / 2 - coachRect.width / 2;
  const left = Math.max(viewportPadding, Math.min(desiredLeft, window.innerWidth - viewportPadding - coachRect.width));
  coach.style.inset = `${top}px auto auto ${left}px`;
  coach.style.translate = '0 0';
  coach.dataset.placement = placeAbove ? 'above' : 'below';
}

function settlementRow(result: BowlSettlement): string {
  const clashedPlayers = result.clashedPlayerIds.map(playerById);
  const clashNames = clashedPlayers.length <= 2
    ? clashedPlayers.map((player) => player.name).join(' · ')
    : `${clashedPlayers[0]?.name ?? ''} 외 ${clashedPlayers.length - 1}마리`;
  const clashes = result.clashedPlayerIds.length === 0
    ? '<span class="no-clash">충돌 없음</span>'
    : `<div class="clash-result-summary" aria-label="${clashedPlayers.map((player) => player.name).join(', ')} 충돌">
      <div class="clash-result-avatars">${clashedPlayers.map((player) => dogAvatar(player, 'result-token')).join('')}</div>
      <strong title="${clashedPlayers.map((player) => player.name).join(' · ')}">${clashNames}</strong>
    </div>`;
  const awards = result.awards.length === 0
    ? '<span class="no-award">획득자 없음</span>'
    : result.awards.map((award) => {
      const player = playerById(award.playerId);
      return `<strong class="award-character">${dogAvatar(player, 'result-token')}<span>${player.name}<b>+${award.reward}</b></span></strong>`;
    }).join('');
  return `<li class="${result.clashedPlayerIds.length > 0 ? 'clashed-result' : ''}">
    <div class="result-bowl-label"><span>${result.face}</span><b>${result.face}번 밥그릇</b>${result.clashedPlayerIds.length > 0 ? '<em>⚡ 충돌</em>' : ''}</div>
    <div class="clash-list">${clashes}</div>
    <div class="award-list">${awards}</div>
  </li>`;
}

function clashOverlay(): string {
  const settlement = state?.lastRoundSettlement;
  if (settlement === null || settlement === undefined || skipClashPresentation) return '';
  const clashedIds = [...new Set(settlement.bowls.flatMap((result) => result.clashedPlayerIds))];
  if (clashedIds.length === 0) return '';
  return `<section class="clash-overlay ${reduceMotion ? 'reduced' : ''}" aria-label="충돌 결과 연출">
    <div class="clash-burst" aria-hidden="true"><img class="asset-image clash-art" src="${ART_PATHS.clash}" alt=""></div>
    <div class="clash-dogs">${clashedIds.map((id) => dogAvatar(playerById(id), 'clash-dog')).join('')}</div>
    <p><strong>동률은 모두 보상에서 제외됩니다.</strong><br>${clashedIds.map((id) => playerById(id).name).join(', ')} 충돌!</p>
    <div class="overlay-actions"><button data-action="skip-clash">결과표 보기</button></div>
  </section>`;
}

function roundResultTemplate(): string {
  if (state?.lastRoundSettlement === null || state?.lastRoundSettlement === undefined) return '';
  const hasClash = state.lastRoundSettlement.bowls.some((result) => result.clashedPlayerIds.length > 0);
  const roundRewards = new Map<string, number>();
  state.lastRoundSettlement.bowls.forEach((bowl) => bowl.awards.forEach((award) => {
    roundRewards.set(award.playerId, (roundRewards.get(award.playerId) ?? 0) + award.reward);
  }));
  const highestRoundReward = Math.max(...state.players.map((player) => roundRewards.get(player.id) ?? 0));
  const roundStars = state.players.filter((player) => (roundRewards.get(player.id) ?? 0) === highestRoundReward);
  const roundStar = roundStars[0];
  const human = state.players.find((player) => player.kind === 'human');
  const roundStarNames = roundStars.map((player) => player.name).join(' · ');
  return `<main class="result round-result screen paper-panel">
    ${clashOverlay()}
    <header class="round-result-heading">
      <div><p class="eyebrow">ROUND ${state.round} COMPLETE</p><h1>${hasClash ? '치열했던 한 판!' : '사료 획득 완료!'}</h1>
        <p>${hasClash ? '동률 강아지는 보상에서 제외됐어요.' : '가장 많이 놓은 강아지부터 사료를 챙겼어요.'}</p></div>
      ${human === undefined ? '' : `<div class="human-round-score team-${human.id}">${dogAvatar(human, 'human-result-avatar')}<span>내 라운드 획득<strong>+${roundRewards.get(human.id) ?? 0}<small>점</small></strong></span></div>`}
    </header>
    <section class="round-result-body">
      <div class="round-star team-${roundStar?.id ?? ''}">
        <span class="star-crown">♛</span>
        <div class="round-star-arts" aria-hidden="true">${roundStars.map((player) => `<img class="asset-image round-star-art" src="${characterVisual(player.characterId).selectImage}" alt="">`).join('')}</div>
        <div><small>이번 라운드 ${roundStars.length > 1 ? '공동 사료왕' : '사료왕'}</small><h2>${roundStarNames}</h2><strong>+${highestRoundReward}점</strong></div>
      </div>
      <ul class="settlement-list">${state.lastRoundSettlement.bowls.map(settlementRow).join('')}</ul>
    </section>
    ${sessionMode === 'tutorial' ? tutorialOverlay() : `<button class="primary next-round-action" data-action="continue">${state.round === activeGameConfig.rounds ? '최종 결과 보기' : `다음 라운드 · ROUND ${state.round + 1}`}</button>`}
  </main>`;
}

function leaderboardStatusCopy(score: number): string {
  const formattedScore = score.toLocaleString('ko-KR');
  if (leaderboardOpenFailed) return '순위를 열지 못했어요. 잠시 후 다시 시도해 주세요';
  if (leaderboardSubmissionStatus === 'submitting') return `${formattedScore}점을 리더보드에 기록하고 있어요`;
  if (leaderboardSubmissionStatus === 'submitted') return `${formattedScore}점이 리더보드에 등록됐어요`;
  if (leaderboardSubmissionStatus === 'failed') return '점수 기록에 실패했어요. 잠시 후 다시 시도해 주세요';
  if (leaderboardSubmissionStatus === 'unsupported') return '현재 환경에서는 순위 기능을 사용할 수 없어요';
  if (leaderboardSubmissionStatus === 'ineligible') return '공식 랭킹은 어려움 난이도에서 참여할 수 있어요';
  return '최종 결과를 확인하고 있어요';
}

function matchResultTemplate(): string {
  if (state === null) return '';
  const viewModel = createMatchResultViewModel(state.players);
  const winner = playerById(viewModel.winner.playerId);
  const heading = viewModel.humanResult.isWinner ? '승리! 오늘의 사료왕' : '이번 판의 사료왕';
  const description = viewModel.humanResult.isWinner
    ? '최고의 밥그릇 사냥꾼이 되었어요!'
    : `${viewModel.winner.displayName}가 가장 많은 사료를 모았어요!`;
  const recommendation = getDifficultyRecommendation({ difficulty: activeGameConfig.ai.difficulty, playerRank: viewModel.humanResult.rank, isWinner: viewModel.humanResult.isWinner });
  const recommendationMarkup = recommendation.visible ? `<section class="difficulty-recommendation">
    <div><strong>${recommendation.title}</strong><p>${recommendation.description}</p></div>
  </section>` : '';
  const difficultyCopy: Record<AiDifficulty, [string, string]> = {
    easy: ['쉬움', '가볍게 즐기기 좋아요.'],
    normal: ['보통', '보상과 경쟁 상황을 고려해 플레이해요.'],
    hard: ['어려움', '전략적인 AI · 공식 랭킹 참여'],
  };
  const officialRankingEligible = isOfficialRankingEligible(activeGameConfig.ai.difficulty);
  const difficultyDialog = difficultyDialogOpen ? `<section class="difficulty-dialog-backdrop">
    <div class="difficulty-dialog" role="dialog" aria-modal="true" aria-labelledby="result-difficulty-title">
      <h2 id="result-difficulty-title">AI 난이도</h2>
      <div class="difficulty-dialog-options" role="radiogroup">
        ${(Object.entries(difficultyCopy) as [AiDifficulty, [string, string]][]).map(([value, [label, copy]]) => `<button role="radio" aria-checked="${pendingAiDifficulty === value}" class="${pendingAiDifficulty === value ? 'selected' : ''}" data-result-difficulty="${value}"><strong>${label}</strong><small>${copy}</small>${recommendation.recommendedDifficulty === value ? '<em>추천</em>' : ''}</button>`).join('')}
      </div>
      <div class="difficulty-dialog-actions"><button data-action="close-difficulty-dialog">취소</button><button class="primary" data-action="restart-with-difficulty">이 난이도로 한 판 더</button></div>
    </div>
  </section>` : '';
  return `<main class="result match-result screen paper-panel">
    <header class="match-heading" tabindex="-1"><p class="eyebrow">MATCH COMPLETE · ${activeGameConfig.rounds}라운드 최종 결과</p><h1>${heading}</h1><p>${description}</p><span class="result-difficulty-badge">난이도 · ${difficultyCopy[activeGameConfig.ai.difficulty][0]}${officialRankingEligible ? ' 🏆 공식 랭킹' : ''}</span></header>
    <section class="match-result-content">
      <section class="winner-stage team-${winner.id}" aria-label="우승자 ${viewModel.winner.displayName}, ${viewModel.winner.score}점">
        <div class="winner-confetti" aria-hidden="true">✦　●　✦<br>　●　✦　</div>
        <span class="winner-crown" aria-hidden="true">♛</span>
        <img class="asset-image winner-hero-art" src="${viewModel.winner.winnerImagePath}" data-fallback-src="${viewModel.winner.imagePath}" alt="${viewModel.winner.displayName} 우승 이미지">
      </section>
      <section class="match-result-details">
        <div class="winner-copy">
          <span>최종 1위</span>
          <h2>${viewModel.winner.displayName}</h2>
          <strong><b>${viewModel.winner.score.toLocaleString('ko-KR')}</b><small>점</small></strong>
          <em>칭호 · ${viewModel.winner.title}</em>
        </div>
        <section class="final-ranking" aria-labelledby="final-ranking-title">
          <div class="final-ranking-heading">
            <h3 id="final-ranking-title">이번 게임 결과</h3>
            <section class="match-point-reward" aria-label="이번 게임 보상 ${currentGameReward} 포인트" aria-live="polite">
              <span>이번 게임 보상</span><strong>+${formatPoints(currentGameReward)}</strong><small>획득!</small>
            </section>
          </div>
          <ol>
            ${viewModel.rankings.map((entry) => {
              const player = playerById(entry.playerId);
              return `<li class="team-${player.id} ${entry.isHuman ? 'is-human' : ''}" aria-label="${entry.rank}위, ${entry.displayName}, ${entry.score}점${entry.isHuman ? ', 내 캐릭터' : ''}">
                <span class="rank">${entry.rank}위${entry.rank === 1 ? '<i aria-hidden="true">♛</i>' : ''}</span>
                ${dogAvatar(player, 'ranking-avatar')}
                <span class="ranking-name"><strong>${entry.displayName}</strong><small>${entry.title}</small></span>
                ${entry.isHuman ? '<b class="me-badge">나</b>' : ''}
                <strong class="ranking-score">${entry.score.toLocaleString('ko-KR')}<small>점</small></strong>
              </li>`;
            }).join('')}
          </ol>
        </section>
        <section class="leaderboard-score-card is-${leaderboardSubmissionStatus}" aria-live="polite">
          <div><span>GAME CENTER</span><strong>${leaderboardStatusCopy(leaderboardScore ?? viewModel.humanResult.score)}</strong></div>
          ${officialRankingEligible ? `<button data-action="open-leaderboard" ${leaderboardSubmissionStatus === 'unsupported' ? 'disabled' : ''}>리더보드 보기 →</button>` : ''}
        </section>
      </section>
    </section>
    ${recommendationMarkup}
    <div class="result-actions"><button class="primary" data-action="restart">다시 하기</button><button class="difficulty-action" data-action="open-difficulty-dialog">난이도 변경</button><button class="tertiary-action" data-action="change-character">강아지 바꾸기</button><button class="tertiary-action" data-action="home">홈으로</button></div>
    ${difficultyDialog}
  </main>`;
}

function render(): void {
  if (screen === 'home') app.innerHTML = homeTemplate();
  else if (screen === 'rules') app.innerHTML = rulesTemplate();
  else if (screen === 'character-select') app.innerHTML = characterSelectTemplate();
  else if (state?.phase === 'round-result' && !(sessionMode === 'tutorial' && tutorialStep === 'success')) app.innerHTML = roundResultTemplate();
  else if (state?.phase === 'match-result') app.innerHTML = matchResultTemplate();
  else app.innerHTML = gameTemplate();
  applySafeArea();
  scheduleAiTurn();
  if (sessionMode === 'tutorial') window.requestAnimationFrame(positionTutorialSpotlight);
}

function resetLeaderboardSubmission(): void {
  leaderboardSubmissionStatus = 'idle';
  leaderboardScore = null;
  leaderboardSubmittedSession = null;
  leaderboardOpenFailed = false;
}

async function handleOpenLeaderboard(): Promise<void> {
  if (!isOfficialRankingEligible(activeGameConfig.ai.difficulty)) {
    leaderboardSubmissionStatus = 'ineligible';
    render();
    return;
  }
  const result = await openLeaderboard();
  if (result === 'opened') return;
  if (result === 'unsupported') leaderboardSubmissionStatus = 'unsupported';
  else leaderboardOpenFailed = true;
  render();
}

function enterMatchResult(gameState: GameState, submitScore = true): void {
  if (gameState.phase !== 'match-result') return;
  if (sessionMode === 'tutorial') { render(); return; }
  playMatchResultSound(gameState);
  if (submitScore && gameSessionId !== null) {
    const rank = createMatchResultViewModel(gameState.players).humanResult.rank;
    const reward = gamePointReward(rank);
    const rewardResult = claimGameReward(gameSessionId, rank, reward);
    if (rewardResult.success) currentGameReward = rewardResult.amount;
  }
  leaderboardScore = leaderboardScoreFromPlayers(gameState.players);

  if (!submitScore || !isOfficialRankingEligible(activeGameConfig.ai.difficulty) || !isGameCenterSupported()) {
    leaderboardSubmissionStatus = !isOfficialRankingEligible(activeGameConfig.ai.difficulty) ? 'ineligible' : 'unsupported';
    render();
    return;
  }
  if (leaderboardSubmittedSession === sessionVersion) {
    render();
    return;
  }

  // Lock before awaiting so rerenders and repeated result-entry events cannot resubmit this match.
  leaderboardSubmittedSession = sessionVersion;
  leaderboardSubmissionStatus = 'submitting';
  render();
  const submittedSession = sessionVersion;
  void submitLeaderboardScore(leaderboardScore).then((result) => {
    if (submittedSession !== sessionVersion || state?.phase !== 'match-result'
      || !isOfficialRankingEligible(activeGameConfig.ai.difficulty)) return;
    if (result === 'submitted') leaderboardSubmissionStatus = 'submitted';
    else if (result === 'unsupported') leaderboardSubmissionStatus = 'unsupported';
    else leaderboardSubmissionStatus = 'failed';
    render();
  });
}

function startGame(): void {
  cancelTurnTimers();
  sessionVersion += 1;
  sessionMode = 'normal';
  tutorialStep = null;
  tutorialExitConfirm = false;
  gameSessionId = createGameSessionId();
  currentGameReward = 0;
  resetLeaderboardSubmission();
  activeGameConfig = createGameConfigForCharacter(selectedCharacterId, characterNames);
  activeGameConfig.ai.difficulty = selectedAiDifficulty;
  activeGameConfig.ai.debug = aiDebugEnabled;
  state = createGame(activeGameConfig, nextSeed);
  turnPhase = initialTurnPhase(state.players[state.currentPlayerIndex]?.kind);
  nextSeed += 1;
  skipClashPresentation = false;
  difficultyDialogOpen = false;
  screen = 'game';
  startRoundIntermission();
}

function startTutorial(): void {
  cancelTurnTimers();
  sessionVersion += 1;
  resetLeaderboardSubmission();
  sessionMode = 'tutorial';
  tutorialStep = 'game-goal';
  tutorialIntroOpen = false;
  tutorialExitConfirm = false;
  tutorialRewardEarned = 0;
  gameSessionId = null;
  currentGameReward = 0;
  activeGameConfig = createTutorialConfig(createGameConfigForCharacter(selectedCharacterId, characterNames));
  state = createTutorialGame(activeGameConfig, nextSeed);
  nextSeed += 1;
  turnPhase = 'waiting';
  skipClashPresentation = true;
  screen = 'game';
  render();
  window.requestAnimationFrame(() => app.querySelector<HTMLElement>('.tutorial-coach')?.focus());
}

function leaveCompletedTutorial(destination: 'home' | 'character-select'): void {
  cancelTurnTimers();
  sessionVersion += 1;
  sessionMode = 'normal';
  tutorialStep = null;
  tutorialExitConfirm = false;
  tutorialRewardEarned = 0;
  gameSessionId = null;
  state = null;
  characterSelectStep = 'character';
  isEditingCharacterName = false;
  screen = destination;
  render();
  window.requestAnimationFrame(() => {
    const selector = destination === 'character-select' ? '[data-character]' : '[data-action="select-character"]';
    app.querySelector<HTMLElement>(selector)?.focus();
  });
}

function previewMatchResult(): void {
  cancelTurnTimers();
  sessionVersion += 1;
  sessionMode = 'normal';
  tutorialStep = null;
  gameSessionId = null;
  currentGameReward = 0;
  resetLeaderboardSubmission();
  activeGameConfig = createGameConfigForCharacter(selectedCharacterId, characterNames);
  activeGameConfig.ai.difficulty = selectedAiDifficulty;
  activeGameConfig.ai.debug = aiDebugEnabled;
  let previewState = createGame(activeGameConfig, nextSeed);
  nextSeed += 1;
  let safety = 0;

  while (previewState.phase !== 'match-result' && safety < 200) {
    if (previewState.phase === 'round-result') {
      previewState = continueAfterRound(previewState, activeGameConfig);
    } else {
      const face = availableFaces(previewState.currentRoll)[0];
      if (face === undefined) break;
      previewState = chooseFace(previewState, activeGameConfig, face).state;
    }
    safety += 1;
  }

  state = previewState;
  skipClashPresentation = true;
  screen = 'game';
  enterMatchResult(previewState, false);
}

function playMatchResultSound(gameState: GameState): void {
  if (gameState.phase !== 'match-result') return;
  const result = createMatchResultViewModel(gameState.players);
  playSound(result.humanResult.isWinner ? 'victory' : 'defeat');
}

function cancelAiTurn(): void {
  if (aiTurnTimer !== null) {
    window.clearTimeout(aiTurnTimer);
    aiTurnTimer = null;
  }
}

function cancelTurnTimers(): void {
  cancelAiTurn();
  if (turnTimer !== null) {
    window.clearTimeout(turnTimer);
    turnTimer = null;
  }
  if (roundIntermissionTimer !== null) {
    window.clearTimeout(roundIntermissionTimer);
    roundIntermissionTimer = null;
  }
  roundIntermissionRound = null;
}

function syncTurnPhase(): void {
  turnPhase = initialTurnPhase(state?.players[state.currentPlayerIndex]?.kind);
}

function roundIntermissionDuration(round: number): number {
  return round === 1 || round === activeGameConfig.rounds ? 1_400 : 1_050;
}

function startRoundIntermission(): void {
  if (state === null || sessionMode === 'tutorial') { render(); return; }
  if (roundIntermissionTimer !== null) window.clearTimeout(roundIntermissionTimer);
  cancelAiTurn();
  turnPhase = 'waiting';
  roundIntermissionRound = state.round;
  const scheduledRound = state.round;
  const scheduledVersion = sessionVersion;
  const duration = roundIntermissionDuration(scheduledRound);
  render();
  roundIntermissionTimer = window.setTimeout(() => {
    roundIntermissionTimer = null;
    if (scheduledVersion !== sessionVersion || state?.round !== scheduledRound) return;
    roundIntermissionRound = null;
    syncTurnPhase();
    render();
  }, duration);
}

function beginRoll(): void {
  if (state === null || !canRoll(turnPhase)) return;
  const current = state.players[state.currentPlayerIndex];
  if (current?.kind !== 'human') return;
  if (sessionMode === 'tutorial' && tutorialStep !== 'roll-clash' && tutorialStep !== 'roll-success') return;
  turnPhase = 'rolling';
  selectedRollFace = null;
  rollPresentation = 'rolling';
  playSound('dice-roll');
  render();
  const scheduledVersion = sessionVersion;
  turnTimer = window.setTimeout(() => {
    if (scheduledVersion !== sessionVersion || state?.players[state.currentPlayerIndex]?.kind !== 'human') return;
    rollPresentation = 'result-shown';
    playSound('dice-land');
    render();
    turnTimer = window.setTimeout(() => {
      if (scheduledVersion !== sessionVersion || state?.players[state.currentPlayerIndex]?.kind !== 'human') return;
      rollPresentation = 'grouped';
      render();
      turnTimer = window.setTimeout(() => {
        turnTimer = null;
        if (scheduledVersion !== sessionVersion || state?.players[state.currentPlayerIndex]?.kind !== 'human') return;
        turnPhase = 'selecting';
        if (sessionMode === 'tutorial') {
          tutorialStep = tutorialStep === 'roll-clash' ? 'select-clash-dice' : 'select-success-dice';
        }
        render();
        if (sessionMode === 'tutorial') {
          window.requestAnimationFrame(() => app.querySelector<HTMLElement>('.die-choice.tutorial-target')?.focus());
        }
      }, GROUPED_RESULT_DURATION_MS);
    }, RESULT_SHOWN_DURATION_MS);
  }, reduceMotion ? 140 : 740);
}

function resolveHumanChoice(face: number): void {
  if (state === null || !canSelectBowl(turnPhase)) return;
  const current = state.players[state.currentPlayerIndex];
  if (current?.kind !== 'human') return;
  selectedRollFace = face;
  playSound('select-dice');
  turnPhase = 'resolving';
  render();
  const scheduledVersion = sessionVersion;
  turnTimer = window.setTimeout(() => {
    turnTimer = null;
    if (scheduledVersion !== sessionVersion || state === null) return;
    state = chooseFace(state, activeGameConfig, face).state;
    playSound('place-dice');
    playRoundResultSounds(state);
    selectedRollFace = null;
    skipClashPresentation = reduceMotion;
    syncTurnPhase();
    render();
  }, reduceMotion ? 80 : 360);
}

function chooseTutorialDice(face: number): void {
  if (turnPhase !== 'selecting') return;
  const expected = tutorialStep === 'select-clash-dice' ? TUTORIAL_CLASH_FACE
    : tutorialStep === 'select-success-dice' ? TUTORIAL_SUCCESS_FACE : null;
  if (face !== expected) return;
  selectedRollFace = face;
  tutorialStep = face === TUTORIAL_CLASH_FACE ? 'select-clash-bowl' : 'select-success-bowl';
  playSound('select-dice');
  render();
  window.requestAnimationFrame(() => app.querySelector<HTMLElement>(`[data-bowl-face="${face}"]`)?.focus());
}

function placeTutorialBowl(face: number): void {
  if (state === null || selectedRollFace !== face) return;
  const expected = tutorialStep === 'select-clash-bowl' ? TUTORIAL_CLASH_FACE
    : tutorialStep === 'select-success-bowl' ? TUTORIAL_SUCCESS_FACE : null;
  if (face !== expected) return;
  turnPhase = 'resolving';
  render();
  const scheduledVersion = sessionVersion;
  turnTimer = window.setTimeout(() => {
    turnTimer = null;
    if (scheduledVersion !== sessionVersion || state === null) return;
    state = placeTutorialHumanDice(state, activeGameConfig, face);
    playSound('place-dice');
    if (face === TUTORIAL_CLASH_FACE) {
      state = runScriptedClashAi(state, activeGameConfig);
      tutorialStep = 'clash';
      turnPhase = 'waiting';
      playSound('kibble-clash');
    } else {
      state = runScriptedSuccessAi(state, activeGameConfig);
      tutorialStep = 'success';
      turnPhase = 'waiting';
      playRoundResultSounds(state);
    }
    selectedRollFace = null;
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('.tutorial-coach')?.focus());
  }, reduceMotion ? 80 : 360);
}

function scheduleAiTurn(): void {
  cancelAiTurn();
  if (sessionMode === 'tutorial') return;
  if (roundIntermissionRound !== null) return;
  if (state?.phase !== 'awaiting-choice') return;
  const current = state.players[state.currentPlayerIndex];
  if (current?.kind !== 'ai') return;
  const scheduledVersion = sessionVersion;
  aiTurnTimer = window.setTimeout(() => {
    aiTurnTimer = null;
    if (scheduledVersion !== sessionVersion || state?.phase !== 'awaiting-choice') return;
    const player = state.players[state.currentPlayerIndex];
    if (player?.kind !== 'ai') return;
    const choice = chooseAiAction(state, activeGameConfig);
    state = chooseFace(
      { ...state, rngState: choice.rngState },
      activeGameConfig,
      choice.face,
    ).state;
    playSound('place-dice');
    playRoundResultSounds(state);
    syncTurnPhase();
    skipClashPresentation = reduceMotion;
    render();
  }, 850);
}

function playRoundResultSounds(gameState: GameState): void {
  if (gameState.phase !== 'round-result' || gameState.lastRoundSettlement === null) return;
  const hasClash = gameState.lastRoundSettlement.bowls.some((bowl) => bowl.clashedPlayerIds.length > 0);
  const scoreAwarded = gameState.lastRoundSettlement.bowls.some((bowl) =>
    bowl.awards.some((award) => award.reward > 0));
  if (hasClash) playSound('kibble-clash');
  if (scoreAwarded) scheduleSound('score-gain', 220);
  scheduleSound('round-complete', 520);
}

function setBowlPreview(face: number | null): void {
  app.querySelectorAll<HTMLElement>('[data-bowl-face]').forEach((bowl) => {
    const selected = Number(bowl.dataset.bowlFace) === face;
    bowl.classList.toggle('is-preview', selected);
    bowl.classList.toggle('is-muted', face !== null && !selected);
    const pending = bowl.querySelector<HTMLElement>('.pending-placement');
    if (pending !== null) {
      const count = selected && state !== null ? state.currentRoll.counts[face - 1] ?? 0 : 0;
      pending.hidden = !selected;
      const countLabel = pending.querySelector<HTMLElement>('b span');
      if (countLabel !== null) countLabel.textContent = String(count);
    }
  });
}

app.addEventListener('pointerover', (event) => {
  const target = event.target;
  if (target instanceof Element) setBowlPreview(Number(target.closest<HTMLElement>('[data-face]')?.dataset.face) || null);
});
app.addEventListener('pointerout', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-face]') !== null) setBowlPreview(null);
});
app.addEventListener('focusin', (event) => {
  const target = event.target;
  if (target instanceof Element) setBowlPreview(Number(target.closest<HTMLElement>('[data-face]')?.dataset.face) || null);
});
app.addEventListener('focusout', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-face]') !== null) setBowlPreview(null);
});

function updateCharacterNameInput(input: HTMLInputElement): void {
  if (!(input instanceof HTMLInputElement) || input.dataset.characterName === undefined) return;
  const characterId = input.dataset.characterName;
  if (!CHARACTER_VISUALS.some((visual) => visual.id === characterId)) return;
  const normalized = normalizeCharacterName(input.value);
  if (input.value !== normalized) input.value = normalized;
  characterNames = saveCharacterName(characterId as CharacterId, normalized, characterNames);
}

app.addEventListener('input', (event) => {
  if (event instanceof InputEvent && event.isComposing) return;
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  updateCharacterNameInput(input);
});

app.addEventListener('compositionend', (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement) updateCharacterNameInput(input);
});

app.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.dataset.characterName === undefined) return;
  if (input.value.length === 0) render();
});

app.addEventListener('error', (event) => {
  const target = event.target;
  if (target instanceof HTMLImageElement && target.classList.contains('asset-image')) {
    const fallbackSrc = target.dataset.fallbackSrc;
    if (fallbackSrc !== undefined) {
      delete target.dataset.fallbackSrc;
      target.src = fallbackSrc;
      return;
    }
    target.classList.add('asset-missing');
  }
}, true);

app.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const clickedButton = target.closest<HTMLButtonElement>('button');
  const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
  if (action === 'toggle-sound') {
    const enabled = !isSoundEnabled();
    setSoundEnabled(enabled);
    if (enabled) playSound('ui-click');
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('[data-action="toggle-sound"]')?.focus());
    return;
  }
  if (clickedButton !== null
    && clickedButton.dataset.face === undefined
    && clickedButton.dataset.action !== 'roll-dice'
    && clickedButton.dataset.action !== 'preview-match-result') playSound('ui-click');
  const joinCandidateButton = target.closest<HTMLButtonElement>('[data-join-candidate]');
  if (joinCandidateButton !== null) {
    const characterId = joinCandidateButton.dataset.joinCandidate;
    if (CHARACTER_VISUALS.some((visual) => visual.id === characterId) && !isCharacterUnlocked(characterId)) {
      friendJoinCandidateId = characterId as CharacterId;
      friendJoinFlow = 'confirm';
      render();
      window.requestAnimationFrame(() => app.querySelector<HTMLElement>('#friend-join-title')?.focus());
    }
    return;
  }
  const characterButton = target.closest<HTMLButtonElement>('[data-character]');
  if (characterButton !== null) {
    const characterId = characterButton.dataset.character;
    if (CHARACTER_VISUALS.some((visual) => visual.id === characterId)) {
      selectedCharacterId = characterId as CharacterId;
      render();
    }
    return;
  }
  const difficultyButton = target.closest<HTMLButtonElement>('[data-difficulty]');
  if (difficultyButton !== null) {
    const difficulty = difficultyButton.dataset.difficulty;
    if (difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') {
      selectedAiDifficulty = difficulty;
      saveAiDifficulty(difficulty);
      render();
    }
    return;
  }
  const resultDifficultyButton = target.closest<HTMLButtonElement>('[data-result-difficulty]');
  if (resultDifficultyButton !== null) {
    const difficulty = resultDifficultyButton.dataset.resultDifficulty;
    if (difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') {
      pendingAiDifficulty = difficulty;
      render();
    }
    return;
  }
  const faceButton = target.closest<HTMLButtonElement>('[data-face]');
  if (faceButton !== null && state !== null) {
    if (sessionMode === 'tutorial') chooseTutorialDice(Number(faceButton.dataset.face));
    else resolveHumanChoice(Number(faceButton.dataset.face));
    return;
  }
  const tutorialBowl = target.closest<HTMLElement>('[data-bowl-face]');
  if (tutorialBowl !== null && sessionMode === 'tutorial') {
    placeTutorialBowl(Number(tutorialBowl.dataset.bowlFace));
    return;
  }
  if (action === 'roll-dice') beginRoll();
  if (action === 'claim-attendance') {
    const result = claimDailyAttendance();
    if (result.success) {
      attendanceFeedback = true;
      if (attendanceFeedbackTimer !== null) window.clearTimeout(attendanceFeedbackTimer);
      attendanceFeedbackTimer = window.setTimeout(() => {
        attendanceFeedback = false;
        attendanceFeedbackTimer = null;
        if (screen === 'home') render();
      }, 1_800);
    }
    render();
    return;
  }
  if (action === 'open-game-settings' && screen === 'character-select') {
    characterSelectStep = 'gameSettings';
    isEditingCharacterName = false;
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('#character-settings-title')?.focus());
    return;
  }
  if (action === 'open-friend-join' && screen === 'character-select') {
    friendJoinFlow = 'choose';
    friendJoinCandidateId = null;
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('#friend-join-title')?.focus());
    return;
  }
  if (action === 'close-friend-join') {
    friendJoinFlow = 'closed';
    friendJoinCandidateId = null;
    render();
    return;
  }
  if (action === 'choose-friend-again') {
    friendJoinFlow = 'choose';
    friendJoinCandidateId = null;
    render();
    return;
  }
  if (action === 'confirm-friend-join' && friendJoinCandidateId !== null) {
    const result = joinCharacter(friendJoinCandidateId);
    if (result.success) {
      selectedCharacterId = friendJoinCandidateId;
      saveSelectedCharacter(selectedCharacterId);
      friendJoinSpent = result.amount;
      friendJoinFlow = 'complete';
    } else {
      friendJoinFlow = 'closed';
      friendJoinCandidateId = null;
    }
    render();
    return;
  }
  if ((action === 'name-new-friend' || action === 'play-with-new-friend') && friendJoinCandidateId !== null) {
    friendJoinFlow = 'closed';
    characterSelectStep = 'gameSettings';
    isEditingCharacterName = action === 'name-new-friend';
    render();
    window.requestAnimationFrame(() => (isEditingCharacterName
      ? app.querySelector<HTMLElement>('#character-name-input')
      : app.querySelector<HTMLElement>('#character-settings-title'))?.focus());
    return;
  }
  if (action === 'choose-another-character' && screen === 'character-select') {
    characterSelectStep = 'character';
    isEditingCharacterName = false;
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>(`[data-character="${selectedCharacterId}"]`)?.focus());
    return;
  }
  if (action === 'edit-character-name' && characterSelectStep === 'gameSettings') {
    isEditingCharacterName = true;
    render();
    window.requestAnimationFrame(() => {
      const input = app.querySelector<HTMLInputElement>('#character-name-input');
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
    return;
  }
  if (action === 'finish-name-edit' && characterSelectStep === 'gameSettings') {
    const input = app.querySelector<HTMLInputElement>('#character-name-input');
    if (input !== null) updateCharacterNameInput(input);
    isEditingCharacterName = false;
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('[data-action="edit-character-name"]')?.focus());
    return;
  }
  if (action === 'start-tutorial') { startTutorial(); return; }
  if (action === 'dismiss-tutorial') {
    dismissTutorialPrompt();
    tutorialIntroOpen = false;
    render();
    return;
  }
  if (action === 'exit-tutorial') { tutorialExitConfirm = true; render(); return; }
  if (action === 'continue-tutorial') { tutorialExitConfirm = false; render(); return; }
  if (action === 'confirm-exit-tutorial') {
    cancelTurnTimers();
    sessionVersion += 1;
    sessionMode = 'normal';
    tutorialStep = null;
    tutorialExitConfirm = false;
    state = null;
    screen = 'home';
    render();
    return;
  }
  if (action === 'tutorial-show-rewards' && tutorialStep === 'game-goal') {
    tutorialStep = 'reward-intro';
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('.tutorial-coach')?.focus());
    return;
  }
  if (action === 'tutorial-start-practice' && tutorialStep === 'reward-intro') {
    tutorialStep = 'roll-clash';
    turnPhase = 'roll-ready';
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('[data-action="roll-dice"]')?.focus());
    return;
  }
  if (action === 'tutorial-after-clash' && tutorialStep === 'clash') {
    tutorialStep = 'roll-success';
    turnPhase = 'roll-ready';
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('[data-action="roll-dice"]')?.focus());
    return;
  }
  if (action === 'tutorial-show-result' && tutorialStep === 'success') {
    tutorialStep = 'round-result';
    skipClashPresentation = true;
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('.tutorial-coach')?.focus());
    return;
  }
  if (action === 'complete-tutorial' && tutorialStep === 'round-result') {
    const result = completeTutorial();
    tutorialRewardEarned = result.success ? result.amount : 0;
    tutorialStep = 'complete';
    render();
    return;
  }
  if (action === 'tutorial-choose-character' && tutorialStep === 'complete') {
    leaveCompletedTutorial('character-select');
    return;
  }
  if (action === 'tutorial-home' && tutorialStep === 'complete') {
    leaveCompletedTutorial('home');
    return;
  }
  if (action === 'open-difficulty-dialog' && state?.phase === 'match-result') {
    const recommendation = getDifficultyRecommendation({ difficulty: activeGameConfig.ai.difficulty, playerRank: createMatchResultViewModel(state.players).humanResult.rank, isWinner: createMatchResultViewModel(state.players).humanResult.isWinner });
    pendingAiDifficulty = recommendation.recommendedDifficulty ?? selectedAiDifficulty;
    difficultyDialogOpen = true;
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('[data-result-difficulty][aria-checked="true"]')?.focus());
  }
  if (action === 'close-difficulty-dialog') { difficultyDialogOpen = false; render(); }
  if (action === 'restart-with-difficulty') {
    selectedAiDifficulty = pendingAiDifficulty;
    saveAiDifficulty(selectedAiDifficulty);
    startGame();
  }
  if (action === 'restart') startGame();
  if (action === 'open-leaderboard') void handleOpenLeaderboard();
  if (action === 'preview-match-result') previewMatchResult();
  if (action === 'open-rules' || action === 'open-settings') {
    homeDialogTriggerAction = action;
    homeDialog = action === 'open-rules' ? 'rules' : 'settings';
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('.home-dialog-close')?.focus());
  }
  if (action === 'close-home-dialog' && (
    target.closest('.home-dialog-close') !== null
    || target.closest('[data-dialog-panel]') === null
  )) {
    homeDialog = null;
    render();
    window.requestAnimationFrame(() => {
      if (homeDialogTriggerAction !== null) {
        app.querySelector<HTMLElement>(`[data-action="${homeDialogTriggerAction}"]`)?.focus();
      }
    });
  }
  if (action === 'select-character' || action === 'change-character') {
    cancelTurnTimers();
    characterSelectStep = 'character';
    isEditingCharacterName = false;
    screen = 'character-select';
    state = null;
    render();
  }
  if (action === 'confirm-character') {
    saveSelectedCharacter(selectedCharacterId);
    saveAiDifficulty(selectedAiDifficulty);
    startGame();
  }
  if (action === 'rules') { screen = 'rules'; render(); }
  if (action === 'home') { cancelTurnTimers(); screen = 'home'; state = null; render(); }
  if (action === 'seed') { nextSeed += 100; render(); }
  if (action === 'continue' && state !== null) {
    state = continueAfterRound(state, activeGameConfig);
    if (state.phase === 'match-result') {
      enterMatchResult(state);
      return;
    }
    skipClashPresentation = reduceMotion;
    startRoundIntermission();
  }
  if (action === 'skip-clash') { skipClashPresentation = true; render(); }
  if (action === 'toggle-motion') {
    reduceMotion = !reduceMotion;
    skipClashPresentation = reduceMotion;
    render();
    if (screen === 'home') window.requestAnimationFrame(() => app.querySelector<HTMLElement>('[data-action="toggle-motion"]')?.focus());
  }
});

app.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.dataset.characterName !== undefined && event.key === 'Enter') {
    event.preventDefault();
    updateCharacterNameInput(event.target);
    isEditingCharacterName = false;
    render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('[data-action="edit-character-name"]')?.focus());
    return;
  }
  if (screen === 'character-select' && characterSelectStep === 'gameSettings') {
    if (event.key === 'Escape') {
      event.preventDefault();
      characterSelectStep = 'character';
      isEditingCharacterName = false;
      render();
      window.requestAnimationFrame(() => app.querySelector<HTMLElement>(`[data-character="${selectedCharacterId}"]`)?.focus());
      return;
    }
    if (event.key === 'Tab') {
      const focusable = [...app.querySelectorAll<HTMLElement>('.character-settings-dialog button:not([disabled]), .character-settings-dialog input:not([disabled])')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first !== undefined && last !== undefined && event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (first !== undefined && last !== undefined && !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  }
  if (sessionMode === 'tutorial' && (event.key === 'Enter' || event.key === ' ')) {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches('[data-bowl-face][role="button"]')) {
      event.preventDefault();
      placeTutorialBowl(Number(target.dataset.bowlFace));
      return;
    }
  }
  if (homeDialog === null) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    homeDialog = null;
    render();
    window.requestAnimationFrame(() => {
      if (homeDialogTriggerAction !== null) {
        app.querySelector<HTMLElement>(`[data-action="${homeDialogTriggerAction}"]`)?.focus();
      }
    });
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...app.querySelectorAll<HTMLElement>('.home-dialog button:not([disabled])')];
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

render();
if (tutorialIntroOpen) {
  window.requestAnimationFrame(() => app.querySelector<HTMLElement>('.tutorial-intro .primary')?.focus());
}
