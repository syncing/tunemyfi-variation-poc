# Watermark Align Fix

## 변경 내용

- 우하단 `TuneMyFi` 워터마크가 둥근 박스 아래쪽으로 치우치던 문제를 수정했습니다.
- PIL 폰트의 baseline offset을 `textbbox()` 기준으로 보정하여 박스 안에서 세로 중앙 정렬되도록 변경했습니다.
- 워터마크 박스의 padding도 조금 더 안정적으로 계산합니다.
