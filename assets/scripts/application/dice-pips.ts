export const PIP_POSITIONS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
} as const satisfies Record<number, readonly number[]>;

export function pipPositions(value: number): readonly number[] {
  return PIP_POSITIONS[value as keyof typeof PIP_POSITIONS] ?? [];
}
