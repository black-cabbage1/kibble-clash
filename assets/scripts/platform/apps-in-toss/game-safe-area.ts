import { SafeAreaInsets } from '@apps-in-toss/web-framework';

export interface GameSafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const EMPTY_GAME_SAFE_AREA: GameSafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

function normalizeInsets(value: Partial<GameSafeAreaInsets> | null | undefined): GameSafeAreaInsets {
  return {
    top: Math.max(0, Number(value?.top) || 0),
    right: Math.max(0, Number(value?.right) || 0),
    bottom: Math.max(0, Number(value?.bottom) || 0),
    left: Math.max(0, Number(value?.left) || 0),
  };
}

export function subscribeToGameSafeArea(
  onChange: (insets: GameSafeAreaInsets) => void,
): () => void {
  try {
    onChange(normalizeInsets(SafeAreaInsets.get()));
  } catch {
    onChange(EMPTY_GAME_SAFE_AREA);
  }

  try {
    return SafeAreaInsets.subscribe({
      onEvent: (insets) => onChange(normalizeInsets(insets)),
    });
  } catch {
    return () => undefined;
  }
}
