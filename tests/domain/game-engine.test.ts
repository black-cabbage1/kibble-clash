import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../../assets/scripts/config/game-config';
import { chooseAiAction } from '../../assets/scripts/domain/ai/choose-action';
import type {
  BowlState,
  GameConfig,
  GameState,
  PlayerState,
} from '../../assets/scripts/domain/models/game-types';
import { GameRuleError } from '../../assets/scripts/domain/models/game-types';
import { shuffle } from '../../assets/scripts/domain/rng/seeded-rng';
import { availableFaces } from '../../assets/scripts/domain/rules/dice';
import {
  chooseFace,
  continueAfterRound,
  createGame,
} from '../../assets/scripts/domain/rules/game-engine';
import { dealBowlRewards } from '../../assets/scripts/domain/rules/reward-deck';
import {
  rankPlayers,
  settleBowl,
} from '../../assets/scripts/domain/rules/settlement';
import {
  continueSession,
  createSession,
  submitHumanChoice,
} from '../../assets/scripts/application/game-session';

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    ...DEFAULT_GAME_CONFIG,
    ...overrides,
    players: overrides.players ?? DEFAULT_GAME_CONFIG.players.map((player) => ({ ...player })),
    rewardCards: overrides.rewardCards ?? [...DEFAULT_GAME_CONFIG.rewardCards],
    ai: { ...DEFAULT_GAME_CONFIG.ai, ...(overrides.ai ?? {}) },
  };
}

function bowl(
  placements: Record<string, number>,
  rewards = [30, 20, 10],
  face = 1,
): BowlState {
  return {
    face,
    placements,
    rewards,
    rewardTotal: rewards.reduce((sum, value) => sum + value, 0),
  };
}

function playRoundByFirstAvailable(
  initial: GameState,
  gameConfig: GameConfig,
): GameState {
  let state = initial;
  let steps = 0;
  while (state.phase === 'awaiting-choice') {
    steps += 1;
    expect(steps).toBeLessThan(200);
    const face = availableFaces(state.currentRoll)[0];
    expect(face).toBeDefined();
    state = chooseFace(state, gameConfig, face!).state;
  }
  return state;
}

describe('Seeded RNG와 보상 준비', () => {
  it('1. 같은 시드에서 셔플 결과가 재현된다', () => {
    expect(shuffle([1, 2, 3, 4, 5], 42)).toEqual(
      shuffle([1, 2, 3, 4, 5], 42),
    );
  });

  it('2. 같은 시드에서 보상 덱 순서와 밥그릇 구성이 재현된다', () => {
    expect(dealBowlRewards(config(), 777)).toEqual(
      dealBowlRewards(config(), 777),
    );
  });

  it('3. 모든 밥그릇은 최소 보상 이상을 받는다', () => {
    const gameConfig = config();
    const result = dealBowlRewards(gameConfig, 1);
    expect(result.bowls).toHaveLength(6);
    expect(
      result.bowls.every(
        (entry) => entry.rewardTotal >= gameConfig.minimumBowlReward,
      ),
    ).toBe(true);
  });

  it('4. 첫 주사위 선택 전에 여섯 밥그릇 보상이 확정된다', () => {
    const state = createGame(config(), 9);
    expect(state.phase).toBe('awaiting-choice');
    expect(state.bowls).toHaveLength(6);
    expect(state.bowls.every((entry) => entry.rewards.length > 0)).toBe(true);
  });

  it('보상 덱이 작아도 명시적 재충전으로 배치가 끝난다', () => {
    const gameConfig = config({
      rewardCards: [10],
      minimumBowlReward: 50,
    });
    const result = dealBowlRewards(gameConfig, 3);
    expect(result.bowls.every((entry) => entry.rewardTotal === 50)).toBe(true);
  });
});

