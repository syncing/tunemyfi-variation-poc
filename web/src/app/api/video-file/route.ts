import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const WEB_ROOT = process.cwd();

function safeVideoPath(publicPath: string) {
  const normalized = publicPath.replace(/^\/+/, "");

  if (!normalized.startsWith("videos/")) {
    throw new Error("invalid video path");
  }

  if (normalized.includes("..")) {
    throw new Error("invalid path");
  }

  return path.join(WEB_ROOT, "public", normalized);
}

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams.get("path") ?? "";
    const filePath = safeVideoPath(p);
    const file = await readFile(filePath);
    const s = await stat(filePath);

    return new NextResponse(file, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(s.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "video not found" },
      { status: 404 },
    );
  }
}
