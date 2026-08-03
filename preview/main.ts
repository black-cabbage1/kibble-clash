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
} from '../assets/scripts/domain/models/game-types';
import { chooseAiAction } from '../assets/scripts/domain/ai/choose-action';
import { createMatchResultViewModel } from '../assets/scripts/application/match-result-view-model';
import { diceResultRowWidth, MAX_RESULT_DICE } from '../assets/scripts/application/dice-result-layout';
import {
  canRoll,
  canSelectBowl,
  initialTurnPhase,
  type TurnPhase,
} from '../assets/scripts/application/turn-flow';
import { availableFaces } from '../assets/scripts/domain/rules/dice';
import { chooseFace, continueAfterRound, createGame } from '../assets/scripts/domain/rules/game-engine';
import {
  loadSelectedCharacter,
  saveSelectedCharacter,
} from '../assets/scripts/platform/storage/selected-character-storage';
import { setupGameOrientation } from '../assets/scripts/platform/apps-in-toss/mini-game-platform';
import {
  EMPTY_GAME_SAFE_AREA,
  subscribeToGameSafeArea,
  type GameSafeAreaInsets,
} from '../assets/scripts/platform/apps-in-toss/game-safe-area';

// 토스 WebView가 게임 화면을 그리기 시작하자마자 가로 방향으로 전환한다.
const restoreOrientation = setupGameOrientation();
window.addEventListener('pagehide', restoreOrientation, { once: true });

