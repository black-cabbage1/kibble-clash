import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../assets/scripts/config/game-config';
import { chooseAiAction, evaluateAiCandidates } from '../assets/scripts/domain/ai/choose-action';
import type { AiDifficulty, GameConfig, GameState, PlayerState } from '../assets/scripts/domain/models/game-types';
import { availableFaces, rollDice } from '../assets/scripts/domain/rules/dice';
import { chooseFace, continueAfterRound, createGame } from '../assets/scripts/domain/rules/game-engine';
import { dealBowlRewards } from '../assets/scripts/domain/rules/reward-deck';

const players: PlayerState[] = [
  { id: 'ai', characterId: 'pug', name: 'AI', kind: 'ai', team: 'a', symbol: 'A', remainingDice: 3, score: 0, rewards: [], clashCount: 0, largestReward: 0 },
  { id: 'p1', characterId: 'poodle', name: 'P1', kind: 'human', team: 'b', symbol: 'B', remainingDice: 3, score: 0, rewards: [], clashCount: 0, largestReward: 0 },
  { id: 'p2', characterId: 'welsh-corgi', name: 'P2', kind: 'human', team: 'c', symbol: 'C', remainingDice: 3, score: 0, rewards: [], clashCount: 0, largestReward: 0 },
  { id: 'p3', characterId: 'golden-retriever', name: 'P3', kind: 'human', team: 'd', symbol: 'D', remainingDice: 3, score: 0, rewards: [], clashCount: 0, largestReward: 0 },
];

function config(difficulty: AiDifficulty): GameConfig {
  return { ...DEFAULT_GAME_CONFIG, players, rewardCards: [...DEFAULT_GAME_CONFIG.rewardCards], ai: { ...DEFAULT_GAME_CONFIG.ai, difficulty, difficultyConfigs: { ...DEFAULT_GAME_CONFIG.ai.difficultyConfigs } } };
}

function scenario(rewards: number[], placements: Record<string, number>[], counts: number[], round = 1, scores = [0, 0, 0, 0], rngState = 1): GameState {
  return {
    seed: 1, rngState, phase: 'awaiting-choice', round, starterIndex: 0, currentPlayerIndex: 0,
    players: players.map((player, index) => ({ ...player, score: scores[index] ?? 0 })),
    bowls: rewards.map((rewardTotal, index) => ({ face: index + 1, rewards: [rewardTotal], rewardTotal, placements: { ai: 0, p1: 0, p2: 0, p3: 0, ...(placements[index] ?? {}) } })),
    currentRoll: { values: counts.flatMap((count, index) => Array(count).fill(index + 1)), counts }, lastRoundSettlement: null,
  };
}

