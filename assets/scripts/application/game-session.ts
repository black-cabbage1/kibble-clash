import type { GameConfig, GameState } from '../domain/models/game-types';
import { GameRuleError } from '../domain/models/game-types';
import { chooseAiAction } from '../domain/ai/choose-action';
import {
  chooseFace,
  continueAfterRound,
  createGame,
} from '../domain/rules/game-engine';

export function createSession(config: GameConfig, seed: number): GameState {
  return advanceAiTurns(createGame(config, seed), config);
}

export function submitHumanChoice(
  state: GameState,
  config: GameConfig,
  face: number,
): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (player?.kind !== 'human') {
    throw new GameRuleError('INVALID_CONFIG', '사용자 턴이 아닙니다.');
  }
  return advanceAiTurns(chooseFace(state, config, face).state, config);
}

export function continueSession(
  state: GameState,
  config: GameConfig,
): GameState {
  return advanceAiTurns(continueAfterRound(state, config), config);
}

export function advanceAiTurns(
  initialState: GameState,
  config: GameConfig,
): GameState {
  let state = initialState;
  let steps = 0;
  while (state.phase === 'awaiting-choice') {
    const player = state.players[state.currentPlayerIndex];
    if (player?.kind !== 'ai') break;
    steps += 1;
    if (steps > config.maxAutomaticSteps) {
      throw new GameRuleError(
        'AUTOMATIC_STEP_LIMIT',
        'AI 자동 진행 단계 제한을 초과했습니다.',
      );
    }
    const choice = chooseAiAction(state, config);
    state = chooseFace(
      { ...state, rngState: choice.rngState },
      config,
      choice.face,
    ).state;
  }
  return state;
}