const isAppsInTossHost = /(^|\.)((private-)?apps\.tossmini\.com)$/i.test(window.location.hostname);
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
let turnPhase: TurnPhase = 'waiting';
let rollPresentation: 'rolling' | 'result' = 'rolling';
let sessionVersion = 0;
let selectedCharacterId = loadSelectedCharacter();
let activeGameConfig: GameConfig = createGameConfigForCharacter(selectedCharacterId);
let homeDialog: 'rules' | 'settings' | null = null;
let homeDialogTriggerAction: 'open-rules' | 'open-settings' | null = null;
let gameSafeArea: GameSafeAreaInsets = EMPTY_GAME_SAFE_AREA;

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
        </button>`}
    </div>
  </section>`;
  return `<main class="home home-v3 screen">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-decoration decoration-left" aria-hidden="true">●　·　●</div>
      <div class="home-decoration decoration-right" aria-hidden="true">◆　·　◆</div>
      <div class="home-character-group" aria-label="멍밥쟁탈전 출전 강아지">
        ${CHARACTER_VISUALS.map((visual, index) => `<img class="home-group-dog home-dog-${index + 1} asset-image" src="${visual.selectImage}" alt="${visual.displayName}">`).join('')}
      </div>
      <div class="home-logo">
        <h1 id="home-title">멍밥쟁탈전</h1>
        <p>KIBBLE CLASH</p>
      </div>
      <p class="home-tagline-v3">주사위를 굴려 최고의 밥그릇을 차지하세요!</p>
      <nav class="home-actions" aria-label="메인 메뉴">
        <button class="primary home-start" data-action="select-character">게임 시작</button>
        <span><button data-action="open-rules">게임 방법</button><button data-action="open-settings">설정</button></span>
      </nav>
    </section>
    ${dialog}
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
  return `<main class="character-select screen" style="--select-bg: url('${ART_PATHS.characterSelectBackground}')">
    <header class="select-heading">
      <div><p class="eyebrow">CHOOSE YOUR DOG</p><h1>내 댕댕이 선택!</h1></div>
      <button data-action="home">뒤로</button>
    </header>
    <div class="character-grid" role="radiogroup" aria-label="플레이 캐릭터">
      ${CHARACTER_VISUALS.map((visual) => {
        const checked = visual.id === selectedCharacterId;
        return `<button class="character-card character-${visual.id} ${checked ? 'selected' : ''}"
          role="radio" aria-checked="${checked}" data-character="${visual.id}">
          <span class="selection-state">${checked ? '✓' : ''}</span>
          <span class="select-art-wrap">
            <img class="asset-image select-art" src="${visual.selectImage}" alt="${visual.displayName}">
            <span class="select-fallback" aria-hidden="true">${visual.symbol}</span>
          </span>
          <strong>${visual.displayName}</strong>
          <span>${visual.personalityText}</span>
        </button>`;
      }).join('')}
    </div>
    <button class="primary select-start" data-action="confirm-character">선택 완료</button>
  </main>`;
}

function rewardCards(rewards: number[]): string {
  return `<div class="reward-cards game-rewards" aria-label="사료 카드 ${rewards.join(', ')}점">
    ${[...rewards].sort((a, b) => b - a).map((reward) => `<span title="${reward}점 사료 카드">
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
        title="${player.name} 주사위 ${count}개">
        ${dogAvatar(player, 'game-token-avatar')}
        <b>×${count}</b>
        ${status.kind === 'tie' && isLeader ? '<span class="token-status" aria-hidden="true">⚡</span>' : ''}
        <span class="sr-only">${player.name} 토큰 ${count}개${isLeader ? `, ${status.label}` : ''}</span>
      </li>`;
    }).join('');
  const human = state.players.find((player) => player.kind === 'human');
  return `<article class="bowl-card game-bowl status-${status.kind}"
    data-bowl-face="${face}" aria-label="${face}번 밥그릇, 보상 총 ${bowl.rewardTotal}점">
    <div class="game-bowl-top">
      <span class="bowl-number" aria-label="${face}번 밥그릇">${face}</span>
      ${rewardCards(bowl.rewards)}
      <strong class="reward-total" title="보상 합계 ${bowl.rewardTotal}점">${bowl.rewardTotal}<small>점</small></strong>
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

const PIP_POSITIONS: Record<number, number[]> = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};

function dieMarkup(value: number, index = 0, rolling = false): string {
  return `<span class="stage-die${rolling ? ' is-tumbling' : ''}" style="--roll-index:${index}" aria-hidden="true">
    ${(PIP_POSITIONS[value] ?? []).map((position) => `<i class="pip pip-${position}"></i>`).join('')}
  </span>`;
}

function diceTiles(values: number[]): string {
  return `<div class="rolled-dice" aria-label="주사위 결과 ${values.join(', ')}">
    ${values.map((value, index) => dieMarkup(value, index)).join('')}
  </div>`;
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
  const isResult = turnPhase === 'rolling' && rollPresentation === 'result';
  const dice = turnPhase === 'roll-ready'
    ? idleDiceTiles()
    : isResult
      ? diceTiles(state.currentRoll.values.slice(0, 3))
      : rollingDiceTiles();
  return `<section class="turn-roll-overlay ${turnPhase === 'rolling' ? 'is-active' : 'is-ready'} ${isResult ? 'is-result' : ''}"
    aria-live="assertive" ${turnPhase === 'rolling' ? 'aria-busy="true"' : ''}>
    <div class="turn-roll-card team-${state.players[state.currentPlayerIndex]?.id ?? ''}">
      <p class="eyebrow">${isResult ? 'ROLL RESULT' : 'YOUR TURN'}</p>
      <h2>${isResult ? '주사위 결과 확정!' : turnPhase === 'rolling' ? '데구르르…' : '내 차례예요!'}</h2>
      <div class="overlay-dice-window">${dice}</div>
      ${turnPhase === 'roll-ready'
        ? '<button class="primary roll-button overlay-roll-button" data-action="roll-dice"><b>ROLL</b><span>주사위 굴리기</span></button>'
        : `<small>${isResult ? '이제 놓을 숫자를 선택하세요.' : '주사위를 굴리고 있어요.'}</small>`}
    </div>
  </section>`;
}

function gameTemplate(): string {
  if (state === null) return '';
  const current = state.players[state.currentPlayerIndex];
  const faces = availableFaces(state.currentRoll);
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
          <div class="dice-stage-window">${diceTiles(state.currentRoll.values)}</div>
          <div class="roll-prompt"><p class="eyebrow">PLACEMENT</p><h2>밥그릇에 놓는 중…</h2><small>선택 결과를 반영하고 있어요.</small></div>
        </section>`
        : `<section class="dice-tray game-dice-tray dice-stage has-result" style="--dice-row-min-width:${diceResultRowWidth(MAX_RESULT_DICE)}px" aria-label="현재 주사위 결과">
      <div class="dice-stage-window">${diceTiles(state.currentRoll.values)}</div>
      <div class="roll-summary"><div><p class="eyebrow">ROLL RESULT</p><h2>놓을 숫자를 고르세요</h2></div></div>
      <div class="choice-buttons">
        ${faces.map((face) => {
          const count = state?.currentRoll.counts[face - 1] ?? 0;
          return `<button class="die-choice" data-face="${face}" aria-label="${face}번 밥그릇에 주사위 ${count}개 놓기">
            <span aria-hidden="true">${DIE_FACES[face - 1]}</span><b>${count}개 놓기</b>
          </button>`;
        }).join('')}
      </div>
    </section>`;
  const diceActionPanel = current?.kind === 'human'
    ? humanPanel
    : `<section class="dice-tray game-dice-tray dice-stage is-waiting" aria-live="polite" aria-label="${current?.name ?? '다른 플레이어'} 차례">
      <div class="dice-stage-window is-disabled">${idleDiceTiles()}</div>
      ${current === undefined ? '' : dogAvatar(current, 'waiting-turn-avatar')}
      <div><p class="eyebrow">OTHER PLAYER'S TURN</p><h2>차례를 기다리는 중…</h2><small>${current?.name ?? ''}의 선택이 진행되고 있어요.</small></div>
    </section>`;
  return `<main class="game game-v3 screen">
    <header class="game-header game-v3-header">
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
  </main>`;
}

