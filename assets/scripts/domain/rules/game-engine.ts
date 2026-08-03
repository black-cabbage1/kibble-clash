import type {
  ChoiceResult,
  GameConfig,
  GameState,
  PlayerState,
} from '../models/game-types';
import { GameRuleError } from '../models/game-types';
import { rollDice } from './dice';
import { dealBowlRewards } from './reward-deck';
import { settleRound } from './settlement';

function validateConfig(config: GameConfig): void {
  if (
    config.rounds <= 0 ||
    config.dicePerPlayer <= 0 ||
    config.bowlCount <= 0 ||
    config.dieFaces !== config.bowlCount ||
    config.players.length < 2 ||
    new Set(config.players.map((player) => player.id)).size !== config.players.length
  ) {
    throw new GameRuleError('INVALID_CONFIG', '게임 설정이 올바르지 않습니다.');
  }
}

function createPlayers(config: GameConfig): PlayerState[] {
  return config.players.map((player) => ({
    ...player,
    remainingDice: config.dicePerPlayer,
    score: 0,
    rewards: [],
    clashCount: 0,
    largestReward: 0,
  }));
}

function firstActiveIndex(players: readonly PlayerState[], startIndex: number): number {
  for (let offset = 0; offset < players.length; offset += 1) {
    const index = (startIndex + offset) % players.length;
    if ((players[index]?.remainingDice ?? 0) > 0) return index;
  }
  return -1;
}

function rollForCurrent(
  state: Omit<GameState, 'currentRoll'>,
  config: GameConfig,
): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (player === undefined || player.remainingDice <= 0) {
    throw new GameRuleError('INVALID_CONFIG', '활성 플레이어가 없습니다.');
  }
  const result = rollDice(
    player.remainingDice,
    config.dieFaces,
    state.rngState,
  );
  return {
    ...state,
    rngState: result.rngState,
    currentRoll: result.roll,
  };
}

export function createGame(config: GameConfig, seed: number): GameState {
  validateConfig(config);
  const rewards = dealBowlRewards(config, seed);
  const players = createPlayers(config);
  return rollForCurrent(
    {
      seed,
      rngState: rewards.rngState,
      phase: 'awaiting-choice',
      round: 1,
      starterIndex: 0,
      currentPlayerIndex: 0,
      players,
      bowls: rewards.bowls,
      lastRoundSettlement: null,
    },
    config,
  );
}

export function chooseFace(
  state: GameState,
  config: GameConfig,
  face: number,
): ChoiceResult {
  if (state.phase !== 'awaiting-choice') {
    throw new GameRuleError(
      'NOT_AWAITING_CHOICE',
      '현재는 주사위를 선택할 수 없습니다.',
    );
  }
  if (!Number.isInteger(face) || face < 1 || face > config.dieFaces) {
    throw new GameRuleError('INVALID_FACE', '주사위 눈이 범위를 벗어났습니다.');
  }
  const placedCount = state.currentRoll.counts[face - 1] ?? 0;
  if (placedCount <= 0) {
    throw new GameRuleError(
      'FACE_NOT_ROLLED',
      '현재 굴림에 없는 눈은 선택할 수 없습니다.',
    );
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer === undefined) {
    throw new GameRuleError('INVALID_CONFIG', '현재 플레이어가 없습니다.');
  }
  const remainingDice = currentPlayer.remainingDice - placedCount;
  const players = state.players.map((player, index) =>
    index === state.currentPlayerIndex ? { ...player, remainingDice } : player,
  );
  const bowls = state.bowls.map((bowl) =>
    bowl.face === face
      ? {
          ...bowl,
          placements: {
            ...bowl.placements,
            [currentPlayer.id]:
              (bowl.placements[currentPlayer.id] ?? 0) + placedCount,
          },
        }
      : bowl,
  );

  const nextIndex = firstActiveIndex(
    players,
    (state.currentPlayerIndex + 1) % players.length,
  );
  if (nextIndex === -1) {
    const result = settleRound(state.round, bowls, players);
    return {
      placedFace: face,
      placedCount,
      state: {
        ...state,
        phase: 'round-result',
        players: result.players,
        bowls,
        currentRoll: { values: [], counts: Array(config.dieFaces).fill(0) },
        lastRoundSettlement: result.settlement,
      },
    };
  }

  const next = rollForCurrent(
    {
      ...state,
      players,
      bowls,
      currentPlayerIndex: nextIndex,
    },
    config,
  );
  return { state: next, placedFace: face, placedCount };
}

export function continueAfterRound(
  state: GameState,
  config: GameConfig,
): GameState {
  if (state.phase !== 'round-result') {
    throw new GameRuleError(
      'NOT_ROUND_RESULT',
      '라운드 결과 상태에서만 계속할 수 있습니다.',
    );
  }
  if (state.round >= config.rounds) {
    return { ...state, phase: 'match-result' };
  }

  const round = state.round + 1;
  const starterIndex = (state.starterIndex + 1) % state.players.length;
  const players = state.players.map((player) => ({
    ...player,
    remainingDice: config.dicePerPlayer,
  }));
  const rewards = dealBowlRewards(config, state.rngState);
  return rollForCurrent(
    {
      ...state,
      rngState: rewards.rngState,
      phase: 'awaiting-choice',
      round,
      starterIndex,
      currentPlayerIndex: starterIndex,
      players,
      bowls: rewards.bowls,
      lastRoundSettlement: null,
    },
    config,
  );
}
