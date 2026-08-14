import { Game } from '@apps-in-toss/web-framework';

export type LeaderboardSubmissionResult =
  | 'submitted'
  | 'unsupported'
  | 'invalid-score'
  | 'failed';

export type OpenLeaderboardResult = 'opened' | 'unsupported' | 'failed';

export function isValidLeaderboardScore(score: number): boolean {
  return Number.isFinite(score) && score >= 0;
}

export function isGameCenterSupported(): boolean {
  try {
    return Game.setLeaderboardScore.isSupported()
      && Game.openLeaderboard.isSupported();
  } catch {
    return false;
  }
}

export async function submitLeaderboardScore(
  score: number,
): Promise<LeaderboardSubmissionResult> {
  if (!isValidLeaderboardScore(score)) return 'invalid-score';
  if (!isGameCenterSupported()) return 'unsupported';

  try {
    const response = await Game.setLeaderboardScore({ score: String(score) });
    if (response === undefined) return 'unsupported';
    return response.statusCode === 'SUCCESS' ? 'submitted' : 'failed';
  } catch {
    return 'failed';
  }
}

export async function openLeaderboard(): Promise<OpenLeaderboardResult> {
  if (!isGameCenterSupported()) return 'unsupported';

  try {
    await Game.openLeaderboard();
    return 'opened';
  } catch {
    return 'failed';
  }
}
