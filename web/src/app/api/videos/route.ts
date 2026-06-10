import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { spawn } from "child_process";

const WEB_ROOT = process.cwd();
const PROJECT_ROOT = "/home/hycho/projects/tunemyfi-variation-poc";
const UV_BIN = "/home/hycho/.local/bin/uv";
const VIDEO_ROOT = path.join(WEB_ROOT, "public", "videos");

function slugify(text: string) {
  return (
    text.toLowerCase().trim()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

async function listVideos(productSlug: string) {
  const dir = path.join(VIDEO_ROOT, productSlug);

  try {
    const files = await readdir(dir);
    const videos = await Promise.all(
      files.filter((f) => f.endsWith(".mp4")).map(async (filename) => {
        const s = await stat(path.join(dir, filename));
        return {
          filename,
          sizeBytes: s.size,
          updatedAt: s.mtime.toISOString(),
          publicPath: `/videos/${productSlug}/${filename}`,
        };
      }),
    );

    return videos.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function runUvPython(args: string[]) {
  return new Promise<any>((resolve, reject) => {
    const proc = spawn(UV_BIN, ["run", "python", ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, UV_PROJECT: PROJECT_ROOT },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => stdout += d.toString());
    proc.stderr.on("data", (d) => stderr += d.toString());
    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `python failed: ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`JSON parse failed\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
      }
    });
  });
}

export async function GET(req: NextRequest) {
  const productSlug = slugify(req.nextUrl.searchParams.get("productSlug") ?? "sony-wh-1000xm6");
  const videos = await listVideos(productSlug);
  return NextResponse.json({ productSlug, videos });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const mode = String(body.mode ?? "preview");
    const productSlug = slugify(String(body.productSlug ?? "sony-wh-1000xm6"));
    const limit = Number(body.limit ?? 16);

    let result: any;

    if (mode === "dubbed") {
      const resourceIds = String(body.resourceIds ?? "");
      const productName = String(body.productName ?? "Sony WH-1000XM6");
      const model = String(body.model ?? process.env.OLLAMA_MODEL ?? "qwen3:32b");
      const targetSeconds = Number(body.targetSeconds ?? 120);
      const verdictFile = String(body.verdictFile ?? "");

      if (!resourceIds) {
        return NextResponse.json({ error: "resourceIds가 없습니다." }, { status: 400 });
      }

      result = await runUvPython([
        "web/scripts/generate_dubbed_review_video.py",
        "--product-slug", productSlug,
        "--resource-ids", resourceIds,
        "--product-name", productName,
        "--model", model,
        "--limit", String(limit),
        "--target-seconds", String(targetSeconds),
        ...(verdictFile ? ["--verdict-file", verdictFile] : []),
      ]);
    } else {
      const resourceId = slugify(String(body.resourceId ?? ""));

      if (!resourceId) {
        return NextResponse.json({ error: "resourceId가 없습니다." }, { status: 400 });
      }

      result = await runUvPython([
        "web/scripts/render_asset_video.py",
        "--product-slug", productSlug,
        "--resource-id", resourceId,
        "--limit", String(limit),
        "--seconds", String(body.seconds ?? 5),
      ]);
    }

    const videos = await listVideos(productSlug);
    return NextResponse.json({ ...result, videos });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "video render 실패" },
      { status: 500 },
    );
  }
}
