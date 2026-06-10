"use client";

import { useEffect, useState } from "react";

type VideoItem = {
  filename: string;
  publicPath: string;
  sizeBytes: number;
  updatedAt: string;
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function videoSrc(publicPath: string) {
  return `/api/video-file?path=${encodeURIComponent(publicPath)}`;
}

export default function VideosPage() {
  const [productName, setProductName] = useState("Sony WH-1000XM6");
  const [productSlug, setProductSlug] = useState("sony-wh-1000xm6");

  const [resourceIds, setResourceIds] = useState("press-sand-pink,press-black-silver");
  const [previewResourceId, setPreviewResourceId] = useState("press-sand-pink");

  const [mode, setMode] = useState<"dubbed" | "preview">("dubbed");
  const [model, setModel] = useState("qwen3:32b");
  const [verdictFile, setVerdictFile] = useState("data/verdicts/sony-wh-1000xm6-review.verdict.json");

  const [limit, setLimit] = useState(16);
  const [targetSeconds, setTargetSeconds] = useState(120);
  const [seconds, setSeconds] = useState(5);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadVideos() {
    const res = await fetch(`/api/videos?productSlug=${encodeURIComponent(productSlug)}`);
    const data = await res.json();
    setVideos(data.videos ?? []);
  }

  useEffect(() => {
    loadVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateVideo() {
    setLoading(true);
    setMessage(mode === "dubbed" ? "Qwen 나레이션 + 더빙 영상 생성 중..." : "Preview 영상 생성 중...");

    try {
      const body =
        mode === "dubbed"
          ? {
              mode,
              productName,
              productSlug,
              resourceIds,
              model,
              limit,
              targetSeconds,
              verdictFile,
            }
          : {
              mode,
              productSlug,
              resourceId: previewResourceId,
              limit,
              seconds,
            };

      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "영상 생성 실패");
      }

      setVideos(data.videos ?? []);
      setMessage(`생성 완료: ${data.filename ?? data.publicPath ?? "video created"}`);
    } catch (err: any) {
      setMessage(err.message ?? "오류 발생");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="mb-4 inline-flex rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
          TuneMyFi Video Lab
        </div>

        <h1 className="text-3xl font-bold">리뷰 더빙 영상 생성</h1>

        <div className="mt-6 grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <label className="grid gap-2 text-sm">
            생성 모드
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "dubbed" | "preview")}
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
            >
              <option value="dubbed">Qwen Verdict 기반 한국어 더빙 영상</option>
              <option value="preview">이미지 Preview 영상</option>
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              Product Name
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
              />
            </label>

            <label className="grid gap-2 text-sm">
              Product Slug
              <input
                value={productSlug}
                onChange={(e) => setProductSlug(e.target.value)}
                onBlur={loadVideos}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
              />
            </label>
          </div>

          {mode === "dubbed" ? (
            <>
              <label className="grid gap-2 text-sm">
                Resource IDs, 쉼표로 여러 개
                <input
                  value={resourceIds}
                  onChange={(e) => setResourceIds(e.target.value)}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                />
              </label>

              <label className="grid gap-2 text-sm">
                Verdict File
                <input
                  value={verdictFile}
                  onChange={(e) => setVerdictFile(e.target.value)}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 font-mono text-xs"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 text-sm">
                  Qwen/Ollama Model
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                  />
                </label>

                <label className="grid gap-2 text-sm">
                  이미지 개수
                  <input
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                  />
                </label>

                <label className="grid gap-2 text-sm">
                  목표 나레이션 초
                  <input
                    type="number"
                    value={targetSeconds}
                    onChange={(e) => setTargetSeconds(Number(e.target.value))}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                  />
                </label>
              </div>
            </>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm">
                Resource ID
                <input
                  value={previewResourceId}
                  onChange={(e) => setPreviewResourceId(e.target.value)}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                />
              </label>

              <label className="grid gap-2 text-sm">
                이미지 개수
                <input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                />
              </label>

              <label className="grid gap-2 text-sm">
                이미지당 초
                <input
                  type="number"
                  value={seconds}
                  onChange={(e) => setSeconds(Number(e.target.value))}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
                />
              </label>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={generateVideo}
              disabled={loading}
              className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              {loading ? "생성 중..." : mode === "dubbed" ? "Generate Dubbed Review" : "Generate Preview"}
            </button>

            <button
              onClick={loadVideos}
              className="rounded-xl border border-neutral-700 px-5 py-3 text-sm text-neutral-300"
            >
              Reload
            </button>
          </div>

          {message && <div className="text-sm text-neutral-300 whitespace-pre-wrap">{message}</div>}
        </div>

        <div className="mt-8 grid gap-6">
          {videos.length === 0 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-400">
              생성된 영상이 없습니다.
            </div>
          )}

          {videos.map((video) => (
            <section key={video.publicPath} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-mono text-lg font-bold">{video.filename}</h2>
                  <p className="text-xs text-neutral-500">
                    {formatBytes(video.sizeBytes)} · {new Date(video.updatedAt).toLocaleString()}
                  </p>
                </div>

                <a
                  href={videoSrc(video.publicPath)}
                  download={video.filename}
                  className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
                >
                  Download
                </a>
              </div>

              <video controls preload="metadata" className="w-full rounded-xl bg-black">
                <source src={videoSrc(video.publicPath)} type="video/mp4" />
              </video>

              <div className="mt-2 break-all text-xs text-neutral-500">
                {video.publicPath}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
