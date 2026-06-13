# Narration Prepare NameError Fix

## 수정 내용

`prepare_narration_assets()` 단계에서 아직 생성되지 않은 `clips` 변수를 참조하던 문제를 수정했습니다.

문제 코드:

```python
"videoTransitions": TRANSITION_LIBRARY[: max(0, len(clips) - 1)]
```

`clips`는 실제 영상 렌더링 단계에서만 존재하므로, Prepare Narration Script 단계 결과에서는 제거했습니다.

## 영향

- Step 4. Prepare Narration Script가 정상 실행됩니다.
- 영상 생성 단계의 transition 정보는 그대로 유지됩니다.
