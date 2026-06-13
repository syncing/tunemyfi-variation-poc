# Job Recovery Buttons Update

## 변경 내용

Job을 사용하는 단계마다 실패/정체 상태를 UI에서 바로 복구할 수 있는 버튼을 추가했습니다.

대상 단계:

- Step 2. Review Analysis
- Step 4. Narration Script Review
- Step 5. Generate Dubbed Video

## 동작

각 단계의 Reset 버튼은 현재 workflow-state에 연결된 Job ID를 초기화하고, 해당 Job을 `CANCELLED` 상태로 표시합니다.

상위 단계를 초기화하면 하위 단계도 함께 초기화됩니다.

- Reset Analysis Job
  - analysisJobId 초기화
  - rankedFile / verdictFile 초기화
  - narration/video 관련 상태 초기화
- Reset Narration Job
  - narrationJobId 초기화
  - narration/spoken/overlay 상태 초기화
  - video 관련 상태 초기화
- Reset Video Job
  - videoJobId 초기화
  - videoPath / videoResult 초기화

## 목적

FAILED Job이나 예전 에러 메시지가 UI에 남아 있을 때 DB와 current.json을 수동으로 지우지 않고, 화면에서 바로 복구할 수 있게 하기 위한 기능입니다.
