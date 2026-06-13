# Video Overlay Update

적용 내용:

- `generate_dubbed_review_video.py`가 장면별 핵심 텍스트 오버레이를 생성합니다.
- 각 이미지 장면 하단에 반투명 흰색 정보 카드가 표시됩니다.
- 마지막에 `장점 / 단점 / 한줄평` 요약 카드가 추가됩니다.
- 오버레이 계획은 `data/video-work/<productSlug>/.../overlay_plan.json`에 저장됩니다.
- 최종 영상 길이에 마지막 요약 카드 시간이 포함되도록 오디오에 `apad`를 적용합니다.
- 영상 생성 후 Ollama 모델 unload를 시도합니다.
- `worker/index.ts`의 top-level await을 제거해 PM2/tsx CJS 실행 오류를 방지합니다.

한글 폰트가 없으면 아래 중 하나를 설치하세요.

```bash
sudo apt update
sudo apt install -y fonts-nanum fonts-noto-cjk
```

적용 후:

```bash
cd ~/projects/tunemyfi-variation-poc/web
npm run build
pm2 restart tunemyfi-web --update-env
pm2 restart tunemyfi-worker --update-env
pm2 save
```


## 2026-06-13 추가 조정

- FFmpeg drawtext 직접 렌더링 대신 Pillow로 투명 PNG 카드 생성 후 영상에 overlay합니다.
- 장면별 카드 텍스트는 중앙 정렬됩니다.
- 본문은 2~3줄까지 허용하고, 한 줄이 카드 폭의 약 80%를 채우도록 프롬프트와 자동 줄바꿈 폭을 조정했습니다.
- 아라비아 숫자 0~9는 TTS와 오버레이 텍스트에서 영어 숫자 발음의 한글 표기로 변환합니다.
  - 1 → 원
  - 2 → 투
  - 3 → 쓰리
  - 4 → 포
  - 5 → 파이브
  - 6 → 식스
  - 7 → 세븐
  - 8 → 에잇
  - 9 → 나인
  - 0 → 제로
- Pillow가 필요합니다. 루트 pyproject.toml에는 이미 pillow 의존성이 포함되어 있습니다. 누락 시 `uv add pillow` 또는 `uv sync`를 실행하세요.
