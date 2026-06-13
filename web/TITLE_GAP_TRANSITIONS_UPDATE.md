# Title Gap + Dynamic Broadcast Transitions Update

## 변경 내용

- 텍스트 카드 제목을 약간 더 위로 올렸습니다.
- 제목과 본문 사이의 줄간격을 더 벌려 읽기 쉽게 조정했습니다.
- 장면별 이미지 모션을 여러 방식으로 순환하도록 변경했습니다.
  - 슬로우 줌인
  - 슬로우 줌아웃
  - 좌→우 팬
  - 우→좌 팬
  - 상→하 팬
  - 하→상 팬
- 장면 연결을 단순 concat에서 다양한 `xfade` 전환으로 변경했습니다.
  - fade
  - fadeblack
  - dissolve
  - smoothleft / smoothright
  - circleopen / circleclose
  - coverleft / coverright
  - revealleft / revealright
  - wipeleft
- 오디오 길이에 맞추기 위해 전환 겹침 시간을 고려하여 장면 길이를 자동 보정합니다.

## 적용 효과

기존의 단조로운 슬라이드 전환보다 훨씬 방송 리포트/리뷰 영상에 가까운 역동적인 흐름으로 보이도록 개선했습니다.
