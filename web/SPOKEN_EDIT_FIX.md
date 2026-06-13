# Spoken Script 편집 덮어쓰기 수정

## 문제

`Spoken Script / TTS 발음용` textarea를 수정하는 동안, 완료된 Job polling이 계속 `/api/workflow-state`를 다시 읽어오면서 사용자가 입력한 값을 서버의 원본 값으로 덮어썼습니다.

## 수정

- `useJobPolling()`이 `COMPLETED` 또는 `FAILED` 상태를 받으면 polling interval을 즉시 종료합니다.
- 완료 상태의 Job이 2초마다 계속 `loadState()`를 호출하지 않도록 변경했습니다.
- 중복 선언된 `isGeneratingVideo`도 정리했습니다.

## 적용 후 기대 동작

- Spoken Script textarea를 직접 수정해도 원본으로 돌아가지 않습니다.
- `Save Edited Scripts`를 누르면 수정된 Spoken Script가 저장됩니다.
- `Generate Dubbed Review Video`는 저장된 Spoken Script 기준으로 TTS를 생성합니다.
