import { POINT_CONFIG } from '../config/point-config';
import { isCharacterId } from '../config/character-visual-config';
import type { CharacterId } from '../domain/models/game-types';
import type { KeyValueStorage } from '../platform/storage/selected-character-storage';

export const POINT_STORAGE_KEY = 'kibble-clash:progress';
export const POINT_STORAGE_VERSION = 3;
export const DEFAULT_UNLOCKED_CHARACTER_ID: CharacterId = 'jindo-mix';

export enum PointReason {
  GAME_1ST = 'GAME_1ST',
  GAME_2ND = 'GAME_2ND',
  GAME_3RD = 'GAME_3RD',
  GAME_4TH = 'GAME_4TH',
  GAME_5TH = 'GAME_5TH',
  DAILY_ATTENDANCE = 'DAILY_ATTENDANCE',
  TUTORIAL_COMPLETE = 'TUTORIAL_COMPLETE',
  CHARACTER_UNLOCK = 'CHARACTER_UNLOCK',
  DEV_TEST_GRANT = 'DEV_TEST_GRANT',
}

export interface PointTransaction {
  id: string;
  amount: number;
  reason: PointReason;
  createdAt: string;
  gameSessionId?: string;
  characterId?: CharacterId;
}

export interface ProgressState {
  version: 3;
  points: { balance: number };
  attendance: { lastClaimDate: string | null };
  tutorial: { completed: boolean; rewardClaimed: boolean; promptDismissed: boolean };
  characters: { unlockedIds: CharacterId[] };
  rewards: { claimedGameSessionIds: string[] };
  transactions: PointTransaction[];
}

export interface PointMetadata { gameSessionId?: string }
export interface PointResult { success: boolean; balance: number; amount: number }

