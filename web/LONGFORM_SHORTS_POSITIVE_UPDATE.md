# Longform 4-5min + Shorts Update

## Longform

- 기본 나레이션 타겟을 270초로 변경했습니다.
- 기본 이미지 사용 수를 32장으로 늘렸습니다.
- YouTube 리뷰 후보 검색과 댓글 수집량을 늘렸습니다.
  - 기본 후보 영상 수: 18개
  - 기본 댓글 수: 영상당 60개
  - 환경변수로 조정 가능:
    - `YOUTUBE_REVIEW_SEARCH_LIMIT`
    - `YOUTUBE_REVIEW_COMMENT_LIMIT`
- 나레이션 프롬프트를 장점 75%, 단점 25% 정도로 더 긍정적인 구성으로 조정했습니다.

## Shorts

- 1분 미만 YouTube Shorts용 스크립트 생성 단계를 추가했습니다.
- 쇼츠용 스크립트와 쇼츠용 Spoken Script를 각각 직접 수정할 수 있습니다.
- 쇼츠 기본값:
  - target seconds: 52초
  - image limit: 8장
  - output: 1080x1920 세로 영상
- 쇼츠도 롱폼과 동일한 알고리즘 BGM 생성/믹싱 로직을 사용합니다.
- 쇼츠 프롬프트는 장점 85%, 단점 15% 정도로 더 빠르고 긍정적인 구매 매력 중심으로 구성했습니다.

## Files

- `web/scripts/generate_dubbed_review_video.py`
- `web/src/app/workflows/page.tsx`
- `web/src/app/api/workflow-state/route.ts`
- `web/worker/index.ts`
- `web/src/lib/explore.ts`
