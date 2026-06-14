import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const LOCALIZED_LANG_META: Record<string, { name: string; voice: string }> = {
  ko: { name: "Korean", voice: "ko-KR-SunHiNeural" },
  en: { name: "English", voice: "en-US-JennyNeural" },
  de: { name: "German", voice: "de-DE-KatjaNeural" },
  fr: { name: "French", voice: "fr-FR-DeniseNeural" },
  ja: { name: "Japanese", voice: "ja-JP-NanamiNeural" },
  es: { name: "Spanish", voice: "es-ES-ElviraNeural" },
  pt: { name: "Portuguese", voice: "pt-BR-FranciscaNeural" },
};

const SUPPORTED_LOCALIZED_LANGS = Object.keys(LOCALIZED_LANG_META);

function normalizeLang(value: unknown) {
  const lang = String(value ?? "ko").trim().toLowerCase();
  return SUPPORTED_LOCALIZED_LANGS.includes(lang) ? lang : "ko";
}



const LOCALIZED_LANG_VOICES: Record<string, string> = {
  ko: "ko-KR-SunHiNeural",
  en: "en-US-JennyNeural",
  de: "de-DE-KatjaNeural",
  fr: "fr-FR-DeniseNeural",
  ja: "ja-JP-NanamiNeural",
  es: "es-ES-ElviraNeural",
  pt: "pt-BR-FranciscaNeural",
};


const WEB_ROOT = process.cwd();
const STATE_PATH = path.join(WEB_ROOT, "data/workflow-state/current.json");

const PACKS: Record<string, { name: string; voice: string }> = {
  en: { name: "English", voice: "en-US-JennyNeural" },
  de: { name: "German", voice: "de-DE-KatjaNeural" },
  fr: { name: "French", voice: "fr-FR-DeniseNeural" },
  ja: { name: "Japanese", voice: "ja-JP-NanamiNeural" },
  es: { name: "Spanish", voice: "es-ES-ElviraNeural" },
  pt: { name: "Portuguese", voice: "pt-BR-FranciscaNeural" },
};

function normLang(value: unknown) {
  return normalizeLang(value);
}

async function readState() {
  return JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
}

