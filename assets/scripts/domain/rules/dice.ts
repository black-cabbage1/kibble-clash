import type { RollState } from '../models/game-types';
import { randomInt } from '../rng/seeded-rng';

export function rollDice(
  count: number,
  faces: number,
  initialRngState: number,
): { roll: RollState; rngState: number } {
  const values: number[] = [];
  const counts = Array.from({ length: faces }, () => 0);
  let rngState = initialRngState;

  for (let index = 0; index < count; index += 1) {
    const result = randomInt(rngState, 1, faces);
    rngState = result.state;
    values.push(result.value);
    const countIndex = result.value - 1;
    counts[countIndex] = (counts[countIndex] ?? 0) + 1;
  }

  return { roll: { values, counts }, rngState };
}

export function availableFaces(roll: RollState): number[] {
  return roll.counts.flatMap((count, index) => (count > 0 ? [index + 1] : []));
}
