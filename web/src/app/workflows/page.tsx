"use client";

import { useEffect, useState } from "react";

function videoSrc(publicPath: string) {
  return `/api/video-file?path=${encodeURIComponent(publicPath)}`;
}

function assetSrc(publicPath: string) {
  return `/api/asset-file?path=${encodeURIComponent(publicPath)}`;
}

type PronunciationRow = {
  id: string;
  source: string;
  spoken: string;
};

const DIGIT_SPOKEN_KO: Record<string, string> = {
  "0": "제로",
  "1": "원",
  "2": "투",
  "3": "쓰리",
  "4": "포",
  "5": "파이브",
  "6": "식스",
  "7": "세븐",
  "8": "에잇",
  "9": "나인",
};

function makeBasicSpokenScript(text: string) {
  return String(text ?? "");
}

function applyPronunciationMap(text: string, pronunciationMap: Record<string, string>) {
  let output = String(text ?? "");
  const entries = Object.entries(pronunciationMap)
    .map(([source, spoken]) => [source.trim(), String(spoken ?? "").trim()] as const)
    .filter(([source, spoken]) => source && spoken)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [source, spoken] of entries) {
    output = output.split(source).join(spoken);
  }

  return output;
}

function rowsToMap(rows: PronunciationRow[]) {
  const next: Record<string, string> = {};
  for (const row of rows) {
    const source = row.source.trim();
    const spoken = row.spoken.trim();
    if (source && spoken) next[source] = spoken;
  }
  return next;
}

function mapToRows(map: Record<string, string>): PronunciationRow[] {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b, "ko"))
    .map(([source, spoken], index) => ({
      id: `${Date.now()}-${index}-${source}`,
      source,
      spoken,
    }));
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

