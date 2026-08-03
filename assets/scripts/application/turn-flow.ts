import type { PlayerKind } from '../domain/models/game-types';

export type TurnPhase =
  | 'waiting'
  | 'roll-ready'
  | 'rolling'
  | 'selecting'
  | 'resolving';

export function initialTurnPhase(playerKind: PlayerKind | undefined): TurnPhase {
  return playerKind === 'human' ? 'roll-ready' : 'waiting';
}

export function canRoll(phase: TurnPhase): boolean {
  return phase === 'roll-ready';
}

export function canSelectBowl(phase: TurnPhase): boolean {
  return phase === 'selecting';
}

