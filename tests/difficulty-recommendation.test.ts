import { describe, expect, it } from 'vitest';
import { getDifficultyRecommendation } from '../assets/scripts/application/difficulty-recommendation';

describe('difficulty recommendation', () => {
  it('recommends normal after completing easy', () => {
    expect(getDifficultyRecommendation({ difficulty: 'easy', playerRank: 4, isWinner: false })).toMatchObject({ visible: true, recommendedDifficulty: 'normal', canChangeDifficulty: true });
  });
  it('recommends hard only after winning normal', () => {
    expect(getDifficultyRecommendation({ difficulty: 'normal', playerRank: 1, isWinner: true })).toMatchObject({ visible: true, recommendedDifficulty: 'hard' });
    expect(getDifficultyRecommendation({ difficulty: 'normal', playerRank: 2, isWinner: false }).visible).toBe(false);
  });
  it('celebrates a hard win without another difficulty button', () => {
    expect(getDifficultyRecommendation({ difficulty: 'hard', playerRank: 1, isWinner: true })).toMatchObject({ visible: true, recommendedDifficulty: null, canChangeDifficulty: false });
    expect(getDifficultyRecommendation({ difficulty: 'hard', playerRank: 3, isWinner: false }).visible).toBe(false);
  });
});