function JobProgress({ job, onReset }: { job: any; onReset?: () => void }) {
  if (!job) return null;
  const canReset = Boolean(onReset) && ["FAILED", "CANCELLED", "PENDING", "RUNNING"].includes(job.status);
  return (
    <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center justify-between gap-4 text-sm">
        <div className="font-medium text-neutral-200">{job.message ?? job.status}</div>
        <div className="flex items-center gap-2">
          <div className="font-mono text-xs text-neutral-400">
            {job.status} · {job.progress ?? 0}%
          </div>
          {canReset && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-red-800 px-2 py-1 text-[11px] text-red-300 hover:border-red-500"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full rounded-full bg-white transition-all"
          style={{ width: `${Math.max(0, Math.min(100, job.progress ?? 0))}%` }}
        />
      </div>
      {job.error && <div className="mt-3 whitespace-pre-wrap text-xs text-red-300">{job.error}</div>}
    </div>
  );
}

export default function WorkflowPage() {
  const [state, setState] = useState<any>(null);
  const [assetData, setAssetData] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [analysisJob, setAnalysisJob] = useState<any>(null);
  const [narrationJob, setNarrationJob] = useState<any>(null);
  const [videoJob, setVideoJob] = useState<any>(null);
  const [shortsNarrationJob, setShortsNarrationJob] = useState<any>(null);
  const [shortsVideoJob, setShortsVideoJob] = useState<any>(null);
  const [pronunciationMap, setPronunciationMap] = useState<Record<string, string>>({});
  const [pronunciationRows, setPronunciationRows] = useState<PronunciationRow[]>([]);
  const [pronunciationMessage, setPronunciationMessage] = useState("");
  const [pronunciationSaving, setPronunciationSaving] = useState(false);

  async function loadState() {
    const res = await fetch("/api/workflow-state", { cache: "no-store" });
    const data = await res.json();
    setState(data);
  }

  async function loadPronunciationDictionary() {
    try {
      const res = await fetch("/api/pronunciation", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "발음 사전 로딩 실패");
      const map = data.map ?? {};
      setPronunciationMap(map);
      setPronunciationRows(mapToRows(map));
      setPronunciationMessage(`발음 사전 ${Object.keys(map).length}개 항목 로딩 완료`);
    } catch (error: any) {
      setPronunciationMessage(error?.message ?? "발음 사전 로딩 실패");
    }
  }

  useEffect(() => {
    loadState();
    loadPronunciationDictionary();
  }, []);

  function useJobPolling(jobId: string | undefined, setter: (job: any) => void, doneMessage: string) {
    useEffect(() => {
      if (!jobId) return;

      let cancelled = false;
      let timer: number | null = null;

      function stopPolling() {
        cancelled = true;
        if (timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
      }

      async function loadJob() {
        if (cancelled) return;

        try {
          const res = await fetch(`/api/jobs/${encodeURIComponent(jobId!)}`, { cache: "no-store" });
          const data = await res.json();
          if (!res.ok || cancelled) return;

          setter(data.job);

          if (data.job.status === "COMPLETED") {
            stopPolling();
            await loadState();
            setLoadingAction("");
            setMessage(doneMessage);
            return;
          }

          if (data.job.status === "FAILED") {
            stopPolling();
            setLoadingAction("");
            setMessage(data.job.error ?? data.job.message ?? `${doneMessage} 실패`);
          }
        } catch {
          // 다음 polling에서 재시도
        }
      }

      timer = window.setInterval(loadJob, 2000);
      loadJob();

      return () => {
        stopPolling();
      };
    }, [jobId]);
  }

  useJobPolling(state?.analysisJobId, setAnalysisJob, "Review Analysis 완료");
  useJobPolling(state?.narrationJobId, setNarrationJob, "Narration Script 준비 완료");
  useJobPolling(state?.videoJobId, setVideoJob, "Video Generation 완료");
  useJobPolling(state?.shortsNarrationJobId, setShortsNarrationJob, "Shorts Script 준비 완료");
  useJobPolling(state?.shortsVideoJobId, setShortsVideoJob, "Shorts Video Generation 완료");

  function updateField(key: string, value: any) {
    setState((prev: any) => ({ ...prev, [key]: value }));
  }

  async function resetJob(scope: "analysis" | "narration" | "video" | "shorts" | "shorts-video") {
    const labels: Record<"analysis" | "narration" | "video" | "shorts" | "shorts-video", string> = {
      analysis: "Review Analysis",
      narration: "Narration Script",
      video: "Video Generation",
      shorts: "Shorts Script",
      "shorts-video": "Shorts Video Generation",
    };

    setLoadingAction(`reset-${scope}`);
    setMessage(`${labels[scope]} Job 상태 복구 중...`);

    try {
      const res = await fetch("/api/workflow-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-job", scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Job 복구 실패");

      setState(data);
      if (scope === "analysis") {
        setAnalysisJob(null);
        setNarrationJob(null);
        setVideoJob(null);
        setShortsNarrationJob(null);
        setShortsVideoJob(null);
      } else if (scope === "narration") {
        setNarrationJob(null);
        setVideoJob(null);
      } else if (scope === "shorts") {
        setShortsNarrationJob(null);
        setShortsVideoJob(null);
      } else if (scope === "shorts-video") {
        setShortsVideoJob(null);
      } else if (scope === "video") {
        setVideoJob(null);
      }
      setMessage(`${labels[scope]} Job 상태를 초기화했습니다. 다시 실행할 수 있습니다.`);
    } catch (e: any) {
      setMessage(e.message ?? "Job 복구 중 오류 발생");
    } finally {
      setLoadingAction("");
    }
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
      if (!res.ok) throw new Error(data.error ?? "초기화 실패");
      setState(data);
      setAssetData(null);
      setAnalysisJob(null);
      setNarrationJob(null);
      setVideoJob(null);
      setMessage("Workflow 초기화 완료");
    } catch (e: any) {
      setMessage(e.message ?? "오류 발생");
    } finally {
      setLoadingAction("");
    }
  }

  async function loadWorkflowAssets() {
    if (!state?.productSlug) return;
    const res = await fetch(`/api/workflow-assets?productSlug=${encodeURIComponent(state.productSlug)}`);
    const data = await res.json();
    setAssetData(data);
  }

  async function saveSelectedAssets(nextSelected: string[]) {
    const res = await fetch("/api/workflow-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productSlug: state.productSlug, selectedPublicPaths: nextSelected }),
    });
    const data = await res.json();
    setAssetData(data);
  }

  function toggleAsset(publicPath: string) {
    const selected = new Set<string>((assetData?.selectedPublicPaths ?? []) as string[]);
    if (selected.has(publicPath)) selected.delete(publicPath);
    else selected.add(publicPath);
    saveSelectedAssets(Array.from(selected));
  }


  function updatePronunciationRow(id: string, key: "source" | "spoken", value: string) {
    setPronunciationRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
  }

  function addPronunciationRow() {
    setPronunciationRows((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, source: "", spoken: "" },
    ]);
  }

  function removePronunciationRow(id: string) {
    setPronunciationRows((prev) => prev.filter((row) => row.id !== id));
  }

  async function savePronunciationDictionary() {
    setPronunciationSaving(true);
    setPronunciationMessage("발음 사전 저장 중...");
    try {
      const entries = pronunciationRows
        .map((row) => ({ source: row.source.trim(), spoken: row.spoken.trim() }))
        .filter((row) => row.source && row.spoken);

      const res = await fetch("/api/pronunciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "발음 사전 저장 실패");

      const map = data.map ?? rowsToMap(entries.map((entry, index) => ({ ...entry, id: `${Date.now()}-${index}` })));
      setPronunciationMap(map);
      setPronunciationRows(mapToRows(map));
      setPronunciationMessage(`발음 사전을 저장했습니다. ${Object.keys(map).length}개 항목`);
    } catch (error: any) {
      setPronunciationMessage(error?.message ?? "발음 사전 저장 실패");
    } finally {
      setPronunciationSaving(false);
    }
  }

  function regenerateSpokenFromNarration() {
    setState((prev: any) => ({
      ...prev,
      spokenScript: applyPronunciationMap(prev?.narrationScript ?? "", pronunciationMap),
    }));
    setMessage("발음 사전을 적용해 발음 스크립트를 다시 만들었습니다. 숫자는 자동 변환하지 않습니다. 필요하면 직접 수정해 주세요.");
  }

  function regenerateShortsSpokenFromNarration() {
    setState((prev: any) => ({
      ...prev,
      shortsSpokenScript: applyPronunciationMap(prev?.shortsScript ?? "", pronunciationMap),
    }));
    setMessage("발음 사전을 적용해 쇼츠 발음 스크립트를 다시 만들었습니다. 숫자는 자동 변환하지 않습니다. 필요하면 직접 수정해 주세요.");
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
      if (!res.ok) throw new Error(data.error ?? `${label} 실패`);
      setState(data);

      if (action === "analyze-reviews") {
        setAnalysisJob(data.analysisJob ?? null);
        setMessage("Review Analysis Job 생성 완료. 백그라운드에서 실행됩니다.");
      } else if (action === "prepare-narration") {
        setNarrationJob(data.narrationJob ?? null);
        setMessage("Narration Script Job 생성 완료. 완료 후 원문과 발음 스크립트를 수정할 수 있습니다.");
      } else if (action === "generate-video") {
        setVideoJob(data.videoJob ?? null);
        setMessage("Video Generation Job 생성 완료. 편집된 발음 스크립트로 더빙됩니다.");
      } else if (action === "prepare-shorts") {
        setShortsNarrationJob(data.shortsNarrationJob ?? null);
        setMessage("Shorts Script Job 생성 완료. 완료 후 쇼츠 원문과 발음 스크립트를 수정할 수 있습니다.");
      } else if (action === "generate-shorts") {
        setShortsVideoJob(data.shortsVideoJob ?? null);
        setMessage("Shorts Video Generation Job 생성 완료. 1분 미만 세로 영상으로 생성됩니다.");
      } else if (action === "save-shorts") {
        setMessage("쇼츠 원문과 발음 스크립트를 저장했습니다.");
      } else if (action === "save-narration") {
        setMessage("나레이션 원문과 발음 스크립트를 저장했습니다.");
      } else {
        setMessage(`${label} 완료`);
      }

      if (action === "check-assets") {
        setTimeout(() => loadWorkflowAssets(), 100);
      }
    } catch (e: any) {
      setMessage(e.message ?? "오류 발생");
    } finally {
      if (!["analyze-reviews", "prepare-narration", "generate-video", "prepare-shorts", "generate-shorts"].includes(action)) {
        setLoadingAction("");
      }
    }
  }

  if (!state) {
    return <main className="min-h-screen bg-neutral-950 p-8 text-white">Loading...</main>;
  }

  const isAnalysisJobRunning = ["PENDING", "RUNNING"].includes(analysisJob?.status);
  const isNarrationJobRunning = ["PENDING", "RUNNING"].includes(narrationJob?.status);
  const isVideoJobRunning = ["PENDING", "RUNNING"].includes(videoJob?.status);
  const isShortsNarrationJobRunning = ["PENDING", "RUNNING"].includes(shortsNarrationJob?.status);
  const isShortsVideoJobRunning = ["PENDING", "RUNNING"].includes(shortsVideoJob?.status);
  const isAnalyzing = loadingAction === "analyze-reviews" || state.steps?.analysis === "running" || isAnalysisJobRunning;
  const isPreparingNarration = loadingAction === "prepare-narration" || state.steps?.narration === "running" || isNarrationJobRunning;
  const isGeneratingVideo = loadingAction === "generate-video" || state.steps?.video === "running" || isVideoJobRunning;
  const isPreparingShorts = loadingAction === "prepare-shorts" || state.steps?.shorts === "running" || isShortsNarrationJobRunning;
  const isGeneratingShorts = loadingAction === "generate-shorts" || state.steps?.shortsVideo === "running" || isShortsVideoJobRunning;
  const isClearing = loadingAction === "clear-workflow";
  const blockCriticalActions = isPreparingNarration || isGeneratingVideo || isPreparingShorts || isGeneratingShorts || isClearing;

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
            disabled={Boolean(loadingAction)}
            className="rounded-xl border border-red-800 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
          >
            Clear Workflow
          </button>
        </div>

        {message && <div className="mt-4 whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300">{message}</div>}

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
                <input value={state.productSlug ?? ""} readOnly className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-neutral-400" />
              </label>

              <label className="grid gap-2 text-sm md:col-span-2">
                Review Query
                <input value={state.query ?? ""} onChange={(e) => updateField("query", e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
              </label>
            </div>

            <button onClick={() => runAction("save-product", "Product 저장")} disabled={isAnalyzing || blockCriticalActions} className="mt-4 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
              Save Product
            </button>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Step 2. Review Analysis → Verdict</h2>
              <StepBadge value={state.steps?.analysis} />
            </div>
            <p className="mt-2 text-sm text-neutral-400">Review Query로 YouTube 리뷰/댓글/Transcript를 더 충분히 수집하고 ranked/verdict JSON을 자동 저장합니다. 기본적으로 후보 영상과 댓글 수집량을 늘려 4~5분 롱폼 나레이션에 쓸 근거를 확보합니다.</p>
            <JobProgress job={analysisJob} onReset={() => resetJob("analysis")} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => runAction("analyze-reviews", "Review Analysis")} disabled={isAnalyzing || blockCriticalActions} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
                {isAnalyzing ? "Analyzing..." : "Analyze Reviews"}
              </button>
              <button onClick={() => resetJob("analysis")} disabled={Boolean(loadingAction)} className="rounded-xl border border-red-800 px-5 py-3 text-sm text-red-300 disabled:opacity-50">
                Reset Analysis Job
              </button>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-neutral-400">
              <div>Query Slug: <span className="font-mono">{state.querySlug || "-"}</span></div>
              <div>Ranked File: <span className="font-mono">{state.rankedFile || "-"}</span></div>
              <div>Verdict File: <span className="font-mono">{state.verdictFile || "-"}</span></div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Step 3. Assets</h2>
              <StepBadge value={state.steps?.assets} />
            </div>

            <label className="mt-4 grid gap-2 text-sm">
              Resource IDs
              <input value={state.resourceIds ?? ""} onChange={(e) => updateField("resourceIds", e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => runAction("check-assets", "Asset 확인")} disabled={isGeneratingVideo || isClearing} className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300 disabled:opacity-50">Check Assets</button>
              <button onClick={loadWorkflowAssets} disabled={isGeneratingVideo || isClearing} className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300 disabled:opacity-50">Load Assets</button>
              <a href={`/assets?productSlug=${encodeURIComponent(state.productSlug ?? "")}&productName=${encodeURIComponent(state.productName ?? "")}`} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black">Open Asset Manager</a>
            </div>

            <div className="mt-4 grid gap-2 text-sm">
              {(state.assetResources ?? []).map((r: any) => <div key={r.resourceId} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">{r.exists ? "✓" : "✗"} {r.resourceId} · {r.assetCount} assets</div>)}
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">Video Asset Selection</h3>
                  <p className="text-xs text-neutral-500">선택한 이미지만 더빙 영상 생성에 사용됩니다.</p>
                </div>
              </div>
              {assetData && <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">Selected: {assetData.selectedPublicPaths?.length ?? 0} images</div>}
              <div className="grid gap-6">
                {(assetData?.resources ?? []).map((resource: any) => (
                  <section key={resource.resourceId} className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="mb-3 text-sm font-bold">{resource.resourceName} · {resource.assetCount} assets</div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {(resource.assets ?? []).map((asset: any) => {
                        const checked = (assetData?.selectedPublicPaths ?? []).includes(asset.publicPath);
                        return (
                          <button key={asset.publicPath} type="button" onClick={() => toggleAsset(asset.publicPath)} className={`overflow-hidden rounded-xl border text-left transition ${checked ? "border-white bg-neutral-800" : "border-neutral-800 bg-black hover:border-neutral-500"}`}>
                            <div className="relative">
                              <img src={assetSrc(asset.publicPath)} alt={asset.filename} className="h-40 w-full bg-black object-contain" />
                              {checked && <div className="absolute right-2 top-2 rounded-full bg-white px-2 py-1 text-xs font-bold text-black">Selected</div>}
                            </div>
                            <div className="p-2 text-xs">
                              <div className="font-mono text-neutral-300">{asset.filename}</div>
                              <div className="mt-1 text-neutral-500">{asset.sizeBytes ? `${(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB` : ""}</div>
                              <div className={checked ? "mt-1 text-green-300" : "mt-1 text-neutral-500"}>{checked ? "✓ 영상에 사용" : "클릭해서 선택"}</div>
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
              <h2 className="text-xl font-bold">Step 4. Narration Script Review</h2>
              <StepBadge value={state.steps?.narration} />
            </div>

            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
              <div className="font-bold text-neutral-100">Script Flow</div>
              <div className="mt-2 text-neutral-400">
                먼저 나레이션 원문을 생성합니다. 아래 두 스크립트는 모두 직접 수정할 수 있습니다.
                화면 텍스트와 카드에는 1, 2, 32B처럼 아라비아 숫자를 그대로 표시합니다. TTS 발음용 스크립트도 숫자는 자동 변환하지 않고, 제품명 발음만 아래 발음 치환 사전으로 관리합니다.
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-neutral-100">Pronunciation Dictionary / 발음 치환 사전</h3>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    화면 텍스트는 그대로 두고, TTS 발음용 스크립트를 만들 때만 적용됩니다. 예: Apple → 애플, AirPods → 에어팟
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={loadPronunciationDictionary}
                    disabled={pronunciationSaving || isPreparingNarration || isGeneratingVideo}
                    className="rounded-xl border border-neutral-700 px-4 py-2 text-xs text-neutral-300 disabled:opacity-50"
                  >
                    Reload Dictionary
                  </button>
                  <button
                    type="button"
                    onClick={addPronunciationRow}
                    disabled={pronunciationSaving || isPreparingNarration || isGeneratingVideo}
                    className="rounded-xl border border-neutral-700 px-4 py-2 text-xs text-neutral-300 disabled:opacity-50"
                  >
                    Add Term
                  </button>
                  <button
                    type="button"
                    onClick={savePronunciationDictionary}
                    disabled={pronunciationSaving || isPreparingNarration || isGeneratingVideo}
                    className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-black disabled:opacity-50"
                  >
                    {pronunciationSaving ? "Saving..." : "Save Dictionary"}
                  </button>
                </div>
              </div>

              {pronunciationMessage && <div className="mt-3 text-xs text-neutral-500">{pronunciationMessage}</div>}

              <div className="mt-4 grid gap-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[11px] uppercase tracking-wide text-neutral-500">
                  <div>Original Text</div>
                  <div>Spoken Text</div>
                  <div />
                </div>
                {pronunciationRows.length === 0 && (
                  <div className="rounded-xl border border-dashed border-neutral-800 p-4 text-xs text-neutral-500">
                    아직 등록된 발음 치환 항목이 없습니다. Add Term으로 Apple → 애플 같은 항목을 추가하세요.
                  </div>
                )}
                {pronunciationRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      value={row.source}
                      onChange={(e) => updatePronunciationRow(row.id, "source", e.target.value)}
                      className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-300"
                      placeholder="Apple AirPods"
                    />
                    <input
                      value={row.spoken}
                      onChange={(e) => updatePronunciationRow(row.id, "spoken", e.target.value)}
                      className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-300"
                      placeholder="애플 에어팟"
                    />
                    <button
                      type="button"
                      onClick={() => removePronunciationRow(row.id)}
                      disabled={pronunciationSaving || isPreparingNarration || isGeneratingVideo}
                      className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-400 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 text-xs leading-5 text-neutral-500">
                사전을 저장한 뒤 아래의 Rebuild Spoken Script from Narration + Dictionary을 누르면, 현재 나레이션 원문에 저장된 치환 사전과 숫자 읽기 규칙이 다시 적용됩니다.
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm">
                Model
                <input value={state.model ?? ""} onChange={(e) => updateField("model", e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
              </label>
              <label className="grid gap-2 text-sm">
                Target Seconds
                <input type="number" value={state.targetSeconds ?? 270} onChange={(e) => updateField("targetSeconds", Number(e.target.value))} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
              </label>
              <label className="grid gap-2 text-sm">
                Image Limit
                <input type="number" value={state.imageLimit ?? 32} onChange={(e) => updateField("imageLimit", Number(e.target.value))} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
              </label>
            </div>

            <JobProgress job={narrationJob} onReset={() => resetJob("narration")} />

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => runAction("prepare-narration", "Narration Script 준비")} disabled={isAnalyzing || blockCriticalActions} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
                {isPreparingNarration ? "Preparing..." : "Prepare Narration Script"}
              </button>
              <button onClick={() => resetJob("narration")} disabled={Boolean(loadingAction)} className="rounded-xl border border-red-800 px-5 py-3 text-sm text-red-300 disabled:opacity-50">
                Reset Narration Job
              </button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span>Narration Script / 화면·대본 원문</span>
                  <span className="rounded-full border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400">화면 숫자 유지</span>
                </span>
                <textarea
                  value={state.narrationScript ?? ""}
                  onChange={(e) => updateField("narrationScript", e.target.value)}
                  rows={14}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 leading-8 text-neutral-100 outline-none focus:border-neutral-300"
                  placeholder="Prepare Narration Script 실행 후 원문이 표시됩니다."
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span>Spoken Script / TTS 발음용</span>
                  <span className="rounded-full border border-emerald-800 px-2 py-1 text-[11px] text-emerald-300">직접 수정 가능</span>
                </span>
                <textarea
                  value={state.spokenScript ?? ""}
                  onChange={(e) => updateField("spokenScript", e.target.value)}
                  rows={14}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 leading-8 text-neutral-100 outline-none focus:border-emerald-300"
                  placeholder="숫자와 제품명 발음이 변환된 TTS용 스크립트가 표시됩니다. 여기에서 직접 수정할 수 있습니다."
                />
                <span className="text-xs leading-5 text-neutral-500">숫자는 자동 변환하지 않습니다. 제품명 발음만 사전으로 치환하고, 필요한 발음은 여기에서 직접 수정합니다.</span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={regenerateSpokenFromNarration} disabled={isPreparingNarration || isGeneratingVideo || !state.narrationScript} className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300 disabled:opacity-50">
                Rebuild Spoken Script from Narration + Dictionary
              </button>
              <button onClick={() => runAction("save-narration", "Narration Script 저장")} disabled={isPreparingNarration || isGeneratingVideo || !state.narrationScript || !state.spokenScript} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
                Save Edited Scripts
              </button>
            </div>

            <div className="mt-4 grid gap-2 text-xs text-neutral-400">
              <div>Narration File: <span className="font-mono">{state.narrationPath || "-"}</span></div>
              <div>Spoken File: <span className="font-mono">{state.spokenNarrationPath || "-"}</span></div>
              <div>Overlay Plan: <span className="font-mono">{state.overlayPlanPath || "-"}</span></div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Step 5. Generate Dubbed Video</h2>
              <StepBadge value={state.steps?.video} />
            </div>
            <p className="mt-2 text-sm text-neutral-400">수정한 나레이션 원문과 발음 스크립트를 저장한 뒤, 발음 스크립트 기준으로 TTS와 더빙 영상을 생성합니다. 기본 BGM은 오픈소스 MIDI 생성기 같은 알고리즘 시퀀서 방식으로 밝고 경쾌하게 변화하며, 분위기와 볼륨을 직접 선택할 수 있습니다.</p>
            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-xs leading-6 text-neutral-400">
              <div className="font-bold text-neutral-200">Audio Style</div>
              <div className="mt-1">TTS 나레이션을 가장 앞에 두고, BGM은 낮은 볼륨으로 자연스럽게 깔립니다.</div>
              <div>기본값은 밝고 경쾌한 리뷰용 BGM이며, A/B/A/C 섹션, 코드 진행, 벨 리드, 베이스, 가벼운 리듬을 코드로 직접 생성합니다.</div>
              <div>BGM 분위기, 볼륨, BPM, 키, 생성 방식 정보는 결과의 BGM Plan에 저장됩니다.</div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="text-neutral-300">BGM Mood</span>
                <select
                  value={state.bgmMood ?? "bright"}
                  onChange={(e) => updateField("bgmMood", e.target.value)}
                  disabled={isGeneratingVideo}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none focus:border-neutral-300 disabled:opacity-50"
                >
                  <option value="bright">Bright / 밝고 경쾌한 기본값</option>
                  <option value="warm">Warm / 따뜻하고 편안함</option>
                  <option value="premium">Premium / 고급스럽고 차분함</option>
                  <option value="tech">Tech / 전자적이고 세련됨</option>
                  <option value="calm">Calm / 아주 은은하고 조용함</option>
                  <option value="auto">Auto / 리뷰 내용으로 자동 판단</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm">
                <span className="text-neutral-300">BGM Volume</span>
                <select
                  value={String(state.bgmVolume ?? 0.12)}
                  onChange={(e) => updateField("bgmVolume", Number(e.target.value))}
                  disabled={isGeneratingVideo}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none focus:border-neutral-300 disabled:opacity-50"
                >
                  <option value="0.06">Very Low / 아주 작게</option>
                  <option value="0.09">Low / 작게</option>
                  <option value="0.12">Default / 기본</option>
                  <option value="0.16">Medium / 조금 더 들리게</option>
                  <option value="0.22">High / 테스트용 크게</option>
                </select>
              </label>
            </div>

            <JobProgress job={videoJob} onReset={() => resetJob("video")} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => runAction("generate-video", "Dubbed Review Video 생성")} disabled={isAnalyzing || blockCriticalActions || !state.narrationScript || !state.spokenScript} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
                {isGeneratingVideo ? "Generating..." : "Generate Dubbed Review Video"}
              </button>
              <button onClick={() => resetJob("video")} disabled={Boolean(loadingAction)} className="rounded-xl border border-red-800 px-5 py-3 text-sm text-red-300 disabled:opacity-50">
                Reset Video Job
              </button>
            </div>
          </section>

          {state.videoPath && (
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <h2 className="text-xl font-bold">Step 5 Result / Review Video Output</h2>
              <div className="mt-3 break-all text-xs text-neutral-500">{state.videoPath}</div>
              {state.videoResult?.overlayPlanPath && (
                <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-400">
                  <div className="font-bold text-neutral-200">Overlay Plan</div>
                  <div className="mt-1 break-all font-mono">{state.videoResult.overlayPlanPath}</div>
                  {state.videoResult?.summaryPreview?.oneLine && <div className="mt-3 text-neutral-300">한줄평: {state.videoResult.summaryPreview.oneLine}</div>}
                </div>
              )}
              {state.videoResult?.bgmEnabled && (
                <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-xs leading-6 text-neutral-400">
                  <div className="font-bold text-neutral-200">BGM Plan</div>
                  {state.videoResult?.bgmPlanPath && <div className="mt-1 break-all font-mono">{state.videoResult.bgmPlanPath}</div>}
                  {state.videoResult?.bgmPlan && (
                    <div className="mt-2 text-neutral-300">
                      분위기: {state.videoResult.bgmPlan.mood} · 볼륨: {state.videoResult.bgmVolume ?? "-"} · BPM: {state.videoResult.bgmPlan.bpm} · Key: {state.videoResult.bgmPlan.key}
                      {state.videoResult.bgmPlan.description ? ` · ${state.videoResult.bgmPlan.description}` : ""}
                    </div>
                  )}
                  {state.videoResult?.bgmPath && <div className="mt-1 break-all font-mono text-neutral-500">BGM: {state.videoResult.bgmPath}</div>}
                </div>
              )}
              <a href={videoSrc(state.videoPath)} download className="mt-4 inline-flex rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-300">Download</a>
              <video controls preload="metadata" className="mt-4 w-full rounded-xl bg-black">
                <source src={videoSrc(state.videoPath)} type="video/mp4" />
              </video>
            </section>
          )}


          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Step 6. YouTube Shorts / 1분 미만 세로 영상</h2>
              <StepBadge value={state.steps?.shortsVideo ?? state.steps?.shorts} />
            </div>
            <p className="mt-2 text-sm text-neutral-400">롱폼과 별도로 1분 미만 쇼츠용 스크립트를 만들고 직접 수정한 뒤, 같은 BGM 스타일을 깔아 9:16 세로 영상으로 생성합니다. 쇼츠는 더 긍정적이고 장점이 강하게 남도록 구성합니다.</p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Shorts Target Seconds
                <input type="number" value={state.shortsTargetSeconds ?? 52} onChange={(e) => updateField("shortsTargetSeconds", Number(e.target.value))} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
              </label>
              <label className="grid gap-2 text-sm">
                Shorts Image Limit
                <input type="number" value={state.shortsImageLimit ?? 8} onChange={(e) => updateField("shortsImageLimit", Number(e.target.value))} className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3" />
              </label>
            </div>

            <JobProgress job={shortsNarrationJob} onReset={() => resetJob("shorts")} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => runAction("prepare-shorts", "Shorts Script 준비")} disabled={isAnalyzing || blockCriticalActions} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
                {isPreparingShorts ? "Preparing Shorts..." : "Prepare Shorts Script"}
              </button>
              <button onClick={() => resetJob("shorts")} disabled={Boolean(loadingAction)} className="rounded-xl border border-red-800 px-5 py-3 text-sm text-red-300 disabled:opacity-50">
                Reset Shorts Script Job
              </button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span>Shorts Script / 화면·대본 원문</span>
                <textarea
                  value={state.shortsScript ?? ""}
                  onChange={(e) => updateField("shortsScript", e.target.value)}
                  rows={10}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 leading-8 text-neutral-100 outline-none focus:border-neutral-300"
                  placeholder="Prepare Shorts Script 실행 후 원문이 표시됩니다."
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Shorts Spoken Script / TTS 발음용</span>
                <textarea
                  value={state.shortsSpokenScript ?? ""}
                  onChange={(e) => updateField("shortsSpokenScript", e.target.value)}
                  rows={10}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 leading-8 text-neutral-100 outline-none focus:border-emerald-300"
                  placeholder="쇼츠 TTS용 발음 스크립트가 표시됩니다. 직접 수정할 수 있습니다."
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={regenerateShortsSpokenFromNarration} disabled={isPreparingShorts || isGeneratingShorts || !state.shortsScript} className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300 disabled:opacity-50">
                Rebuild Shorts Spoken Script
              </button>
              <button onClick={() => runAction("save-shorts", "Shorts Script 저장")} disabled={isPreparingShorts || isGeneratingShorts || !state.shortsScript || !state.shortsSpokenScript} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
                Save Edited Shorts Scripts
              </button>
            </div>

            <div className="mt-4 grid gap-2 text-xs text-neutral-400">
              <div>Shorts Narration File: <span className="font-mono">{state.shortsNarrationPath || "-"}</span></div>
              <div>Shorts Spoken File: <span className="font-mono">{state.shortsSpokenNarrationPath || "-"}</span></div>
              <div>Shorts Overlay Plan: <span className="font-mono">{state.shortsOverlayPlanPath || "-"}</span></div>
            </div>

            <JobProgress job={shortsVideoJob} onReset={() => resetJob("shorts-video")} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => runAction("generate-shorts", "Shorts Video 생성")} disabled={isAnalyzing || blockCriticalActions || !state.shortsScript || !state.shortsSpokenScript} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
                {isGeneratingShorts ? "Generating Shorts..." : "Generate YouTube Shorts"}
              </button>
              <button onClick={() => resetJob("shorts-video")} disabled={Boolean(loadingAction)} className="rounded-xl border border-red-800 px-5 py-3 text-sm text-red-300 disabled:opacity-50">
                Reset Shorts Video Job
              </button>
            </div>
          </section>

          {state.shortsVideoPath && (
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <h2 className="text-xl font-bold">Step 6 Result / Shorts Output</h2>
              <div className="mt-3 break-all text-xs text-neutral-500">{state.shortsVideoPath}</div>
              {state.shortsVideoResult?.durationSeconds && <div className="mt-2 text-xs text-neutral-400">Duration: {Number(state.shortsVideoResult.durationSeconds).toFixed(1)}s</div>}
              <a href={videoSrc(state.shortsVideoPath)} download className="mt-4 inline-flex rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-300">Download Shorts</a>
              <video controls preload="metadata" className="mt-4 max-h-[720px] rounded-xl bg-black">
                <source src={videoSrc(state.shortsVideoPath)} type="video/mp4" />
              </video>
            </section>
          )}



        </div>
      </section>
    </main>
  );
}
