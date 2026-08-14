export const POINT_LABEL = 'P';
export const FRIEND_JOIN_COSTS = [500, 1_000, 1_500, 2_000, 2_500, 3_000, 3_500] as const;

export const POINT_CONFIG = {
  gameRewards: {
    1: 100,
    2: 70,
    3: 50,
    4: 35,
    5: 25,
  },
  attendanceReward: 100,
  tutorialReward: 300,
  friendJoinCosts: FRIEND_JOIN_COSTS,
  maxTransactions: 100,
  maxClaimedGameSessions: 100,
} as const;

export type RewardedRank = keyof typeof POINT_CONFIG.gameRewards;

export function gamePointReward(rank: number): number {
  return POINT_CONFIG.gameRewards[rank as RewardedRank] ?? 0;
}
