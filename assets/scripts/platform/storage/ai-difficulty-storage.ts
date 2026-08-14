import type { AiDifficulty } from '../../domain/models/game-types';
import type { KeyValueStorage } from './selected-character-storage';

export const AI_DIFFICULTY_STORAGE_KEY = 'kibble-clash:ai-difficulty';
export const DEFAULT_AI_DIFFICULTY: AiDifficulty = 'normal';

export function isAiDifficulty(value: unknown): value is AiDifficulty {
  return value === 'easy' || value === 'normal' || value === 'hard';
}

function browserStorage(): KeyValueStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function loadAiDifficulty(storage: KeyValueStorage | null = browserStorage()): AiDifficulty {
  if (storage === null) return DEFAULT_AI_DIFFICULTY;
  try {
    const value = storage.getItem(AI_DIFFICULTY_STORAGE_KEY);
    return isAiDifficulty(value) ? value : DEFAULT_AI_DIFFICULTY;
  } catch { return DEFAULT_AI_DIFFICULTY; }
}

export function saveAiDifficulty(value: AiDifficulty, storage: KeyValueStorage | null = browserStorage()): void {
  if (storage === null) return;
  try { storage.setItem(AI_DIFFICULTY_STORAGE_KEY, value); } catch { /* optional persistence */ }
}
