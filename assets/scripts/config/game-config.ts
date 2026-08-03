import type {
  CharacterId,
  GameConfig,
  PlayerDefinition,
} from '../domain/models/game-types';

const CHARACTER_PLAYERS: ReadonlyArray<
  Omit<PlayerDefinition, 'kind'>
> = [
  { id: 'jindo', characterId: 'jindo-mix', name: '진도믹스', team: '파랑', symbol: '◆' },
  { id: 'poodle', characterId: 'poodle', name: '푸들', team: '분홍', symbol: '●' },
  { id: 'pug', characterId: 'pug', name: '퍼그', team: '노랑', symbol: '▲' },
  { id: 'retriever', characterId: 'golden-retriever', name: '골든리트리버', team: '초록', symbol: '■' },
  { id: 'corgi', characterId: 'welsh-corgi', name: '웰시코기', team: '청록', symbol: '♣' },
];

function playersForCharacter(selectedCharacterId: CharacterId): PlayerDefinition[] {
  return [...CHARACTER_PLAYERS]
    .sort((left, right) => Number(right.characterId === selectedCharacterId) - Number(left.characterId === selectedCharacterId))
    .slice(0, 4)
    .map((character) => ({
      ...character,
      kind: character.characterId === selectedCharacterId ? 'human' : 'ai',
    }));
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  rounds: 4,
  dicePerPlayer: 8,
  bowlCount: 6,
  dieFaces: 6,
  minimumBowlReward: 50,
  rewardCards: [
    10, 10, 10, 10, 10, 10, 10, 10,
    20, 20, 20, 20, 20, 20, 20, 20,
    30, 30, 30, 30, 30, 30, 30, 30,
    40, 40, 40, 40, 40, 40, 40, 40,
    50, 50, 50, 50, 50, 50, 50, 50,
  ],
  players: playersForCharacter('jindo-mix'),
  ai: {
    rewardWeight: 1,
    diceWeight: 9,
    survivalRankWeight: 18,
    clashRiskPenalty: 24,
    clashOpponentBonus: 11,
    opportunityCostWeight: 0.12,
    randomError: 7,
  },
  maxAutomaticSteps: 200,
};

export function createGameConfigForCharacter(
  selectedCharacterId: CharacterId,
): GameConfig {
  return {
    ...DEFAULT_GAME_CONFIG,
    players: playersForCharacter(selectedCharacterId),
    rewardCards: [...DEFAULT_GAME_CONFIG.rewardCards],
    ai: { ...DEFAULT_GAME_CONFIG.ai },
  };
}
