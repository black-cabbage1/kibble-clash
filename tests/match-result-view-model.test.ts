import { describe, expect, it } from 'vitest';
import { createMatchResultViewModel } from '../assets/scripts/application/match-result-view-model';
import { createGameConfigForCharacter } from '../assets/scripts/config/game-config';
import { createGame } from '../assets/scripts/domain/rules/game-engine';

function finalPlayers(humanScore: number, aiScores: number[]) {
  const state = createGame(createGameConfigForCharacter('jindo-mix'), 44);
  return state.players.map((player, index) => ({
    ...player,
    score: index === 0 ? humanScore : aiScores[index - 1] ?? 0,
  }));
}

describe('Match Result 단일 ViewModel', () => {
  it('우승자와 전체 순위 1위가 같은 최종 결과를 참조한다', () => {
    const viewModel = createMatchResultViewModel(finalPlayers(110, [190, 150, 130]));
    expect(viewModel.winner.playerId).toBe(viewModel.rankings[0]?.playerId);
    expect(viewModel.winner.score).toBe(viewModel.rankings[0]?.score);
    expect(viewModel.winner.winnerImagePath).toContain('_win.png');
  });

  it('사용자 카드와 순위표의 사용자 행은 순위와 점수가 일치한다', () => {
    const viewModel = createMatchResultViewModel(finalPlayers(110, [190, 150, 130]));
    const humanRanking = viewModel.rankings.find((entry) => entry.isHuman);
    expect(viewModel.humanResult.rank).toBe(humanRanking?.rank);
    expect(viewModel.humanResult.score).toBe(humanRanking?.score);
    expect(viewModel.humanResult.scoreGap).toBe(80);
    expect(viewModel.humanResult.isWinner).toBe(false);
  });

  it('사용자가 실제 1위이면 우승 상태로 표시한다', () => {
    const viewModel = createMatchResultViewModel(finalPlayers(220, [190, 150, 130]));
    expect(viewModel.humanResult.isWinner).toBe(true);
    expect(viewModel.humanResult.rank).toBe(1);
    expect(viewModel.winner.playerId).toBe(viewModel.humanResult.playerId);
    expect(viewModel.humanResult.scoreGap).toBe(0);
  });

  it('동점 순위는 기존 결과 모델의 공동 순위를 유지한다', () => {
    const viewModel = createMatchResultViewModel(finalPlayers(190, [190, 150, 130]));
    expect(viewModel.rankings.slice(0, 2).map((entry) => entry.rank)).toEqual([1, 1]);
    expect(viewModel.humanResult.isWinner).toBe(true);
  });
});