function browserStorage(): KeyValueStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function emptyState(): ProgressState {
  return {
    version: POINT_STORAGE_VERSION,
    points: { balance: 0 },
    attendance: { lastClaimDate: null },
    tutorial: { completed: false, rewardClaimed: false, promptDismissed: false },
    characters: { unlockedIds: [DEFAULT_UNLOCKED_CHARACTER_ID] },
    rewards: { claimedGameSessionIds: [] },
    transactions: [],
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function loadProgress(storage: KeyValueStorage | null = browserStorage()): ProgressState {
  if (storage === null) return emptyState();
  try {
    const parsed: unknown = JSON.parse(storage.getItem(POINT_STORAGE_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return emptyState();
    const source = parsed as Partial<ProgressState>;
    const balance = isNonNegativeInteger(source.points?.balance) ? source.points.balance : 0;
    const lastClaimDate = typeof source.attendance?.lastClaimDate === 'string'
      ? source.attendance.lastClaimDate : null;
    const claimed = Array.isArray(source.rewards?.claimedGameSessionIds)
      ? source.rewards.claimedGameSessionIds.filter((id): id is string => typeof id === 'string') : [];
    const transactions = Array.isArray(source.transactions)
      ? source.transactions.filter((item): item is PointTransaction => (
        typeof item === 'object' && item !== null
        && typeof (item as PointTransaction).id === 'string'
        && isNonNegativeInteger(Math.abs((item as PointTransaction).amount))
      )) : [];
    const storedUnlockedIds = (source as Partial<ProgressState>).characters?.unlockedIds;
    const unlockedIds = Array.from(new Set<CharacterId>([
      DEFAULT_UNLOCKED_CHARACTER_ID,
      ...(Array.isArray(storedUnlockedIds) ? storedUnlockedIds.filter(isCharacterId) : []),
    ]));
    return {
      version: POINT_STORAGE_VERSION,
      points: { balance },
      attendance: { lastClaimDate },
      tutorial: {
        completed: source.tutorial?.completed === true,
        rewardClaimed: source.tutorial?.rewardClaimed === true,
        promptDismissed: source.tutorial?.promptDismissed === true,
      },
      characters: { unlockedIds },
      rewards: { claimedGameSessionIds: claimed.slice(-POINT_CONFIG.maxClaimedGameSessions) },
      transactions: transactions.slice(-POINT_CONFIG.maxTransactions),
    };
  } catch { return emptyState(); }
}

function saveProgress(state: ProgressState, storage: KeyValueStorage | null): boolean {
  if (storage === null) return false;
  try { storage.setItem(POINT_STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

function transactionId(): string {
  try { return globalThis.crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random()}`; }
}

function validAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0;
}

export function getPointBalance(storage: KeyValueStorage | null = browserStorage()): number {
  return loadProgress(storage).points.balance;
}

export function addPoints(amount: number, reason: PointReason, metadata: PointMetadata = {}, storage: KeyValueStorage | null = browserStorage()): PointResult {
  const state = loadProgress(storage);
  if (!validAmount(amount) || state.points.balance > Number.MAX_SAFE_INTEGER - amount) {
    return { success: false, balance: state.points.balance, amount: 0 };
  }
  const transaction: PointTransaction = {
    id: transactionId(), amount, reason, createdAt: new Date().toISOString(),
    ...(metadata.gameSessionId === undefined ? {} : { gameSessionId: metadata.gameSessionId }),
  };
  const next = { ...state, points: { balance: state.points.balance + amount }, transactions: [...state.transactions, transaction].slice(-POINT_CONFIG.maxTransactions) };
  return saveProgress(next, storage)
    ? { success: true, balance: next.points.balance, amount }
    : { success: false, balance: state.points.balance, amount: 0 };
}

export function canSpendPoints(amount: number, storage: KeyValueStorage | null = browserStorage()): boolean {
  return validAmount(amount) && getPointBalance(storage) >= amount;
}

export function spendPoints(amount: number, reason: PointReason, metadata: PointMetadata = {}, storage: KeyValueStorage | null = browserStorage()): PointResult {
  const state = loadProgress(storage);
  if (!validAmount(amount) || state.points.balance < amount) return { success: false, balance: state.points.balance, amount: 0 };
  const transaction: PointTransaction = {
    id: transactionId(), amount: -amount, reason, createdAt: new Date().toISOString(),
    ...(metadata.gameSessionId === undefined ? {} : { gameSessionId: metadata.gameSessionId }),
  };
  const next = { ...state, points: { balance: state.points.balance - amount }, transactions: [...state.transactions, transaction].slice(-POINT_CONFIG.maxTransactions) };
  return saveProgress(next, storage)
    ? { success: true, balance: next.points.balance, amount }
    : { success: false, balance: state.points.balance, amount: 0 };
}

export function getUnlockedCharacterIds(storage: KeyValueStorage | null = browserStorage()): CharacterId[] {
  return [...loadProgress(storage).characters.unlockedIds];
}

export function isCharacterUnlocked(characterId: unknown, storage: KeyValueStorage | null = browserStorage()): characterId is CharacterId {
  return isCharacterId(characterId) && loadProgress(storage).characters.unlockedIds.includes(characterId);
}

export function getNextFriendJoinCost(storage: KeyValueStorage | null = browserStorage()): number | null {
  const joinedFriendCount = Math.max(0, loadProgress(storage).characters.unlockedIds.length - 1);
  return POINT_CONFIG.friendJoinCosts[joinedFriendCount] ?? null;
}

export function joinCharacter(characterId: unknown, storage: KeyValueStorage | null = browserStorage()): PointResult {
  const state = loadProgress(storage);
  if (!isCharacterId(characterId)
    || characterId === DEFAULT_UNLOCKED_CHARACTER_ID
    || state.characters.unlockedIds.includes(characterId)) {
    return { success: false, balance: state.points.balance, amount: 0 };
  }
  const joinedFriendCount = Math.max(0, state.characters.unlockedIds.length - 1);
  const amount = POINT_CONFIG.friendJoinCosts[joinedFriendCount];
  if (amount === undefined || state.points.balance < amount) {
    return { success: false, balance: state.points.balance, amount: 0 };
  }
  const transaction: PointTransaction = {
    id: transactionId(), amount: -amount, reason: PointReason.CHARACTER_UNLOCK,
    createdAt: new Date().toISOString(), characterId,
  };
  const next: ProgressState = {
    ...state,
    points: { balance: state.points.balance - amount },
    characters: { unlockedIds: [...state.characters.unlockedIds, characterId] },
    transactions: [...state.transactions, transaction].slice(-POINT_CONFIG.maxTransactions),
  };
  return saveProgress(next, storage)
    ? { success: true, balance: next.points.balance, amount }
    : { success: false, balance: state.points.balance, amount: 0 };
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function hasClaimedAttendance(date = new Date(), storage: KeyValueStorage | null = browserStorage()): boolean {
  return loadProgress(storage).attendance.lastClaimDate === localDateKey(date);
}

export function claimDailyAttendance(date = new Date(), storage: KeyValueStorage | null = browserStorage()): PointResult {
  const state = loadProgress(storage);
  const today = localDateKey(date);
  const amount = POINT_CONFIG.attendanceReward;
  if (state.attendance.lastClaimDate === today || state.points.balance > Number.MAX_SAFE_INTEGER - amount) {
    return { success: false, balance: state.points.balance, amount: 0 };
  }
  const transaction: PointTransaction = { id: transactionId(), amount, reason: PointReason.DAILY_ATTENDANCE, createdAt: date.toISOString() };
  const next: ProgressState = {
    ...state,
    points: { balance: state.points.balance + amount },
    attendance: { lastClaimDate: today },
    transactions: [...state.transactions, transaction].slice(-POINT_CONFIG.maxTransactions),
  };
  return saveProgress(next, storage)
    ? { success: true, balance: next.points.balance, amount }
    : { success: false, balance: state.points.balance, amount: 0 };
}

export function claimGameReward(gameSessionId: string, rank: number, amount: number, storage: KeyValueStorage | null = browserStorage()): PointResult {
  const state = loadProgress(storage);
  if (!gameSessionId || state.rewards.claimedGameSessionIds.includes(gameSessionId) || !validAmount(amount) || rank < 1 || rank > 5) {
    return { success: false, balance: state.points.balance, amount: 0 };
  }
  const reason = PointReason[`GAME_${rank}${rank === 1 ? 'ST' : rank === 2 ? 'ND' : rank === 3 ? 'RD' : 'TH'}` as keyof typeof PointReason];
  if (reason === undefined || state.points.balance > Number.MAX_SAFE_INTEGER - amount) return { success: false, balance: state.points.balance, amount: 0 };
  const transaction: PointTransaction = { id: transactionId(), amount, reason, createdAt: new Date().toISOString(), gameSessionId };
  const next: ProgressState = {
    ...state,
    points: { balance: state.points.balance + amount },
    rewards: { claimedGameSessionIds: [...state.rewards.claimedGameSessionIds, gameSessionId].slice(-POINT_CONFIG.maxClaimedGameSessions) },
    transactions: [...state.transactions, transaction].slice(-POINT_CONFIG.maxTransactions),
  };
  return saveProgress(next, storage)
    ? { success: true, balance: next.points.balance, amount }
    : { success: false, balance: state.points.balance, amount: 0 };
}

export function dismissTutorialPrompt(storage: KeyValueStorage | null = browserStorage()): boolean {
  const state = loadProgress(storage);
  if (state.tutorial.promptDismissed) return true;
  return saveProgress({ ...state, tutorial: { ...state.tutorial, promptDismissed: true } }, storage);
}

export function shouldShowTutorialPrompt(storage: KeyValueStorage | null = browserStorage()): boolean {
  const tutorial = loadProgress(storage).tutorial;
  return !tutorial.completed && !tutorial.promptDismissed;
}

export function completeTutorial(storage: KeyValueStorage | null = browserStorage()): PointResult {
  const state = loadProgress(storage);
  if (state.tutorial.rewardClaimed) {
    if (!state.tutorial.completed) {
      saveProgress({ ...state, tutorial: { ...state.tutorial, completed: true } }, storage);
    }
    return { success: false, balance: state.points.balance, amount: 0 };
  }
  const amount = POINT_CONFIG.tutorialReward;
  if (state.points.balance > Number.MAX_SAFE_INTEGER - amount) {
    return { success: false, balance: state.points.balance, amount: 0 };
  }
  const transaction: PointTransaction = {
    id: transactionId(), amount, reason: PointReason.TUTORIAL_COMPLETE, createdAt: new Date().toISOString(),
  };
  const next: ProgressState = {
    ...state,
    points: { balance: state.points.balance + amount },
    tutorial: { completed: true, rewardClaimed: true, promptDismissed: true },
    transactions: [...state.transactions, transaction].slice(-POINT_CONFIG.maxTransactions),
  };
  return saveProgress(next, storage)
    ? { success: true, balance: next.points.balance, amount }
    : { success: false, balance: state.points.balance, amount: 0 };
}

export function formatPoints(amount: number): string {
  return `${Math.max(0, Math.trunc(amount)).toLocaleString('ko-KR')} P`;
}
