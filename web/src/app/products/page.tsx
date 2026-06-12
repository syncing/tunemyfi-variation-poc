"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  slug: string;
  name: string;
  query?: string | null;
  status: string;
  rankedFile?: string | null;
  verdictFile?: string | null;
  videoPath?: string | null;
  updatedAt: string;
  assets: any[];
  selectedAssets: any[];
};

export default function ProductsPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function loadProducts(nextPage = page) {
    setLoading(true);

    try {
      const res = await fetch(
        `/api/products?q=${encodeURIComponent(q)}&page=${nextPage}&pageSize=20`,
      );
      const json = await res.json();
      setData(json);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const products: Product[] = data?.products ?? [];

  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="mb-4 inline-flex rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
          TuneMyFi Products
        </div>

        <h1 className="text-3xl font-bold">Products</h1>

        <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadProducts(1);
            }}
            placeholder="제품명, slug, query 검색"
            className="min-w-80 flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
          />

          <button
            onClick={() => loadProducts(1)}
            disabled={loading}
            className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
          >
            Search
          </button>

          <a
            href="/workflows"
            className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300"
          >
            New Workflow
          </a>
        </div>

        <div className="mt-4 text-sm text-neutral-500">
          Total: {data?.total ?? 0} · Page {data?.page ?? 1} / {data?.totalPages ?? 1}
        </div>

        <div className="mt-5 grid gap-4">
          {products.length === 0 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-400">
              등록된 제품이 없습니다.
            </div>
          )}

          {products.map((p) => (
            <a
              key={p.id}
              href={`/products/${p.slug}`}
              className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-500"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{p.name}</h2>
                  <div className="mt-1 font-mono text-xs text-neutral-500">
                    {p.slug}
                  </div>
                  <div className="mt-2 text-sm text-neutral-400">
                    {p.query || "-"}
                  </div>
                </div>

                <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
                  {p.status}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-xs text-neutral-500 md:grid-cols-4">
                <div>Assets: {p.assets?.length ?? 0}</div>
                <div>Selected: {p.selectedAssets?.length ?? 0}</div>
                <div>Verdict: {p.verdictFile ? "yes" : "no"}</div>
                <div>Video: {p.videoPath ? "yes" : "no"}</div>
              </div>

              <div className="mt-3 text-xs text-neutral-600">
                Updated: {new Date(p.updatedAt).toLocaleString()}
              </div>
            </a>
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => loadProducts(Math.max(1, page - 1))}
            disabled={loading || page <= 1}
            className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-300 disabled:opacity-40"
          >
            Prev
          </button>

          <button
            onClick={() => loadProducts(page + 1)}
            disabled={loading || page >= (data?.totalPages ?? 1)}
            className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-300 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
