import { describe, expect, it } from 'vitest';
import {
  canRoll,
  canSelectBowl,
  initialTurnPhase,
  type TurnPhase,
} from '../assets/scripts/application/turn-flow';

describe('사용자 턴 UI 흐름', () => {
  it('사용자 차례는 굴리기 준비 상태로 시작한다', () => {
    expect(initialTurnPhase('human')).toBe('roll-ready');
  });

  it('AI 차례와 참가자가 없는 상태에서는 기다린다', () => {
    expect(initialTurnPhase('ai')).toBe('waiting');
    expect(initialTurnPhase(undefined)).toBe('waiting');
  });

  it('각 조작은 해당 단계에서만 허용된다', () => {
    const phases: TurnPhase[] = ['waiting', 'roll-ready', 'rolling', 'selecting', 'resolving'];
    expect(phases.filter(canRoll)).toEqual(['roll-ready']);
    expect(phases.filter(canSelectBowl)).toEqual(['selecting']);
  });
});
