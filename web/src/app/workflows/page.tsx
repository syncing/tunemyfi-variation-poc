"use client";

import { useEffect, useState } from "react";

function assetSrc(publicPath: string) {
  return `/api/asset-file?path=${encodeURIComponent(publicPath)}`;
}

function videoSrc(publicPath: string) {
  return `/api/video-file?path=${encodeURIComponent(publicPath)}`;
}

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

function StepBadge({ value }: { value?: string }) {
  const label = value ?? "pending";

  return (
    <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
      {label}
    </span>
  );
}

export default function WorkflowPage() {
  const [state, setState] = useState<any>(null);
  const [assetData, setAssetData] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loadingAction, setLoadingAction] = useState("");

  async function loadState() {
    const res = await fetch("/api/workflow-state");
    const data = await res.json();
    setState(data);
  }

  useEffect(() => {
    loadState();
  }, []);

  function updateField(key: string, value: any) {
    setState((prev: any) => ({ ...prev, [key]: value }));
  }

  async function clearWorkflow() {
      setLoadingAction("clear-workflow");
      setMessage("Workflow 초기화 중...");

      try {
        const res = await fetch("/api/workflow-state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clear-workflow" }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? "초기화 실패");
        }

        setState(data);
        setAssetData(null);
        setMessage("Workflow 초기화 완료");
      } catch (e: any) {
        setMessage(e.message ?? "오류 발생");
      } finally {
        setLoadingAction("");
      }
    }

  async function loadWorkflowAssets() {
    if (!state?.productSlug) return;

    const res = await fetch(
      `/api/workflow-assets?productSlug=${encodeURIComponent(state.productSlug)}`,
    );

    const data = await res.json();
    setAssetData(data);
  }

  async function saveSelectedAssets(nextSelected: string[]) {
    const res = await fetch("/api/workflow-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productSlug: state.productSlug,
        selectedPublicPaths: nextSelected,
      }),
    });

    const data = await res.json();
    setAssetData(data);
  }

  function toggleAsset(publicPath: string) {
    const selected = new Set<string>(
    (assetData?.selectedPublicPaths ?? []) as string[],
    );

    if (selected.has(publicPath)) {
    selected.delete(publicPath);
    } else {
    selected.add(publicPath);
    }

    saveSelectedAssets(Array.from(selected));
  }       

  async function runAction(action: string, label: string) {
    setLoadingAction(action);
    setMessage(`${label} 실행 중...`);

    try {
      const res = await fetch("/api/workflow-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...state, action }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `${label} 실패`);
      }

      setState(data);
      setMessage(`${label} 완료`);

      if (action === "check-assets") {
        setTimeout(() => {
          loadWorkflowAssets();
        }, 100);
      }
    } catch (e: any) {
      setMessage(e.message ?? "오류 발생");
    } finally {
      setLoadingAction("");
    }
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-neutral-950 p-8 text-white">
        Loading...
      </main>
    );
  }

  const busy = Boolean(loadingAction);

  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="mb-4 inline-flex rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
          TuneMyFi Workflow Wizard
        </div>

        <h1 className="text-3xl font-bold">Review Video Workflow</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={clearWorkflow}
            disabled={busy}
            className="rounded-xl border border-red-800 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
          >
            Clear Workflow
          </button>
        </div>

        {message && (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300">
            {message}
          </div>
        )}

        <div className="mt-6 grid gap-6">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Step 1. Product</h2>
              <StepBadge value={state.steps?.product} />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Product Name
                <input
                  value={state.productName ?? ""}
                  onChange={(e) => {
                      const productName = e.target.value;
                      const productSlug = slugify(productName);

                      updateField("productName", productName);
                      updateField("productSlug", productSlug);
                      updateField("query", productName ? `${productName} review` : "");
                      updateField("resourceIds", productSlug);
                  }}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                />
              </label>

              <label className="grid gap-2 text-sm">
                Product Slug
                <input
                  value={state.productSlug ?? ""}
                  readOnly
                  className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-neutral-400"
                />
              </label>

              <label className="grid gap-2 text-sm md:col-span-2">
                Review Query
                <input
                  value={state.query ?? ""}
                  onChange={(e) => updateField("query", e.target.value)}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                />
              </label>
            </div>

            <button
              onClick={() => runAction("save-product", "Product 저장")}
              disabled={busy}
              className="mt-4 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              Save Product
            </button>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Step 2. Review Analysis → Verdict</h2>
              <StepBadge value={state.steps?.analysis} />
            </div>

            <p className="mt-2 text-sm text-neutral-400">
              Review Query로 YouTube 리뷰/댓글/Transcript 분석을 실행하고 ranked/verdict JSON을 자동 저장합니다.
            </p>

            <button
              onClick={() => runAction("analyze-reviews", "Review Analysis")}
              disabled={busy}
              className="mt-4 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              {loadingAction === "analyze-reviews" ? "Analyzing..." : "Analyze Reviews"}
            </button>

            <div className="mt-4 grid gap-2 text-xs text-neutral-400">
              <div>
                Query Slug: <span className="font-mono">{state.querySlug || "-"}</span>
              </div>
              <div>
                Ranked File: <span className="font-mono">{state.rankedFile || "-"}</span>
              </div>
              <div>
                Verdict File: <span className="font-mono">{state.verdictFile || "-"}</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Step 3. Assets</h2>
              <StepBadge value={state.steps?.assets} />
            </div>

            <label className="mt-4 grid gap-2 text-sm">
              Resource IDs
              <input
                value={state.resourceIds ?? ""}
                onChange={(e) => updateField("resourceIds", e.target.value)}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => runAction("check-assets", "Asset 확인")}
                disabled={busy}
                className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300 disabled:opacity-50"
              >
                Check Assets
              </button>

              <button
                onClick={loadWorkflowAssets}
                disabled={busy}
                className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300 disabled:opacity-50"
              >
                Load Assets
              </button>
            <a
              href={`/assets?productSlug=${encodeURIComponent(state.productSlug ?? "")}&productName=${encodeURIComponent(state.productName ?? "")}`}
              className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black"
            >
              Open Asset Manager
            </a>
            </div>

            <div className="mt-4 grid gap-2 text-sm">
              {(state.assetResources ?? []).map((r: any) => (
                <div
                  key={r.resourceId}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                >
                  {r.exists ? "✓" : "✗"} {r.resourceId} · {r.assetCount} assets
                </div>
              ))}
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">Video Asset Selection</h3>
                  <p className="text-xs text-neutral-500">
                    선택한 이미지만 더빙 영상 생성에 사용됩니다.
                  </p>
                </div>
              </div>

              {assetData && (
                <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
                  Selected: {assetData.selectedPublicPaths?.length ?? 0} images
                </div>
              )}

              <div className="grid gap-6">
                {(assetData?.resources ?? []).map((resource: any) => (
                  <section
                    key={resource.resourceId}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-bold">
                        {resource.resourceName} · {resource.assetCount} assets
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {(resource.assets ?? []).map((asset: any) => {
                        const checked = (assetData?.selectedPublicPaths ?? []).includes(
                          asset.publicPath,
                        );

                        return (
                          <button
                            type="button"
                            key={asset.publicPath}
                            onClick={() => toggleAsset(asset.publicPath)}
                            className={`overflow-hidden rounded-xl border text-left transition ${
                              checked
                                ? "border-white bg-neutral-800"
                                : "border-neutral-800 bg-black hover:border-neutral-500"
                            }`}
                          >
                            <div className="relative">
                              <img
                                src={assetSrc(asset.publicPath)}
                                alt={asset.filename}
                                className="h-40 w-full bg-black object-contain"
                              />

                              {checked && (
                                <div className="absolute right-2 top-2 rounded-full bg-white px-2 py-1 text-xs font-bold text-black">
                                  Selected
                                </div>
                              )}
                            </div>

                            <div className="p-2 text-xs">
                              <div className="font-mono text-neutral-300">
                                {asset.filename}
                              </div>

                              <div className="mt-1 text-neutral-500">
                                {asset.sizeBytes
                                  ? `${(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB`
                                  : ""}
                              </div>

                              <div
                                className={
                                  checked
                                    ? "mt-1 text-green-300"
                                    : "mt-1 text-neutral-500"
                                }
                              >
                                {checked ? "✓ 영상에 사용" : "클릭해서 선택"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Step 4. Narration + Video</h2>
              <StepBadge value={state.steps?.video} />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm">
                Model
                <input
                  value={state.model ?? ""}
                  onChange={(e) => updateField("model", e.target.value)}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                />
              </label>

              <label className="grid gap-2 text-sm">
                Target Seconds
                <input
                  type="number"
                  value={state.targetSeconds ?? 120}
                  onChange={(e) => updateField("targetSeconds", Number(e.target.value))}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                />
              </label>

              <label className="grid gap-2 text-sm">
                Image Limit
                <input
                  type="number"
                  value={state.imageLimit ?? 16}
                  onChange={(e) => updateField("imageLimit", Number(e.target.value))}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                />
              </label>
            </div>

            <button
              onClick={() => runAction("generate-video", "Dubbed Review Video 생성")}
              disabled={busy}
              className="mt-4 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              {loadingAction === "generate-video"
                ? "Generating..."
                : "Generate Dubbed Review Video"}
            </button>
          </section>

          {state.videoPath && (
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <h2 className="text-xl font-bold">Output</h2>

              <div className="mt-3 break-all text-xs text-neutral-500">
                {state.videoPath}
              </div>

              <a
                href={videoSrc(state.videoPath)}
                download
                className="mt-4 inline-flex rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
              >
                Download
              </a>

              <video controls preload="metadata" className="mt-4 w-full rounded-xl bg-black">
                <source src={videoSrc(state.videoPath)} type="video/mp4" />
              </video>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
