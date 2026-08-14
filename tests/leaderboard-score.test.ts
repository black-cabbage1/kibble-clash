import { describe, expect, it } from 'vitest';
import { leaderboardScoreFromPlayers } from '../assets/scripts/application/leaderboard-score';
import { isValidLeaderboardScore } from '../assets/scripts/platform/apps-in-toss/game-center-leaderboard';
import type { PlayerState } from '../assets/scripts/domain/models/game-types';

function player(kind: PlayerState['kind'], score: number): PlayerState {
  return {
    id: kind === 'human' ? 'human' : 'ai',
    characterId: kind === 'human' ? 'pug' : 'poodle',
    name: kind,
    kind,
    team: kind === 'human' ? 'a' : 'b',
    symbol: kind === 'human' ? 'H' : 'A',
    remainingDice: 0,
    score,
    rewards: [],
    clashCount: 0,
    largestReward: 0,
  };
}

describe('leaderboard score', () => {
  it('uses the human player final kibble score without weighting', () => {
    expect(leaderboardScoreFromPlayers([player('ai', 999), player('human', 1850)]))
      .toBe(1850);
  });

  it('accepts zero and rejects negative or non-finite scores', () => {
    expect(isValidLeaderboardScore(0)).toBe(true);
    expect(isValidLeaderboardScore(920)).toBe(true);
    expect(isValidLeaderboardScore(-1)).toBe(false);
    expect(isValidLeaderboardScore(Number.NaN)).toBe(false);
    expect(isValidLeaderboardScore(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('fails explicitly when no human result exists', () => {
    expect(() => leaderboardScoreFromPlayers([player('ai', 100)]))
      .toThrow('사용자 플레이어');
  });
});
