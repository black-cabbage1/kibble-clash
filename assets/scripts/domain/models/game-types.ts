export type PlayerId = string;
export type PlayerKind = 'human' | 'ai';
export type CharacterId =
  | 'jindo-mix'
  | 'poodle'
  | 'pug'
  | 'golden-retriever'
  | 'welsh-corgi';
export type GamePhase =
  | 'awaiting-choice'
  | 'round-result'
  | 'match-result';

export interface PlayerDefinition {
  id: PlayerId;
  characterId: CharacterId;
  name: string;
  kind: PlayerKind;
  team: string;
  symbol: string;
}

export interface AiConfig {
  rewardWeight: number;
  diceWeight: number;
  survivalRankWeight: number;
  clashRiskPenalty: number;
  clashOpponentBonus: number;
  opportunityCostWeight: number;
  randomError: number;
}

export interface GameConfig {
  rounds: number;
  dicePerPlayer: number;
  bowlCount: number;
  dieFaces: number;
  minimumBowlReward: number;
  rewardCards: number[];
  players: PlayerDefinition[];
  ai: AiConfig;
  maxAutomaticSteps: number;
}

export interface PlayerState extends PlayerDefinition {
  remainingDice: number;
  score: number;
  rewards: number[];
  clashCount: number;
  largestReward: number;
}

export interface BowlState {
  face: number;
  rewards: number[];
  rewardTotal: number;
  placements: Record<PlayerId, number>;
}

export interface RollState {
  values: number[];
  counts: number[];
}

export interface BowlAward {
  playerId: PlayerId;
  dice: number;
  reward: number;
}

export interface BowlSettlement {
  face: number;
  clashedPlayerIds: PlayerId[];
  awards: BowlAward[];
  unclaimedRewards: number[];
}

export interface RoundSettlement {
  round: number;
  bowls: BowlSettlement[];
}

export interface RankedPlayer {
  playerId: PlayerId;
  rank: number;
  score: number;
  clashCount: number;
  largestReward: number;
}

export interface GameState {
  seed: number;
  rngState: number;
  phase: GamePhase;
  round: number;
  starterIndex: number;
  currentPlayerIndex: number;
  players: PlayerState[];
  bowls: BowlState[];
  currentRoll: RollState;
  lastRoundSettlement: RoundSettlement | null;
}

export interface ChoiceResult {
  state: GameState;
  placedFace: number;
  placedCount: number;
}

export type GameRuleErrorCode =
  | 'INVALID_CONFIG'
  | 'INVALID_FACE'
  | 'FACE_NOT_ROLLED'
  | 'NOT_AWAITING_CHOICE'
  | 'NOT_ROUND_RESULT'
  | 'REWARD_DECK_EMPTY'
  | 'AUTOMATIC_STEP_LIMIT';

export class GameRuleError extends Error {
  constructor(
    public readonly code: GameRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameRuleError';
  }
}
