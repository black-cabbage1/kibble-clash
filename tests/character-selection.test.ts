import { describe, expect, it } from 'vitest';
import {
  CHARACTER_VISUALS,
  characterVisual,
} from '../assets/scripts/config/character-visual-config';
import { createGameConfigForCharacter } from '../assets/scripts/config/game-config';
import { createGame } from '../assets/scripts/domain/rules/game-engine';
import {
  DEFAULT_CHARACTER_ID,
  loadSelectedCharacter,
  saveSelectedCharacter,
  SELECTED_CHARACTER_STORAGE_KEY,
  type KeyValueStorage,
} from '../assets/scripts/platform/storage/selected-character-storage';

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('캐릭터 선택과 플레이어 역할 분리', () => {
  it('기존 5종과 신규 3종을 하나의 8종 캐릭터 소스로 제공한다', () => {
    expect(CHARACTER_VISUALS).toHaveLength(8);
    expect(CHARACTER_VISUALS.slice(-3).map(({ id }) => id)).toEqual(['maltese', 'pomeranian', 'bichon']);
    for (const id of ['maltese', 'pomeranian', 'bichon'] as const) {
      const visual = characterVisual(id);
      expect(visual.selectImage).toBe(`/characters/${id}.png`);
      expect(visual.avatarImage).toBe(`/avatars/${id}.png`);
      expect(visual.winnerImage).toBe(`/winner/${id}_win.png`);
    }
  });

  it.each(CHARACTER_VISUALS.map(({ id }) => [id] as const))(
    '%s를 선택하면 해당 캐릭터만 사용자에게 배정된다',
    (characterId) => {
      const gameConfig = createGameConfigForCharacter(characterId);
      const human = gameConfig.players.filter((player) => player.kind === 'human');
      const ai = gameConfig.players.filter((player) => player.kind === 'ai');
      expect(human).toHaveLength(1);
      expect(human[0]?.characterId).toBe(characterId);
      expect(ai).toHaveLength(3);
      expect(new Set(gameConfig.players.map((player) => player.characterId)).size).toBe(4);
      expect(gameConfig.players).toHaveLength(4);
      expect(createGame(gameConfig, 77).players[0]?.characterId).toBe(characterId);
    },
  );

  it('신규 캐릭터 3종이 AI 후보에도 모두 등장할 수 있다', () => {
    const aiCharacters = new Set(CHARACTER_VISUALS.flatMap(({ id }) =>
      createGameConfigForCharacter(id).players.filter((player) => player.kind === 'ai').map((player) => player.characterId)));
    expect([...aiCharacters]).toEqual(expect.arrayContaining(['maltese', 'pomeranian', 'bichon']));
  });

  it('저장한 캐릭터를 다음 선택 화면의 기본값으로 읽는다', () => {
    const storage = new MemoryStorage();
    saveSelectedCharacter('pug', storage);
    expect(storage.getItem(SELECTED_CHARACTER_STORAGE_KEY)).toBe('pug');
    expect(loadSelectedCharacter(storage)).toBe('pug');
  });

  it('유효하지 않은 저장값은 진도믹스로 fallback한다', () => {
    const storage = new MemoryStorage();
    storage.setItem(SELECTED_CHARACTER_STORAGE_KEY, 'cat');
    expect(loadSelectedCharacter(storage)).toBe(DEFAULT_CHARACTER_ID);
  });

  it('저장소 예외와 누락 이미지 경로가 게임 실행을 막지 않는다', () => {
    const blockedStorage: KeyValueStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(loadSelectedCharacter(blockedStorage)).toBe(DEFAULT_CHARACTER_ID);
    expect(() => saveSelectedCharacter('poodle', blockedStorage)).not.toThrow();
    expect(characterVisual('poodle').avatarImage).toContain('poodle_avatar.png');
    expect(() => createGame(createGameConfigForCharacter('poodle'), 12)).not.toThrow();
  });
});
