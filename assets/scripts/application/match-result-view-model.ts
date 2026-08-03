import { characterVisual } from '../config/character-visual-config';
import type {
  CharacterId,
  PlayerState,
} from '../domain/models/game-types';
import { rankPlayers } from '../domain/rules/settlement';

export interface MatchResultRankingItem {
  playerId: string;
  characterId: CharacterId;
  displayName: string;
  rank: number;
  score: number;
  title: string;
  imagePath: string;
  isHuman: boolean;
}

export interface MatchResultViewModel {
  winner: MatchResultRankingItem & {
    winnerImagePath: string;
  };
  humanResult: MatchResultRankingItem & {
    isWinner: boolean;
    scoreGap: number;
  };
  rankings: MatchResultRankingItem[];
}

function playerTitle(player: PlayerState, rank: number): string {
  if (rank === 1) return '사료왕';
  if (player.clashCount >= 3) return '충돌 전문가';
  return '눈치 탐색가';
}

export function createMatchResultViewModel(
  players: readonly PlayerState[],
): MatchResultViewModel {
  const rankedPlayers = rankPlayers(players);
  const rankings = rankedPlayers.map(({ playerId, rank, score }) => {
    const player = players.find((candidate) => candidate.id === playerId);
    if (player === undefined) throw new Error(`최종 결과 플레이어가 없습니다: ${playerId}`);
    const visual = characterVisual(player.characterId);
    return {
      playerId,
      characterId: player.characterId,
      displayName: player.name,
      rank,
      score,
      title: playerTitle(player, rank),
      imagePath: visual.selectImage,
      isHuman: player.kind === 'human',
    };
  });
  const winnerRanking = rankings[0];
  const humanRanking = rankings.find((entry) => entry.isHuman);
  if (winnerRanking === undefined) throw new Error('최종 우승자가 없습니다.');
  if (humanRanking === undefined) throw new Error('사용자 최종 결과가 없습니다.');

  return {
    winner: {
      ...winnerRanking,
      winnerImagePath: characterVisual(winnerRanking.characterId).winnerImage,
    },
    humanResult: {
      ...humanRanking,
      isWinner: humanRanking.rank === 1,
      scoreGap: Math.max(0, winnerRanking.score - humanRanking.score),
    },
    rankings,
  };
}
