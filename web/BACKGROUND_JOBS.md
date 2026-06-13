# TuneMyFi Background Job Setup

이번 패치는 Review Analysis를 HTTP 동기 요청에서 PostgreSQL 기반 Background Job으로 분리합니다.

## 1. 의존성 설치

```bash
cd ~/projects/tunemyfi-variation-poc/web
npm install
```

`tsx`가 devDependency로 추가되었습니다.

## 2. Prisma migration 적용

```bash
cd ~/projects/tunemyfi-variation-poc/web
npx prisma migrate dev --name add_job
npx prisma generate
```

이미 migration 파일은 포함되어 있으므로 운영/서버에서는 아래처럼 적용해도 됩니다.

```bash
npx prisma migrate deploy
npx prisma generate
```

## 3. Next.js 앱 실행

```bash
npm run build
pm2 restart tunemyfi-web --update-env
```

또는 개발 중에는:

```bash
npm run dev
```

## 4. Worker 실행

개발 확인용:

```bash
npm run worker
```

PM2 등록:

```bash
pm2 start npm --name tunemyfi-worker -- run worker
pm2 save
```

## 5. 동작 방식

- `/workflows`에서 Analyze Reviews 클릭
- `/api/workflow-state`가 즉시 Job을 생성하고 응답
- worker가 `PENDING` Job을 `FOR UPDATE SKIP LOCKED` 방식으로 하나씩 가져가 실행
- `/api/jobs/:id`를 2초마다 polling해서 진행률 표시
- 완료 시 `data/ranked/*.ranked.json`, `data/verdicts/*.verdict.json`, Product DB, workflow-state가 갱신됨

## 6. Job 상태

- `PENDING`: 대기
- `RUNNING`: 실행 중
- `COMPLETED`: 완료
- `FAILED`: 실패

워커 재시작 시 오래된 RUNNING Job은 다시 PENDING으로 돌립니다. 기본 기준은 30분이며 `JOB_STALE_RUNNING_MINUTES`로 조정할 수 있습니다.

## 2차: Generate Video Job화

`generate-video` 액션도 `GENERATE_VIDEO` Job으로 전환했습니다.

흐름:

1. `/workflows`에서 Generate Dubbed Review Video 클릭
2. `/api/workflow-state`가 `Job(type=GENERATE_VIDEO)` 생성 후 즉시 응답
3. `worker/index.ts`가 Python 영상 생성 스크립트 실행
4. `/api/jobs/[id]`를 2초 polling하여 진행률 표시
5. 완료 시 `videoPath`, `videoResult`, Product DB `videoPath/status` 자동 갱신

진행률은 Python 스크립트 내부 세부 단계가 아직 structured progress를 출력하지 않기 때문에 1차적으로 아래처럼 표시합니다.

- 5%: Job 시작
- 15%: Python 영상 생성 스크립트 실행
- 55%: 나레이션/TTS/영상 렌더링 진행 중 heartbeat
- 90%: 결과 저장
- 100%: 완료

추후 개선:

- `generate_dubbed_review_video.py`가 `stderr` 또는 JSONL로 단계별 progress를 출력하도록 변경
- Worker가 해당 progress를 파싱해서 `script`, `tts`, `ffmpeg_scene_01`, `concat`, `mux` 단위로 표시