describe('주사위 선택과 턴 진행', () => {
  it('5. 굴림에 없는 숫자는 선택할 수 없다', () => {
    const gameConfig = config();
    const state = createGame(gameConfig, 11);
    const unavailable = [1, 2, 3, 4, 5, 6].find(
      (face) => !availableFaces(state.currentRoll).includes(face),
    );
    if (unavailable === undefined) return;
    expect(() => chooseFace(state, gameConfig, unavailable)).toThrowError(
      GameRuleError,
    );
  });

  it('6. 선택한 눈의 주사위가 모두 해당 밥그릇에 배치된다', () => {
    const gameConfig = config();
    const state = createGame(gameConfig, 12);
    const face = availableFaces(state.currentRoll)[0]!;
    const expected = state.currentRoll.counts[face - 1]!;
    const result = chooseFace(state, gameConfig, face);
    expect(result.placedCount).toBe(expected);
    expect(result.state.bowls[face - 1]!.placements.jindo).toBe(expected);
  });

  it('7. 일부 개수를 전달하는 API가 존재하지 않고 항상 전체 개수가 배치된다', () => {
    const gameConfig = config();
    const state = createGame(gameConfig, 13);
    const face = availableFaces(state.currentRoll)[0]!;
    const count = state.currentRoll.counts[face - 1]!;
    expect(chooseFace(state, gameConfig, face).placedCount).toBe(count);
  });

  it('8. 배치 후 남은 주사위가 정확하다', () => {
    const gameConfig = config();
    const state = createGame(gameConfig, 14);
    const face = availableFaces(state.currentRoll)[0]!;
    const count = state.currentRoll.counts[face - 1]!;
    const next = chooseFace(state, gameConfig, face).state;
    expect(next.players[0]!.remainingDice).toBe(
      gameConfig.dicePerPlayer - count,
    );
  });

  it('9. 주사위가 없는 플레이어의 턴을 건너뛴다', () => {
    const gameConfig = config({ dicePerPlayer: 1 });
    let state = createGame(gameConfig, 15);
    const firstFace = state.currentRoll.values[0]!;
    state = chooseFace(state, gameConfig, firstFace).state;
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.players[0]!.remainingDice).toBe(0);
    const secondFace = state.currentRoll.values[0]!;
    state = chooseFace(state, gameConfig, secondFace).state;
    expect(state.currentPlayerIndex).toBe(2);
  });

  it('10. 모든 주사위가 소진되면 라운드 결과 상태가 된다', () => {
    const gameConfig = config({ dicePerPlayer: 1 });
    const state = playRoundByFirstAvailable(createGame(gameConfig, 16), gameConfig);
    expect(state.phase).toBe('round-result');
    expect(state.players.every((player) => player.remainingDice === 0)).toBe(true);
  });
});

describe('동률 상쇄와 보상 정산', () => {
  it('11. 같은 주사위 수의 플레이어가 모두 제외된다', () => {
    const result = settleBowl(
      bowl({ jindo: 3, poodle: 3, pug: 1, retriever: 0 }),
    );
    expect(result.clashedPlayerIds).toEqual(
      expect.arrayContaining(['jindo', 'poodle']),
    );
    expect(result.awards[0]?.playerId).toBe('pug');
  });

  it('12. 복수 동률 집단이 각각 상쇄된다', () => {
    const result = settleBowl(
      bowl({ jindo: 2, poodle: 2, pug: 1, retriever: 1 }),
    );
    expect(result.clashedPlayerIds).toHaveLength(4);
    expect(result.awards).toHaveLength(0);
  });

  it('13. 상쇄 후 생존자가 주사위 수 순서로 정렬된다', () => {
    const result = settleBowl(
      bowl({ jindo: 4, poodle: 3, pug: 3, retriever: 1 }),
    );
    expect(result.awards.map((award) => award.playerId)).toEqual([
      'jindo',
      'retriever',
    ]);
  });

  it('14. 높은 순위부터 가장 큰 보상을 한 장씩 받는다', () => {
    const result = settleBowl(
      bowl({ jindo: 4, poodle: 3, pug: 3, retriever: 1 }, [10, 30, 20]),
    );
    expect(result.awards.map((award) => award.reward)).toEqual([30, 20]);
  });

  it('15. 한 플레이어는 한 밥그릇에서 한 장만 받는다', () => {
    const result = settleBowl(
      bowl({ jindo: 4, poodle: 0, pug: 0, retriever: 0 }),
    );
    expect(result.awards).toHaveLength(1);
    expect(result.awards[0]).toMatchObject({ playerId: 'jindo', reward: 30 });
  });

  it('16. 남은 보상 카드는 미획득으로 회수된다', () => {
    const result = settleBowl(
      bowl({ jindo: 4, poodle: 0, pug: 0, retriever: 0 }),
    );
    expect(result.unclaimedRewards).toEqual([20, 10]);
  });

  it('17. 모두 상쇄되면 아무도 보상을 받지 못한다', () => {
    const result = settleBowl(
      bowl({ jindo: 2, poodle: 2, pug: 1, retriever: 1 }),
    );
    expect(result.awards).toEqual([]);
    expect(result.unclaimedRewards).toEqual([30, 20, 10]);
  });
});

