import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const WEB_ROOT = process.cwd();
const STATE_PATH = path.join(WEB_ROOT, "data/workflow-state/current.json");

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

function spawnBatchJob(jobId: string) {
  const child = spawn(
    "uv",
    [
      "run",
      "python",
      "scripts/run_all_localized_content_job.py",
      "--job-id",
      jobId,
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
    localizedBatchJobs: state.localizedBatchJobs || {},
    localizedContent: state.localizedContent || {},
  });
}

export async function POST() {
  try {
    const jobId = `${Date.now()}-all-localized-${crypto.randomUUID().slice(0, 8)}`;

    const state = await readState();
    state.localizedBatchJobs ||= {};
    state.localizedBatchJobs[jobId] = {
      id: jobId,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentLang: null,
      currentAction: null,
      total: 21,
      done: 0,
      failed: 0,
      error: null,
    };

    await writeState(state);
    spawnBatchJob(jobId);

    return NextResponse.json({
      ok: true,
      jobId,
      status: "queued",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}
