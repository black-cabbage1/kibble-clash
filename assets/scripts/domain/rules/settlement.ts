import type {
  BowlSettlement,
  BowlState,
  PlayerId,
  PlayerState,
  RankedPlayer,
  RoundSettlement,
} from '../models/game-types';

function clashGroups(bowl: BowlState): Map<number, PlayerId[]> {
  const groups = new Map<number, PlayerId[]>();
  for (const [playerId, dice] of Object.entries(bowl.placements)) {
    if (dice <= 0) continue;
    const group = groups.get(dice) ?? [];
    group.push(playerId);
    groups.set(dice, group);
  }
  return groups;
}

export function settleBowl(bowl: BowlState): BowlSettlement {
  const groups = clashGroups(bowl);
  const clashedPlayerIds = [...groups.values()]
    .filter((group) => group.length > 1)
    .flat();
  const clashed = new Set(clashedPlayerIds);
  const survivors = Object.entries(bowl.placements)
    .filter(([playerId, dice]) => dice > 0 && !clashed.has(playerId))
    .sort((left, right) => right[1] - left[1]);
  const rewards = [...bowl.rewards].sort((left, right) => right - left);
  const awards = survivors.slice(0, rewards.length).map(([playerId, dice], index) => ({
    playerId,
    dice,
    reward: rewards[index] ?? 0,
  }));

  return {
    face: bowl.face,
    clashedPlayerIds,
    awards,
    unclaimedRewards: rewards.slice(awards.length),
  };
}

export function settleRound(
  round: number,
  bowls: readonly BowlState[],
  players: readonly PlayerState[],
): { settlement: RoundSettlement; players: PlayerState[] } {
  const settlements = bowls.map(settleBowl);
  const nextPlayers = players.map((player) => {
    const rewards = settlements.flatMap((bowl) =>
      bowl.awards
        .filter((award) => award.playerId === player.id)
        .map((award) => award.reward),
    );
    const clashCount = settlements.filter((bowl) =>
      bowl.clashedPlayerIds.includes(player.id),
    ).length;
    return {
      ...player,
      score: player.score + rewards.reduce((sum, reward) => sum + reward, 0),
      rewards: [...player.rewards, ...rewards],
      clashCount: player.clashCount + clashCount,
      largestReward: Math.max(player.largestReward, ...rewards, 0),
    };
  });

  return {
    settlement: { round, bowls: settlements },
    players: nextPlayers,
  };
}

export function rankPlayers(players: readonly PlayerState[]): RankedPlayer[] {
  const sorted = [...players].sort((left, right) => right.score - left.score);
  let previousScore: number | null = null;
  let previousRank = 0;
  return sorted.map((player, index) => {
    const rank =
      previousScore === player.score ? previousRank : index + 1;
    previousScore = player.score;
    previousRank = rank;
    return {
      playerId: player.id,
      rank,
      score: player.score,
      clashCount: player.clashCount,
      largestReward: player.largestReward,
    };
  });
}