describe('라운드, 경기, AI', () => {
  it('18. 4라운드 결과가 누적되고 경기 결과로 종료된다', () => {
    const gameConfig = config({ dicePerPlayer: 2 });
    let state = createGame(gameConfig, 88);
    while (state.phase !== 'match-result') {
      if (state.phase === 'awaiting-choice') {
        state = playRoundByFirstAvailable(state, gameConfig);
      } else {
        state = continueAfterRound(state, gameConfig);
      }
    }
    expect(state.round).toBe(4);
    expect(state.players.every((player) => player.score >= 0)).toBe(true);
    expect(
      state.players.every(
        (player) =>
          player.score === player.rewards.reduce((sum, value) => sum + value, 0),
      ),
    ).toBe(true);
  });

  it('19. 시작 플레이어가 라운드마다 순환한다', () => {
    const gameConfig = config({ dicePerPlayer: 1 });
    let state = playRoundByFirstAvailable(createGame(gameConfig, 99), gameConfig);
    expect(state.starterIndex).toBe(0);
    state = continueAfterRound(state, gameConfig);
    expect(state.starterIndex).toBe(1);
    state = playRoundByFirstAvailable(state, gameConfig);
    state = continueAfterRound(state, gameConfig);
    expect(state.starterIndex).toBe(2);
  });

  it('20. AI는 현재 굴림에서 가능한 행동만 선택한다', () => {
    const gameConfig = config({ dicePerPlayer: 1 });
    let state = createGame(gameConfig, 100);
    state = chooseFace(state, gameConfig, state.currentRoll.values[0]!).state;
    expect(state.players[state.currentPlayerIndex]!.kind).toBe('ai');
    const choice = chooseAiAction(state, gameConfig);
    expect(availableFaces(state.currentRoll)).toContain(choice.face);
  });

  it('21. 자동 AI와 사용자 선택으로 경기가 무한 루프 없이 끝난다', () => {
    const gameConfig = config({ dicePerPlayer: 3 });
    let state = createSession(gameConfig, 101);
    let actions = 0;
    while (state.phase !== 'match-result') {
      actions += 1;
      expect(actions).toBeLessThan(100);
      if (state.phase === 'round-result') {
        state = continueSession(state, gameConfig);
      } else {
        const face = availableFaces(state.currentRoll)[0]!;
        state = submitHumanChoice(state, gameConfig, face);
      }
    }
    expect(state.round).toBe(4);
  });

  it('서로 다른 시드 100개의 경기가 모두 제한 단계 안에 끝난다', () => {
    const gameConfig = config();
    for (let seed = 1; seed <= 100; seed += 1) {
      let state = createSession(gameConfig, seed);
      let actions = 0;
      while (state.phase !== 'match-result') {
        actions += 1;
        expect(actions).toBeLessThan(200);
        if (state.phase === 'round-result') {
          state = continueSession(state, gameConfig);
        } else {
          state = submitHumanChoice(
            state,
            gameConfig,
            availableFaces(state.currentRoll)[0]!,
          );
        }
      }
      expect(state.round).toBe(4);
    }
  });

  it('최종 동점은 공동 순위를 사용한다', () => {
    const players = [
      { id: 'a', score: 100 },
      { id: 'b', score: 100 },
      { id: 'c', score: 80 },
    ].map(
      (partial, index): PlayerState => ({
        ...partial,
        name: partial.id,
        kind: index === 0 ? 'human' : 'ai',
        characterId: 'jindo-mix',
        team: partial.id,
        symbol: partial.id,
        remainingDice: 0,
        rewards: [partial.score],
        clashCount: 0,
        largestReward: partial.score,
      }),
    );
    expect(rankPlayers(players).map(({ rank }) => rank)).toEqual([1, 1, 3]);
  });
});
