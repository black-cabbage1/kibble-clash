import type { AiDifficulty } from '../domain/models/game-types';

export interface DifficultyRecommendationInput {
  difficulty: AiDifficulty;
  playerRank: number;
  isWinner: boolean;
}

export interface DifficultyRecommendation {
  visible: boolean;
  title: string;
  description: string;
  recommendedDifficulty: AiDifficulty | null;
  canChangeDifficulty: boolean;
}

const HIDDEN: DifficultyRecommendation = {
  visible: false,
  title: '',
  description: '',
  recommendedDifficulty: null,
  canChangeDifficulty: false,
};

export function getDifficultyRecommendation({ difficulty, isWinner }: DifficultyRecommendationInput): DifficultyRecommendation {
  if (difficulty === 'easy') {
    return { visible: true, title: '너무 쉬웠나요?', description: '보통 난이도에 도전해 보세요!', recommendedDifficulty: 'normal', canChangeDifficulty: true };
  }
  if (difficulty === 'normal' && isWinner) {
    return { visible: true, title: '너무 쉬웠나요?', description: '어려움 난이도에 도전해 보세요!', recommendedDifficulty: 'hard', canChangeDifficulty: true };
  }
  if (difficulty === 'hard' && isWinner) {
    return { visible: true, title: '어려움 난이도 정복!', description: '최고의 사료왕이에요!', recommendedDifficulty: null, canChangeDifficulty: false };
  }
  return HIDDEN;
}
