import type { CharacterId, GameConfig, PlayerDefinition } from '../domain/models/game-types';
import type { CharacterNames } from '../platform/storage/character-name-storage';
import { CHARACTER_VISUALS } from './character-visual-config';

function playersForCharacter(selectedCharacterId: CharacterId, characterNames: CharacterNames = {}): PlayerDefinition[] {
  const definitions = CHARACTER_VISUALS.map((character): Omit<PlayerDefinition, 'kind'> => ({
    id: character.playerId, characterId: character.id, name: characterNames[character.id] ?? character.displayName,
    team: character.team, symbol: character.symbol,
  }));
  const selected = definitions.find((character) => character.characterId === selectedCharacterId)!;
  const selectedVisual = CHARACTER_VISUALS.find((character) => character.id === selectedCharacterId)!;
  const otherDefinitions = definitions.filter((character) => character.characterId !== selectedCharacterId);
  const ordered = selectedVisual.featuredOnHome
    ? [selected, ...otherDefinitions]
    : [
      selected,
      ...otherDefinitions.filter((definition) => !CHARACTER_VISUALS.find((visual) => visual.id === definition.characterId)!.featuredOnHome),
      ...otherDefinitions.filter((definition) => CHARACTER_VISUALS.find((visual) => visual.id === definition.characterId)!.featuredOnHome),
    ];
  return ordered
    .slice(0, 4)
    .map((character) => ({ ...character, kind: character.characterId === selectedCharacterId ? 'human' : 'ai' }));
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  rounds: 4, dicePerPlayer: 8, bowlCount: 6, dieFaces: 6, minimumBowlReward: 50,
  rewardCards: [10,10,10,10,10,10,10,10,20,20,20,20,20,20,20,20,30,30,30,30,30,30,30,30,40,40,40,40,40,40,40,40,50,50,50,50,50,50,50,50],
  players: playersForCharacter('jindo-mix'),
  ai: {
    difficulty: 'normal', debug: false,
    difficultyConfigs: {
      easy: { rewardWeight: 0.72, winningChanceWeight: 18, tieRiskWeight: 4, competitionRiskWeight: 5, diceEfficiencyWeight: 3, scoreSituationWeight: 0, roundSituationWeight: 0, optimalChoiceProbability: 0.45, temperature: 1.8, candidateLimit: 4 },
      normal: { rewardWeight: 0.58, winningChanceWeight: 48, tieRiskWeight: 38, competitionRiskWeight: 18, diceEfficiencyWeight: 20, scoreSituationWeight: 4, roundSituationWeight: 3, optimalChoiceProbability: 0.76, temperature: 0.8, candidateLimit: 3 },
      hard: { rewardWeight: 0.52, winningChanceWeight: 64, tieRiskWeight: 62, competitionRiskWeight: 26, diceEfficiencyWeight: 26, scoreSituationWeight: 24, roundSituationWeight: 22, optimalChoiceProbability: 0.93, temperature: 0.25, candidateLimit: 2 },
    },
  },
  maxAutomaticSteps: 200,
};

export function createGameConfigForCharacter(selectedCharacterId: CharacterId, characterNames: CharacterNames = {}): GameConfig {
  return { ...DEFAULT_GAME_CONFIG, players: playersForCharacter(selectedCharacterId, characterNames), rewardCards: [...DEFAULT_GAME_CONFIG.rewardCards], ai: { ...DEFAULT_GAME_CONFIG.ai, difficultyConfigs: { ...DEFAULT_GAME_CONFIG.ai.difficultyConfigs } } };
}
