# Narration Review Update

이번 업데이트는 더빙 영상 생성을 다음 2단계로 분리합니다.

1. Prepare Narration Script
   - 나레이션 원문을 먼저 생성합니다.
   - TTS에서 실제로 어떻게 읽힐지 발음 스크립트를 함께 생성합니다.
   - 사용자가 두 텍스트를 웹 UI에서 직접 수정할 수 있습니다.

2. Generate Dubbed Review Video
   - 수정된 발음 스크립트로 TTS를 생성합니다.
   - 수정된 나레이션 원문과 overlay plan을 기준으로 화면 텍스트 카드를 렌더링합니다.

## 숫자 처리

- 화면 텍스트와 카드 텍스트에는 아라비아 숫자를 그대로 표시합니다.
  - 예: 1, 2, 32B
- TTS 발음 스크립트에서만 숫자를 영어식 한글 발음으로 변환합니다.
  - 1 → 원
  - 2 → 투
  - 3 → 쓰리
  - 32B → 쓰리투B

## 변경 파일

- `web/scripts/generate_dubbed_review_video.py`
- `web/src/app/api/workflow-state/route.ts`
- `web/src/app/workflows/page.tsx`
- `web/worker/index.ts`
- `web/src/lib/prisma.ts`

## 적용 후 실행

```bash
cd ~/projects/tunemyfi-variation-poc/web
npm run build
pm2 restart tunemyfi-web --update-env
pm2 restart tunemyfi-worker --update-env
pm2 save
```
