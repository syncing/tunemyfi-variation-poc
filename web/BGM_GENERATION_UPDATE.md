# BGM Generation Update

Generate Dubbed Video 단계에서 나레이션 분위기에 맞춘 은은한 BGM을 자동 생성합니다.

## 핵심

- 외부 음원을 사용하지 않고 Python으로 간단한 신스 패드/벨 사운드를 WAV로 생성합니다.
- LLM이 나레이션과 리뷰 내용을 보고 `mood`, `bpm`, `key`, `intensity`를 정합니다.
- 생성된 BGM은 `background_music.wav`로 저장됩니다.
- 나레이션은 전면에 유지하고 BGM은 낮은 볼륨으로 믹싱됩니다.
- 최종 결과에는 `bgmPlanPath`, `bgmPath`, `mixedAudioPath`가 포함됩니다.

## 끄는 방법

스크립트 직접 실행 시 `--no-bgm` 옵션을 주면 기존처럼 나레이션만 들어갑니다.

```bash
uv run python web/scripts/generate_dubbed_review_video.py ... --no-bgm
```

## 볼륨 조정

기본값은 `--bgm-volume 0.12`입니다.

```bash
--bgm-volume 0.09
```
