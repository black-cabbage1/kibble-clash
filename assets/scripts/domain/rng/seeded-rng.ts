export interface RandomResult {
  value: number;
  state: number;
}

function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export function nextRandom(state: number): RandomResult {
  let value = normalizeSeed(state);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  const nextState = value >>> 0;
  return {
    value: nextState / 0x1_0000_0000,
    state: nextState,
  };
}

export function randomInt(
  state: number,
  minimum: number,
  maximumInclusive: number,
): RandomResult {
  const result = nextRandom(state);
  const span = maximumInclusive - minimum + 1;
  return {
    value: minimum + Math.floor(result.value * span),
    state: result.state,
  };
}

export function shuffle<T>(
  source: readonly T[],
  initialState: number,
): { values: T[]; state: number } {
  const values = [...source];
  let state = initialState;
  for (let index = values.length - 1; index > 0; index -= 1) {
    const result = randomInt(state, 0, index);
    state = result.state;
    const swapIndex = result.value;
    const current = values[index];
    const other = values[swapIndex];
    if (current === undefined || other === undefined) {
      throw new Error('셔플 인덱스가 범위를 벗어났습니다.');
    }
    values[index] = other;
    values[swapIndex] = current;
  }
  return { values, state };
}
