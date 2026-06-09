"use client";

import { useEffect, useState } from "react";

type Asset = {
  id: string;
  filename: string;
  publicPath: string;
  sourceUrl: string;
  contentType: string;
  sizeBytes: number;
};

type Resource = {
  resourceId: string;
  resourceName: string;
  sourcePageUrl: string;
  rule: string;
  assetCount: number;
  manifest?: {
    assets: Asset[];
  };
};

type ProductData = {
  productSlug: string;
  productName: string;
  resources: Resource[];
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function AssetsPage() {
  const [productName, setProductName] = useState("Sony WH-1000XM6");
  const [productSlug, setProductSlug] = useState("sony-wh-1000xm6");
  const [resourceName, setResourceName] = useState("Press Images - Sand Pink");
  const [resourceId, setResourceId] = useState("press-sand-pink");
  const [sourceUrl, setSourceUrl] = useState(
    "https://www.sony.eu/presscentre/media/album/bba2b823-312b-4e09-a3b5-7313736ad69f",
  );
  const [rule, setRule] = useState("press-inline-jpeg");
  const [copyrightNote, setCopyrightNote] = useState(
    "Official press assets. Verify usage rights before publication.",
  );
  const [clean, setClean] = useState(true);
  const [data, setData] = useState<ProductData | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadProduct() {
    const res = await fetch(`/api/assets?productSlug=${encodeURIComponent(productSlug)}`);
    const json = await res.json();
    setData(json);
  }

  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importResource() {
    setLoading(true);
    setMessage("Asset resource import 중...");

    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          productSlug,
          resourceName,
          resourceId,
          sourceUrl,
          rule,
          copyrightNote,
          clean,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error ?? "Import 실패");
      }

      setMessage("Import 완료");
      await loadProduct();
    } catch (e: any) {
      setMessage(e.message ?? "오류 발생");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <div className="mb-4 inline-flex rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
          TuneMyFi Asset Manager
        </div>

        <h1 className="text-3xl font-bold">제품별 이미지 리소스 관리</h1>

        <div className="mt-6 grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              Product Name
              <input value={productName} onChange={(e) => setProductName(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
            </label>

            <label className="grid gap-2 text-sm">
              Product Slug
              <input value={productSlug} onChange={(e) => setProductSlug(e.target.value)} onBlur={loadProduct} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
            </label>

            <label className="grid gap-2 text-sm">
              Resource Name
              <input value={resourceName} onChange={(e) => setResourceName(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
            </label>

            <label className="grid gap-2 text-sm">
              Resource ID
              <input value={resourceId} onChange={(e) => setResourceId(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
            </label>
          </div>

          <label className="grid gap-2 text-sm">
            Source URL
            <textarea value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} rows={3} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs" />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              Rule
              <select value={rule} onChange={(e) => setRule(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3">
                <option value="generic">generic</option>
                <option value="press-inline-jpeg">press-inline-jpeg</option>
              </select>
            </label>

            <label className="flex items-center gap-2 pt-7 text-sm">
              <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} />
              기존 Resource 덮어쓰기
            </label>
          </div>

          <label className="grid gap-2 text-sm">
            Copyright Note
            <textarea value={copyrightNote} onChange={(e) => setCopyrightNote(e.target.value)} rows={2} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs" />
          </label>

          <div className="flex gap-2">
            <button onClick={importResource} disabled={loading} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
              {loading ? "Import 중..." : "Import Resource"}
            </button>

            <button onClick={loadProduct} className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300">
              Reload
            </button>
          </div>

          {message && <div className="text-sm text-neutral-300">{message}</div>}
        </div>

        <div className="mt-8">
          <h2 className="text-2xl font-bold">
            {data?.productName ?? productName}
          </h2>
          <div className="mt-1 text-sm text-neutral-500">
            {data?.productSlug ?? productSlug}
          </div>
        </div>

        <div className="mt-5 grid gap-6">
          {(data?.resources ?? []).map((resource) => (
            <section key={resource.resourceId} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold">{resource.resourceName}</h3>
                  <div className="mt-1 text-xs text-neutral-500">
                    {resource.resourceId} · rule: {resource.rule} · assets: {resource.assetCount}
                  </div>
                  <a href={resource.sourcePageUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-blue-400">
                    Source URL
                  </a>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(resource.manifest?.assets ?? []).map((asset) => (
                  <div key={asset.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
                    <a href={asset.publicPath} target="_blank" rel="noreferrer">
                      <img src={asset.publicPath} alt={asset.filename} className="h-48 w-full object-contain bg-black" />
                    </a>
                    <div className="space-y-1 p-3 text-xs text-neutral-400">
                      <div className="font-mono text-neutral-200">{asset.filename}</div>
                      <div>{formatBytes(asset.sizeBytes)}</div>
                      <div>{asset.contentType}</div>
                      <a href={asset.sourceUrl} target="_blank" rel="noreferrer" className="block break-all text-blue-400">
                        Original URL
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
