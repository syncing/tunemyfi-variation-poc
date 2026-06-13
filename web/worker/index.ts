import { spawn } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { prisma } from "../src/lib/prisma";
import { runExplore } from "../src/lib/explore";

const WORKER_ID = `${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = Number(process.env.JOB_WORKER_POLL_INTERVAL_MS ?? 2000);
const STALE_RUNNING_MINUTES = Number(process.env.JOB_STALE_RUNNING_MINUTES ?? 30);
const WEB_ROOT = process.cwd();
const PROJECT_ROOT = process.env.PROJECT_ROOT ?? path.resolve(WEB_ROOT, "..");
const UV_BIN = process.env.UV_BIN ?? "/home/hycho/.local/bin/uv";
const STATE_DIR = path.join(WEB_ROOT, "data", "workflow-state");
const STATE_FILE = path.join(STATE_DIR, "current.json");

type JobRecord = {
  id: string;
  type: string;
  status: string;
  progress: number;
  message?: string | null;
  productSlug?: string | null;
  payload?: any;
  result?: any;
  error?: string | null;
  attempts: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

function defaultState() {
  return {
    productName: "",
    productSlug: "",
    query: "",
    querySlug: "",
    resourceIds: "",
    model:
      process.env.OLLAMA_NARRATION_MODEL ??
      process.env.OLLAMA_MODEL ??
      "qwen3:32b",
    targetSeconds: 270,
    imageLimit: 32,
    rankedFile: "",
    verdictFile: "",
    videoPath: "",
    videoResult: null,
    assetResources: [],
    analysisJobId: "",
    narrationJobId: "",
    videoJobId: "",
    narrationScript: "",
    spokenScript: "",
    narrationPath: "",
    spokenNarrationPath: "",
    overlayPlanPath: "",
    shortsNarrationJobId: "",
    shortsVideoJobId: "",
    shortsTargetSeconds: 52,
    shortsImageLimit: 8,
    shortsScript: "",
    shortsSpokenScript: "",
    shortsNarrationPath: "",
    shortsSpokenNarrationPath: "",
    shortsOverlayPlanPath: "",
    shortsVideoPath: "",
    shortsVideoResult: null,
    steps: {
      product: "pending",
      analysis: "pending",
      assets: "pending",
      narration: "pending",
      video: "pending",
      shorts: "pending",
      shortsVideo: "pending",
    },
    updatedAt: new Date().toISOString(),
  };
}

async function readState() {
  try {
    return { ...defaultState(), ...JSON.parse(await readFile(STATE_FILE, "utf-8")) };
  } catch {
    return defaultState();
  }
}

async function saveState(state: any) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), "utf-8");
}

function productStatusFromState(state: any) {
  if (state.steps?.video === "done") return "video_done";
  if (state.steps?.narration === "ready") return "narration_ready";
  if (state.steps?.analysis === "done") return "analyzed";
  if (state.steps?.assets === "done") return "assets_done";
  if (state.steps?.analysis === "running") return "analyzing";
  if (state.steps?.product === "done") return "draft";
  return "draft";
}

async function updateProductFromState(state: any) {
  if (!state.productSlug || !state.productName) return;

  await (prisma as any).product.upsert({
    where: { slug: state.productSlug },
    create: {
      slug: state.productSlug,
      name: state.productName,
      query: state.query || null,
      status: productStatusFromState(state),
      rankedFile: state.rankedFile || null,
      verdictFile: state.verdictFile || null,
      videoPath: state.videoPath || null,
    },
    update: {
      name: state.productName,
      query: state.query || null,
      status: productStatusFromState(state),
      rankedFile: state.rankedFile || null,
      verdictFile: state.verdictFile || null,
      videoPath: state.videoPath || null,
    },
  });
}

async function updateJob(id: string, data: Record<string, any>) {
  await (prisma as any).job.update({ where: { id }, data });
}

function runPython(args: string[], onOutput?: (text: string) => void) {
  return new Promise<any>((resolve, reject) => {
    const proc = spawn(UV_BIN, ["run", "python", ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, UV_PROJECT: PROJECT_ROOT },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => {
      const text = d.toString();
      stdout += text;
      onOutput?.(text);
    });

    proc.stderr.on("data", (d) => {
      const text = d.toString();
      stderr += text;
      onOutput?.(text);
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `python failed: ${code}`));
        return;
      }

      const trimmed = stdout.trim();
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        reject(new Error(`JSON parse failed\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
        return;
      }

      try {
        resolve(JSON.parse(trimmed.slice(start, end + 1)));
      } catch {
        reject(new Error(`JSON parse failed\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
      }
    });
  });
}

async function requeueStaleJobs() {
  const staleSql = `
    UPDATE "Job"
       SET "status" = 'PENDING',
           "message" = '워커 재시작으로 재대기 중',
           "lockedAt" = NULL,
           "lockedBy" = NULL
     WHERE "status" = 'RUNNING'
       AND "lockedAt" < NOW() - INTERVAL '${STALE_RUNNING_MINUTES} minutes'
  `;

  await (prisma as any).$executeRawUnsafe(staleSql);
}

async function claimNextJob(): Promise<JobRecord | null> {
  const rows = await (prisma as any).$queryRawUnsafe(`
    UPDATE "Job"
       SET "status" = 'RUNNING',
           "startedAt" = COALESCE("startedAt", NOW()),
           "lockedAt" = NOW(),
           "lockedBy" = '${WORKER_ID}',
           "attempts" = "attempts" + 1,
           "message" = COALESCE("message", '실행 중')
     WHERE "id" = (
       SELECT "id"
         FROM "Job"
        WHERE "status" = 'PENDING'
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     RETURNING *
  `);

  return rows[0] ?? null;
}

async function handleAnalyzeReviews(job: JobRecord) {
  const payload = job.payload ?? {};
  const productName = String(payload.productName ?? "");
  const productSlug = String(payload.productSlug ?? job.productSlug ?? slugify(productName));
  const query = String(payload.query ?? "").trim();

  if (!query) throw new Error("Review Query가 없습니다.");

  const result = await runExplore(query, async ({ progress, message, phase }) => {
    await updateJob(job.id, { progress, message, result: { phase }, lockedAt: new Date() });
  });

  const state = await readState();
  const shouldUpdateWorkflow = !state.productSlug || state.productSlug === productSlug || state.analysisJobId === job.id;

  if (shouldUpdateWorkflow) {
    const next = {
      ...state,
      productName: productName || state.productName,
      productSlug,
      query,
      querySlug: result.querySlug,
      rankedFile: result.rankedFile,
      verdictFile: result.verdictFile,
      analysisJobId: job.id,
      narrationScript: "",
      spokenScript: "",
      narrationPath: "",
      spokenNarrationPath: "",
      overlayPlanPath: "",
    shortsNarrationJobId: "",
    shortsVideoJobId: "",
    shortsTargetSeconds: 52,
    shortsImageLimit: 8,
    shortsScript: "",
    shortsSpokenScript: "",
    shortsNarrationPath: "",
    shortsSpokenNarrationPath: "",
    shortsOverlayPlanPath: "",
    shortsVideoPath: "",
    shortsVideoResult: null,
      steps: { ...state.steps, product: "done", analysis: "done", narration: "pending", video: "pending" },
    };
    await saveState(next);
    await updateProductFromState(next);
  } else {
    await (prisma as any).product.updateMany({
      where: { slug: productSlug },
      data: { status: "analyzed", rankedFile: result.rankedFile, verdictFile: result.verdictFile },
    });
  }

  await updateJob(job.id, {
    status: "COMPLETED",
    progress: 100,
    message: "Review Analysis 완료",
    result,
    error: null,
    lockedAt: null,
    lockedBy: null,
    finishedAt: new Date(),
  });
}

async function handlePrepareNarration(job: JobRecord) {
  const payload = job.payload ?? {};
  const productName = String(payload.productName ?? "");
  const productSlug = String(payload.productSlug ?? job.productSlug ?? slugify(productName));
  const resourceIds = String(payload.resourceIds ?? "");
  const model = String(payload.model ?? process.env.OLLAMA_NARRATION_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen3:32b");
  const videoKind = String(payload.videoKind ?? "long");
  const isShorts = videoKind === "shorts";
  const targetSeconds = Number(payload.targetSeconds ?? (isShorts ? 52 : 270));
  const imageLimit = Number(payload.imageLimit ?? (isShorts ? 8 : 32));
  const verdictFile = String(payload.verdictFile ?? "");

  if (!productSlug) throw new Error("productSlug가 없습니다.");
  if (!resourceIds) throw new Error("resourceIds가 없습니다.");
  if (!verdictFile) throw new Error("verdictFile이 없습니다.");

  await updateJob(job.id, { progress: 10, message: "나레이션 원문 생성 중", result: { phase: "narration" }, lockedAt: new Date() });

  const args = [
    "web/scripts/generate_dubbed_review_video.py",
    "--prepare-only",
    "--product-slug",
    productSlug,
    "--resource-ids",
    resourceIds,
    "--product-name",
    productName,
    "--model",
    model,
    "--limit",
    String(imageLimit),
    "--target-seconds",
    String(targetSeconds),
    "--verdict-file",
    verdictFile,
  ];
  if (isShorts) {
    args.push("--video-kind", "shorts");
  }
  const result = await runPython(args);

  await updateJob(job.id, { progress: 90, message: "나레이션 스크립트 저장 중", result, lockedAt: new Date() });

  const state = await readState();
  const shouldUpdateWorkflow = !state.productSlug || state.productSlug === productSlug || state.narrationJobId === job.id;

  if (shouldUpdateWorkflow) {
    const next = {
      ...state,
      productName: productName || state.productName,
      productSlug,
      resourceIds,
      model,
      ...(isShorts
        ? {
            shortsTargetSeconds: targetSeconds,
            shortsImageLimit: imageLimit,
            shortsNarrationJobId: job.id,
            shortsScript: result.narrationText ?? "",
            shortsSpokenScript: result.spokenText ?? "",
            shortsNarrationPath: result.narrationPath ?? "",
            shortsSpokenNarrationPath: result.spokenNarrationPath ?? "",
            shortsOverlayPlanPath: result.overlayPlanPath ?? "",
            shortsVideoResult: { ...(state.shortsVideoResult ?? {}), preparation: result },
            steps: { ...state.steps, shorts: "ready", shortsVideo: "pending" },
          }
        : {
            targetSeconds,
            imageLimit,
            narrationJobId: job.id,
            narrationScript: result.narrationText ?? "",
            spokenScript: result.spokenText ?? "",
            narrationPath: result.narrationPath ?? "",
            spokenNarrationPath: result.spokenNarrationPath ?? "",
            overlayPlanPath: result.overlayPlanPath ?? "",
            videoResult: { ...(state.videoResult ?? {}), preparation: result },
            steps: { ...state.steps, narration: "ready", video: "pending" },
          }),
      verdictFile,
    };
    await saveState(next);
    await updateProductFromState(next);
  }

  await updateJob(job.id, {
    status: "COMPLETED",
    progress: 100,
    message: "Narration Script 준비 완료",
    result,
    error: null,
    lockedAt: null,
    lockedBy: null,
    finishedAt: new Date(),
  });
}

async function handleGenerateVideo(job: JobRecord) {
  const payload = job.payload ?? {};
  const productName = String(payload.productName ?? "");
  const productSlug = String(payload.productSlug ?? job.productSlug ?? slugify(productName));
  const resourceIds = String(payload.resourceIds ?? "");
  const model = String(payload.model ?? process.env.OLLAMA_NARRATION_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen3:32b");
  const videoKind = String(payload.videoKind ?? "long");
  const isShorts = videoKind === "shorts";
  const targetSeconds = Number(payload.targetSeconds ?? (isShorts ? 52 : 270));
  const imageLimit = Number(payload.imageLimit ?? (isShorts ? 8 : 32));
  const verdictFile = String(payload.verdictFile ?? "");
  const narrationPath = String(payload.narrationPath ?? "");
  const spokenNarrationPath = String(payload.spokenNarrationPath ?? "");
  const overlayPlanPath = String(payload.overlayPlanPath ?? "");
  const bgmMood = String(payload.bgmMood ?? "bright");
  const bgmVolume = Number(payload.bgmVolume ?? 0.12);

  if (!productSlug) throw new Error("productSlug가 없습니다.");
  if (!resourceIds) throw new Error("resourceIds가 없습니다.");
  if (!verdictFile) throw new Error("verdictFile이 없습니다.");
  if (!narrationPath) throw new Error("narrationPath가 없습니다.");
  if (!spokenNarrationPath) throw new Error("spokenNarrationPath가 없습니다.");

  await updateJob(job.id, { progress: 5, message: "Video Generation 시작", result: { phase: "start" }, lockedAt: new Date() });

  let lastOutputAt = Date.now();
  const heartbeat = setInterval(() => {
    updateJob(job.id, {
      progress: 55,
      message: "TTS/영상 렌더링 진행 중",
      result: { phase: "rendering", lastOutputAt },
      lockedAt: new Date(),
    }).catch(() => {});
  }, 15000);

  try {
    await updateJob(job.id, { progress: 15, message: "편집된 스크립트로 더빙 영상 생성 중", result: { phase: "spawn-python" }, lockedAt: new Date() });

    const args = [
      "web/scripts/generate_dubbed_review_video.py",
      "--product-slug",
      productSlug,
      "--resource-ids",
      resourceIds,
      "--product-name",
      productName,
      "--model",
      model,
      "--limit",
      String(imageLimit),
      "--target-seconds",
      String(targetSeconds),
      "--verdict-file",
      verdictFile,
      "--narration-file",
      narrationPath,
      "--spoken-narration-file",
      spokenNarrationPath,
    ];

    if (overlayPlanPath) {
      args.push("--overlay-plan-file", overlayPlanPath);
    }

    args.push("--bgm-mood", bgmMood);
    args.push("--bgm-volume", String(bgmVolume));
    if (isShorts) {
      args.push("--video-kind", "shorts");
    }

    const result = await runPython(args, () => {
      lastOutputAt = Date.now();
    });

    clearInterval(heartbeat);

    await updateJob(job.id, { progress: 90, message: "영상 결과 저장 중", result: { phase: "saving", ...result }, lockedAt: new Date() });

    const state = await readState();
    const shouldUpdateWorkflow = !state.productSlug || state.productSlug === productSlug || state.videoJobId === job.id;

    if (shouldUpdateWorkflow) {
      const next = {
        ...state,
        productName: productName || state.productName,
        productSlug,
        resourceIds,
        model,
        ...(isShorts
          ? {
              shortsTargetSeconds: targetSeconds,
              shortsImageLimit: imageLimit,
              shortsNarrationPath: result.narrationPath ?? state.shortsNarrationPath,
              shortsSpokenNarrationPath: result.spokenNarrationPath ?? state.shortsSpokenNarrationPath,
              shortsOverlayPlanPath: result.overlayPlanPath ?? state.shortsOverlayPlanPath,
              shortsVideoJobId: job.id,
              shortsVideoPath: result.publicPath,
              shortsVideoResult: result,
              steps: { ...state.steps, shorts: "ready", shortsVideo: "done" },
            }
          : {
              targetSeconds,
              imageLimit,
              narrationPath: result.narrationPath ?? state.narrationPath,
              spokenNarrationPath: result.spokenNarrationPath ?? state.spokenNarrationPath,
              overlayPlanPath: result.overlayPlanPath ?? state.overlayPlanPath,
              videoJobId: job.id,
              videoPath: result.publicPath,
              videoResult: result,
              steps: { ...state.steps, narration: "ready", video: "done" },
            }),
        verdictFile,
        bgmMood: result.bgmMood ?? bgmMood,
        bgmVolume: result.bgmVolume ?? bgmVolume,
      };
      await saveState(next);
      await updateProductFromState(next);
    } else {
      await (prisma as any).product.updateMany({
        where: { slug: productSlug },
        data: { status: "video_done", videoPath: result.publicPath },
      });
    }

    await updateJob(job.id, {
      status: "COMPLETED",
      progress: 100,
      message: "Video Generation 완료",
      result,
      error: null,
      lockedAt: null,
      lockedBy: null,
      finishedAt: new Date(),
    });
  } finally {
    clearInterval(heartbeat);
  }
}

async function processJob(job: JobRecord) {
  try {
    if (job.type === "ANALYZE_REVIEWS") {
      await handleAnalyzeReviews(job);
      return;
    }

    if (job.type === "PREPARE_NARRATION" || job.type === "PREPARE_SHORTS") {
      await handlePrepareNarration(job);
      return;
    }

    if (job.type === "GENERATE_VIDEO" || job.type === "GENERATE_SHORTS") {
      await handleGenerateVideo(job);
      return;
    }

    throw new Error(`지원하지 않는 job type입니다: ${job.type}`);
  } catch (error: any) {
    const message = error?.message ?? "job failed";
    await updateJob(job.id, { status: "FAILED", message, error: message, lockedAt: null, lockedBy: null, finishedAt: new Date() });
  }
}

async function main() {
  console.log(`[job-worker] started: ${WORKER_ID}`);
  await requeueStaleJobs();

  while (true) {
    const job = await claimNextJob();
    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    console.log(`[job-worker] claimed ${job.type} ${job.id}`);
    await processJob(job);
  }
}

main()
  .catch((error) => {
    console.error("[job-worker] fatal", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
