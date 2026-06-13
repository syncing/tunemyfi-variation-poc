import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const WEB_ROOT = process.cwd();
const STATE_DIR = path.join(WEB_ROOT, "data", "workflow-state");
const STATE_FILE = path.join(STATE_DIR, "current.json");

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

function parseResourceIds(value: string) {
  return String(value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function videoWorkDir(productSlug: string, resourceIds: string) {
  const resourceKey = parseResourceIds(resourceIds).join("-");
  return path.join(
    WEB_ROOT,
    "data",
    "video-work",
    productSlug,
    `${resourceKey}-qwen-dubbed-ko`,
  );
}

async function writeNarrationFiles(state: any) {
  const productSlug = String(state.productSlug ?? "");
  const resourceIds = String(state.resourceIds ?? "");
  const narrationScript = String(state.narrationScript ?? "").trim();
  const spokenScript = String(state.spokenScript ?? "").trim();

  if (!productSlug) throw new Error("productSlug가 없습니다.");
  if (!resourceIds) throw new Error("resourceIds가 없습니다.");
  if (!narrationScript) throw new Error("나레이션 스크립트를 먼저 준비하거나 입력하세요.");
  if (!spokenScript) throw new Error("발음 스크립트를 먼저 준비하거나 입력하세요.");

  const dir = videoWorkDir(productSlug, resourceIds);
  await mkdir(dir, { recursive: true });

  const narrationPath = path.join(dir, "narration_ko.txt");
  const spokenNarrationPath = path.join(dir, "narration_spoken_ko.txt");

  await writeFile(narrationPath, narrationScript, "utf-8");
  await writeFile(spokenNarrationPath, spokenScript, "utf-8");

  return { narrationPath, spokenNarrationPath };
}

async function writeShortsFiles(state: any) {
  const productSlug = String(state.productSlug ?? "");
  const resourceIds = String(state.resourceIds ?? "");
  const shortsScript = String(state.shortsScript ?? "").trim();
  const shortsSpokenScript = String(state.shortsSpokenScript ?? "").trim();

  if (!productSlug) throw new Error("productSlug가 없습니다.");
  if (!resourceIds) throw new Error("resourceIds가 없습니다.");
  if (!shortsScript) throw new Error("쇼츠 스크립트를 먼저 준비하거나 입력하세요.");
  if (!shortsSpokenScript) throw new Error("쇼츠 발음 스크립트를 먼저 준비하거나 입력하세요.");

  const dir = videoWorkDir(productSlug, resourceIds);
  await mkdir(dir, { recursive: true });

  const shortsNarrationPath = path.join(dir, "shorts_narration_ko.txt");
  const shortsSpokenNarrationPath = path.join(dir, "shorts_narration_spoken_ko.txt");

  await writeFile(shortsNarrationPath, shortsScript, "utf-8");
  await writeFile(shortsSpokenNarrationPath, shortsSpokenScript, "utf-8");

  return { shortsNarrationPath, shortsSpokenNarrationPath };
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
    bgmMood: "bright",
    bgmVolume: 0.12,

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
    return {
      ...defaultState(),
      ...JSON.parse(await readFile(STATE_FILE, "utf-8")),
    };
  } catch {
    return defaultState();
  }
}

async function saveState(state: any) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(
    STATE_FILE,
    JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );
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

async function upsertProductToDb(state: any) {
  if (!state.productSlug || !state.productName) return;

  await prisma.product.upsert({
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

async function syncAssetResourcesToDb(state: any) {
  if (!state.productSlug || !state.productName) return;

  const product = await prisma.product.findUnique({
    where: { slug: state.productSlug },
  });

  if (!product) return;

  const resources = Array.isArray(state.assetResources) ? state.assetResources : [];

  for (const r of resources) {
    if (!r.resourceId) continue;

    await prisma.assetResource.upsert({
      where: {
        productId_resourceId: {
          productId: product.id,
          resourceId: r.resourceId,
        },
      },
      create: {
        productId: product.id,
        resourceId: r.resourceId,
        resourceName: r.resourceName ?? r.resourceId,
        sourceUrl: r.sourceUrl ?? null,
        rule: r.rule ?? null,
        assetCount: Number(r.assetCount ?? 0),
      },
      update: {
        resourceName: r.resourceName ?? r.resourceId,
        sourceUrl: r.sourceUrl ?? null,
        rule: r.rule ?? null,
        assetCount: Number(r.assetCount ?? 0),
      },
    });
  }
}

async function cancelJobIfPresent(jobId: string | undefined | null, reason: string) {
  const id = String(jobId ?? "").trim();
  if (!id) return;

  await (prisma as any).job.updateMany({
    where: { id },
    data: {
      status: "CANCELLED",
      progress: 0,
      message: reason,
      error: null,
      lockedAt: null,
      lockedBy: null,
      finishedAt: new Date(),
    },
  });
}

function resetJobState(state: any, scope: string) {
  const steps = { ...(state.steps ?? {}) };

  if (scope === "analysis") {
    return {
      ...state,
      analysisJobId: "",
      rankedFile: "",
      verdictFile: "",
      narrationJobId: "",
      videoJobId: "",
      narrationScript: "",
      spokenScript: "",
      narrationPath: "",
      spokenNarrationPath: "",
      overlayPlanPath: "",
      videoPath: "",
      videoResult: null,
      shortsNarrationJobId: "",
      shortsVideoJobId: "",
      shortsScript: "",
      shortsSpokenScript: "",
      shortsNarrationPath: "",
      shortsSpokenNarrationPath: "",
      shortsOverlayPlanPath: "",
      shortsVideoPath: "",
      shortsVideoResult: null,
      steps: { ...steps, analysis: "pending", narration: "pending", video: "pending", shorts: "pending", shortsVideo: "pending" },
    };
  }

  if (scope === "narration") {
    return {
      ...state,
      narrationJobId: "",
      videoJobId: "",
      narrationScript: "",
      spokenScript: "",
      narrationPath: "",
      spokenNarrationPath: "",
      overlayPlanPath: "",
      videoPath: "",
      videoResult: null,
      shortsNarrationJobId: "",
      shortsVideoJobId: "",
      shortsScript: "",
      shortsSpokenScript: "",
      shortsNarrationPath: "",
      shortsSpokenNarrationPath: "",
      shortsOverlayPlanPath: "",
      shortsVideoPath: "",
      shortsVideoResult: null,
      steps: { ...steps, narration: "pending", video: "pending", shorts: "pending", shortsVideo: "pending" },
    };
  }

  if (scope === "video") {
    return {
      ...state,
      videoJobId: "",
      videoPath: "",
      videoResult: null,
      steps: { ...steps, video: "pending" },
    };
  }

  return state;
}

export async function GET() {
  return NextResponse.json(await readState());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const state = await readState();

  const productName = String(body.productName ?? state.productName ?? "");
  const productSlug = slugify(String(body.productSlug ?? productName));
  const query = String(body.query ?? state.query ?? "");
  const querySlug = query ? slugify(query) : "";

  const next = {
    ...state,
    ...body,
    productName,
    productSlug,
    query,
    querySlug,
  };

  await saveState(next);
  await upsertProductToDb(next);

  return NextResponse.json(next);
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action ?? "");
    const state = await readState();

    if (action === "clear-workflow") {
      const next = defaultState();
      await saveState(next);
      return NextResponse.json(next);
    }

    if (action === "reset-job") {
      const scope = String(body.scope ?? "");
      if (!["analysis", "narration", "video", "shorts", "shorts-video"].includes(scope)) {
        return NextResponse.json({ error: "reset scope가 올바르지 않습니다." }, { status: 400 });
      }

      if (scope === "analysis") {
        await cancelJobIfPresent(state.analysisJobId, "사용자 복구로 Review Analysis Job 초기화");
        await cancelJobIfPresent(state.narrationJobId, "상위 단계 초기화로 Narration Job 초기화");
        await cancelJobIfPresent(state.videoJobId, "상위 단계 초기화로 Video Job 초기화");
        await cancelJobIfPresent(state.shortsNarrationJobId, "상위 단계 초기화로 Shorts Script Job 초기화");
        await cancelJobIfPresent(state.shortsVideoJobId, "상위 단계 초기화로 Shorts Video Job 초기화");
      } else if (scope === "narration") {
        await cancelJobIfPresent(state.narrationJobId, "사용자 복구로 Narration Job 초기화");
        await cancelJobIfPresent(state.videoJobId, "상위 단계 초기화로 Video Job 초기화");
      } else if (scope === "shorts") {
        await cancelJobIfPresent(state.shortsNarrationJobId, "사용자 복구로 Shorts Script Job 초기화");
        await cancelJobIfPresent(state.shortsVideoJobId, "상위 단계 초기화로 Shorts Video Job 초기화");
      } else if (scope === "shorts-video") {
        await cancelJobIfPresent(state.shortsVideoJobId, "사용자 복구로 Shorts Video Job 초기화");
      } else if (scope === "video") {
        await cancelJobIfPresent(state.videoJobId, "사용자 복구로 Video Job 초기화");
      }

      const next = resetJobState(state, scope);
      await saveState(next);
      await upsertProductToDb(next);
      return NextResponse.json(next);
    }

    if (action === "save-product") {
      const productName = String(body.productName ?? "");
      const productSlug = slugify(String(body.productSlug ?? productName));
      const query = String(body.query ?? "");
      const querySlug = query ? slugify(query) : "";
      const resourceIds = productSlug;

      const next = {
        ...state,
        ...body,
        productName,
        productSlug,
        query,
        querySlug,
        resourceIds,
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
        bgmMood: state.bgmMood ?? "bright",
        bgmVolume: state.bgmVolume ?? 0.12,
        steps: {
          product: "done",
          analysis: "pending",
          assets: "pending",
          narration: "pending",
          video: "pending",
      shorts: "pending",
      shortsVideo: "pending",
        },
      };

      await saveState(next);
      await upsertProductToDb(next);

      return NextResponse.json(next);
    }

    if (action === "analyze-reviews") {
      const productName = String(body.productName ?? state.productName ?? "");
      const productSlug = slugify(String(body.productSlug ?? productName));
      const query = String(body.query ?? state.query ?? "");
      const querySlug = slugify(query);

      if (!query) {
        return NextResponse.json({ error: "Review Query를 입력하세요." }, { status: 400 });
      }

      const job = await (prisma as any).job.create({
        data: {
          type: "ANALYZE_REVIEWS",
          status: "PENDING",
          progress: 0,
          message: "Review Analysis 대기 중",
          productSlug,
          payload: { productName, productSlug, query, querySlug },
        },
      });

      const next = {
        ...state,
        ...body,
        productName,
        productSlug,
        query,
        querySlug,
        analysisJobId: job.id,
        rankedFile: "",
        verdictFile: "",
        narrationJobId: "",
        videoJobId: "",
        narrationScript: "",
        spokenScript: "",
        narrationPath: "",
        spokenNarrationPath: "",
        overlayPlanPath: "",
        bgmMood: state.bgmMood ?? "bright",
        bgmVolume: state.bgmVolume ?? 0.12,
        steps: { ...state.steps, product: "done", analysis: "running", narration: "pending", video: "pending" },
      };

      await saveState(next);
      await upsertProductToDb(next);

      return NextResponse.json({ ...next, analysisJob: job });
    }

    if (action === "check-assets") {
      const productName = String(body.productName ?? state.productName ?? "");
      const productSlug = slugify(String(body.productSlug ?? state.productSlug));
      const resourceIds = parseResourceIds(String(body.resourceIds ?? state.resourceIds));

      const resources = await Promise.all(
        resourceIds.map(async (resourceId) => {
          const manifestPath = path.join(
            WEB_ROOT,
            "data",
            "product-assets",
            productSlug,
            "resources",
            resourceId,
            "manifest.json",
          );

          try {
            const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));

            return {
              resourceId,
              resourceName: manifest.resourceName ?? resourceId,
              sourceUrl: manifest.sourcePageUrl ?? manifest.sourceUrl ?? null,
              rule: manifest.rule ?? null,
              exists: true,
              assetCount: manifest.assetCount ?? manifest.assets?.length ?? 0,
            };
          } catch {
            return { resourceId, resourceName: resourceId, sourceUrl: null, rule: null, exists: false, assetCount: 0 };
          }
        }),
      );

      const allOk = resources.every((r) => r.exists && r.assetCount > 0);

      const next = {
        ...state,
        ...body,
        productName,
        productSlug,
        resourceIds: resourceIds.join(","),
        assetResources: resources,
        steps: { ...state.steps, assets: allOk ? "done" : "needs-action" },
      };

      await saveState(next);
      await upsertProductToDb(next);
      await syncAssetResourcesToDb(next);

      return NextResponse.json(next);
    }

    if (action === "prepare-narration") {
      const productName = String(body.productName ?? state.productName ?? "");
      const productSlug = slugify(String(body.productSlug ?? state.productSlug));
      const resourceIds = String(body.resourceIds ?? state.resourceIds);
      const model = String(body.model ?? state.model);
      const targetSeconds = Number(body.targetSeconds ?? state.targetSeconds ?? 270);
      const imageLimit = Number(body.imageLimit ?? state.imageLimit ?? 32);
      const verdictFile = String(body.verdictFile ?? state.verdictFile);

      if (!verdictFile) {
        return NextResponse.json({ error: "먼저 Review Analysis를 실행해 verdictFile을 생성하세요." }, { status: 400 });
      }

      const job = await (prisma as any).job.create({
        data: {
          type: "PREPARE_NARRATION",
          status: "PENDING",
          progress: 0,
          message: "Narration Script 준비 대기 중",
          productSlug,
          payload: { productName, productSlug, resourceIds, model, targetSeconds, imageLimit, verdictFile },
        },
      });

      const next = {
        ...state,
        ...body,
        productName,
        productSlug,
        resourceIds,
        model,
        targetSeconds,
        imageLimit,
        verdictFile,
        narrationJobId: job.id,
        videoJobId: "",
        videoPath: "",
        videoResult: null,
        steps: { ...state.steps, narration: "running", video: "pending" },
      };

      await saveState(next);
      await upsertProductToDb(next);

      return NextResponse.json({ ...next, narrationJob: job });
    }

    if (action === "save-narration") {
      const nextDraft = {
        ...state,
        ...body,
        productName: String(body.productName ?? state.productName ?? ""),
        productSlug: slugify(String(body.productSlug ?? state.productSlug)),
        resourceIds: String(body.resourceIds ?? state.resourceIds),
        narrationScript: String(body.narrationScript ?? state.narrationScript ?? ""),
        spokenScript: String(body.spokenScript ?? state.spokenScript ?? ""),
      };

      const paths = await writeNarrationFiles(nextDraft);
      const next = {
        ...nextDraft,
        narrationPath: paths.narrationPath,
        spokenNarrationPath: paths.spokenNarrationPath,
        steps: { ...state.steps, narration: "ready", video: state.steps?.video === "done" ? "pending" : state.steps?.video ?? "pending" },
      };

      await saveState(next);
      await upsertProductToDb(next);

      return NextResponse.json(next);
    }

    if (action === "prepare-shorts") {
      const productName = String(body.productName ?? state.productName ?? "");
      const productSlug = slugify(String(body.productSlug ?? state.productSlug));
      const resourceIds = String(body.resourceIds ?? state.resourceIds);
      const model = String(body.model ?? state.model);
      const targetSeconds = Number(body.shortsTargetSeconds ?? state.shortsTargetSeconds ?? 52);
      const imageLimit = Number(body.shortsImageLimit ?? state.shortsImageLimit ?? 8);
      const verdictFile = String(body.verdictFile ?? state.verdictFile);

      if (!verdictFile) {
        return NextResponse.json({ error: "먼저 Review Analysis를 실행해 verdictFile을 생성하세요." }, { status: 400 });
      }

      const job = await (prisma as any).job.create({
        data: {
          type: "PREPARE_SHORTS",
          status: "PENDING",
          progress: 0,
          message: "Shorts Script 준비 대기 중",
          productSlug,
          payload: { productName, productSlug, resourceIds, model, targetSeconds, imageLimit, verdictFile, videoKind: "shorts" },
        },
      });

      const next = {
        ...state,
        ...body,
        productName,
        productSlug,
        resourceIds,
        model,
        shortsTargetSeconds: targetSeconds,
        shortsImageLimit: imageLimit,
        verdictFile,
        shortsNarrationJobId: job.id,
        shortsVideoJobId: "",
        shortsVideoPath: "",
        shortsVideoResult: null,
        steps: { ...state.steps, shorts: "running", shortsVideo: "pending" },
      };

      await saveState(next);
      await upsertProductToDb(next);

      return NextResponse.json({ ...next, shortsNarrationJob: job });
    }

    if (action === "save-shorts") {
      const nextDraft = {
        ...state,
        ...body,
        productName: String(body.productName ?? state.productName ?? ""),
        productSlug: slugify(String(body.productSlug ?? state.productSlug)),
        resourceIds: String(body.resourceIds ?? state.resourceIds),
        shortsScript: String(body.shortsScript ?? state.shortsScript ?? ""),
        shortsSpokenScript: String(body.shortsSpokenScript ?? state.shortsSpokenScript ?? ""),
      };

      const paths = await writeShortsFiles(nextDraft);
      const next = {
        ...nextDraft,
        shortsNarrationPath: paths.shortsNarrationPath,
        shortsSpokenNarrationPath: paths.shortsSpokenNarrationPath,
        steps: { ...state.steps, shorts: "ready", shortsVideo: state.steps?.shortsVideo === "done" ? "pending" : state.steps?.shortsVideo ?? "pending" },
      };

      await saveState(next);
      await upsertProductToDb(next);

      return NextResponse.json(next);
    }

    if (action === "generate-shorts") {
      const productName = String(body.productName ?? state.productName ?? "");
      const productSlug = slugify(String(body.productSlug ?? state.productSlug));
      const resourceIds = String(body.resourceIds ?? state.resourceIds);
      const model = String(body.model ?? state.model);
      const targetSeconds = Number(body.shortsTargetSeconds ?? state.shortsTargetSeconds ?? 52);
      const imageLimit = Number(body.shortsImageLimit ?? state.shortsImageLimit ?? 8);
      const verdictFile = String(body.verdictFile ?? state.verdictFile);
      const shortsScript = String(body.shortsScript ?? state.shortsScript ?? "").trim();
      const shortsSpokenScript = String(body.shortsSpokenScript ?? state.shortsSpokenScript ?? "").trim();
      const overlayPlanPath = String(body.shortsOverlayPlanPath ?? state.shortsOverlayPlanPath ?? "");
      const bgmMood = String(body.bgmMood ?? state.bgmMood ?? "bright");
      const bgmVolume = Number(body.bgmVolume ?? state.bgmVolume ?? 0.12);

      if (!verdictFile) {
        return NextResponse.json({ error: "먼저 Review Analysis를 실행해 verdictFile을 생성하세요." }, { status: 400 });
      }
      if (!shortsScript || !shortsSpokenScript) {
        return NextResponse.json({ error: "먼저 Shorts Script를 준비하고 필요하면 수정하세요." }, { status: 400 });
      }

      const nextDraft = { ...state, ...body, productName, productSlug, resourceIds, model, shortsTargetSeconds: targetSeconds, shortsImageLimit: imageLimit, verdictFile, shortsScript, shortsSpokenScript, shortsOverlayPlanPath: overlayPlanPath, bgmMood, bgmVolume };
      const paths = await writeShortsFiles(nextDraft);

      const job = await (prisma as any).job.create({
        data: {
          type: "GENERATE_SHORTS",
          status: "PENDING",
          progress: 0,
          message: "Shorts Video Generation 대기 중",
          productSlug,
          payload: {
            productName,
            productSlug,
            resourceIds,
            model,
            targetSeconds,
            imageLimit,
            verdictFile,
            narrationPath: paths.shortsNarrationPath,
            spokenNarrationPath: paths.shortsSpokenNarrationPath,
            overlayPlanPath,
            bgmMood,
            bgmVolume,
            videoKind: "shorts",
          },
        },
      });

      const next = {
        ...nextDraft,
        shortsNarrationPath: paths.shortsNarrationPath,
        shortsSpokenNarrationPath: paths.shortsSpokenNarrationPath,
        shortsVideoJobId: job.id,
        shortsVideoPath: "",
        shortsVideoResult: null,
        steps: { ...state.steps, shorts: "ready", shortsVideo: "running" },
      };

      await saveState(next);
      await upsertProductToDb(next);

      return NextResponse.json({ ...next, shortsVideoJob: job });
    }

    if (action === "generate-video") {
      const productName = String(body.productName ?? state.productName ?? "");
      const productSlug = slugify(String(body.productSlug ?? state.productSlug));
      const resourceIds = String(body.resourceIds ?? state.resourceIds);
      const model = String(body.model ?? state.model);
      const targetSeconds = Number(body.targetSeconds ?? state.targetSeconds ?? 270);
      const imageLimit = Number(body.imageLimit ?? state.imageLimit ?? 32);
      const verdictFile = String(body.verdictFile ?? state.verdictFile);
      const narrationScript = String(body.narrationScript ?? state.narrationScript ?? "").trim();
      const spokenScript = String(body.spokenScript ?? state.spokenScript ?? "").trim();
      const overlayPlanPath = String(body.overlayPlanPath ?? state.overlayPlanPath ?? "");
      const bgmMood = String(body.bgmMood ?? state.bgmMood ?? "bright");
      const bgmVolume = Number(body.bgmVolume ?? state.bgmVolume ?? 0.12);

      if (!verdictFile) {
        return NextResponse.json({ error: "먼저 Review Analysis를 실행해 verdictFile을 생성하세요." }, { status: 400 });
      }
      if (!narrationScript || !spokenScript) {
        return NextResponse.json({ error: "먼저 Narration Script를 준비하고 필요하면 수정하세요." }, { status: 400 });
      }

      const nextDraft = { ...state, ...body, productName, productSlug, resourceIds, model, targetSeconds, imageLimit, verdictFile, narrationScript, spokenScript, overlayPlanPath, bgmMood, bgmVolume };
      const paths = await writeNarrationFiles(nextDraft);

      const job = await (prisma as any).job.create({
        data: {
          type: "GENERATE_VIDEO",
          status: "PENDING",
          progress: 0,
          message: "Video Generation 대기 중",
          productSlug,
          payload: {
            productName,
            productSlug,
            resourceIds,
            model,
            targetSeconds,
            imageLimit,
            verdictFile,
            narrationPath: paths.narrationPath,
            spokenNarrationPath: paths.spokenNarrationPath,
            overlayPlanPath,
            bgmMood,
            bgmVolume,
          },
        },
      });

      const next = {
        ...nextDraft,
        narrationPath: paths.narrationPath,
        spokenNarrationPath: paths.spokenNarrationPath,
        videoJobId: job.id,
        videoPath: "",
        videoResult: null,
        steps: { ...state.steps, narration: "ready", video: "running" },
      };

      await saveState(next);
      await upsertProductToDb(next);

      return NextResponse.json({ ...next, videoJob: job });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "workflow action failed" }, { status: 500 });
  }
}
