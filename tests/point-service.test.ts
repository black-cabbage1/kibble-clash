import { describe, expect, it } from 'vitest';
import { POINT_CONFIG, gamePointReward } from '../assets/scripts/config/point-config';
import {
  POINT_STORAGE_KEY,
  PointReason,
  addPoints,
  canSpendPoints,
  claimDailyAttendance,
  claimGameReward,
  completeTutorial,
  dismissTutorialPrompt,
  formatPoints,
  getPointBalance,
  getNextFriendJoinCost,
  getUnlockedCharacterIds,
  hasClaimedAttendance,
  loadProgress,
  localDateKey,
  shouldShowTutorialPrompt,
  spendPoints,
  joinCharacter,
} from '../assets/scripts/application/point-service';
import type { KeyValueStorage } from '../assets/scripts/platform/storage/selected-character-storage';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('point service', () => {
  it('starts existing users at zero without touching unrelated storage', () => {
    const storage = memoryStorage({ 'kibble-clash:selected-character': 'pug' });
    expect(getPointBalance(storage)).toBe(0);
    expect(loadProgress(storage).attendance.lastClaimDate).toBeNull();
  });

  it('adds and spends through validated common APIs without going negative', () => {
    const storage = memoryStorage();
    expect(addPoints(150, PointReason.TUTORIAL_COMPLETE, {}, storage).success).toBe(true);
    expect(canSpendPoints(151, storage)).toBe(false);
    expect(spendPoints(151, PointReason.CHARACTER_UNLOCK, {}, storage).success).toBe(false);
    expect(spendPoints(50, PointReason.CHARACTER_UNLOCK, {}, storage).success).toBe(true);
    expect(getPointBalance(storage)).toBe(100);
  });

  it.each([NaN, Infinity, -1, 0, 1.5])('rejects invalid additions: %s', (amount) => {
    const storage = memoryStorage();
    expect(addPoints(amount, PointReason.TUTORIAL_COMPLETE, {}, storage).success).toBe(false);
    expect(getPointBalance(storage)).toBe(0);
  });

  it('claims attendance once per local calendar date, not per 24 hours', () => {
    const storage = memoryStorage();
    const morning = new Date(2026, 7, 14, 9);
    const evening = new Date(2026, 7, 14, 20);
    const afterMidnight = new Date(2026, 7, 15, 0, 1);
    expect(localDateKey(morning)).toBe('2026-08-14');
    expect(claimDailyAttendance(morning, storage).amount).toBe(POINT_CONFIG.attendanceReward);
    expect(claimDailyAttendance(evening, storage).success).toBe(false);
    expect(hasClaimedAttendance(evening, storage)).toBe(true);
    expect(claimDailyAttendance(afterMidnight, storage).success).toBe(true);
    expect(getPointBalance(storage)).toBe(200);
  });

  it('claims each completed game session exactly once and uses configured rank rewards', () => {
    const storage = memoryStorage();
    expect(claimGameReward('game-1', 1, gamePointReward(1), storage).amount).toBe(100);
    expect(claimGameReward('game-1', 1, gamePointReward(1), storage).success).toBe(false);
    expect(claimGameReward('game-2', 5, gamePointReward(5), storage).amount).toBe(25);
    expect(getPointBalance(storage)).toBe(125);
  });

  it('does not reward an invalid/unranked game result', () => {
    const storage = memoryStorage();
    expect(claimGameReward('game-1', 0, 0, storage).success).toBe(false);
    expect(claimGameReward('', 1, 100, storage).success).toBe(false);
    expect(getPointBalance(storage)).toBe(0);
  });

  it('recovers safely from malformed progress data and formats thousands', () => {
    const storage = memoryStorage({ [POINT_STORAGE_KEY]: '{broken' });
    expect(getPointBalance(storage)).toBe(0);
    expect(formatPoints(12_500)).toBe('12,500 P');
  });

  it('dismisses the first prompt without completing or rewarding the tutorial', () => {
    const storage = memoryStorage();
    expect(shouldShowTutorialPrompt(storage)).toBe(true);
    expect(dismissTutorialPrompt(storage)).toBe(true);
    expect(shouldShowTutorialPrompt(storage)).toBe(false);
    expect(loadProgress(storage).tutorial.completed).toBe(false);
    expect(getPointBalance(storage)).toBe(0);
  });

  it('commits tutorial completion and its reward only once', () => {
    const storage = memoryStorage();
    expect(completeTutorial(storage).amount).toBe(POINT_CONFIG.tutorialReward);
    expect(completeTutorial(storage).success).toBe(false);
    expect(loadProgress(storage).tutorial).toEqual({ completed: true, rewardClaimed: true, promptDismissed: true });
    expect(getPointBalance(storage)).toBe(300);
  });

  it('migrates V1 point data by adding default tutorial state', () => {
    const storage = memoryStorage({
      [POINT_STORAGE_KEY]: JSON.stringify({ version: 1, points: { balance: 125 }, attendance: { lastClaimDate: null }, rewards: { claimedGameSessionIds: [] }, transactions: [] }),
    });
    expect(loadProgress(storage).tutorial).toEqual({ completed: false, rewardClaimed: false, promptDismissed: false });
    expect(getPointBalance(storage)).toBe(125);
    expect(getUnlockedCharacterIds(storage)).toEqual(['jindo-mix']);
  });

  it('joins friends atomically in the chosen order with escalating shared costs', () => {
    const storage = memoryStorage();
    addPoints(2_000, PointReason.TUTORIAL_COMPLETE, {}, storage);
    expect(getNextFriendJoinCost(storage)).toBe(500);
    expect(joinCharacter('bichon', storage)).toMatchObject({ success: true, amount: 500, balance: 1_500 });
    expect(getNextFriendJoinCost(storage)).toBe(1_000);
    expect(joinCharacter('pug', storage)).toMatchObject({ success: true, amount: 1_000, balance: 500 });
    expect(getUnlockedCharacterIds(storage)).toEqual(['jindo-mix', 'bichon', 'pug']);
  });

  it('rejects duplicate, invalid, and insufficient friend joins without deducting points', () => {
    const storage = memoryStorage();
    addPoints(500, PointReason.TUTORIAL_COMPLETE, {}, storage);
    expect(joinCharacter('poodle', storage).success).toBe(true);
    expect(joinCharacter('poodle', storage).success).toBe(false);
    expect(joinCharacter('not-a-dog', storage).success).toBe(false);
    expect(joinCharacter('pug', storage).success).toBe(false);
    expect(getPointBalance(storage)).toBe(0);
  });

  it('finishes the seven-friend sequence and exposes no further join cost', () => {
    const storage = memoryStorage();
    addPoints(14_000, PointReason.TUTORIAL_COMPLETE, {}, storage);
    for (const characterId of ['poodle', 'pug', 'golden-retriever', 'welsh-corgi', 'maltese', 'pomeranian', 'bichon']) {
      expect(joinCharacter(characterId, storage).success).toBe(true);
    }
    expect(getUnlockedCharacterIds(storage)).toHaveLength(8);
    expect(getNextFriendJoinCost(storage)).toBeNull();
    expect(getPointBalance(storage)).toBe(0);
  });
});
