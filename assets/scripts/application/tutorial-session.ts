import type { GameConfig, GameState, RollState } from '../domain/models/game-types';
import { chooseFace, createGame } from '../domain/rules/game-engine';

export type TutorialStep =
  | 'game-goal'
  | 'reward-intro'
  | 'roll-clash'
  | 'select-clash-dice'
  | 'select-clash-bowl'
  | 'clash'
  | 'roll-success'
  | 'select-success-dice'
  | 'select-success-bowl'
  | 'success'
  | 'round-result'
  | 'complete';

export const TUTORIAL_CLASH_FACE = 1;
export const TUTORIAL_SUCCESS_FACE = 3;

function fixedRoll(values: readonly number[], faces: number): RollState {
  const counts = Array.from({ length: faces }, () => 0);
  values.forEach((value) => { counts[value - 1] = (counts[value - 1] ?? 0) + 1; });
  return { values: [...values], counts };
}

export function createTutorialConfig(base: GameConfig): GameConfig {
  return {
    ...base,
    rounds: 1,
    dicePerPlayer: 3,
    players: base.players.slice(0, 2),
    rewardCards: [...base.rewardCards],
    ai: { ...base.ai, difficultyConfigs: { ...base.ai.difficultyConfigs } },
  };
}

export function createTutorialGame(config: GameConfig, seed: number): GameState {
  const state = createGame(config, seed);
  return { ...state, currentRoll: fixedRoll([1, 1, 3], config.dieFaces) };
}

export function placeTutorialHumanDice(state: GameState, config: GameConfig, face: number): GameState {
  return chooseFace(state, config, face).state;
}

export function runScriptedClashAi(state: GameState, config: GameConfig): GameState {
  const scripted = { ...state, currentRoll: fixedRoll([1, 1, 5], config.dieFaces) };
  const afterAi = chooseFace(scripted, config, TUTORIAL_CLASH_FACE).state;
  return { ...afterAi, currentRoll: fixedRoll([3], config.dieFaces) };
}

export function runScriptedSuccessAi(state: GameState, config: GameConfig): GameState {
  const scripted = { ...state, currentRoll: fixedRoll([5], config.dieFaces) };
  return chooseFace(scripted, config, 5).state;
}
