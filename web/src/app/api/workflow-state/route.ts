import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { prisma } from "@/lib/prisma";

const WEB_ROOT = process.cwd();
const PROJECT_ROOT =
  process.env.PROJECT_ROOT ?? "/home/hycho/projects/tunemyfi-variation-poc";
const UV_BIN = process.env.UV_BIN ?? "/home/hycho/.local/bin/uv";

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
    targetSeconds: 120,
    imageLimit: 16,

    rankedFile: "",
    verdictFile: "",
    videoPath: "",
    videoResult: null,
    assetResources: [],

    steps: {
      product: "pending",
      analysis: "pending",
      assets: "pending",
      video: "pending",
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
  if (state.steps?.analysis === "done") return "analyzed";
  if (state.steps?.assets === "done") return "assets_done";
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

  const resources = Array.isArray(state.assetResources)
    ? state.assetResources
    : [];

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

async function callExplore(query: string) {
  const url = new URL("/api/explore", "http://127.0.0.1:3000");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Explore API 실패");
  }

  return data;
}

function runPython(args: string[]) {
  return new Promise<any>((resolve, reject) => {
    const proc = spawn(UV_BIN, ["run", "python", ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, UV_PROJECT: PROJECT_ROOT },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });

    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `python failed: ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(
          new Error(`JSON parse failed\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`),
        );
      }
    });
  });
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

        steps: {
          product: "done",
          analysis: "pending",
          assets: "pending",
          video: "pending",
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

      await callExplore(query);

      const rankedFile = `data/ranked/${querySlug}.ranked.json`;
      const verdictFile = `data/verdicts/${querySlug}.verdict.json`;

      const next = {
        ...state,
        ...body,
        productName,
        productSlug,
        query,
        querySlug,
        rankedFile,
        verdictFile,
        steps: {
          ...state.steps,
          product: "done",
          analysis: "done",
        },
      };

      await saveState(next);
      await upsertProductToDb(next);

      return NextResponse.json(next);
    }

    if (action === "check-assets") {
      const productName = String(body.productName ?? state.productName ?? "");
      const productSlug = slugify(String(body.productSlug ?? state.productSlug));
      const resourceIds = String(body.resourceIds ?? state.resourceIds)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

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
            return {
              resourceId,
              resourceName: resourceId,
              sourceUrl: null,
              rule: null,
              exists: false,
              assetCount: 0,
            };
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
        steps: {
          ...state.steps,
          assets: allOk ? "done" : "needs-action",
        },
      };

      await saveState(next);
      await upsertProductToDb(next);
      await syncAssetResourcesToDb(next);

      return NextResponse.json(next);
    }

    if (action === "generate-video") {
      const productName = String(body.productName ?? state.productName ?? "");
      const productSlug = slugify(String(body.productSlug ?? state.productSlug));
      const resourceIds = String(body.resourceIds ?? state.resourceIds);
      const model = String(body.model ?? state.model);
      const targetSeconds = Number(
        body.targetSeconds ?? state.targetSeconds ?? 120,
      );
      const imageLimit = Number(body.imageLimit ?? state.imageLimit ?? 16);
      const verdictFile = String(body.verdictFile ?? state.verdictFile);

      if (!verdictFile) {
        return NextResponse.json(
          { error: "먼저 Review Analysis를 실행해 verdictFile을 생성하세요." },
          { status: 400 },
        );
      }

      const result = await runPython([
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
      ]);

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
        videoPath: result.publicPath,
        videoResult: result,
        steps: {
          ...state.steps,
          video: "done",
        },
      };

      await saveState(next);
      await upsertProductToDb(next);

      return NextResponse.json(next);
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "workflow action failed" },
      { status: 500 },
    );
  }
}
