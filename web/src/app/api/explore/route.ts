import { NextRequest, NextResponse } from "next/server";
import { runExplore } from "@/lib/explore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = String(body.query ?? "").trim();
    const result = await runExplore(query);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message ?? "unknown error",
      },
      { status: 500 },
    );
  }
}