async function writeState(state: any) {
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function run(command: string, args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, { cwd: WEB_ROOT, env: process.env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function publicToFile(publicPath: string) {
  return path.join(WEB_ROOT, "public", publicPath.replace(/^\/+/, ""));
}


async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(targetPath: string) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

async function cleanupLocalizedArtifacts(lang: string, action: string, state: any) {
  const productSlug = state?.productSlug || state?.product?.slug || "sennheiser-hdb-630";
  const videoDir = path.join(WEB_ROOT, "public/videos", productSlug);
  const workDir = path.join(
    WEB_ROOT,
    "data/video-work",
    productSlug,
    `${productSlug}-qwen-dubbed-${lang}`
  );

  // public output files
  const publicTargets: string[] = [];

  if (action === "generate-content") {
    // Content regeneration should start fresh for that language.
    await removeIfExists(workDir);

    publicTargets.push(
      path.join(videoDir, `${productSlug}-qwen-${lang}.mp4`),
      path.join(videoDir, `${productSlug}-qwen-shorts-${lang}.mp4`)
    );
  }

  if (action === "generate-shorts") {
    publicTargets.push(path.join(videoDir, `${productSlug}-qwen-shorts-${lang}.mp4`));

    // Keep localized text/json inputs, remove only generated shorts media/cache.
    if (await pathExists(workDir)) {
      const entries = await fs.readdir(workDir).catch(() => []);
      await Promise.all(
        entries
          .filter((name) =>
            name.startsWith("shorts_scene_") ||
            name.startsWith("timeline_caption_") ||
            name.startsWith("shorts_timeline_caption_") ||
            name.startsWith("shorts_silent_") ||
            name.startsWith("shorts_final_") ||
            name === "shorts_result.json" ||
            name === "shorts_narration_ko.mp3"
          )
          .map((name) => removeIfExists(path.join(workDir, name)))
      );
    }
  }

  if (action === "generate-video") {
    publicTargets.push(path.join(videoDir, `${productSlug}-qwen-${lang}.mp4`));

    // Keep localized text/json inputs, remove only generated longform media/cache.
    if (await pathExists(workDir)) {
      const entries = await fs.readdir(workDir).catch(() => []);
      await Promise.all(
        entries
          .filter((name) =>
            name.startsWith("scene_") ||
            name.startsWith("timeline_caption_") ||
            name.startsWith("silent_") ||
            name.startsWith("final_") ||
            name === "result.json" ||
            name === "narration_ko.mp3"
          )
          .map((name) => removeIfExists(path.join(workDir, name)))
      );
    }
  }

  await Promise.all(publicTargets.map(removeIfExists));
}

function withLangSuffix(publicPath: string, lang: string) {
  const cleanLang = normalizeLang(lang);
  return String(publicPath || "")
    .replace(/-(ko|en|de|fr|ja|es|pt)\.mp4$/i, ".mp4")
    .replace(/\.mp4$/i, `-${cleanLang}.mp4`);
}

async function generateContent(lang: string) {
  const state = await readState();
const productSlug = state.productSlug;
  const productName = state.productName || productSlug;
  const model = state.model || "qwen3:32b";

  if (!productSlug) throw new Error("productSlug is missing");

  const result = await run("uv", [
    "run",
    "python",
    "scripts/generate_localized_content.py",
    "--lang",
    lang,
    "--product-name",
    productName,
    "--product-slug",
    productSlug,
    "--query-slug",
    state.querySlug || productSlug,
    "--model",
    model,
  ]);

  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `generate content failed: ${result.code}`);
  }

  return await readState();
}

async function generateVideo(lang: string, shorts: boolean) {
  let state = await readState();
  const pack = LOCALIZED_LANG_META[lang] || LOCALIZED_LANG_META.ko;
  const item = state.localizedContent?.[lang];

  if (!item) {
    throw new Error(`${pack.name} content is missing. Generate content first.`);
  }

  const productSlug = state.productSlug;
  const productName = state.productName || productSlug;
  const resourceIds = state.resourceIds || productSlug;
  const model = state.model || "qwen3:32b";

  const narrationFile = shorts ? item.shortsNarrationPath : item.narrationPath;
  const spokenFile = shorts ? item.shortsSpokenNarrationPath : item.spokenNarrationPath;
  const overlayFile = shorts ? item.shortsOverlayPlanPath : item.overlayPlanPath;

  if (!narrationFile) throw new Error(`${pack.name} narration file is missing`);
  if (!spokenFile) throw new Error(`${pack.name} spoken narration file is missing`);

  const beforeVideoPath = state.videoPath;
  const beforeShortsVideoPath = state.shortsVideoPath;

  const args = [
    "run",
    "python",
    "scripts/generate_dubbed_review_video.py",
    "--product-slug",
    productSlug,
    "--resource-ids",
    resourceIds,
    "--product-name",
    productName,
    "--model",
    model,
    "--target-seconds",
    String(shorts ? state.shortsTargetSeconds || 75 : state.targetSeconds || 330),
    "--video-kind",
    shorts ? "shorts" : "long",
    "--tts-voice",
    LOCALIZED_LANG_VOICES[lang],
    "--narration-file",
    narrationFile,
    "--spoken-narration-file",
    spokenFile,
  ];

  if (overlayFile) {
    args.push("--overlay-plan-file", overlayFile);
  }

  const result = await run("uv", args);

  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `video generation failed: ${result.code}`);
  }

  state = await readState();

  const generatedPublicPath = shorts ? state.shortsVideoPath : state.videoPath;
  if (!generatedPublicPath) throw new Error("generated video path is missing");

  const outputPublicPath = withLangSuffix(generatedPublicPath, lang);
  await fs.copyFile(publicToFile(generatedPublicPath), publicToFile(outputPublicPath));

  if (beforeVideoPath !== undefined) state.videoPath = beforeVideoPath;
  if (beforeShortsVideoPath !== undefined) state.shortsVideoPath = beforeShortsVideoPath;

  state.localizedContent ||= {};
  state.localizedContent[lang] ||= {};

  if (shorts) {
    state.localizedContent[lang].shortsVideoPath = outputPublicPath;
    state.steps ||= {};
    state.steps[`${lang}ShortsVideo`] = "ready";
  } else {
    state.localizedContent[lang].videoPath = outputPublicPath;
    state.steps ||= {};
    state.steps[`${lang}Video`] = "ready";
  }

  state.contentLanguages = Array.from(new Set([...(state.contentLanguages || []), lang])).sort();

  await writeState(state);

  return {
    ok: true,
    lang,
    kind: shorts ? "shorts" : "long",
    publicVideoPath: outputPublicPath,
    state,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    
    const lang = normalizeLang(body.lang);
const action = body.action || "";

const SHORTS_TARGET_SECONDS = 75;
const LONG_TARGET_SECONDS = 330;

if (action === "generate-content") {
      const state = await generateContent(lang);
      return NextResponse.json({ ok: true, lang, state });
    }

    if (action === "generate-video") {
      const result = await generateVideo(lang, false);
      return NextResponse.json(result);
    }

    if (action === "generate-shorts") {
      const result = await generateVideo(lang, true);
      return NextResponse.json(result);
    }

    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST with action=generate-content | generate-video | generate-shorts",
  });
}
