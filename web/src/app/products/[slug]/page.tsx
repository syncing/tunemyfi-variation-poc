import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

function videoSrc(publicPath: string) {
  return `/api/video-file?path=${encodeURIComponent(publicPath)}`;
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      assets: {
        orderBy: { createdAt: "desc" },
      },
      selectedAssets: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!product) notFound();

  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <a href="/products" className="text-sm text-neutral-400">
          ← Products
        </a>

        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">{product.name}</h1>
              <div className="mt-2 font-mono text-sm text-neutral-500">
                {product.slug}
              </div>
              <div className="mt-2 text-sm text-neutral-400">
                {product.query || "-"}
              </div>
            </div>

            <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
              {product.status}
            </span>
          </div>

          <div className="mt-5 grid gap-3 text-sm text-neutral-400 md:grid-cols-2">
            <div>
              Ranked File:{" "}
              <span className="font-mono text-neutral-300">
                {product.rankedFile || "-"}
              </span>
            </div>
            <div>
              Verdict File:{" "}
              <span className="font-mono text-neutral-300">
                {product.verdictFile || "-"}
              </span>
            </div>
            <div>
              Video Path:{" "}
              <span className="font-mono text-neutral-300">
                {product.videoPath || "-"}
              </span>
            </div>
            <div>
              Updated: {new Date(product.updatedAt).toLocaleString()}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={`/workflows`}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
            >
              Open Workflow
            </a>

            <a
              href={`/assets?productSlug=${encodeURIComponent(
                product.slug,
              )}&productName=${encodeURIComponent(product.name)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-black"
            >
              Open Asset Manager
            </a>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xl font-bold">Asset Resources</h2>

          <div className="mt-4 grid gap-3">
            {product.assets.length === 0 && (
              <div className="text-sm text-neutral-500">
                등록된 asset resource가 없습니다.
              </div>
            )}

            {product.assets.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
              >
                <div className="font-bold">{r.resourceName}</div>
                <div className="mt-1 font-mono text-xs text-neutral-500">
                  {r.resourceId}
                </div>
                <div className="mt-2 text-sm text-neutral-400">
                  rule: {r.rule || "-"} · assets: {r.assetCount}
                </div>
                {r.sourceUrl && (
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all text-xs text-blue-400"
                  >
                    Source URL
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xl font-bold">Selected Assets</h2>

          <div className="mt-4 grid gap-3">
            {product.selectedAssets.length === 0 && (
              <div className="text-sm text-neutral-500">
                선택된 asset이 없습니다.
              </div>
            )}

            {product.selectedAssets.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs text-neutral-400"
              >
                {a.publicPath}
              </div>
            ))}
          </div>
        </section>

        {product.videoPath && (
          <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-xl font-bold">Video</h2>

            <video controls preload="metadata" className="mt-4 w-full rounded-xl bg-black">
              <source src={videoSrc(product.videoPath)} type="video/mp4" />
            </video>
          </section>
        )}
      </section>
    </main>
  );
}
