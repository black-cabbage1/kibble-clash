import type { BowlState, GameConfig, PlayerId } from '../models/game-types';
import { GameRuleError } from '../models/game-types';
import { shuffle } from '../rng/seeded-rng';

function emptyPlacements(playerIds: readonly PlayerId[]): Record<PlayerId, number> {
  return Object.fromEntries(playerIds.map((id) => [id, 0]));
}

export function dealBowlRewards(
  config: GameConfig,
  initialRngState: number,
): { bowls: BowlState[]; rngState: number } {
  if (config.rewardCards.length === 0) {
    throw new GameRuleError('REWARD_DECK_EMPTY', '보상 카드 설정이 비어 있습니다.');
  }

  let shuffled = shuffle(config.rewardCards, initialRngState);
  let drawPile = shuffled.values;
  let rngState = shuffled.state;
  const bowls: BowlState[] = [];
  const playerIds = config.players.map((player) => player.id);

  for (let face = 1; face <= config.bowlCount; face += 1) {
    const rewards: number[] = [];
    let total = 0;
    let guard = 0;

    while (total < config.minimumBowlReward) {
      guard += 1;
      if (guard > 1_000) {
        throw new GameRuleError(
          'REWARD_DECK_EMPTY',
          '보상 배치가 종료되지 않았습니다.',
        );
      }
      if (drawPile.length === 0) {
        shuffled = shuffle(config.rewardCards, rngState);
        drawPile = shuffled.values;
        rngState = shuffled.state;
      }
      const card = drawPile.pop();
      if (card === undefined || card <= 0) {
        throw new GameRuleError(
          'REWARD_DECK_EMPTY',
          '보상 카드는 0보다 커야 합니다.',
        );
      }
      rewards.push(card);
      total += card;
    }

    bowls.push({
      face,
      rewards,
      rewardTotal: total,
      placements: emptyPlacements(playerIds),
    });
  }

  return { bowls, rngState };
}
