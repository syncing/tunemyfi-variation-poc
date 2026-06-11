"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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

function assetSrc(publicPath: string) {
  return `/api/asset-file?path=${encodeURIComponent(publicPath)}`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || ""
  );
}

function AssetsPageInner() {
  const searchParams = useSearchParams();

  const initialProductSlug = searchParams.get("productSlug") ?? "";
  const initialProductName = searchParams.get("productName") ?? "";
  const initialResourceId = searchParams.get("resourceId") ?? initialProductSlug;

  const [productName, setProductName] = useState(initialProductName);
  const [productSlug, setProductSlug] = useState(initialProductSlug);
  const [resourceName, setResourceName] = useState(
    initialProductSlug ? "Official Assets" : "",
  );
  const [resourceId, setResourceId] = useState(initialResourceId);
  const [sourceUrl, setSourceUrl] = useState("");
  const [rule, setRule] = useState("generic");
  const [copyrightNote, setCopyrightNote] = useState(
    "Official or manually collected assets. Verify usage rights before publication.",
  );
  const [clean, setClean] = useState(true);
  const [data, setData] = useState<ProductData | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadProduct(slug = productSlug) {
    if (!slug) {
      setData(null);
      return;
    }

    const res = await fetch(`/api/assets?productSlug=${encodeURIComponent(slug)}`);
    const json = await res.json();

    setData(json);

    if (json?.productName && !productName) {
      setProductName(json.productName);
    }
  }

  useEffect(() => {
    if (initialProductSlug) {
      loadProduct(initialProductSlug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importResource() {
    setLoading(true);
    setMessage("Asset resource import 중...");

    try {
      const normalizedSlug = slugify(productSlug || productName);
      const normalizedResourceId = slugify(resourceId || normalizedSlug);

      if (!normalizedSlug) {
        throw new Error("Product Slug가 없습니다.");
      }

      if (!normalizedResourceId) {
        throw new Error("Resource ID가 없습니다.");
      }

      if (!sourceUrl.trim()) {
        throw new Error("Source URL이 없습니다.");
      }

      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          productSlug: normalizedSlug,
          resourceName: resourceName || normalizedResourceId,
          resourceId: normalizedResourceId,
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

      setProductSlug(normalizedSlug);
      setResourceId(normalizedResourceId);
      setMessage("Import 완료");
      await loadProduct(normalizedSlug);
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

        {initialProductSlug && (
          <div className="mt-3 text-sm text-neutral-400">
            Workflow에서 넘어온 Product Slug:{" "}
            <span className="font-mono text-neutral-200">
              {initialProductSlug}
            </span>
          </div>
        )}

        <div className="mt-6 grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              Product Name
              <input
                value={productName}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setProductName(nextName);

                  if (!productSlug) {
                    const nextSlug = slugify(nextName);
                    setProductSlug(nextSlug);
                    setResourceId(nextSlug);
                  }
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
              />
            </label>

            <label className="grid gap-2 text-sm">
              Product Slug
              <input
                value={productSlug}
                onChange={(e) => {
                  const nextSlug = slugify(e.target.value);
                  setProductSlug(nextSlug);
                  setResourceId(nextSlug);
                }}
                onBlur={() => loadProduct(productSlug)}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
              />
            </label>

            <label className="grid gap-2 text-sm">
              Resource Name
              <input
                value={resourceName}
                onChange={(e) => setResourceName(e.target.value)}
                placeholder="Official Assets"
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
              />
            </label>

            <label className="grid gap-2 text-sm">
              Resource ID
              <input
                value={resourceId}
                onChange={(e) => setResourceId(slugify(e.target.value))}
                placeholder={productSlug || "product-slug"}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
              />
              <span className="text-xs text-neutral-500">
                기본값은 Product Slug입니다. 색상/출처별로 나누고 싶으면 변경하세요.
              </span>
            </label>
          </div>

          <label className="grid gap-2 text-sm">
            Source URL
            <textarea
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              rows={3}
              placeholder="공식 제품 페이지, 보도자료, 이미지 앨범 URL"
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              Rule
              <select
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
              >
                <option value="generic">generic</option>
                <option value="press-inline-jpeg">press-inline-jpeg</option>
              </select>
            </label>

            <label className="flex items-center gap-2 pt-7 text-sm">
              <input
                type="checkbox"
                checked={clean}
                onChange={(e) => setClean(e.target.checked)}
              />
              기존 Resource 덮어쓰기
            </label>
          </div>

          <label className="grid gap-2 text-sm">
            Copyright Note
            <textarea
              value={copyrightNote}
              onChange={(e) => setCopyrightNote(e.target.value)}
              rows={2}
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={importResource}
              disabled={loading}
              className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              {loading ? "Import 중..." : "Import Resource"}
            </button>

            <button
              onClick={() => loadProduct(productSlug)}
              className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300"
            >
              Reload
            </button>

            <a
              href="/workflows"
              className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300"
            >
              Back to Workflow
            </a>
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
            <section
              key={resource.resourceId}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold">{resource.resourceName}</h3>
                  <div className="mt-1 text-xs text-neutral-500">
                    {resource.resourceId} · rule: {resource.rule} · assets:{" "}
                    {resource.assetCount}
                  </div>
                  <a
                    href={resource.sourcePageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all text-xs text-blue-400"
                  >
                    Source URL
                  </a>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(resource.manifest?.assets ?? []).map((asset) => (
                  <div
                    key={`${resource.resourceId}-${asset.id}`}
                    className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950"
                  >
                    <a href={assetSrc(asset.publicPath)} target="_blank" rel="noreferrer">
                        <img
                          src={assetSrc(asset.publicPath)}
                          alt={asset.filename}
                          className="h-48 w-full bg-black object-contain"
                        />
                    </a>
                    <div className="space-y-1 p-3 text-xs text-neutral-400">
                      <div className="font-mono text-neutral-200">
                        {asset.filename}
                      </div>
                      <div>{formatBytes(asset.sizeBytes)}</div>
                      <div>{asset.contentType}</div>
                      <a
                        href={asset.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block break-all text-blue-400"
                      >
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

export default function AssetsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 p-8 text-white">
          Loading...
        </main>
      }
    >
      <AssetsPageInner />
    </Suspense>
  );
}
