import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const WEB_ROOT = process.cwd();
const PRONUNCIATION_PATH = path.join(
  WEB_ROOT,
  "scripts",
  "config",
  "tts_pronunciation_ko.json",
);

type PronunciationEntry = {
  source: string;
  spoken: string;
};

async function readPronunciationMap(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(PRONUNCIATION_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const result: Record<string, string> = {};
    for (const [source, spoken] of Object.entries(parsed)) {
      const sourceText = String(source ?? "").trim();
      const spokenText = String(spoken ?? "").trim();
      if (sourceText && spokenText) result[sourceText] = spokenText;
    }
    return result;
  } catch {
    return {};
  }
}

function mapToEntries(map: Record<string, string>): PronunciationEntry[] {
  return Object.entries(map)
    .map(([source, spoken]) => ({ source, spoken }))
    .sort((a, b) => a.source.localeCompare(b.source, "ko"));
}

function entriesToMap(entries: PronunciationEntry[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const entry of entries) {
    const source = String(entry?.source ?? "").trim();
    const spoken = String(entry?.spoken ?? "").trim();
    if (!source || !spoken) continue;
    result[source] = spoken;
  }

  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b, "ko")),
  );
}

export async function GET() {
  const map = await readPronunciationMap();
  return NextResponse.json({
    ok: true,
    path: PRONUNCIATION_PATH,
    map,
    entries: mapToEntries(map),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let nextMap: Record<string, string> = {};

    if (Array.isArray(body.entries)) {
      nextMap = entriesToMap(body.entries);
    } else if (body.map && typeof body.map === "object" && !Array.isArray(body.map)) {
      nextMap = entriesToMap(
        Object.entries(body.map).map(([source, spoken]) => ({
          source,
          spoken: String(spoken ?? ""),
        })),
      );
    } else {
      return NextResponse.json(
        { ok: false, error: "entries 또는 map이 필요합니다." },
        { status: 400 },
      );
    }

    await mkdir(path.dirname(PRONUNCIATION_PATH), { recursive: true });
    await writeFile(
      PRONUNCIATION_PATH,
      JSON.stringify(nextMap, null, 2) + "\n",
      "utf-8",
    );

    return NextResponse.json({
      ok: true,
      path: PRONUNCIATION_PATH,
      map: nextMap,
      entries: mapToEntries(nextMap),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "pronunciation save failed" },
      { status: 500 },
    );
  }
}
