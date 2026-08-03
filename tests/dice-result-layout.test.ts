import { describe, expect, it } from 'vitest';
import {
  diceResultRowWidth,
  MAX_RESULT_DICE,
} from '../assets/scripts/application/dice-result-layout';

describe('주사위 결과 한 줄 배치', () => {
  const maximumWidth = diceResultRowWidth(MAX_RESULT_DICE);

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('%i개가 최대 결과 폭 안에 들어간다', (count) => {
    expect(diceResultRowWidth(count)).toBeLessThanOrEqual(maximumWidth);
  });

  it('8개 결과에 필요한 최소 너비는 298px이다', () => {
    expect(maximumWidth).toBe(298);
  });
});
