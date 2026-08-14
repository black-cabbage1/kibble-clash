import type { CharacterId } from '../../domain/models/game-types';
import { isCharacterId } from '../../config/character-visual-config';
import type { KeyValueStorage } from './selected-character-storage';

export const CHARACTER_NAMES_STORAGE_KEY = 'kibble-clash:character-names';
export const MAX_CHARACTER_NAME_LENGTH = 6;
export type CharacterNames = Partial<Record<CharacterId, string>>;

function browserStorage(): KeyValueStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function normalizeCharacterName(value: string): string {
  return Array.from(value.trim().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]/g, ''))
    .slice(0, MAX_CHARACTER_NAME_LENGTH)
    .join('');
}

export function loadCharacterNames(
  storage: KeyValueStorage | null = browserStorage(),
): CharacterNames {
  if (storage === null) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CHARACTER_NAMES_STORAGE_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([id, value]) => {
      if (!isCharacterId(id) || typeof value !== 'string') return [];
      const name = normalizeCharacterName(value);
      return name.length === 0 ? [] : [[id, name]];
    })) as CharacterNames;
  } catch {
    return {};
  }
}

export function saveCharacterName(
  characterId: CharacterId,
  value: string,
  names: CharacterNames,
  storage: KeyValueStorage | null = browserStorage(),
): CharacterNames {
  const name = normalizeCharacterName(value);
  const next = { ...names };
  if (name.length === 0) delete next[characterId];
  else next[characterId] = name;
  if (storage !== null) {
    try { storage.setItem(CHARACTER_NAMES_STORAGE_KEY, JSON.stringify(next)); } catch { /* optional persistence */ }
  }
  return next;
}
