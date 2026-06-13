import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function normalizeJob(job: any) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    message: job.message,
    productSlug: job.productSlug,
    payload: job.payload,
    result: job.result,
    error: job.error,
    attempts: job.attempts,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    updatedAt: job.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productSlug = searchParams.get("productSlug") ?? undefined;
  const type = searchParams.get("type") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

  const jobs = await (prisma as any).job.findMany({
    where: {
      ...(productSlug ? { productSlug } : {}),
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ jobs: jobs.map(normalizeJob) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = String(body.type ?? "").trim();
    const productSlug = body.productSlug ? String(body.productSlug) : null;
    const payload = body.payload ?? {};

    if (!type) {
      return NextResponse.json({ error: "type이 필요합니다." }, { status: 400 });
    }

    const job = await (prisma as any).job.create({
      data: {
        type,
        status: "PENDING",
        progress: 0,
        message: "대기 중",
        productSlug,
        payload,
      },
    });

    return NextResponse.json({ job: normalizeJob(job) }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "job create failed" },
      { status: 500 },
    );
  }
}
