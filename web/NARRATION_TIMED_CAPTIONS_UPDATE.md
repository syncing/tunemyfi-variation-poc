# Narration-Timed Captions Update

## 변경 내용

- 텍스트 카드가 이미지 순서에만 맞춰 생성되던 구조를 개선했습니다.
- Overlay Plan 생성 시 나레이션 원문을 앞에서 뒤로 나눠 각 카드가 특정 나레이션 구간에 대응하도록 프롬프트를 변경했습니다.
- 각 카드에 `narrationSegment`와 `durationWeight`를 추가합니다.
  - `narrationSegment`: 카드가 대응하는 나레이션 핵심 구간 요약
  - `durationWeight`: 해당 구간의 상대 길이. 1~5 사이
- 영상 생성 시 `durationWeight`를 이용해 이미지 장면 길이를 가변 배분합니다.
- 카드 표시 시간이 나레이션 흐름과 더 가깝게 맞도록 `captionTimingMode: narration-weighted` 결과 값을 추가합니다.

## 주의

이미 생성된 `overlay_plan.json`이 있으면 기존 카드 계획을 재사용할 수 있습니다. 새 타이밍 방식을 확실히 적용하려면 `/workflows`에서 `Reset Narration Job` 후 `Prepare Narration Script`를 다시 실행하세요.