function settlementRow(result: BowlSettlement): string {
  const clashes = result.clashedPlayerIds.length === 0
    ? '<span class="no-clash">충돌 없음</span>'
    : `<div class="result-dogs clash-result-dogs" aria-label="${result.clashedPlayerIds.map((id) => playerById(id).name).join(', ')} 충돌">
      ${result.clashedPlayerIds.map((id) => {
        const player = playerById(id);
        return `<span>${dogAvatar(player, 'result-token')}<small>${player.name}</small><b>충돌</b></span>`;
      }).join('')}
    </div>`;
  const awards = result.awards.length === 0
    ? '<span class="no-award">획득자 없음</span>'
    : result.awards.map((award) => {
      const player = playerById(award.playerId);
      return `<strong class="award-character">${dogAvatar(player, 'result-token')}<span>${player.name}<b>+${award.reward}</b></span></strong>`;
    }).join('');
  return `<li class="${result.clashedPlayerIds.length > 0 ? 'clashed-result' : ''}">
    <div class="result-bowl-label"><span>${result.face}</span><b>${result.face}번 밥그릇</b></div>
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
  const roundStar = [...state.players].sort(
    (left, right) => (roundRewards.get(right.id) ?? 0) - (roundRewards.get(left.id) ?? 0),
  )[0];
  const human = state.players.find((player) => player.kind === 'human');
  const roundStarVisual = roundStar === undefined ? null : characterVisual(roundStar.characterId);
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
        ${roundStarVisual === null ? '' : `<img class="asset-image round-star-art" src="${roundStarVisual.selectImage}" alt="${roundStar?.name}">`}
        <div><small>이번 라운드 사료왕</small><h2>${roundStar?.name ?? ''}</h2><strong>+${roundStar === undefined ? 0 : roundRewards.get(roundStar.id) ?? 0}점</strong></div>
      </div>
      <ul class="settlement-list">${state.lastRoundSettlement.bowls.map(settlementRow).join('')}</ul>
    </section>
    <button class="primary next-round-action" data-action="continue">${state.round === activeGameConfig.rounds ? '최종 결과 보기' : `다음 라운드 · ROUND ${state.round + 1}`}</button>
  </main>`;
}

function matchResultTemplate(): string {
  if (state === null) return '';
  const viewModel = createMatchResultViewModel(state.players);
  const winner = playerById(viewModel.winner.playerId);
  const human = playerById(viewModel.humanResult.playerId);
  const heading = viewModel.humanResult.isWinner ? '승리! 오늘의 사료왕' : '이번 판의 사료왕';
  const description = viewModel.humanResult.isWinner
    ? '최고의 밥그릇 사냥꾼이 되었어요!'
    : `${viewModel.winner.displayName}가 가장 많은 사료를 모았어요!`;
  return `<main class="result match-result screen paper-panel">
    <header class="match-heading" tabindex="-1"><p class="eyebrow">MATCH COMPLETE · 4라운드 최종 결과</p><h1>${heading}</h1><p>${description}</p></header>
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
          <strong><b>${viewModel.winner.score}</b><small>사료 포인트</small></strong>
          <em>칭호 · ${viewModel.winner.title}</em>
        </div>
        ${viewModel.humanResult.isWinner ? '' : `<section class="my-result-card team-${human.id}" aria-label="내 결과, ${viewModel.humanResult.rank}위, ${viewModel.humanResult.score}점">
          ${dogAvatar(human, 'my-result-avatar')}
          <div><span>내 결과 · 나</span><strong>${viewModel.humanResult.displayName}</strong><p>${viewModel.humanResult.rank}위 · ${viewModel.humanResult.score} 사료 포인트</p>
          <small>우승까지 ${viewModel.humanResult.scoreGap}점 차이</small></div>
        </section>`}
        <section class="final-ranking" aria-labelledby="final-ranking-title">
          <h3 id="final-ranking-title">전체 순위</h3>
          <ol>
            ${viewModel.rankings.map((entry) => {
              const player = playerById(entry.playerId);
              return `<li class="team-${player.id} ${entry.isHuman ? 'is-human' : ''}" aria-label="${entry.rank}위, ${entry.displayName}, ${entry.score}점${entry.isHuman ? ', 내 캐릭터' : ''}">
                <span class="rank">${entry.rank}위${entry.rank === 1 ? '<i aria-hidden="true">♛</i>' : ''}</span>
                ${dogAvatar(player, 'ranking-avatar')}
                <span class="ranking-name"><strong>${entry.displayName}</strong><small>${entry.title}</small></span>
                ${entry.isHuman ? '<b class="me-badge">나</b>' : ''}
                <strong class="ranking-score">${entry.score}<small>점</small></strong>
              </li>`;
            }).join('')}
          </ol>
        </section>
      </section>
    </section>
    <div class="result-actions"><button class="primary" data-action="restart">같은 강아지로 한 판 더</button><button data-action="change-character">강아지 바꾸기</button><button data-action="home">집으로</button></div>
  </main>`;
}

