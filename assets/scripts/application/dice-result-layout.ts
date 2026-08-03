export const RESULT_DIE_SIZE = 31;
export const RESULT_DIE_GAP = 4;
export const RESULT_ROW_PADDING = 18;
export const RESULT_ROW_BORDER = 4;
export const MAX_RESULT_DICE = 8;

export function diceResultRowWidth(diceCount: number): number {
  const count = Math.max(0, Math.min(MAX_RESULT_DICE, Math.floor(diceCount)));
  if (count === 0) return RESULT_ROW_PADDING + RESULT_ROW_BORDER;
  return (count * RESULT_DIE_SIZE)
    + ((count - 1) * RESULT_DIE_GAP)
    + RESULT_ROW_PADDING
    + RESULT_ROW_BORDER;
}
