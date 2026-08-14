import type { CharacterId } from '../domain/models/game-types';

export interface CharacterVisualConfig {
  id: CharacterId; playerId: string; displayName: string; selectImage: string; avatarImage: string;
  winnerImage: string; primaryColor: string; symbol: string; personalityText: string; team: string; featuredOnHome: boolean;
}

export const CHARACTER_VISUALS: readonly CharacterVisualConfig[] = [
  { id: 'jindo-mix', playerId: 'jindo', displayName: '진도믹스', selectImage: '/characters/jindo-mix/jindo-mix_select.png', avatarImage: '/avatars/jindo-mix_avatar.png', winnerImage: '/winner/jindo-mix_win.png', primaryColor: '#347bc1', symbol: '◆', personalityText: '영리하고 눈치 빠른 밥그릇 탐색꾼', team: '파랑', featuredOnHome: true },
  { id: 'poodle', playerId: 'poodle', displayName: '푸들', selectImage: '/characters/poodle/poodle_select.png', avatarImage: '/avatars/poodle_avatar.png', winnerImage: '/winner/poodle_win.png', primaryColor: '#d95d91', symbol: '●', personalityText: '귀여운 얼굴 뒤에 숨은 전략가', team: '분홍', featuredOnHome: true },
  { id: 'pug', playerId: 'pug', displayName: '퍼그', selectImage: '/characters/pug/pug_select.png', avatarImage: '/avatars/pug_avatar.png', winnerImage: '/winner/pug_win.png', primaryColor: '#d0951f', symbol: '▲', personalityText: '한 그릇에 과감하게 몰아붙이는 승부사', team: '노랑', featuredOnHome: true },
  { id: 'golden-retriever', playerId: 'retriever', displayName: '골든리트리버', selectImage: '/characters/golden-retriever/golden-retriever_select.png', avatarImage: '/avatars/golden-retriever_avatar.png', winnerImage: '/winner/golden-retriever_win.png', primaryColor: '#459866', symbol: '★', personalityText: '안전한 보상을 차근차근 챙기는 평화주의자', team: '초록', featuredOnHome: true },
  { id: 'welsh-corgi', playerId: 'corgi', displayName: '웰시코기', selectImage: '/characters/welsh-corgi/welsh-corgi_select.png', avatarImage: '/avatars/welsh-corgi_avatar.png', winnerImage: '/winner/welsh-corgi_win.png', primaryColor: '#159c96', symbol: '♣', personalityText: '짧은 다리로 누구보다 빠르게 달려드는 분위기 메이커', team: '청록', featuredOnHome: true },
  { id: 'maltese', playerId: 'maltese', displayName: '몰티즈', selectImage: '/characters/maltese.png', avatarImage: '/avatars/maltese.png', winnerImage: '/winner/maltese_win.png', primaryColor: '#cf4545', symbol: '♥', personalityText: '작지만 당차게 밥그릇을 노리는 승부사', team: '빨강', featuredOnHome: false },
  { id: 'pomeranian', playerId: 'pomeranian', displayName: '포메라니안', selectImage: '/characters/pomeranian.png', avatarImage: '/avatars/pomeranian.png', winnerImage: '/winner/pomeranian_win.png', primaryColor: '#334b79', symbol: '✦', personalityText: '풍성한 털만큼 자신감 넘치는 전략가', team: '남색', featuredOnHome: false },
  { id: 'bichon', playerId: 'bichon', displayName: '비숑프리제', selectImage: '/characters/bichon.png', avatarImage: '/avatars/bichon.png', winnerImage: '/winner/bichon_win.png', primaryColor: '#8659b5', symbol: '●', personalityText: '몽글몽글 웃으며 빈틈을 찾는 탐색가', team: '보라', featuredOnHome: false },
];

export function isCharacterId(value: unknown): value is CharacterId { return CHARACTER_VISUALS.some((character) => character.id === value); }
export function characterVisual(characterId: CharacterId): CharacterVisualConfig {
  const visual = CHARACTER_VISUALS.find((character) => character.id === characterId);
  if (visual === undefined) throw new Error(`캐릭터 시각 설정이 없습니다: ${characterId}`);
  return visual;
}
export const ART_PATHS = {
  bowl: (face: number): string => `/bowls/bowls${face}.png`,
  reward: (value: number): string => value <= 20 ? '/rewards/rewards1.png' : value <= 40 ? '/rewards/rewards2.png' : '/rewards/rewards3.png',
  clash: '/effects/effect_kibble_clash.png', gameBackground: '/backgrounds/bg_game_board.png', characterSelectBackground: '/backgrounds/character-select-bg.png',
} as const;
