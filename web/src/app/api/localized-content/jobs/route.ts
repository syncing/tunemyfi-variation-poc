import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const WEB_ROOT = process.cwd();
const STATE_PATH = path.join(WEB_ROOT, "data/workflow-state/current.json");

const LANGS = ["ko", "en", "de", "fr", "ja", "es", "pt"];
const ACTIONS = ["generate-content", "generate-shorts", "generate-video"];

function normalizeLang(value: unknown) {
  const lang = String(value ?? "en").trim().toLowerCase();
  return LANGS.includes(lang) ? lang : "en";
}

function normalizeAction(value: unknown) {
  const action = String(value ?? "").trim();
  return ACTIONS.includes(action) ? action : "";
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function writeState(state: any) {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function spawnJob(jobId: string, action: string, lang: string) {
  const child = spawn(
    "uv",
    [
      "run",
      "python",
      "scripts/run_localized_content_job.py",
      "--job-id",
      jobId,
      "--action",
      action,
      "--lang",
      lang,
    ],
    {
      cwd: WEB_ROOT,
      env: process.env,
      detached: true,
      stdio: "ignore",
    }
  );

  child.unref();
}

export async function GET() {
  const state = await readState();

  return NextResponse.json({
    ok: true,
    localizedJobs: state.localizedJobs || {},
    localizedContent: state.localizedContent || {},
    contentLanguages: state.contentLanguages || [],
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = normalizeAction(body.action);
    const lang = normalizeLang(body.lang);

    if (!action) {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }

    const jobId = `${Date.now()}-${lang}-${action}-${crypto.randomUUID().slice(0, 8)}`;

    const state = await readState();
    state.localizedJobs ||= {};
    state.localizedJobs[jobId] = {
      id: jobId,
      lang,
      action,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
    };

    await writeState(state);
    spawnJob(jobId, action, lang);

    return NextResponse.json({
      ok: true,
      jobId,
      lang,
      action,
      status: "queued",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}
