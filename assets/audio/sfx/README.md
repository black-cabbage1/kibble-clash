# 멍밥쟁탈전 효과음

- WAV: 44.1kHz / 16bit / Mono 원본
- OGG: Vorbis 배포 파일
- 2026-08-12 귀여운 강아지·장난감 보드게임 콘셉트로 전면 교체
- 조작음은 부드럽게 유지하고 성취 순간에는 짧은 합성 강아지 짖음 사용
- 동시 재생을 고려해 피크를 -7~-11 dBFS 범위로 유지

## 구성

- `ui-click`: 부드러운 나무 버튼 탭
- `dice-roll`: 밥그릇 안에서 사료가 `도도도독` 구르는 소리
- `dice-land`: 플라스틱 밥그릇이 짧게 울리는 `통!`
- `select-dice`: 강아지가 코로 버튼을 누르는 `뽁!`
- `place-dice`: 사료 묶음이 밥그릇에 들어가는 `토도독!`
- `score-gain`: 가벼운 한 번의 `멍!`
- `kibble-clash`: 놀란 듯한 짧은 `왈!`
- `round-complete`: 경쾌한 `멍! 멍!`
- `victory`: 높낮이가 올라가는 세 번의 신나는 짖음
- `defeat`: 작고 부드러운 `낑…`

재생성: `python -B tools/generate_sfx.py`
