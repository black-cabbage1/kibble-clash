import type { GameConfig, GameState } from '../models/game-types';
import { GameRuleError } from '../models/game-types';
import { nextRandom } from '../rng/seeded-rng';
import { availableFaces } from '../rules/dice';

export interface AiChoice {
  face: number;
  rngState: number;
  scores: Record<number, number>;
}

export function chooseAiAction(
  state: GameState,
  config: GameConfig,
): AiChoice {
  const player = state.players[state.currentPlayerIndex];
  if (player === undefined || player.kind !== 'ai') {
    throw new GameRuleError('INVALID_CONFIG', '현재 플레이어가 AI가 아닙니다.');
  }
  const faces = availableFaces(state.currentRoll);
  if (faces.length === 0) {
    throw new GameRuleError('FACE_NOT_ROLLED', 'AI가 선택할 눈이 없습니다.');
  }

  let rngState = state.rngState;
  const scores: Record<number, number> = {};
  for (const face of faces) {
    const bowl = state.bowls[face - 1];
    const dice = state.currentRoll.counts[face - 1] ?? 0;
    if (bowl === undefined) continue;
    const ownAfter = (bowl.placements[player.id] ?? 0) + dice;
    const opponentCounts = Object.entries(bowl.placements)
      .filter(([id]) => id !== player.id)
      .map(([, count]) => count)
      .filter((count) => count > 0);
    const clashes = opponentCounts.filter((count) => count === ownAfter).length;
    const higher = opponentCounts.filter((count) => count > ownAfter).length;
    const random = nextRandom(rngState);
    rngState = random.state;
    const noise = (random.value * 2 - 1) * config.ai.randomError;
    scores[face] =
      bowl.rewardTotal * config.ai.rewardWeight +
      dice * config.ai.diceWeight +
      Math.max(0, state.players.length - higher) *
        config.ai.survivalRankWeight -
      (clashes > 0 ? config.ai.clashRiskPenalty : 0) +
      clashes * config.ai.clashOpponentBonus -
      player.remainingDice * config.ai.opportunityCostWeight +
      noise;
  }

  const face = [...faces].sort(
    (left, right) => (scores[right] ?? -Infinity) - (scores[left] ?? -Infinity),
  )[0];
  if (face === undefined) {
    throw new GameRuleError('FACE_NOT_ROLLED', 'AI 행동을 결정하지 못했습니다.');
  }
  return { face, rngState, scores };
}
