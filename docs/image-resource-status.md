# 이미지 리소스 적용 현황

## 생성 및 적용 완료

- `assets/art/characters/jindo-mix/jindo-mix_select.png`
- `assets/art/characters/poodle/poodle_select.png`
- `assets/art/characters/pug/pug_select.png`
- `assets/art/characters/golden-retriever/golden-retriever_select.png`
- `assets/art/characters/welsh-corgi/welsh-corgi_select.png`

다섯 파일은 built-in imagegen으로 평면 크로마키 배경에서 생성한 뒤 로컬 도구로
알파 PNG로 변환했다. 캐릭터 선택 카드에서 직접 사용하며, 전용 아바타와 우승
이미지가 없을 때도 축소 fallback 이미지로 사용한다.

## 누락 리소스와 fallback

- 아바타 4종: 선택 이미지를 얼굴 중심으로 축소해 표시하고, 이 이미지도 실패하면 CSS 토큰 사용
- 밥그릇 6종: 기존 CSS 밥그릇 사용
- 보상 오브젝트 3종: 기존 CSS 사료 카드 사용
- `kibble-clash-burst.png`: 기존 CSS 충돌 버스트 사용
- `game-board-yard.png`: 기존 잔디 그라데이션 보드 사용
- `character-select-bg.png`: 기존 마당색 그라데이션 사용
- 우승 포즈 4종: 선택 이미지 사용

모든 이미지에는 로드 실패 감지가 적용되어 누락 파일이 게임 실행을 막지 않는다.

## 다음 제작 순서

1. 아바타 4종
2. 밥그릇 기본형과 색상 변형 6종
3. 보상 아이콘 3종
4. 게임판 및 캐릭터 선택 배경
5. 충돌 버스트
6. 우승 포즈 4종
