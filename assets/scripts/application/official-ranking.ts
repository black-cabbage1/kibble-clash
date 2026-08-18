import type { AiDifficulty } from '../domain/models/game-types';

export const OFFICIAL_RANKING_DIFFICULTY: AiDifficulty = 'hard';

export function isOfficialRankingEligible(difficulty: AiDifficulty): boolean {
  return difficulty === OFFICIAL_RANKING_DIFFICULTY;
}