function render(): void {
  if (screen === 'home') app.innerHTML = homeTemplate();
  else if (screen === 'rules') app.innerHTML = rulesTemplate();
  else if (screen === 'character-select') app.innerHTML = characterSelectTemplate();
  else if (state?.phase === 'round-result') app.innerHTML = roundResultTemplate();
  else if (state?.phase === 'match-result') app.innerHTML = matchResultTemplate();
  else app.innerHTML = gameTemplate();
  applySafeArea();
  scheduleAiTurn();
}

function startGame(): void {
  cancelTurnTimers();
  sessionVersion += 1;
  activeGameConfig = createGameConfigForCharacter(selectedCharacterId);
  state = createGame(activeGameConfig, nextSeed);
  turnPhase = initialTurnPhase(state.players[state.currentPlayerIndex]?.kind);
  nextSeed += 1;
  skipClashPresentation = false;
  screen = 'game';
  render();
}

function previewMatchResult(): void {
  cancelTurnTimers();
  sessionVersion += 1;
  activeGameConfig = createGameConfigForCharacter(selectedCharacterId);
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
  render();
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
}

function syncTurnPhase(): void {
  turnPhase = initialTurnPhase(state?.players[state.currentPlayerIndex]?.kind);
}

function beginRoll(): void {
  if (state === null || !canRoll(turnPhase)) return;
  const current = state.players[state.currentPlayerIndex];
  if (current?.kind !== 'human') return;
  turnPhase = 'rolling';
  rollPresentation = 'rolling';
  render();
  const scheduledVersion = sessionVersion;
  turnTimer = window.setTimeout(() => {
    if (scheduledVersion !== sessionVersion || state?.players[state.currentPlayerIndex]?.kind !== 'human') return;
    rollPresentation = 'result';
    render();
    turnTimer = window.setTimeout(() => {
      turnTimer = null;
      if (scheduledVersion !== sessionVersion || state?.players[state.currentPlayerIndex]?.kind !== 'human') return;
      turnPhase = 'selecting';
      render();
      window.requestAnimationFrame(() => app.querySelector<HTMLElement>('.die-choice')?.focus());
    }, reduceMotion ? 100 : 360);
  }, reduceMotion ? 140 : 740);
}

function resolveHumanChoice(face: number): void {
  if (state === null || !canSelectBowl(turnPhase)) return;
  const current = state.players[state.currentPlayerIndex];
  if (current?.kind !== 'human') return;
  turnPhase = 'resolving';
  render();
  const scheduledVersion = sessionVersion;
  turnTimer = window.setTimeout(() => {
    turnTimer = null;
    if (scheduledVersion !== sessionVersion || state === null) return;
    state = chooseFace(state, activeGameConfig, face).state;
    skipClashPresentation = reduceMotion;
    syncTurnPhase();
    render();
  }, reduceMotion ? 80 : 360);
}

function scheduleAiTurn(): void {
  cancelAiTurn();
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
    syncTurnPhase();
    skipClashPresentation = reduceMotion;
    render();
  }, 850);
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
  const characterButton = target.closest<HTMLButtonElement>('[data-character]');
  if (characterButton !== null) {
    const characterId = characterButton.dataset.character;
    if (CHARACTER_VISUALS.some((visual) => visual.id === characterId)) {
      selectedCharacterId = characterId as CharacterId;
      render();
    }
    return;
  }
  const faceButton = target.closest<HTMLButtonElement>('[data-face]');
  if (faceButton !== null && state !== null) {
    resolveHumanChoice(Number(faceButton.dataset.face));
    return;
  }
  const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
  if (action === 'roll-dice') beginRoll();
  if (action === 'restart') startGame();
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
    screen = 'character-select';
    state = null;
    render();
  }
  if (action === 'confirm-character') {
    saveSelectedCharacter(selectedCharacterId);
    startGame();
  }
  if (action === 'rules') { screen = 'rules'; render(); }
  if (action === 'home') { cancelTurnTimers(); screen = 'home'; state = null; render(); }
  if (action === 'seed') { nextSeed += 100; render(); }
  if (action === 'continue' && state !== null) {
    state = continueAfterRound(state, activeGameConfig);
    syncTurnPhase();
    skipClashPresentation = reduceMotion;
    render();
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
