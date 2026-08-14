import type { PlayerState } from '../domain/models/game-types';

export function leaderboardScoreFromPlayers(
  players: readonly PlayerState[],
): number {
  const human = players.find((player) => player.kind === 'human');
  if (human === undefined) {
    throw new Error('리더보드 점수를 계산할 사용자 플레이어가 없습니다.');
  }
  return human.score;
}
