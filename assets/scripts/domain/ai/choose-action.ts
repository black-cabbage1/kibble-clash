import type { AiDifficultyConfig, BowlState, GameConfig, GameState, PlayerState } from '../models/game-types';
import { GameRuleError } from '../models/game-types';
import { nextRandom } from '../rng/seeded-rng';
import { availableFaces } from '../rules/dice';

export interface AiCandidate {
  face: number; diceCount: number; rewardValue: number; winningChance: number;
  tieRisk: number; competitionRisk: number; diceEfficiency: number;
  expectedReward: number; prospectiveRank: number | null;
  scoreSituation: number; roundSituation: number; score: number;
}
export interface AiChoice { face: number; rngState: number; scores: Record<number, number>; candidates: AiCandidate[]; }

export const HARD_AI_STRATEGY_CONFIG = {
  expectedRewardWeight: 0.7,
  expectedRewardRatioWeight: 18,
  extraClashRiskWeight: 22,
  trailingUpsideWeight: 24,
  leadingSafetyWeight: 18,
} as const;

function candidateFor(state: GameState, config: GameConfig, player: PlayerState, bowl: BowlState, face: number, weights: AiDifficultyConfig): AiCandidate {
  const diceCount = state.currentRoll.counts[face - 1] ?? 0;
  const ownAfter = (bowl.placements[player.id] ?? 0) + diceCount;
  const opponents = Object.entries(bowl.placements).filter(([id, count]) => id !== player.id && count > 0).map(([, count]) => count);
  const higher = opponents.filter((count) => count > ownAfter).length;
  const equal = opponents.filter((count) => count === ownAfter).length;
  const sortedRewards = [...bowl.rewards].sort((left, right) => right - left);
  const prospectiveRank = equal > 0 || higher >= sortedRewards.length ? null : higher + 1;
  const expectedReward = prospectiveRank === null ? 0 : sortedRewards[prospectiveRank - 1] ?? 0;
  const winningChance = equal > 0 ? 0.08 : higher === 0 ? 1 : Math.max(0.12, 1 - higher / Math.max(1, state.players.length - 1));
  const tieRisk = equal > 0 ? 1 : opponents.some((count) => Math.abs(count - ownAfter) === 1) ? 0.3 : 0;
  const competitionRisk = opponents.length / Math.max(1, state.players.length - 1) * (winningChance >= 0.9 ? 0.35 : 1);
  const diceEfficiency = (bowl.rewardTotal * winningChance) / Math.max(1, diceCount) / 100;
  const leaderScore = Math.max(...state.players.map((candidate) => candidate.score));
  const gap = leaderScore - player.score;
  const progress = state.round / config.rounds;
  const trailing = gap > 0 ? Math.min(1, gap / 100) : 0;
  const leading = gap === 0 ? Math.min(1, (player.score - Math.max(...state.players.filter((candidate) => candidate.id !== player.id).map((candidate) => candidate.score))) / 100) : 0;
  const riskValue = bowl.rewardTotal / Math.max(1, Math.max(...state.bowls.map((candidate) => candidate.rewardTotal)));
  const scoreSituation = trailing * riskValue - leading * competitionRisk;
  const roundSituation = progress * scoreSituation;
  let score = bowl.rewardTotal * weights.rewardWeight + winningChance * weights.winningChanceWeight + diceEfficiency * weights.diceEfficiencyWeight + scoreSituation * weights.scoreSituationWeight + roundSituation * weights.roundSituationWeight - competitionRisk * weights.competitionRiskWeight - tieRisk * weights.tieRiskWeight;
  if (config.ai.difficulty === 'hard') {
    const maximumReward = Math.max(1, ...state.bowls.flatMap((candidate) => candidate.rewards));
    const expectedRewardRatio = expectedReward / maximumReward;
    const strategy = HARD_AI_STRATEGY_CONFIG;
    score += expectedReward * strategy.expectedRewardWeight
      + expectedRewardRatio * strategy.expectedRewardRatioWeight
      - tieRisk * strategy.extraClashRiskWeight
      + progress * trailing * expectedRewardRatio * strategy.trailingUpsideWeight
      + progress * leading * (1 - tieRisk) * (1 - competitionRisk) * strategy.leadingSafetyWeight;
  }
  return { face, diceCount, rewardValue: bowl.rewardTotal, winningChance, tieRisk, competitionRisk, diceEfficiency, expectedReward, prospectiveRank, scoreSituation, roundSituation, score };
}

function selectCandidate(candidates: readonly AiCandidate[], randomValue: number, weights: AiDifficultyConfig): AiCandidate {
  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.face - b.face);
  const best = ranked[0];
  if (best === undefined) throw new GameRuleError('FACE_NOT_ROLLED', 'AI 행동 후보가 없습니다.');
  if (randomValue < weights.optimalChoiceProbability || ranked.length === 1) return best;
  const pool = ranked.slice(1, Math.max(2, weights.candidateLimit));
  const max = Math.max(...pool.map((candidate) => candidate.score));
  const scale = Math.max(1, Math.max(...pool.map((candidate) => Math.abs(candidate.score - max))));
  const weighted = pool.map((candidate) => ({ candidate, weight: Math.exp(((candidate.score - max) / scale) / weights.temperature) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = ((randomValue - weights.optimalChoiceProbability) / (1 - weights.optimalChoiceProbability)) * total;
  for (const entry of weighted) { cursor -= entry.weight; if (cursor <= 0) return entry.candidate; }
  return weighted.at(-1)?.candidate ?? best;
}

export function evaluateAiCandidates(state: GameState, config: GameConfig): AiCandidate[] {
  const player = state.players[state.currentPlayerIndex];
  if (player === undefined || player.kind !== 'ai') throw new GameRuleError('INVALID_CONFIG', '현재 플레이어가 AI가 아닙니다.');
  const weights = config.ai.difficultyConfigs[config.ai.difficulty];
  return availableFaces(state.currentRoll).flatMap((face) => {
    const bowl = state.bowls[face - 1];
    return bowl === undefined ? [] : [candidateFor(state, config, player, bowl, face, weights)];
  });
}

export function chooseAiAction(state: GameState, config: GameConfig): AiChoice {
  const candidates = evaluateAiCandidates(state, config);
  if (candidates.length === 0) throw new GameRuleError('FACE_NOT_ROLLED', 'AI가 선택할 눈이 없습니다.');
  const random = nextRandom(state.rngState);
  const selected = selectCandidate(candidates, random.value, config.ai.difficultyConfigs[config.ai.difficulty]);
  if (config.ai.debug && typeof console !== 'undefined') console.debug('[AI DEBUG]', { difficulty: config.ai.difficulty, candidates, selected });
  return { face: selected.face, rngState: random.state, scores: Object.fromEntries(candidates.map((candidate) => [candidate.face, candidate.score])), candidates };
}