describe('AI difficulty evaluation', () => {
  it('A: easy is reward-led while normal/hard avoid a crowded tie', () => {
    const state = scenario([90, 50, 50, 50, 50, 50], [{ p1: 1, p2: 2 }, {}, {}, {}, {}, {}], [2, 1, 0, 0, 0, 0]);
    expect(evaluateAiCandidates(state, config('easy')).sort((a, b) => b.score - a.score)[0]?.face).toBe(1);
    expect(evaluateAiCandidates(state, config('normal')).sort((a, b) => b.score - a.score)[0]?.face).toBe(2);
    expect(evaluateAiCandidates(state, config('hard')).sort((a, b) => b.score - a.score)[0]?.face).toBe(2);
  });

  it('B: tie risk penalty grows by difficulty', () => {
    const state = scenario([60, 60, 50, 50, 50, 50], [{ p1: 2 }, {}, {}, {}, {}, {}], [2, 2, 0, 0, 0, 0]);
    const gap = (difficulty: AiDifficulty) => {
      const c = evaluateAiCandidates(state, config(difficulty));
      return c.find((x) => x.face === 2)!.score - c.find((x) => x.face === 1)!.score;
    };
    expect(gap('normal')).toBeGreaterThan(gap('easy'));
    expect(gap('hard')).toBeGreaterThan(gap('normal'));
  });

  it('C/D: hard changes late-round risk value based on score position', () => {
    const placements = [{ p1: 1 }, {}, {}, {}, {}, {}];
    const trailing = scenario([90, 40, 50, 50, 50, 50], placements, [2, 1, 0, 0, 0, 0], 4, [50, 100, 60, 40]);
    const leading = scenario([90, 40, 50, 50, 50, 50], placements, [2, 1, 0, 0, 0, 0], 4, [180, 100, 80, 70]);
    const advantage = (state: GameState) => { const c = evaluateAiCandidates(state, config('hard')); return c.find((x) => x.face === 1)!.score - c.find((x) => x.face === 2)!.score; };
    expect(advantage(trailing)).toBeGreaterThan(advantage(leading));
  });

  it('uses one decision RNG step regardless of difficulty', () => {
    const state = scenario([90, 50, 50, 50, 50, 50], [{ p1: 1 }, {}, {}, {}, {}, {}], [2, 1, 0, 0, 0, 0], 1, [0, 0, 0, 0], 98765);
    const rngStates = (['easy', 'normal', 'hard'] as const).map((difficulty) => chooseAiAction(state, config(difficulty)).rngState);
    expect(new Set(rngStates).size).toBe(1);
  });

  it('keeps dice, rewards, player dice, scoring and collision rules identical', () => {
    const configs = (['easy', 'normal', 'hard'] as const).map(config);
    expect(configs.map((entry) => entry.dicePerPlayer)).toEqual([8, 8, 8]);
    expect(configs.map((entry) => entry.rewardCards)).toEqual([DEFAULT_GAME_CONFIG.rewardCards, DEFAULT_GAME_CONFIG.rewardCards, DEFAULT_GAME_CONFIG.rewardCards]);
    expect(configs.map((entry) => rollDice(8, entry.dieFaces, 12345))).toEqual(Array(3).fill(rollDice(8, 6, 12345)));
    expect(configs.map((entry) => dealBowlRewards(entry, 54321).bowls)).toEqual(Array(3).fill(dealBowlRewards(configs[0]!, 54321).bowls));
  });

  it('E: repeated identical situations improve objective choice rate by level', () => {
    const rates = (['easy', 'normal', 'hard'] as const).map((difficulty) => {
      let safe = 0;
      for (let seed = 1; seed <= 1000; seed += 1) {
        const state = scenario([90, 50, 50, 50, 50, 50], [{ p1: 1, p2: 2 }, {}, {}, {}, {}, {}], [2, 1, 0, 0, 0, 0], 1, [0, 0, 0, 0], (seed * 2654435761) >>> 0);
        if (chooseAiAction(state, config(difficulty)).face === 2) safe += 1;
      }
      return safe / 1000;
    });
    expect(rates[0]!).toBeLessThan(rates[1]!);
    expect(rates[1]!).toBeLessThan(rates[2]!);
  });

  it('E2: repeated full matches show difficulty benchmark statistics', () => {
    const results = (['easy', 'normal', 'hard'] as const).map((difficulty) => {
      const gameConfig = config(difficulty);
      let aiScore = 0;
      let aiWins = 0;
      for (let seed = 1; seed <= 300; seed += 1) {
        let state = createGame(gameConfig, seed);
        while (state.phase !== 'match-result') {
          if (state.phase === 'round-result') { state = continueAfterRound(state, gameConfig); continue; }
          const current = state.players[state.currentPlayerIndex]!;
          const aiChoice = current.kind === 'ai' ? chooseAiAction(state, gameConfig) : null;
          const face = aiChoice?.face ?? availableFaces(state.currentRoll)[0]!;
          const rngState = aiChoice?.rngState ?? state.rngState;
          state = chooseFace({ ...state, rngState }, gameConfig, face).state;
        }
        const ais = state.players.filter((player) => player.kind === 'ai');
        aiScore += ais.reduce((sum, player) => sum + player.score, 0) / ais.length;
        const human = state.players.find((player) => player.kind === 'human')!;
        if (Math.max(...ais.map((player) => player.score)) > human.score) aiWins += 1;
      }
      return { averageAiScore: aiScore / 300, aiWinRate: aiWins / 300 };
    });
    console.info('[AI BALANCE 300 MATCHES EACH]', results);
    expect(results[0]!.averageAiScore).toBeLessThan(results[1]!.averageAiScore);
    expect(results[1]!.averageAiScore).toBeLessThan(results[2]!.averageAiScore);
    expect(results[0]!.aiWinRate).toBeLessThanOrEqual(results[1]!.aiWinRate);
    expect(results[1]!.aiWinRate).toBeLessThanOrEqual(results[2]!.aiWinRate);
  });
});
