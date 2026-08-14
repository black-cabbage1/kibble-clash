import { describe, expect, it } from 'vitest';
import { AI_DIFFICULTY_STORAGE_KEY, loadAiDifficulty, saveAiDifficulty } from '../assets/scripts/platform/storage/ai-difficulty-storage';

describe('AI difficulty storage', () => {
  it('defaults invalid and missing values to normal', () => {
    expect(loadAiDifficulty(null)).toBe('normal');
    expect(loadAiDifficulty({ getItem: () => 'expert', setItem: () => undefined })).toBe('normal');
  });
  it('saves and loads a valid selection', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    saveAiDifficulty('hard', storage);
    expect(values.get(AI_DIFFICULTY_STORAGE_KEY)).toBe('hard');
    expect(loadAiDifficulty(storage)).toBe('hard');
  });
});
