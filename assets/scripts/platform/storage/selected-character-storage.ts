import type { CharacterId } from '../../domain/models/game-types';
import { isCharacterId } from '../../config/character-visual-config';

export const SELECTED_CHARACTER_STORAGE_KEY = 'kibble-clash:selected-character';
export const DEFAULT_CHARACTER_ID: CharacterId = 'jindo-mix';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSelectedCharacter(
  storage: KeyValueStorage | null = browserStorage(),
): CharacterId {
  if (storage === null) return DEFAULT_CHARACTER_ID;
  try {
    const value = storage.getItem(SELECTED_CHARACTER_STORAGE_KEY);
    return isCharacterId(value) ? value : DEFAULT_CHARACTER_ID;
  } catch {
    return DEFAULT_CHARACTER_ID;
  }
}

export function saveSelectedCharacter(
  characterId: CharacterId,
  storage: KeyValueStorage | null = browserStorage(),
): void {
  if (storage === null) return;
  try {
    storage.setItem(SELECTED_CHARACTER_STORAGE_KEY, characterId);
  } catch {
    // 저장이 막힌 인앱/프라이빗 환경에서도 게임은 계속 실행한다.
  }
}
