import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const WEB_ROOT = process.cwd();

function contentTypeFor(filePath: string) {
  const lower = filePath.toLowerCase();

  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

export async function GET(req: NextRequest) {
  const publicPath = req.nextUrl.searchParams.get("path") ?? "";

  if (!publicPath.startsWith("/product-assets/")) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const filePath = path.join(WEB_ROOT, "public", publicPath);

  try {
    const s = await stat(filePath);

    if (!s.isFile()) {
      return NextResponse.json({ error: "not a file" }, { status: 404 });
    }

    const buf = await readFile(filePath);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentTypeFor(filePath),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found", path: publicPath }, { status: 404 });
  }
}
