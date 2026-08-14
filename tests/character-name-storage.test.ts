import { describe, expect, it } from 'vitest';
import { createGameConfigForCharacter } from '../assets/scripts/config/game-config';
import {
  CHARACTER_NAMES_STORAGE_KEY,
  loadCharacterNames,
  normalizeCharacterName,
  saveCharacterName,
} from '../assets/scripts/platform/storage/character-name-storage';
import type { KeyValueStorage } from '../assets/scripts/platform/storage/selected-character-storage';

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('캐릭터 사용자 이름', () => {
  it('한글·영문·숫자만 남기고 표시 문자 기준 6자로 제한한다', () => {
    expect(normalizeCharacterName('  몽실이  ')).toBe('몽실이');
    expect(normalizeCharacterName('Dog 12!@')).toBe('Dog12');
    expect(normalizeCharacterName('가나다라마바사')).toBe('가나다라마바사'.slice(0, 6));
  });

  it('캐릭터별로 저장하고 빈 값은 기본 이름으로 되돌린다', () => {
    const storage = new MemoryStorage();
    let names = saveCharacterName('pug', '춘식이', {}, storage);
    names = saveCharacterName('poodle', '몽실이', names, storage);
    expect(loadCharacterNames(storage)).toEqual({ pug: '춘식이', poodle: '몽실이' });
    names = saveCharacterName('pug', '   ', names, storage);
    expect(names.pug).toBeUndefined();
    expect(storage.getItem(CHARACTER_NAMES_STORAGE_KEY)).toContain('몽실이');
  });

  it.each(['maltese', 'pomeranian', 'bichon'] as const)('%s의 사용자 이름을 독립 저장한다', (characterId) => {
    const storage = new MemoryStorage();
    saveCharacterName(characterId, '구름이', {}, storage);
    expect(loadCharacterNames(storage)[characterId]).toBe('구름이');
    expect(createGameConfigForCharacter(characterId, loadCharacterNames(storage)).players[0])
      .toMatchObject({ characterId, name: '구름이', kind: 'human' });
  });

  it('표시 이름만 바꾸고 캐릭터와 플레이어 식별자는 유지한다', () => {
    const config = createGameConfigForCharacter('pug', { pug: '춘식이', poodle: '몽실이' });
    expect(config.players.find((player) => player.characterId === 'pug'))
      .toMatchObject({ id: 'pug', characterId: 'pug', name: '춘식이', kind: 'human' });
    expect(config.players.find((player) => player.characterId === 'poodle')?.name).toBe('몽실이');
  });

  it('손상된 저장 데이터는 안전하게 무시한다', () => {
    const storage = new MemoryStorage();
    storage.setItem(CHARACTER_NAMES_STORAGE_KEY, '{bad');
    expect(loadCharacterNames(storage)).toEqual({});
  });
});
