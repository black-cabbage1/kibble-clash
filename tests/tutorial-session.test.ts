import { describe, expect, it } from 'vitest';
import { createGameConfigForCharacter } from '../assets/scripts/config/game-config';
import {
  TUTORIAL_CLASH_FACE,
  TUTORIAL_SUCCESS_FACE,
  createTutorialConfig,
  createTutorialGame,
  placeTutorialHumanDice,
  runScriptedClashAi,
  runScriptedSuccessAi,
} from '../assets/scripts/application/tutorial-session';

describe('scripted tutorial session', () => {
  it('always creates the same short learning roll', () => {
    const config = createTutorialConfig(createGameConfigForCharacter('jindo-mix'));
    const state = createTutorialGame(config, 123);
    expect(config.rounds).toBe(1);
    expect(config.players).toHaveLength(2);
    expect(state.currentRoll.values).toEqual([1, 1, 3]);
  });

  it('uses the real placement and settlement rules for clash and solo ownership', () => {
    const config = createTutorialConfig(createGameConfigForCharacter('jindo-mix'));
    let state = createTutorialGame(config, 123);
    const humanId = state.players.find((player) => player.kind === 'human')!.id;
    const aiId = state.players.find((player) => player.kind === 'ai')!.id;

    state = placeTutorialHumanDice(state, config, TUTORIAL_CLASH_FACE);
    state = runScriptedClashAi(state, config);
    expect(state.bowls[0]!.placements).toMatchObject({ [humanId]: 2, [aiId]: 2 });

    state = placeTutorialHumanDice(state, config, TUTORIAL_SUCCESS_FACE);
    state = runScriptedSuccessAi(state, config);
    expect(state.phase).toBe('round-result');
    const clashBowl = state.lastRoundSettlement!.bowls.find((bowl) => bowl.face === TUTORIAL_CLASH_FACE)!;
    const successBowl = state.lastRoundSettlement!.bowls.find((bowl) => bowl.face === TUTORIAL_SUCCESS_FACE)!;
    expect(clashBowl.clashedPlayerIds).toEqual(expect.arrayContaining([humanId, aiId]));
    expect(clashBowl.awards).toHaveLength(0);
    expect(successBowl.awards.some((award) => award.playerId === humanId)).toBe(true);
  });
});
