import { describe, expect, it } from 'vitest';
import { pipPositions } from '../assets/scripts/application/dice-pips';

describe('fixed 3x3 dice pip positions', () => {
  it.each([
    [1, [5]],
    [2, [1, 9]],
    [3, [1, 5, 9]],
    [4, [1, 3, 7, 9]],
    [5, [1, 3, 5, 7, 9]],
    [6, [1, 3, 4, 6, 7, 9]],
  ])('renders face %i at explicit cells', (face, positions) => {
    expect(pipPositions(face)).toEqual(positions);
  });
});
