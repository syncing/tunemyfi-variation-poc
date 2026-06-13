# Narration Script Editing + Broadcast Card Typography Update

## 변경 내용

- `Spoken Script / TTS 발음용`을 웹에서 직접 수정할 수 있음을 명확히 표시했습니다.
- 나레이션 원문에서 숫자만 기본 변환해 발음용 스크립트를 다시 만드는 `Rebuild Spoken Script from Narration` 버튼을 추가했습니다.
- `Save Edited Scripts` 버튼을 강조해, 수정한 원문/발음 스크립트를 파일에 저장한 뒤 영상 생성에 사용하도록 했습니다.
- 영상 카드 렌더링을 개선했습니다.
  - 제목과 본문 사이 간격을 조금 더 띄웠습니다.
  - 본문 줄간격을 조금 더 넓혔습니다.
  - 카드 항목 앞에 `✓` 체크 표시를 붙였습니다.
  - 방송 자막 느낌에 더 가까운 굵은 산세리프 계열 폰트를 우선 사용합니다.
- 화면 카드 텍스트에는 숫자를 그대로 표시합니다.
- TTS 발음용 스크립트에서만 `1 → 원`, `2 → 투`, `32B → 쓰리투B` 식으로 읽히게 합니다.

## 권장 폰트 설치

```bash
sudo apt update
sudo apt install -y fonts-noto-cjk fonts-nanum
```

우선순위는 Noto Sans CJK Bold/Regular → NanumSquare/NanumBarunGothic → NanumGothic 순서입니다.
