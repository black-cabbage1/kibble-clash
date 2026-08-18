import { describe, expect, it } from 'vitest';
import { isOfficialRankingEligible, OFFICIAL_RANKING_DIFFICULTY } from '../assets/scripts/application/official-ranking';

describe('official ranking eligibility', () => {
  it('allows only the hard difficulty', () => {
    expect(OFFICIAL_RANKING_DIFFICULTY).toBe('hard');
    expect(isOfficialRankingEligible('easy')).toBe(false);
    expect(isOfficialRankingEligible('normal')).toBe(false);
    expect(isOfficialRankingEligible('hard')).toBe(true);
  });
});
